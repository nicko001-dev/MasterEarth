"""Aides de test : comptes jetables sur la vraie base."""

import uuid

from sqlalchemy import text

from app.infrastructure.db.session import get_engine, session_scope
from app.services import accounts

PASSWORD = "mot-de-passe-solide-123"


def make_user(role: str) -> str:
    # Map old role names to new ones for backward compatibility in tests
    role_map = {"viewer": "citoyen", "operator": "agent_terrain", "admin": "admin"}
    actual_role = role_map.get(role, role)
    email = f"test-{role}-{uuid.uuid4().hex[:8]}@example.test"
    with session_scope() as db:
        accounts.create_user(db, email, f"Test {role}", PASSWORD, actual_role, None)
    return email


def login_headers(client, role: str) -> dict:
    # Map old role names to new ones for backward compatibility in tests
    role_map = {"viewer": "citoyen", "operator": "agent_terrain", "admin": "admin"}
    actual_role = role_map.get(role, role)
    email = make_user(role)
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def cleanup() -> None:
    with get_engine().begin() as conn:
        conn.execute(text("delete from users where email like 'test-%@example.test'"))
        conn.execute(text("delete from audit_log where actor like '%@example.test' or detail like 'test-%@example.test%'"))
        conn.execute(text("delete from organizations where name like 'Org test %'"))
