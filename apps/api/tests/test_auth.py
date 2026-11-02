import time
import uuid
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.api.auth_deps import current_user
from app.api.routes.auth import logout
from app.core import security
from app.core.exceptions import AuthenticationError
from app.domain.models import RevokedToken, User
from app.infrastructure.db.session import get_engine
from app.main import app
from app.services import accounts
from tests.conftest_auth import PASSWORD, cleanup, login_headers, make_user

SECRET = "x" * 40


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", SECRET)
    monkeypatch.setattr(settings, "ingest_api_key", "k")
    accounts._FAILS.clear()
    accounts._REGISTRATIONS.clear()
    yield
    if DB_OK:
        cleanup()


def test_password_hash_roundtrip_and_salt():
    a, b = security.hash_password("secret-secret"), security.hash_password("secret-secret")
    assert a != b and security.verify_password("secret-secret", a) and not security.verify_password("autre", a)
    assert not security.verify_password("x", "format-invalide")


def test_token_rejects_tampering_expiry_and_weak_secret(monkeypatch):
    token = security.create_token(1, "admin")
    claims = security.decode_token(token)
    assert claims["sub"] == "1" and uuid.UUID(claims["jti"])
    with pytest.raises(Exception):
        security.decode_token(token[:-2] + "xx")
    expired = jwt.encode({"sub": "1", "exp": int(time.time()) - 5}, SECRET, algorithm="HS256")
    with pytest.raises(Exception):
        security.decode_token(expired)
    monkeypatch.setattr(settings, "jwt_secret", "court")
    with pytest.raises(Exception):
        security.create_token(1, "admin")


def test_current_user_rejects_revoked_token():
    token = security.create_token(1, "viewer")

    class FakeResult:
        def first(self):
            return (1,)

    class FakeDB:
        def execute(self, _statement):
            return FakeResult()

    with pytest.raises(AuthenticationError) as error:
        current_user(f"Bearer {token}", FakeDB())
    assert error.value.code == "REVOKED_SESSION"


def test_logout_persists_revocation_and_returns_no_content(monkeypatch):
    token = security.create_token(7, "viewer")
    user = SimpleNamespace(id=7, email="user@example.test")
    added = []

    class FakeDB:
        def execute(self, _statement):
            return None

        def add(self, item):
            added.append(item)

    monkeypatch.setattr(accounts, "audit", lambda *_args, **_kwargs: None)
    response = logout(f"Bearer {token}", user, FakeDB())
    claims = security.decode_token(token)

    assert response.status_code == 204
    revoked = next(item for item in added if isinstance(item, RevokedToken))
    assert revoked.jti == claims["jti"]
    assert revoked.user_id == user.id
    assert int(revoked.expires_at.timestamp()) == claims["exp"]


try:
    with get_engine().connect() as c:
        c.execute(text("select 1 from users limit 1"))
    DB_OK = True
except Exception:
    DB_OK = False
pytestmark_db = pytest.mark.skipif(not DB_OK, reason="PostgreSQL migré indisponible")


@pytestmark_db
def test_login_failures_do_not_reveal_account_and_are_throttled():
    client = TestClient(app)
    email = make_user("viewer")
    bad = client.post("/api/v1/auth/login", json={"email": email, "password": "faux"})
    ghost = client.post("/api/v1/auth/login", json={"email": "inconnu@example.test", "password": "faux"})
    strip = lambda r: {k: v for k, v in r.json().items() if k != "request_id"}
    assert bad.status_code == ghost.status_code == 401 and strip(bad) == strip(ghost)  # pas de fuite sur l'existence du compte
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": email, "password": "faux"})
    assert client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 429


@pytestmark_db
def test_roles_are_enforced_and_actions_audited():
    client = TestClient(app)
    citoyen, agent, admin = (login_headers(client, r) for r in ("citoyen", "agent_terrain", "admin"))
    assert client.get("/api/v1/auth/me", headers=citoyen).json()["role"] == "citoyen"
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.post("/api/v1/auth/logout", headers=citoyen).status_code == 204
    assert client.get("/api/v1/auth/me", headers=citoyen).status_code == 401
    citoyen = login_headers(client, "citoyen")
    code = f"AUTH-{uuid.uuid4().hex[:6]}"
    body = {"code": code, "name": "Capteur auth", "lon": -4.0, "lat": 5.3, "mount_height_cm": 150}
    assert client.post("/api/v1/sensors", json=body, headers=citoyen).status_code == 403
    assert client.post("/api/v1/sensors", json=body).status_code == 401
    assert client.post("/api/v1/sensors", json=body, headers=agent).status_code == 201
    assert client.get("/api/v1/users", headers=agent).status_code == 403
    new = {"email": f"test-new-{uuid.uuid4().hex[:6]}@example.test", "full_name": "Nouveau", "password": "court", "role": "citoyen"}
    assert client.post("/api/v1/users", json=new, headers=admin).status_code == 422  # mot de passe faible
    new["password"] = PASSWORD
    assert client.post("/api/v1/users", json=new, headers=admin).status_code == 201
    assert client.post("/api/v1/users", json=new, headers=admin).status_code == 409
    assert client.post("/api/v1/organizations", json={"name": f"Org test {uuid.uuid4().hex[:5]}", "kind": "ngo"}, headers=admin).status_code == 201
    actions = {a["action"] for a in client.get("/api/v1/audit", headers=admin).json()}
    assert {"login", "sensor_created", "user_created", "organization_created"} <= actions
    # appareil : clé d'API pour les mesures, mais pas pour créer des capteurs
    assert client.post(f"/api/v1/sensors/{code}/readings", json={"samples_cm": [100]}, headers={"X-API-Key": "k"}).status_code == 201
    assert client.post(f"/api/v1/sensors/{code}/readings", json={"samples_cm": [100]}, headers={"X-API-Key": "faux"}).status_code == 401
    with get_engine().begin() as conn:
        conn.execute(text("delete from sensors where code = :c"), {"c": code})


@pytestmark_db
def test_public_registration_creates_only_viewer_accounts():
    client = TestClient(app)
    email = f"test-public-{uuid.uuid4().hex[:8]}@example.test"
    payload = {"email": email, "full_name": "Compte public", "password": PASSWORD}

    response = client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 201, response.text
    assert response.json()["role"] == "citoyen"
    assert response.json()["organization_id"] is None
    assert client.post("/api/v1/auth/register", json={**payload, "role": "admin"}).status_code == 422
    assert client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}).status_code == 200
    assert client.post("/api/v1/auth/register", json={**payload, "email": email}).status_code == 409
    with get_engine().connect() as conn:
        assert conn.execute(
            text("select count(*) from audit_log where actor = :email and action = 'self_registered'"),
            {"email": email},
        ).scalar_one() == 1


@pytestmark_db
def test_bootstrap_admin_only_when_no_account(monkeypatch):
    from app.infrastructure.db.session import session_scope
    monkeypatch.setattr(settings, "admin_email", "root@example.test")
    monkeypatch.setattr(settings, "admin_password", PASSWORD)
    with get_engine().connect() as conn:
        empty = conn.execute(text("select count(*) from users")).scalar() == 0
    with session_scope() as db:
        assert accounts.bootstrap_admin(db) is empty  # n'agit que sur une base sans compte
        assert accounts.bootstrap_admin(db) is False  # jamais deux fois
    with get_engine().begin() as conn:
        conn.execute(text("delete from users where email = 'root@example.test'"))
        conn.execute(text("delete from audit_log where actor = 'système' and detail = 'root@example.test'"))
