"""Fixed-host adapters for provider catalogs and OpenAI-compatible inference."""

import hashlib
from dataclasses import dataclass
from time import monotonic

import httpx

from app.config import settings


@dataclass(frozen=True)
class Provider:
    id: str
    name: str
    base_url: str
    catalog_url: str
    billing_note: str


PROVIDERS = {
    "gemini": Provider(
        "gemini",
        "Google Gemini",
        "https://generativelanguage.googleapis.com/v1beta/openai",
        "https://generativelanguage.googleapis.com/v1beta/openai/models",
        "Limites gratuites selon le compte et le modèle; les données envoyées au "
        "niveau gratuit peuvent contribuer à l'amélioration des produits Google.",
    ),
    "groq": Provider(
        "groq",
        "Groq",
        "https://api.groq.com/openai/v1",
        "https://api.groq.com/openai/v1/models",
        "Offre gratuite limitée par compte et quotas susceptibles d'évoluer.",
    ),
    "mistral": Provider(
        "mistral",
        "Mistral AI",
        "https://api.mistral.ai/v1",
        "https://api.mistral.ai/v1/models",
        "Le mode Studio gratuit doit être actif sur le compte; une erreur 402 "
        "désactive ce fournisseur pour la requête.",
    ),
    "xkiro": Provider(
        "xkiro",
        "xKiro",
        "https://api.xkiro.com/v1",
        "https://api.xkiro.com/v1/models",
        "Seuls les modèles explicitement indiqués access_tier=free sont proposés.",
    ),
    "openrouter": Provider(
        "openrouter",
        "OpenRouter",
        "https://openrouter.ai/api/v1",
        "https://openrouter.ai/api/v1/models?output_modalities=text",
        "Seules les variantes :free à prix nul sont proposées; aucun modèle "
        "payant de repli n'est envoyé.",
    ),
}

# Google does not expose a per-model free-tier flag in its compatible catalog.
# Keep this allowlist intentionally narrow and aligned with Google's published
# free-tier pricing; update it only after checking the official model/pricing docs.
GEMINI_FREE_MODELS = frozenset({"gemini-3.8-flash", "gemini-3.5-flash-lite"})
_catalog_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}
_CATALOG_TTL_SECONDS = 300
_MAX_CATALOG_BYTES = 2_000_000
_MAX_CHAT_BYTES = 256_000


class ProviderError(Exception):
    def __init__(self, kind: str):
        self.kind = kind
        super().__init__(kind)


def _headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}


def _response_json(response: httpx.Response, limit: int) -> dict:
    if len(response.content) > limit:
        raise ProviderError("response_too_large")
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderError("invalid_response") from exc
    if not isinstance(payload, dict):
        raise ProviderError("invalid_response")
    return payload


def _free_price(value: object) -> bool:
    if value is None:
        return False
    try:
        return float(value) == 0
    except (TypeError, ValueError):
        return False


def _supports_images(item: dict, provider_id: str, model_id: str) -> bool:
    if provider_id == "gemini":
        return model_id in GEMINI_FREE_MODELS
    candidates = [
        item.get("input_modalities"),
        item.get("supported_input_modalities"),
        (item.get("architecture") or {}).get("input_modalities"),
        (item.get("architecture") or {}).get("modality"),
        item.get("capabilities"),
    ]
    return any(
        "image" in str(value).lower() for value in candidates if value is not None
    )


def _normalize_model(item: object, provider_id: str) -> dict | None:
    if not isinstance(item, dict):
        return None
    model_id = item.get("id") or item.get("name") or item.get("model")
    if not isinstance(model_id, str):
        return None
    model_id = model_id.removeprefix("models/")
    if not model_id or len(model_id) > 160 or any(ord(char) < 32 for char in model_id):
        return None

    pricing = item.get("pricing") if isinstance(item.get("pricing"), dict) else {}
    if provider_id == "gemini":
        if model_id not in GEMINI_FREE_MODELS:
            return None
    elif provider_id == "openrouter":
        if not model_id.endswith(":free"):
            return None
        if not (
            _free_price(pricing.get("prompt"))
            and _free_price(pricing.get("completion"))
        ):
            return None
        if pricing.get("image") is not None and not _free_price(pricing.get("image")):
            return None
    elif provider_id == "xkiro":
        if item.get("access_tier") != "free":
            return None
        if item.get("pay_as_you_go") is True or item.get("payg") is True:
            return None
    elif provider_id in {"groq", "mistral"}:
        if item.get("active") is False or item.get("deprecated") is True:
            return None
        if any(
            part in model_id.lower()
            for part in ("embed", "whisper", "transcrib", "tts")
        ):
            return None

    display_name = item.get("name") or item.get("display_name") or model_id
    supports_images = _supports_images(item, provider_id, model_id)
    if provider_id in {"openrouter", "xkiro"} and not _free_price(
        pricing.get("image")
    ):
        supports_images = False
    return {
        "id": model_id,
        "name": str(display_name)[:160],
        "supports_images": supports_images,
    }


