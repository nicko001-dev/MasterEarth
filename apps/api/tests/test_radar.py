"""Tests du proxy radar RainViewer (aucun réseau, fetcher injecté)."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import radar

BASE_TIME = 1_760_000_000
NOW = float(BASE_TIME)
PNG = b"\x89PNG\r\n\x1a\n" + b"radar"

client = TestClient(app)


@pytest.fixture(autouse=True)
def _fresh_radar_state():
    radar.reset_cache()
    radar.reset_tile_cache()
    radar.reset_rate_limit()
    yield
    radar.reset_cache()
    radar.reset_tile_cache()
    radar.reset_rate_limit()


def make_product(*, count: int = 3, fetched_at: float = NOW) -> radar.RadarProduct:
    frames = tuple(
        radar.RadarFrame(
            time=BASE_TIME + 300 * offset,
            path=f"/v2/radar/frame_{offset}",
            forecast=False,
        )
        for offset in range(count)
    )
    return radar.RadarProduct(
        host=radar.UPSTREAM_HOST, frames=frames, fetched_at=fetched_at
    )


def make_payload(past: list, nowcast: list | None = None) -> dict:
    return {
        "version": "2.0",
        "generated": BASE_TIME,
        # L'hôte du fournisseur ne doit jamais être repris tel quel.
        "host": "https://attacker.example.com",
        "radar": {"past": past, "nowcast": nowcast or []},
    }


def valid_past(count: int) -> list[dict]:
    return [
        {
            "time": BASE_TIME - 60 * offset,
            "path": f"/v2/radar/past_{offset}",
        }
        for offset in range(count)
    ]


class _FakeHeaders:
    def __init__(self, content_type: str) -> None:
        self._content_type = content_type

    def get_content_type(self) -> str:
        return self._content_type


class _FakeResponse:
    def __init__(self, body: bytes, content_type: str = "image/png") -> None:
        self._body = body
        self.headers = _FakeHeaders(content_type)

    def read(self, amount: int = -1) -> bytes:
        return self._body if amount < 0 else self._body[:amount]

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *exc_info: object) -> bool:
        return False


def test_load_frames_keeps_valid_frames_sorts_caps_and_normalises_host():
    invalid = [
        {"time": BASE_TIME, "path": "/v1/radar/ancien"},
        {"time": BASE_TIME, "path": "/v2/radar/tiret-invalide"},
        {"time": BASE_TIME, "path": "/v2/radar/abc/extra"},
        {"time": 0, "path": "/v2/radar/zero"},
        {"time": -10, "path": "/v2/radar/negatif"},
        {"time": "123", "path": "/v2/radar/texte"},
        {"time": True, "path": "/v2/radar/booleen"},
        {"time": BASE_TIME},
        {"path": "/v2/radar/sans_heure"},
        "pas-une-image",
    ]
    nowcast = [
        {"time": BASE_TIME + 300 * (offset + 1), "path": f"/v2/radar/now_{offset}"}
        for offset in range(5)
    ]
    payload = make_payload(invalid + valid_past(20), nowcast)

    product = radar.load_frames(fetcher=lambda: payload, now=lambda: NOW)

    assert product.host == "https://tilecache.rainviewer.com"
    assert product.fetched_at == NOW
    assert len(product.frames) == 16
    times = [frame.time for frame in product.frames]
    assert times == sorted(times)
    assert all(frame.path.startswith("/v2/radar/") for frame in product.frames)
    past_frames = [frame for frame in product.frames if not frame.forecast]
    forecast_frames = [frame for frame in product.frames if frame.forecast]
    assert len(past_frames) == 13
    assert len(forecast_frames) == 3
    # Les 13 images passées les plus récentes, puis les 3 premières prévisions.
    assert product.frames[0].time == BASE_TIME - 720
    assert product.frames[-1].time == BASE_TIME + 900


def test_load_frames_is_cached_for_five_minutes():
    calls: list[int] = []
    payload = make_payload(valid_past(3))

    def fetcher() -> dict:
        calls.append(1)
        return payload

    first = radar.load_frames(fetcher=fetcher, now=lambda: NOW)
    second = radar.load_frames(fetcher=fetcher, now=lambda: NOW + 299)

    assert len(calls) == 1
    assert second == first

    refreshed = radar.load_frames(True, fetcher=fetcher, now=lambda: NOW + 299)

    assert len(calls) == 2
    assert refreshed.fetched_at == NOW + 299


def test_stale_frames_are_served_when_upstream_fails_after_a_success():
    payload = make_payload(valid_past(2))
    first = radar.load_frames(fetcher=lambda: payload, now=lambda: NOW)

    def failing_fetcher() -> dict:
        raise OSError("réseau coupé")

    stale = radar.load_frames(fetcher=failing_fetcher, now=lambda: NOW + 3_600)

    assert stale == first
    assert stale.fetched_at == NOW


def test_unavailable_frames_raise_when_nothing_is_cached():
    def failing_fetcher() -> dict:
        raise TimeoutError("réseau coupé")

    with pytest.raises(radar.RadarUnavailable) as excinfo:
        radar.load_frames(fetcher=failing_fetcher, now=lambda: NOW)

    assert "indisponible" in str(excinfo.value).lower()


def test_invalid_payload_raises_when_nothing_is_cached():
    with pytest.raises(radar.RadarUnavailable):
        radar.load_frames(
            fetcher=lambda: {"radar": {"past": "pas-une-liste"}},
            now=lambda: NOW,
        )


def test_tile_url_builds_the_exact_rainviewer_png_url():
    product = make_product(count=2)

    url = radar.tile_url(product, 1, 3, 4, 5)

    assert url == (
        "https://tilecache.rainviewer.com/v2/radar/frame_1/256/3/4/5/2/1_1.png"
    )
    with pytest.raises(ValueError):
        radar.tile_url(product, 2, 3, 4, 5)
    with pytest.raises(ValueError):
        radar.tile_url(product, -1, 3, 4, 5)


@pytest.mark.parametrize(
    ("z", "x", "y"),
    [
        (8, 0, 0),
        (-1, 0, 0),
        (0, -1, 0),
        (0, 0, -1),
        (2, 4, 0),
        (2, 0, 4),
        (0, 1, 0),
        (7, 128, 0),
    ],
)
def test_validate_tile_coordinates_rejects_invalid_tiles(z, x, y):
    with pytest.raises(ValueError):
        radar.validate_tile_coordinates(z, x, y)


def test_validate_tile_coordinates_accepts_the_boundaries():
    radar.validate_tile_coordinates(0, 0, 0)
    radar.validate_tile_coordinates(7, 127, 127)


def test_fetch_tile_rejects_a_non_png_response(monkeypatch):
    monkeypatch.setattr(
        radar.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeResponse(b"<html></html>", "text/html"),
    )

    with pytest.raises(radar.RadarUnavailable):
        radar.fetch_tile(make_product(), 0, 1, 0, 0)


def test_fetch_tile_rejects_an_oversized_payload(monkeypatch):
    oversized = b"x" * (radar.MAX_TILE_BYTES + 1)
    monkeypatch.setattr(
        radar.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeResponse(oversized),
    )

    with pytest.raises(radar.RadarUnavailable):
        radar.fetch_tile(make_product(), 0, 1, 0, 0)


def test_fetch_tile_is_cached_by_frame_and_coordinates(monkeypatch):
    calls: list[str] = []

    def fake_urlopen(request, timeout):
        calls.append(request.full_url)
        return _FakeResponse(PNG)

    monkeypatch.setattr(radar.urllib.request, "urlopen", fake_urlopen)
    product = make_product(count=2)

    first = radar.fetch_tile(product, 0, 2, 1, 3)
    second = radar.fetch_tile(product, 0, 2, 1, 3)
    other_frame = radar.fetch_tile(product, 1, 2, 1, 3)

    assert first == second == other_frame == (PNG, "image/png")
    assert len(calls) == 2
    assert calls[0].endswith("/256/2/1/3/2/1_1.png")
    assert "/frame_0/" in calls[0]
    assert "/frame_1/" in calls[1]


def test_radar_frames_route_returns_the_frontend_contract(monkeypatch):
    product = make_product(count=3)
    monkeypatch.setattr(radar, "load_frames", lambda: product)

    response = client.get("/api/v1/weather/radar/frames")

    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {
        "generated_at",
        "attribution",
        "attribution_url",
        "frames",
        "limitations",
    }
    assert body["attribution"] == "Weather data by RainViewer"
    assert body["attribution_url"] == "https://www.rainviewer.com/"
    assert body["limitations"]
    assert all(isinstance(line, str) for line in body["limitations"])
    assert datetime.fromisoformat(body["generated_at"]).tzinfo is not None
    assert [frame["index"] for frame in body["frames"]] == [0, 1, 2]
    assert set(body["frames"][0]) == {"index", "time", "forecast"}
    assert body["frames"][0]["time"] == BASE_TIME
    assert body["frames"][0]["forecast"] is False


def test_radar_frames_route_returns_503_when_unavailable(monkeypatch):
    def unavailable() -> radar.RadarProduct:
        raise radar.RadarUnavailable("Radar indisponible pour le moment.")

    monkeypatch.setattr(radar, "load_frames", unavailable)

    response = client.get("/api/v1/weather/radar/frames")

    assert response.status_code == 503, response.text
    assert "indisponible" in response.json()["message"].lower()


def test_radar_tile_route_returns_a_png_with_cache_and_cors_headers(monkeypatch):
    monkeypatch.setattr(radar, "load_frames", lambda: make_product())
    monkeypatch.setattr(
        radar,
        "fetch_tile",
        lambda product, index, z, x, y: (PNG, "image/png"),
    )

    response = client.get(
        "/api/v1/weather/radar/tiles/0/2/1/3.png",
        headers={"Origin": "http://127.0.0.1:5173"},
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "public, max-age=600"
    # Le CORS est géré par le middleware configuré, pas par un « * » manuel :
    # un en-tête sauvage entrerait en conflit avec les requêtes credentialées.
    assert (
        response.headers["access-control-allow-origin"]
        == "http://127.0.0.1:5173"
    )
    assert response.content == PNG


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/api/v1/weather/radar/tiles/0/8/0/0.png", "zoom"),
        ("/api/v1/weather/radar/tiles/0/2/4/0.png", "limites"),
        ("/api/v1/weather/radar/tiles/0/0/0/2.png", "limites"),
        ("/api/v1/weather/radar/tiles/-1/1/0/0.png", "index"),
    ],
)
def test_radar_tile_route_rejects_invalid_requests(monkeypatch, path, expected):
    monkeypatch.setattr(radar, "load_frames", lambda: make_product())

    response = client.get(path)

    assert response.status_code == 422, response.text
    assert expected in response.json()["message"].lower()


def test_radar_tile_route_returns_404_for_an_unknown_frame(monkeypatch):
    monkeypatch.setattr(radar, "load_frames", lambda: make_product(count=2))

    response = client.get("/api/v1/weather/radar/tiles/7/0/0/0.png")

    assert response.status_code == 404, response.text
    assert "inconnue" in response.json()["message"].lower()


def test_radar_tile_route_returns_503_when_the_upstream_fails(monkeypatch):
    monkeypatch.setattr(radar, "load_frames", lambda: make_product())

    def unavailable(product, index, z, x, y):
        raise radar.RadarUnavailable("Tuile radar indisponible pour le moment.")

    monkeypatch.setattr(radar, "fetch_tile", unavailable)

    response = client.get("/api/v1/weather/radar/tiles/0/1/0/0.png")

    assert response.status_code == 503, response.text
    assert "indisponible" in response.json()["message"].lower()


def test_radar_tile_route_rate_limits_per_client_host(monkeypatch):
    monkeypatch.setattr(radar, "load_frames", lambda: make_product())
    invalid = "/api/v1/weather/radar/tiles/0/8/0/0.png"

    for _ in range(radar.RATE_LIMIT_MAX_REQUESTS):
        assert client.get(invalid).status_code == 422

    limited = client.get(invalid)

    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "60"
    assert "Trop de requêtes" in limited.json()["message"]
