import numpy as np
import pytest

from app.domain import flood_model as fm
from app.infrastructure.dem import terrarium


def bowl(n=41):
    y, x = np.mgrid[0:n, 0:n]
    return 0.05 * np.hypot(x - n // 2, y - n // 2) ** 2  # cuvette : 0 m au centre


def test_level_floods_connected_cells_only():
    g = bowl()
    g[:, 0:3] = -5.0  # cuvette isolée : plus basse mais séparée par une crête
    g[:, 3:6] = 50.0
    r = fm.flood_from_level(g, (20, 20), 1.0, 10.0, 0.0)
    assert r.max_depth_m == pytest.approx(1.0, abs=1e-6) and r.depth_m[20, 20] == pytest.approx(1.0)
    assert r.depth_m[:, 0:3].sum() == 0  # non connectée à la source : sèche
    assert r.surface_level_m == pytest.approx(1.0)


def test_more_water_floods_more_and_uncertainty_widens():
    g = bowl()
    a = fm.flood_from_level(g, (20, 20), 1.0, 10.0, 0.0)
    b = fm.flood_from_level(g, (20, 20), 3.0, 10.0, 0.0)
    c = fm.flood_from_level(g, (20, 20), 1.0, 10.0, 1.5)
    assert b.area_km2 > a.area_km2 and b.volume_m3 > a.volume_m3
    assert c.possible.sum() > (a.depth_m > 0).sum()


def test_rain_volume_balance():
    g = bowl()
    cell = 10.0
    r = fm.flood_from_rain(g, rain_mm_h=30, hours=2, runoff=0.6, cell_m=cell, dem_error_m=0.0)
    expected = 0.030 * 2 * g.size * cell**2 * 0.6
    assert r.volume_m3 == pytest.approx(expected, rel=0.02)  # le volume stocké = le volume ruisselé
    assert fm.flood_from_rain(g, 0, 2, 0.6, cell, 0).area_km2 == 0


def test_invalid_inputs():
    with pytest.raises(ValueError):
        fm.flood_from_level(bowl(), (1, 1), -1, 10, 0)
    with pytest.raises(ValueError):
        fm.flood_from_rain(bowl(), 10, 1, 1.5, 10, 0)


def test_terrarium_decode_and_sampling(tmp_path):
    h = np.full((256, 256), 123.5)  # 123,5 m
    v = h + 32768
    rgb = np.stack([np.floor(v / 256), np.floor(v) % 256, np.floor((v - np.floor(v)) * 256)], -1).astype(np.uint8)
    from PIL import Image
    import io
    buf = io.BytesIO(); Image.fromarray(rgb).save(buf, "PNG")
    assert terrarium.decode(buf.getvalue()).mean() == pytest.approx(123.5, abs=0.01)
    grid = terrarium.ground_grid(5.30, -4.05, 5.40, -3.95, 5, 6, tmp_path, 13, fetch=lambda z, x, y, c: terrarium.decode(buf.getvalue()))
    assert grid.shape == (5, 6) and np.allclose(grid, 123.5, atol=0.01)
