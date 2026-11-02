import base64
import io
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import text

from app.api.routes import ai as ai_routes
from app.config import settings
from app.domain.anomaly import detect_level_anomalies
from app.infrastructure import ai_providers
from app.infrastructure.ai_providers import ProviderError
from app.infrastructure.db.session import get_engine
from app.main import app
from app.schemas.ai import AssistantRequest
from app.services import ai


try:
    with get_engine().connect() as connection:
        connection.execute(text("select 1 from ai_provider_configs limit 1"))
    AI_DB_OK = True
except Exception:
    AI_DB_OK = False


@pytest.mark.skipif(not AI_DB_OK, reason="PostgreSQL migré indisponible")
def test_ai_status_and_assistant_are_open_to_anonymous(monkeypatch):
    """L'IA reste utilisable sans compte : l'acteur anonyme est transmis au service."""
    monkeypatch.setattr(settings, "jwt_secret", "x" * 40)
    captured = {}

    def fake_answer(db, user, message, mode, surface):
        captured.update(user=user, message=message, mode=mode, surface=surface)
        return {"answer": "Résumé déterministe.", "mode": "offline", "sources": []}

    monkeypatch.setattr(ai_routes.ai, "answer", fake_answer)
    monkeypatch.setattr(ai_routes.ai_rate_limit, "allow_request", lambda _key: True)
    client = TestClient(app)

    status = client.get("/api/v1/ai/status")
    assert status.status_code == 200, status.text
    assert status.json()["external_requests_require_consent"] is True

    response = client.post(
        "/api/v1/ai/assistant",
        json={
            "message": "Quel est le niveau de vigilance ?",
            "mode": "answer",
            "surface": "web",
            "external_consent": True,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["answer"] == "Résumé déterministe."
    assert captured["user"].email == "anonyme@intelliflood.local"
    assert captured["user"].role == "citoyen"


def test_provider_keys_are_encrypted_and_require_a_valid_master_key(monkeypatch):
    key = Fernet.generate_key().decode("ascii")
    monkeypatch.setattr(settings, "ai_encryption_key", key)
    encrypted = ai.encrypt_api_key("provider-secret")

    assert encrypted != "provider-secret"
    assert ai.decrypt_api_key(encrypted) == "provider-secret"

    monkeypatch.setattr(settings, "ai_encryption_key", "")
    with pytest.raises(RuntimeError, match="AI_ENCRYPTION_KEY"):
        ai.encrypt_api_key("provider-secret")


def test_provider_save_validates_encryption_before_contacting_catalog(monkeypatch):
    class QueryResult:
        def scalar_one_or_none(self):
            return None

    class Database:
        def execute(self, _query):
            return QueryResult()

    catalog_calls = []
    monkeypatch.setattr(settings, "ai_encryption_key", "")
    monkeypatch.setattr(
        ai, "list_free_models", lambda *_args: catalog_calls.append(True)
    )

    with pytest.raises(RuntimeError, match="AI_ENCRYPTION_KEY"):
        ai.save_provider(
            Database(), "gemini", "provider-secret", ["free-model"], True, 1, 1
        )

    assert catalog_calls == []


def test_provider_catalog_filters_to_explicitly_free_models():
    assert (
        ai_providers._normalize_model({"id": "gemini-3.8-flash"}, "gemini")["id"]
        == "gemini-3.8-flash"
    )
    assert ai_providers._normalize_model({"id": "gemini-paid"}, "gemini") is None

    free = ai_providers._normalize_model(
        {
            "id": "example/model:free",
            "pricing": {"prompt": "0", "completion": "0", "image": "0"},
            "architecture": {"input_modalities": ["text", "image"]},
        },
        "openrouter",
    )
    paid = ai_providers._normalize_model(
        {
            "id": "example/model",
            "pricing": {"prompt": "0", "completion": "0"},
        },
        "openrouter",
    )
    assert free and free["supports_images"]
    assert paid is None
    assert ai_providers._normalize_model(
        {"id": "free-model", "access_tier": "free"}, "xkiro"
    )
    assert (
        ai_providers._normalize_model(
            {"id": "paid-model", "access_tier": "paid"}, "xkiro"
        )
        is None
    )


def test_catalog_response_does_not_promote_paid_openrouter_fallbacks(monkeypatch):
    class Response:
        status_code = 200
        content = b"{}"

        def json(self):
            return {
                "data": [
                    {
                        "id": "org/free:free",
                        "pricing": {"prompt": "0", "completion": "0"},
                    },
                    {
                        "id": "org/paid",
                        "pricing": {"prompt": "0.1", "completion": "0.2"},
                    },
                ]
            }

    monkeypatch.setattr(ai_providers, "_catalog_cache", {})
    monkeypatch.setattr(ai_providers.httpx, "get", lambda *args, **kwargs: Response())

    result = ai_providers.list_free_models("openrouter", "secret", refresh=True)

    assert [model["id"] for model in result] == ["org/free:free"]


def test_provider_failover_only_uses_selected_models_in_free_catalog(monkeypatch):
    rows = [
        SimpleNamespace(
            provider="groq",
            encrypted_api_key="ciphertext",
            selected_models=["no-longer-free"],
            enabled=True,
            free_tier_confirmed=True,
        ),
        SimpleNamespace(
            provider="mistral",
            encrypted_api_key="ciphertext",
            selected_models=["free-model"],
            enabled=True,
            free_tier_confirmed=True,
        ),
    ]
    monkeypatch.setattr(ai, "_active_provider_rows", lambda _db: rows)
    monkeypatch.setattr(ai, "decrypt_api_key", lambda _key: "secret")
    monkeypatch.setattr(
        ai,
        "list_free_models",
        lambda provider, _key: (
            []
            if provider == "groq"
            else [{"id": "free-model", "supports_images": False}]
        ),
    )
    calls = []

    def complete(provider, _key, model, _messages, **_kwargs):
        calls.append((provider, model))
        return "réponse informative"

    monkeypatch.setattr(ai, "complete", complete)

    result = ai._attempts(object(), [{"role": "user", "content": "question"}])

    assert result == ("mistral", "free-model", "réponse informative")
    assert calls == [("mistral", "free-model")]


def test_provider_failover_moves_to_next_model_after_temporary_failure(monkeypatch):
    rows = [
        SimpleNamespace(
            provider="groq",
            encrypted_api_key="ciphertext",
            selected_models=["model-one", "model-two"],
            enabled=True,
            free_tier_confirmed=True,
        )
    ]
    monkeypatch.setattr(ai, "_provider_cooldowns", {})
    monkeypatch.setattr(ai, "_active_provider_rows", lambda _db: rows)
    monkeypatch.setattr(ai, "decrypt_api_key", lambda _key: "secret")
    monkeypatch.setattr(
        ai,
        "list_free_models",
        lambda *_args: [
            {"id": "model-one", "supports_images": False},
            {"id": "model-two", "supports_images": False},
        ],
    )
    calls = []

    def complete(_provider, _key, model, _messages, **_kwargs):
        calls.append(model)
        if model == "model-one":
            raise ProviderError("model_unavailable")
        return "réponse de secours"

    monkeypatch.setattr(ai, "complete", complete)
    result = ai._attempts(object(), [{"role": "user", "content": "question"}])

    assert calls == ["model-one", "model-two"]
    assert result == ("groq", "model-two", "réponse de secours")


def test_assistant_requires_explicit_consent_and_rejects_common_personal_data():
    with pytest.raises(ValidationError):
        AssistantRequest(message="Question")
    with pytest.raises(ValidationError):
        AssistantRequest(
            message="Envoyer les données à prenom@example.test ?",
            external_consent=True,
        )
    with pytest.raises(ValidationError):
        AssistantRequest(
            message="Appeler le 0123456789",
            external_consent=True,
        )

    assert (
        AssistantRequest(
            message="  Résume les alertes  ",
            external_consent=True,
        ).message
        == "Résume les alertes"
    )


def test_image_is_reencoded_without_metadata_and_rejects_mime_mismatch():
    source = io.BytesIO()
    image = Image.new("RGB", (20, 10), color="blue")
    exif = image.getexif()
    exif[271] = "private camera metadata"
    image.save(source, format="PNG", exif=exif)
    encoded = base64.b64encode(source.getvalue()).decode("ascii")

    clean = ai._clean_image(encoded, "image/png")
    assert clean.startswith("data:image/jpeg;base64,")
    clean_bytes = base64.b64decode(clean.partition(",")[2])
    with Image.open(io.BytesIO(clean_bytes)) as output:
        assert output.format == "JPEG"
        assert not output.getexif()

    with pytest.raises(ValueError, match="type déclaré"):
        ai._clean_image(encoded, "image/webp")


def test_statistical_anomalies_are_candidates_not_incidents():
    assert detect_level_anomalies([10, 10, 11, 10, 9, 10]) is None
    candidate = detect_level_anomalies([10, 10, 11, 10, 9, 80])
    assert candidate is not None
    assert candidate["method"] == "median_absolute_deviation"
    assert candidate["value"] == 80
    assert candidate["robust_score"] is None
