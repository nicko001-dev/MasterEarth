"""Intelligence Engine API: free-tier providers, assistant, vision, and anomalies."""

# FastAPI dependencies are expressed in route signatures, per project convention.
# ruff: noqa: B008
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.domain.models import User
from app.infrastructure.ai_providers import PROVIDERS, ProviderError
from app.infrastructure.db.session import get_db_session
from app.schemas.ai import (
    AssistantRequest,
    ProviderCatalogRequest,
    ProviderConfigUpdate,
    VisionRequest,
)
from app.services import accounts, ai, ai_rate_limit

router = APIRouter(prefix="/api/v1/ai", tags=["intelligence-engine"])


class _AnonymousUser:
    id = None
    email = "anonyme@intelliflood.local"
    role = "citoyen"
    organization_id = None


def _provider_id(provider_id: str) -> str:
    if provider_id not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Fournisseur IA inconnu.")
    return provider_id


def _provider_error(error: ProviderError) -> HTTPException:
    if error.kind == "credentials_rejected":
        return HTTPException(
            status_code=401, detail="Clé API refusée par le fournisseur."
        )
    if error.kind == "rate_limited":
        return HTTPException(
            status_code=429, detail="Quota fournisseur atteint; réessayez plus tard."
        )
    if error.kind == "free_tier_unavailable":
        return HTTPException(
            status_code=402, detail="Le fournisseur n'a pas confirmé un accès gratuit."
        )
    if error.kind == "provider_unreachable":
        return HTTPException(status_code=503, detail="Fournisseur IA indisponible.")
    return HTTPException(
        status_code=502, detail="Catalogue gratuit indisponible ou invalide."
    )


@router.get("/providers")
def providers(
    _: User = Depends(auth_deps.admin),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    return ai.list_provider_configs(db)


@router.get("/status")
def ai_status(
    _: Optional[User] = Depends(auth_deps.optional_user),
    db: Session = Depends(get_db_session),
) -> dict:
    return {
        "providers": ai.list_active_provider_status(db),
        "external_requests_require_consent": True,
        "offline_mode": "deterministic_summary",
    }


@router.post("/providers/{provider_id}/catalog")
def provider_catalog(
    provider_id: str,
    body: ProviderCatalogRequest,
    _: User = Depends(auth_deps.admin),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    provider_id = _provider_id(provider_id)
    try:
        return ai.discover_free_models(provider_id, body.api_key, db)
    except ProviderError as exc:
        raise _provider_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.put("/providers/{provider_id}")
def configure_provider(
    provider_id: str,
    body: ProviderConfigUpdate,
    actor: User = Depends(auth_deps.admin),
    db: Session = Depends(get_db_session),
) -> dict:
    provider_id = _provider_id(provider_id)
    try:
        result = ai.save_provider(
            db,
            provider_id,
            body.api_key,
            body.selected_models,
            body.enabled,
            body.priority,
            actor.id,
        )
        accounts.audit(
            db,
            actor.email,
            "ai_provider_configured",
            f"{provider_id}: {len(body.selected_models)} modèle(s), "
            f"priorité {body.priority}",
            actor.id,
        )
        return result
    except ProviderError as exc:
        raise _provider_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.delete("/providers/{provider_id}", status_code=204)
def remove_provider(
    provider_id: str,
    actor: User = Depends(auth_deps.admin),
    db: Session = Depends(get_db_session),
) -> Response:
    provider_id = _provider_id(provider_id)
    ai.delete_provider(db, provider_id)
    accounts.audit(db, actor.email, "ai_provider_removed", provider_id, actor.id)
    return Response(status_code=204)


@router.post("/assistant")
def assistant(
    body: AssistantRequest,
    request: Request,
    actor: Optional[User] = Depends(auth_deps.optional_user),
    db: Session = Depends(get_db_session),
) -> dict:
    client_key = actor.id if actor else (request.client.host if request.client else "unknown")
    if not ai_rate_limit.allow_request(client_key):
        raise HTTPException(
            status_code=429,
            detail="Limite locale atteinte : maximum 8 requêtes IA par 5 minutes.",
            headers={"Retry-After": "300"},
        )
    effective_actor = actor or _AnonymousUser()
    client_context = (
        body.client_context.model_dump(exclude_none=True)
        if body.client_context is not None
        else None
    )
    try:
        return ai.answer(
            db,
            effective_actor,
            body.message,
            body.mode,
            body.surface,
            client_context=client_context,
            allow_actions=body.allow_actions,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/anomalies")
def anomalies(
    _: Optional[User] = Depends(auth_deps.optional_user),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    return ai.list_anomalies(db)


@router.post("/vision")
def vision(
    body: VisionRequest,
    request: Request,
    actor: Optional[User] = Depends(auth_deps.optional_user),
    db: Session = Depends(get_db_session),
) -> dict:
    client_key = actor.id if actor else (request.client.host if request.client else "unknown")
    if not ai_rate_limit.allow_request(client_key):
        raise HTTPException(
            status_code=429,
            detail="Limite locale atteinte : maximum 8 requêtes IA par 5 minutes.",
            headers={"Retry-After": "300"},
        )
    effective_actor = actor or _AnonymousUser()
    try:
        return ai.analyze_image(
            db, effective_actor, body.question, body.image_base64, body.media_type
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
