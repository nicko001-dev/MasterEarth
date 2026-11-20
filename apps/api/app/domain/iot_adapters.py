"""Adaptateurs d'entrée IoT : normalisent des charges utiles de plateformes diverses en (code, rafale en cm, horodatage).

Le code du capteur MasterEarth doit être utilisé comme nom d'appareil dans la plateforme source (convention).
Chaque plateforme doit envoyer une distance mesurée (cm) ou une rafale `samples_cm`.
"""

from dataclasses import dataclass
from datetime import datetime, timezone


class PayloadError(ValueError):
    pass


@dataclass(frozen=True)
class Normalized:
    code: str
    samples_cm: list[float]
    measured_at: datetime | None


def _samples(obj: dict) -> list[float]:
    if isinstance(obj.get("samples_cm"), list) and obj["samples_cm"]:
        vals = obj["samples_cm"]
    elif "distance_cm" in obj:
        vals = [obj["distance_cm"]]
    elif "distance_mm" in obj:
        vals = [float(obj["distance_mm"]) / 10.0]
    else:
        raise PayloadError("Aucune distance (samples_cm, distance_cm ou distance_mm) dans la charge utile.")
    try:
        out = [float(v) for v in vals]
    except (TypeError, ValueError):
        raise PayloadError("Valeurs de distance non numériques.")
    if not out or any(not (0 < v < 1000) for v in out):
        raise PayloadError("Distances hors plage plausible (0–1000 cm).")
    return out


def _ts(value) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise PayloadError("Horodatage illisible (ISO 8601 attendu).")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def generic(body: dict) -> Normalized:
    code = body.get("sensor") or body.get("code")
    if not code:
        raise PayloadError("Champ « sensor » manquant.")
    return Normalized(str(code), _samples(body), _ts(body.get("ts") or body.get("measured_at")))


def ttn(body: dict) -> Normalized:
    """The Things Stack v3 (webhook « uplink message »), charge décodée par un décodeur côté TTN."""
    up = body.get("uplink_message") or {}
    code = (body.get("end_device_ids") or {}).get("device_id")
    if not code:
        raise PayloadError("end_device_ids.device_id manquant.")
    return Normalized(code, _samples(up.get("decoded_payload") or {}), _ts(up.get("received_at") or body.get("received_at")))


def chirpstack(body: dict) -> Normalized:
    """ChirpStack v4 (intégration HTTP, événement « up »)."""
    code = (body.get("deviceInfo") or {}).get("deviceName")
    if not code:
        raise PayloadError("deviceInfo.deviceName manquant.")
    return Normalized(code, _samples(body.get("object") or {}), _ts(body.get("time")))


ADAPTERS = {"generic": generic, "ttn": ttn, "chirpstack": chirpstack}
