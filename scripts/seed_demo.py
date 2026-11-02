"""Crée 3 capteurs de démonstration (Abidjan) et envoie des mesures. Bibliothèque standard : Windows/macOS/Linux.

Usage : python scripts/seed_demo.py URL_API EMAIL_ADMIN MOT_DE_PASSE [CLE_APPAREIL]
Positions et niveaux FICTIFS : ils ne représentent aucun équipement réel.
"""
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

if len(sys.argv) < 4:
    sys.exit(__doc__)
API, EMAIL, PASSWORD = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
DEVICE_KEY = sys.argv[4] if len(sys.argv) > 4 else ""


def call(path, body=None, headers=None):
    req = urllib.request.Request(API + path, method="POST" if body is not None else "GET",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None


status, data = call("/api/v1/auth/login", {"email": EMAIL, "password": PASSWORD})
if status != 200:
    sys.exit(f"Connexion refusée ({status}) : vérifiez l'e-mail et le mot de passe.")
auth = {"Authorization": f"Bearer {data['access_token']}"}
for code, name, lon, lat, dist in [("DEMO-001", "Démo · Caniveau A (Cocody)", -3.9867, 5.3600, 135),
                                   ("DEMO-002", "Démo · Caniveau B (Cocody)", -3.9700, 5.3550, 95),
                                   ("DEMO-003", "Démo · Caniveau C (Cocody)", -3.9950, 5.3480, 55)]:
    s, _ = call("/api/v1/sensors", {"code": code, "name": name, "lon": lon, "lat": lat, "mount_height_cm": 150}, auth)
    print(code, "créé" if s == 201 else f"déjà présent ou refusé ({s})")
    now = datetime.now(timezone.utc)
    for i in range(4):
        call(f"/api/v1/sensors/{code}/readings",
             {"samples_cm": [dist, dist + 1, dist - 1, dist, dist + 2, dist, dist - 2], "measured_at": (now - timedelta(minutes=3 - i)).isoformat()},
             {"X-API-Key": DEVICE_KEY} if DEVICE_KEY else auth)
print("Terminé.")