def list_free_models(
    provider_id: str, api_key: str, *, refresh: bool = False
) -> list[dict]:
    provider = PROVIDERS[provider_id]
    cache_key = (provider_id, hashlib.sha256(api_key.encode("utf-8")).hexdigest())
    cached = _catalog_cache.get(cache_key)
    if not refresh and cached and monotonic() - cached[0] < _CATALOG_TTL_SECONDS:
        return [model.copy() for model in cached[1]]
    try:
        response = httpx.get(
            provider.catalog_url,
            headers=_headers(api_key),
            timeout=httpx.Timeout(settings.ai_request_timeout_seconds, connect=5),
            follow_redirects=False,
        )
    except httpx.HTTPError as exc:
        raise ProviderError("provider_unreachable") from exc
    if response.status_code in {401, 403}:
        raise ProviderError("credentials_rejected")
    if response.status_code == 402:
        raise ProviderError("free_tier_unavailable")
    if response.status_code == 429:
        raise ProviderError("rate_limited")
    if response.status_code < 200 or response.status_code >= 300:
        raise ProviderError("catalog_unavailable")
    payload = _response_json(response, _MAX_CATALOG_BYTES)
    items = payload.get("data") or payload.get("models")
    if not isinstance(items, list):
        raise ProviderError("invalid_catalog")
    models = [model for item in items if (model := _normalize_model(item, provider_id))]
    unique = {model["id"]: model for model in models}
    result = sorted(
        unique.values(), key=lambda model: (model["name"].casefold(), model["id"])
    )
    _catalog_cache[cache_key] = (monotonic(), result)
    if len(_catalog_cache) > 25:
        oldest = sorted(_catalog_cache, key=lambda key: _catalog_cache[key][0])
        for key in oldest[: len(_catalog_cache) - 25]:
            _catalog_cache.pop(key, None)
    return [model.copy() for model in result]


def complete(
    provider_id: str,
    api_key: str,
    model_id: str,
    messages: list[dict],
    *,
    image_data_url: str | None = None,
) -> str:
    provider = PROVIDERS[provider_id]
    user_message: dict | str
    if image_data_url is None:
        user_message = messages[-1]["content"]
    else:
        user_message = [
            {"type": "text", "text": messages[-1]["content"]},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ]
    payload = {
        "model": model_id,
        "messages": [
            *messages[:-1],
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.2,
        "max_tokens": 900,
    }
    headers = _headers(api_key)
    if provider_id == "openrouter":
        headers["X-Title"] = "MasterEarth"
    try:
        response = httpx.post(
            f"{provider.base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=httpx.Timeout(settings.ai_request_timeout_seconds, connect=5),
            follow_redirects=False,
        )
    except httpx.HTTPError as exc:
        raise ProviderError("provider_unreachable") from exc
    if response.status_code in {401, 403}:
        raise ProviderError("credentials_rejected")
    if response.status_code == 402:
        raise ProviderError("free_tier_unavailable")
    if response.status_code == 429:
        raise ProviderError("rate_limited")
    if response.status_code < 200 or response.status_code >= 300:
        raise ProviderError("model_unavailable")
    data = _response_json(response, _MAX_CHAT_BYTES)
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError("empty_response") from exc
    if isinstance(content, list):
        content = " ".join(
            str(part.get("text", "")) for part in content if isinstance(part, dict)
        )
    if not isinstance(content, str) or not content.strip():
        raise ProviderError("empty_response")
    return content.strip()[:12_000]
