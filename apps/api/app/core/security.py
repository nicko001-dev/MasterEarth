"""Mots de passe (scrypt, bibliothèque standard) et jetons JWT HS256."""

import base64
import hashlib
import hmac
import os
import time
import uuid

import jwt

from app.config import settings
from app.core.exceptions import AuthenticationError

_N, _R, _P = 2**14, 8, 1

# Hiérarchie des rôles métier selon DOCUMENT003 §5.1
# 0: citoyen (inscription publique, lecture seule)
# 1: agent_terrain (créer observations, voir ses données)
# 2: analyste (lecture complète, analyses, simulations)
# 3: responsable (gestion capteurs, organisations, alertes)
# 4: admin (tout, y compris gestion comptes/IA)
ROLES = {
    "citoyen": 0,
    "agent_terrain": 1,
    "analyste": 2,
    "responsable": 3,
    "admin": 4,
}

# Alias pour compatibilité ascendante
VIEWER_ROLES = {"viewer": 0, "operator": 1, "admin": 2}


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return "scrypt${}${}${}${}${}".format(_N, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(digest).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        candidate = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(candidate, base64.b64decode(digest))
    except Exception:
        return False


DUMMY_HASH = hash_password("dummy-password-for-timing")


def _secret() -> str:
    if len(settings.jwt_secret) < 32:
        raise AuthenticationError("Authentification non configurée : JWT_SECRET (≥ 32 caractères) manquant.", code="AUTH_NOT_CONFIGURED")
    return settings.jwt_secret


def create_token(user_id: int, role: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": str(user_id),
            "role": role,
            "iat": now,
            "exp": now + settings.jwt_minutes * 60,
            "jti": str(uuid.uuid4()),
        },
        _secret(),
        algorithm="HS256",
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=["HS256"], options={"require": ["exp", "sub", "jti"]})
    except jwt.PyJWTError:
        raise AuthenticationError("Session expirée ou invalide.", code="INVALID_TOKEN")
