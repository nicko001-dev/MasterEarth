"""Tests du proxy de trafic aérien OpenSky (aucun réseau, fetcher injecté)."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import aircraft

BASE_TIME = 1_760_000_000
NOW = float(BASE_TIME)
BBOX = (45.0, 5.0, 55.0, 15.0)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _fresh_aircraft_state():
    aircraft.reset_cache()
    aircraft.reset_rate_limit()
    yield
    aircraft.reset_cache()
    aircraft.reset_rate_limit()


def row(
    icao24: str = "abc123",
    callsign: str = "TEST123 ",
    country: str = "France",
    lat: float = 48.85,
    lon: float = 6.0,
    *,
    altitude: object = 10_000.0,
    on_ground: bool = False,
    velocity: object = 220.0,
    heading: object = 90.0,
    observed_at: int = BASE_TIME,
    source: int = 0,
) -> list:
    return [
        icao24,
        callsign,
        country,
        observed_at,
        observed_at,
        lon,
        lat,
        altitude,
        on_ground,
        velocity,
        heading,
        0.5,
        None,
        altitude,
        "1234",
        False,
        source,
    ]


def payload(*rows: list, time: int = BASE_TIME) -> dict:
    return {"time": time, "states": list(rows)}


def test_parse_states_keeps_valid_rows_and_filters_the_bbox():
    snapshot = aircraft.parse_states(
        payload(
            row("abc123", "AFR1", lat=48.85, lon=6.0),
            row("def456", "OUT", lat=10.0, lon=6.0),  # hors emprise
            row("bad", "NOLAT", lat=float("nan")),
            row("short")[:10],
            "pas une ligne",
        ),
        bbox=BBOX,
        fetched_at=NOW,
    )

    assert len(snapshot.states) == 1
    assert snapshot.states[0].icao24 == "abc123"
    assert snapshot.states[0].callsign == "AFR1"
    assert snapshot.states[0].source == "ADS-B"
    assert snapshot.upstream_time == BASE_TIME


def test_parse_states_handles_missing_states_and_invalid_numbers():
    empty = aircraft.parse_states({"time": BASE_TIME, "states": None}, bbox=BBOX, fetched_at=NOW)
    assert empty.states == ()

    snapshot = aircraft.parse_states(
        payload(
            row("abc123", altitude=None, velocity="fast", heading=True),
        ),
        bbox=BBOX,
        fetched_at=NOW,
    )
    assert snapshot.states[0].altitude_m is None
    assert snapshot.states[0].velocity_m_s is None
    assert snapshot.states[0].heading_deg is None


def test_parse_states_sorts_recent_first_and_caps_the_result():
    rows = [
        row(f"a{index:05d}", observed_at=BASE_TIME - index)
        for index in range(aircraft.MAX_STATES + 20)
    ]
    snapshot = aircraft.parse_states(payload(*rows), bbox=BBOX, fetched_at=NOW)

    assert len(snapshot.states) == aircraft.MAX_STATES
    assert snapshot.states[0].icao24 == "a00000"


def test_load_snapshot_is_cached_and_serves_stale_data_on_failure():
    calls: list[tuple] = []

    def fetcher(south, west, north, east):
        calls.append((south, west, north, east))
        return payload(row())

    first = aircraft.load_snapshot(*BBOX, fetcher=fetcher, now=lambda: NOW)
    second = aircraft.load_snapshot(*BBOX, fetcher=fetcher, now=lambda: NOW + 30)
    assert len(calls) == 1
    assert second == first

    def failing_fetcher(south, west, north, east):
        raise OSError("réseau coupé")

    stale = aircraft.load_snapshot(*BBOX, fetcher=failing_fetcher, now=lambda: NOW + 120)
    assert stale.degraded is True
    assert stale.states == first.states


def test_load_snapshot_raises_when_nothing_is_cached():
    def failing_fetcher(south, west, north, east):
        raise TimeoutError("réseau coupé")

    with pytest.raises(aircraft.AircraftUnavailable):
        aircraft.load_snapshot(*BBOX, fetcher=failing_fetcher, now=lambda: NOW)


@pytest.mark.parametrize(
    "bbox",
    [
        (50.0, 5.0, 45.0, 15.0),  # sud > nord
        (45.0, 15.0, 55.0, 5.0),  # ouest > est
        (-95.0, 5.0, 55.0, 15.0),  # latitude hors bornes
        (-80.0, -190.0, 80.0, 190.0),  # longitude hors bornes
        (-80.0, -180.0, 80.0, 180.0),  # emprise mondiale
    ],
)
def test_validate_bbox_rejects_invalid_or_too_large_areas(bbox):
    from app.core.exceptions import ValidationAppError

    with pytest.raises(ValidationAppError):
        aircraft.validate_bbox(*bbox)


def test_aircraft_route_returns_a_validated_payload(monkeypatch):
    snapshot = aircraft.parse_states(payload(row()), bbox=BBOX, fetched_at=NOW)
    monkeypatch.setattr(aircraft, "load_snapshot", lambda *args, **kwargs: snapshot)

    response = client.get(
        "/api/v1/live/aircraft",
        params={"south": 45, "west": 5, "north": 55, "east": 15},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "OpenSky Network"
    assert body["count"] == 1
    assert body["states"][0]["callsign"] == "TEST123"
    assert body["limitations"]


def test_aircraft_route_returns_503_when_upstream_is_unavailable(monkeypatch):
    def unavailable(*args, **kwargs):
        raise aircraft.AircraftUnavailable("Trafic indisponible.")

    monkeypatch.setattr(aircraft, "load_snapshot", unavailable)

    response = client.get(
        "/api/v1/live/aircraft",
        params={"south": 45, "west": 5, "north": 55, "east": 15},
    )

    assert response.status_code == 503


def test_aircraft_route_rejects_invalid_bbox(monkeypatch):
    def fake_load(south, west, north, east, *args, **kwargs):
        aircraft.validate_bbox(south, west, north, east)
        return aircraft.parse_states(payload(), bbox=BBOX, fetched_at=NOW)

    monkeypatch.setattr(aircraft, "load_snapshot", fake_load)

    response = client.get(
        "/api/v1/live/aircraft",
        params={"south": 55, "west": 5, "north": 45, "east": 15},
    )

    assert response.status_code == 422


def test_aircraft_route_rate_limits_per_host(monkeypatch):
    snapshot = aircraft.parse_states(payload(), bbox=BBOX, fetched_at=NOW)
    monkeypatch.setattr(aircraft, "load_snapshot", lambda *args, **kwargs: snapshot)
    url = "/api/v1/live/aircraft"
    params = {"south": 45, "west": 5, "north": 55, "east": 15}

    for _ in range(aircraft.RATE_LIMIT_MAX_REQUESTS):
        assert client.get(url, params=params).status_code == 200

    response = client.get(url, params=params)
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"
