"""Vérifie la connexion à Open-Meteo depuis TA machine (réseau requis) : python scripts/check_weather.py [lat lon]"""
import sys
from datetime import datetime, timezone

sys.path.insert(0, "apps/api")
from app.infrastructure.weather import open_meteo  # noqa: E402

lat, lon = (float(sys.argv[1]), float(sys.argv[2])) if len(sys.argv) > 2 else (5.36, -4.01)
pts = open_meteo.fetch(lat, lon)
now = datetime.now(timezone.utc)
print(f"{len(pts)} points horaires reçus pour ({lat}, {lon}).")
for p in [p for p in pts if abs((p.valid_at - now).total_seconds()) < 4 * 3600]:
    print(p.valid_at.isoformat(), f"{p.precip_mm} mm", "prévision" if p.is_forecast else "passé")
