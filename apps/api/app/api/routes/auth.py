"""API v1 : connexion, comptes, organisations, journal d'audit."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.core.exceptions import AuthenticationError
from app.core.security import decode_token
from app.domain.models import AuditLog, Organization, RevokedToken, User
from app.infrastructure.db.session import get_db_session
from app.services import accounts

router = APIRouter(prefix="/api/v1", tags=["auth"])


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=10, max_length=200)

    @field_validator("full_name", mode="before")
    @classmethod
    def trim_full_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class UserIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(max_length=200)
    role: str = Field(default="citoyen", pattern=r"^(citoyen|agent_terrain|analyste|responsable|admin|viewer|operator)$")
    organization_id: int | None = None

    @field_validator("role", mode="before")
    @classmethod
    def normalize_user_role(cls, value: str) -> str:
        mapping = {"viewer": "citoyen", "operator": "agent_terrain"}
        return mapping.get(value, value)


class OrgIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    kind: str = Field(default="other", pattern=r"^(authority|municipality|ngo|school|company|other)$")


def _user(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role,
            "organization_id": u.organization_id, "is_active": u.is_active}


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db_session)) -> dict:
    user, token = accounts.authenticate(db, body.email, body.password)
    return {"access_token": token, "token_type": "bearer", "user": _user(user)}


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db_session)) -> dict:
    client_id = request.client.host if request.client else "unknown"
    user = accounts.register_citoyen(db, body.email, body.full_name, body.password, client_id)
    return _user(user)


@router.get("/auth/me")
def me(user: User = Depends(auth_deps.current_user)) -> dict:
    return _user(user)


@router.post("/auth/logout", status_code=204)
def logout(
    authorization: str = Header(default=""),
    user: User = Depends(auth_deps.current_user),
    db: Session = Depends(get_db_session),
) -> Response:
    token = auth_deps.bearer_token(authorization)
    if not token:
        raise AuthenticationError("Connexion requise.", code="LOGIN_REQUIRED")
    claims = decode_token(token)
    db.execute(delete(RevokedToken).where(RevokedToken.expires_at <= datetime.now(timezone.utc)))
    db.add(
        RevokedToken(
            jti=claims["jti"],
            user_id=user.id,
            expires_at=datetime.fromtimestamp(int(claims["exp"]), timezone.utc),
        )
    )
    accounts.audit(db, user.email, "logout", "session révoquée", user.id)
    return Response(status_code=204)


@router.get("/users")
def users(_: User = Depends(auth_deps.admin), db: Session = Depends(get_db_session)) -> list[dict]:
    return [_user(u) for u in db.execute(select(User).order_by(User.email)).scalars()]


@router.post("/users", status_code=201)
def add_user(body: UserIn, actor: User = Depends(auth_deps.admin), db: Session = Depends(get_db_session)) -> dict:
    user = accounts.create_user(db, body.email, body.full_name, body.password, body.role, body.organization_id)
    accounts.audit(db, actor.email, "user_created", f"{user.email} ({user.role})", actor.id)
    return _user(user)


@router.get("/organizations")
def organizations(_: User = Depends(auth_deps.operator), db: Session = Depends(get_db_session)) -> list[dict]:
    return [{"id": o.id, "name": o.name, "kind": o.kind} for o in db.execute(select(Organization).order_by(Organization.name)).scalars()]


@router.post("/organizations", status_code=201)
def add_org(body: OrgIn, actor: User = Depends(auth_deps.admin), db: Session = Depends(get_db_session)) -> dict:
    org = accounts.create_organization(db, body.name, body.kind)
    accounts.audit(db, actor.email, "organization_created", org.name, actor.id)
    return {"id": org.id, "name": org.name, "kind": org.kind}


@router.get("/audit")
def audit_log(limit: int = Query(100, ge=1, le=1000), _: User = Depends(auth_deps.admin), db: Session = Depends(get_db_session)) -> list[dict]:
    rows = db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).scalars()
    return [{"at": r.created_at, "actor": r.actor, "action": r.action, "detail": r.detail} for r in rows]
