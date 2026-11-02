"""Comptes, organisations, journal d'audit et protection contre le bourrage d'identifiants."""

import logging
import time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import AuthenticationError, ConflictError, RateLimitError, ValidationAppError
from app.core.security import DUMMY_HASH, ROLES, create_token, hash_password, verify_password
from app.domain.models import AuditLog, Organization, User

log = logging.getLogger(__name__)
_FAILS: dict[str, list[float]] = {}
MAX_FAILS, WINDOW_S = 5, 15 * 60
_REGISTRATIONS: dict[str, list[float]] = {}
MAX_REGISTRATIONS, REGISTRATION_WINDOW_S = 5, 60 * 60


def audit(db: Session, actor: str, action: str, detail: str = "", user_id: int | None = None) -> None:
    db.add(AuditLog(user_id=user_id, actor=actor, action=action, detail=detail[:2000]))
    db.commit()


def _check_password_policy(password: str) -> None:
    if len(password) < 10:
        raise ValidationAppError("Le mot de passe doit contenir au moins 10 caractères.", code="WEAK_PASSWORD")


def create_user(db: Session, email: str, full_name: str, password: str, role: str, organization_id: int | None) -> User:
    if role not in ROLES:
        raise ValidationAppError("Rôle inconnu.", code="INVALID_ROLE")
    _check_password_policy(password)
    user = User(email=email.strip().lower(), full_name=full_name.strip(), password_hash=hash_password(password),
                role=role, organization_id=organization_id)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("Un compte existe déjà avec cet e-mail (ou l'organisation est inconnue).", code="USER_EXISTS")
    return user


def register_citoyen(db: Session, email: str, full_name: str, password: str, client_id: str, role: str = "citoyen") -> User:
    """Public self-registration (allows role selection or defaults to citoyen)."""
    now = time.time()
    recent = [at for at in _REGISTRATIONS.get(client_id, []) if now - at < REGISTRATION_WINDOW_S]
    if len(recent) >= MAX_REGISTRATIONS:
        raise RateLimitError("Trop d'inscriptions depuis cette adresse. Réessayez plus tard.", code="REGISTRATION_RATE_LIMIT")

    if len(_REGISTRATIONS) > 5000:
        stale_threshold = now - REGISTRATION_WINDOW_S * 2
        for key in list(_REGISTRATIONS.keys()):
            attempts = _REGISTRATIONS[key]
            active = [at for at in attempts if at > stale_threshold]
            if active:
                _REGISTRATIONS[key] = active
            else:
                del _REGISTRATIONS[key]

    _REGISTRATIONS[client_id] = recent + [now]
    target_role = role if role in ROLES else "citoyen"
    user = create_user(db, email, full_name, password, target_role, None)
    audit(db, user.email, "self_registered", target_role, user.id)
    return user


def create_organization(db: Session, name: str, kind: str) -> Organization:
    org = Organization(name=name.strip(), kind=kind)
    db.add(org)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("Cette organisation existe déjà.", code="ORG_EXISTS")
    return org


def authenticate(db: Session, email: str, password: str) -> tuple[User, str]:
    key = email.strip().lower()
    now = time.time()
    recent = [t for t in _FAILS.get(key, []) if now - t < WINDOW_S]
    if len(recent) >= MAX_FAILS:
        raise RateLimitError("Trop de tentatives. Réessayez dans quelques minutes.", code="TOO_MANY_ATTEMPTS")
    user = db.execute(select(User).where(User.email == key)).scalar_one_or_none()
    ok = verify_password(password, user.password_hash if user else DUMMY_HASH)  # même durée si le compte n'existe pas
    if not (user and ok and user.is_active):
        _FAILS[key] = recent + [now]
        audit(db, key, "login_failed")
        raise AuthenticationError("E-mail ou mot de passe incorrect.", code="BAD_CREDENTIALS")
    _FAILS.pop(key, None)
    audit(db, user.email, "login", user_id=user.id)
    return user, create_token(user.id, user.role)


def bootstrap_admin(db: Session) -> bool:
    """Crée le premier administrateur depuis ADMIN_EMAIL / ADMIN_PASSWORD si aucun compte n'existe."""
    if not (settings.admin_email and settings.admin_password):
        return False
    if db.execute(select(User.id).limit(1)).first():
        return False
    user = create_user(db, settings.admin_email, "Administrateur", settings.admin_password, "admin", None)
    audit(db, "système", "bootstrap_admin", user.email, user.id)
    log.warning("Premier administrateur créé : %s (changez le mot de passe et retirez ADMIN_PASSWORD de l'environnement).", user.email)
    return True
