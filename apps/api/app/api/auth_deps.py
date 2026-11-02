"""Dépendances d'authentification et d'autorisation (rôles métier)."""

import secrets
from typing import Optional

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import ROLES, VIEWER_ROLES, decode_token
from app.domain.models import RevokedToken, User
from app.infrastructure.db.session import get_db_session


def bearer_token(authorization: str) -> Optional[str]:
    scheme, _, token = authorization.partition(" ")
    return token if scheme.lower() == "bearer" and token else None


def optional_user(authorization: str = Header(default=""), db: Session = Depends(get_db_session)) -> Optional[User]:
    token = bearer_token(authorization)
    if not token:
        return None
    try:
        claims = decode_token(token)
        if db.execute(select(RevokedToken.id).where(RevokedToken.jti == claims["jti"])).first():
            return None
        user_id = int(claims["sub"])
        user = db.get(User, user_id)
        return user if user and user.is_active else None
    except Exception:
        return None


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db_session)) -> User:
    token = bearer_token(authorization)
    if not token:
        raise AuthenticationError("Connexion requise.", code="LOGIN_REQUIRED")
    claims = decode_token(token)
    if db.execute(select(RevokedToken.id).where(RevokedToken.jti == claims["jti"])).first():
        raise AuthenticationError("Cette session a été révoquée.", code="REVOKED_SESSION")
    try:
        user_id = int(claims["sub"])
    except (TypeError, ValueError):
        raise AuthenticationError("Session expirée ou invalide.", code="INVALID_TOKEN")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Compte inactif ou supprimé.", code="INACTIVE_ACCOUNT")
    return user


def require_role(minimum: str):
    def dependency(user: User = Depends(current_user)) -> User:
        # Accepte les anciens rôles (viewer/operator/admin) et les nouveaux
        role_rank = ROLES.get(user.role, VIEWER_ROLES.get(user.role, -1))
        min_rank = ROLES.get(minimum, VIEWER_ROLES.get(minimum, -1))
        if role_rank < min_rank:
            raise PermissionDeniedError("Droits insuffisants pour cette action.", code="FORBIDDEN")
        return user
    return dependency


# Dépendances pour les nouveaux rôles
citoyen = require_role("citoyen")
agent_terrain = require_role("agent_terrain")
analyste = require_role("analyste")
responsable = require_role("responsable")
admin = require_role("admin")

# Alias pour compatibilité
viewer = require_role("viewer")  # = citoyen
operator = require_role("operator")  # = agent_terrain


def device_or_operator(x_api_key: str = Header(default=""), authorization: str = Header(default=""),
                       db: Session = Depends(get_db_session)) -> str:
    """Capteurs : clé d'appareil. Humains : jeton d'un opérateur/agent. Retourne l'identité à journaliser."""
    if settings.ingest_api_key and secrets.compare_digest(x_api_key, settings.ingest_api_key):
        return "appareil"
    return agent_terrain(current_user(authorization, db)).email
