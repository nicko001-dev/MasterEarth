"""MNT mondial gratuit : tuiles « Terrarium » (AWS Open Data / Mapzen). Mise en cache disque → utilisable hors ligne.

Altitude (m) = R×256 + G + B/256 − 32768. Précision verticale variable selon la source (SRTM, etc.) :
à valider localement ; remplaçable par un MNT local (LiDAR, Copernicus GLO-30) via un autre fournisseur.
"""

import io
import math
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TILE = 256


def tile_xy(lat: float, lon: float, z: int) -> tuple[float, float]:
    n = 2**z
    x = (lon + 180.0) / 360.0 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def decode(png: bytes) -> np.ndarray:
    rgb = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"), dtype=np.float64)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def fetch_tile(z: int, x: int, y: int, cache_dir: Path, timeout: float = 20) -> np.ndarray:
    path = cache_dir / f"{z}_{x}_{y}.png"
    if path.exists():
        return decode(path.read_bytes())
    with urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=timeout) as r:  # noqa: S310
        data = r.read()
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return decode(data)


def ground_grid(south: float, west: float, north: float, east: float, rows: int, cols: int, cache_dir: Path,
                zoom: int = 13, fetch=fetch_tile) -> np.ndarray:
    """Altitudes (m) échantillonnées sur une grille rows×cols couvrant la boîte (nord en haut)."""
    lats = np.linspace(north, south, rows)
    lons = np.linspace(west, east, cols)
    px = np.array([[tile_xy(la, lo, zoom) for lo in lons] for la in lats])  # (rows, cols, 2) en tuiles
    tx, ty = px[..., 0], px[..., 1]
    needed = {(int(a), int(b)) for a, b in zip(tx.ravel(), ty.ravel())}
    tiles = {k: fetch(zoom, k[0], k[1], cache_dir) for k in needed}
    out = np.empty((rows, cols))
    for i in range(rows):
        for j in range(cols):
            x, y = tx[i, j], ty[i, j]
            t = tiles[(int(x), int(y))]
            out[i, j] = t[min(TILE - 1, int((y - int(y)) * TILE)), min(TILE - 1, int((x - int(x)) * TILE))]
    return out
