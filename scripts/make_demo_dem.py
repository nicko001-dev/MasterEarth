"""Génère un MNT FICTIF (cuvette) dans le cache de tuiles, pour tester la simulation sans Internet.
Ne représente PAS le relief réel. Usage : python scripts/make_demo_dem.py [lat lon] [dossier_cache]"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

lat0 = float(sys.argv[1]) if len(sys.argv) > 2 else 5.36
lon0 = float(sys.argv[2]) if len(sys.argv) > 2 else -4.01
cache = Path(sys.argv[3] if len(sys.argv) > 3 else "apps/api/data/dem_cache")
cache.mkdir(parents=True, exist_ok=True)
Z = 13
n = 2**Z
cx = int((lon0 + 180) / 360 * n)
cy = int((1 - math.asinh(math.tan(math.radians(lat0))) / math.pi) / 2 * n)
for tx in range(cx - 1, cx + 2):
    for ty in range(cy - 1, cy + 2):
        px = (tx + (np.arange(256) + 0.5) / 256) / n * 360 - 180
        yy = (ty + (np.arange(256) + 0.5) / 256) / n
        lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * yy))))
        LON, LAT = np.meshgrid(px, lat)
        d = np.hypot((LON - lon0) * 111320 * math.cos(math.radians(lat0)), (LAT - lat0) * 111320)
        h = np.minimum(60, 2.0 + 0.0000032 * d**2 + 0.8 * np.sin(d / 180))  # cuvette douce autour du point
        v = h + 32768
        rgb = np.stack([np.floor(v / 256), np.floor(v) % 256, np.floor((v - np.floor(v)) * 256)], -1).astype(np.uint8)
        Image.fromarray(rgb).save(cache / f"{Z}_{tx}_{ty}.png")
print("Tuiles fictives écrites dans", cache)
