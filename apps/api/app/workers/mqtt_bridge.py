"""Pont MQTT → MasterEarth : écoute `intelliflood/sensors/<code>/readings` et enregistre les mesures.

Charge utile JSON : {"samples_cm": [..], "ts": "2026-10-31T12:00:00Z"}  (ts facultatif).
Lancement : python -m app.workers.mqtt_bridge   (variables MQTT_HOST, MQTT_PORT, MQTT_USERNAME, MQTT_PASSWORD, MQTT_TLS)
"""

import json
import logging
import os
import ssl

from app.core.exceptions import AppException
from app.domain import iot_adapters
from app.infrastructure.db.session import session_scope
from app.services import monitoring

log = logging.getLogger("mqtt_bridge")
TOPIC = "intelliflood/sensors/+/readings"


def handle_message(topic: str, payload: bytes) -> str:
    """Traite un message. Retourne un statut lisible ; ne lève jamais (un message invalide ne doit pas arrêter le pont)."""
    try:
        code = topic.split("/")[2]
        body = json.loads(payload)
        n = iot_adapters.generic({**body, "sensor": code})
        with session_scope() as db:
            _, alert = monitoring.ingest(db, n.code, n.samples_cm, n.measured_at)
        return f"ok:{code}" + (f":alerte {alert.level}" if alert else "")
    except (json.JSONDecodeError, iot_adapters.PayloadError, AppException, IndexError) as exc:
        log.warning("Message rejeté sur %s : %s", topic, exc)
        return f"rejeté:{exc.__class__.__name__}"


def main() -> None:
    import paho.mqtt.client as mqtt

    logging.basicConfig(level=logging.INFO)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if os.getenv("MQTT_USERNAME"):
        client.username_pw_set(os.environ["MQTT_USERNAME"], os.getenv("MQTT_PASSWORD", ""))
    if os.getenv("MQTT_TLS", "false").lower() == "true":
        client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
    client.on_connect = lambda c, *a: (c.subscribe(TOPIC, qos=1), log.info("Abonné à %s", TOPIC))
    client.on_message = lambda c, u, m: log.info(handle_message(m.topic, m.payload))
    client.reconnect_delay_set(min_delay=1, max_delay=60)  # reconnexion automatique en cas de coupure
    client.connect(os.getenv("MQTT_HOST", "localhost"), int(os.getenv("MQTT_PORT", "1883")), keepalive=60)
    client.loop_forever()


if __name__ == "__main__":
    main()
