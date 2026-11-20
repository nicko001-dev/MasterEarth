"""Tests du proxy de réseau routier OpenStreetMap (aucun réseau, fetcher injecté)."""

import threading

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import roads

NOW = 1_760_000_000.0
BBOX = (5.30, -4.05, 5.36, -3.99)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _fresh_roads_state():
    roads.reset_cache()
    roads.reset_rate_limit()
    yield
    roads.reset_cache()
    roads.reset_rate_limit()


def way(
    identifier: int = 1,
    highway: str = "primary",
    points: list[tuple[float, float]] | None = None,
    **tags: object,
) -> dict:
    coords = points or [(5.31, -4.03), (5.32, -4.02), (5.33, -4.01)]
    return {
        "type": "way",
        "id": identifier,
        "tags": {"highway": highway, **tags},
        "geometry": [{"lat": lat, "lon": lon} for lat, lon in coords],
    }


def payload(*elements: dict) -> dict:
    return {"version": 0.6, "elements": list(elements)}


def test_parse_roads_keeps_supported_classes_and_drops_the_rest():
    snapshot = roads.parse_roads(
        payload(
            way(1, "primary"),
            way(2, "footway"),
            way(3, "residential", points=[(5.31, -4.03)]),
            {"type": "node", "id": 4},
            "pas un élément",
        ),
        bbox=BBOX,
        fetched_at=NOW,
    )

    assert [road.id for road in snapshot.roads] == ["1"]
    assert snapshot.roads[0].road_class == "primary"
    assert len(snapshot.roads[0].points) == 3


def test_parse_roads_reads_direction_and_speed():
    snapshot = roads.parse_roads(
        payload(
            way(1, "motorway", oneway="yes"),
            way(2, "residential", oneway="-1", maxspeed="30"),
            way(3, "secondary", maxspeed="90 km/h"),
            way(4, "tertiary", junction="roundabout"),
            way(5, "trunk", maxspeed="500"),
        ),
        bbox=BBOX,
        fetched_at=NOW,
    )
    by_id = {road.id: road for road in snapshot.roads}

    assert by_id["1"].oneway == 1
    assert by_id["2"].oneway == -1
    assert by_id["2"].max_speed_kmh == 30
    assert by_id["3"].max_speed_kmh == 90
    assert by_id["4"].oneway == 1
    # Une vitesse aberrante est ignorée au profit de la valeur par défaut.
    assert by_id["5"].max_speed_kmh == 90


def test_parse_roads_sorts_main_axes_first_and_caps_the_result():
    elements = [way(index, "residential") for index in range(roads.MAX_WAYS + 30)]
    elements.insert(0, way(9999, "motorway"))
    snapshot = roads.parse_roads(payload(*elements), bbox=BBOX, fetched_at=NOW)

    assert len(snapshot.roads) == roads.MAX_WAYS
    assert snapshot.roads[0].road_class == "motorway"


def test_parse_roads_decimates_long_ways():
    points = [(5.30 + index * 0.0001, -4.05) for index in range(400)]
    snapshot = roads.parse_roads(payload(way(1, "primary", points=points)), bbox=BBOX, fetched_at=NOW)
    road = snapshot.roads[0]

    assert len(road.points) == roads.MAX_POINTS_PER_WAY
    assert road.points[0] == pytest.approx((points[0][1], points[0][0]))
    assert road.points[-1] == pytest.approx((points[-1][1], points[-1][0]))


def test_parse_roads_rejects_invalid_payloads():
    with pytest.raises(ValueError):
        roads.parse_roads("pas un objet", bbox=BBOX, fetched_at=NOW)
    with pytest.raises(ValueError):
        roads.parse_roads({"elements": "nope"}, bbox=BBOX, fetched_at=NOW)
    assert roads.parse_roads({}, bbox=BBOX, fetched_at=NOW).roads == ()


def test_load_snapshot_is_cached_and_serves_stale_data_on_failure():
    calls: list[tuple] = []

    def fetcher(south, west, north, east):
        calls.append((south, west, north, east))
        return payload(way(1, "primary"))

    first = roads.load_snapshot(*BBOX, fetcher=fetcher, now=lambda: NOW)
    second = roads.load_snapshot(*BBOX, fetcher=fetcher, now=lambda: NOW + 60)
    assert len(calls) == 1
    assert second == first

    def failing_fetcher(south, west, north, east):
        raise OSError("réseau coupé")

    stale = roads.load_snapshot(*BBOX, fetcher=failing_fetcher, now=lambda: NOW + roads.CACHE_TTL_SECONDS + 5)
    assert stale.degraded is True
    assert stale.roads == first.roads


def test_load_snapshot_reuses_a_neighbouring_area_without_refetching():
    calls: list[tuple] = []

    def fetcher(south, west, north, east):
        calls.append((south, west, north, east))
        return payload(way(1, "primary"))

    roads.load_snapshot(*BBOX, fetcher=fetcher, now=lambda: NOW)
    # Vue décalée mais très largement couverte par la précédente.
    neighbour = roads.load_snapshot(5.31, -4.04, 5.37, -3.98, fetcher=fetcher, now=lambda: NOW + 5)

    assert len(calls) == 1
    assert neighbour.degraded is True


def test_load_snapshot_raises_when_nothing_is_cached():
    def failing_fetcher(south, west, north, east):
        raise TimeoutError("réseau coupé")

    with pytest.raises(roads.RoadsUnavailable):
        roads.load_snapshot(*BBOX, fetcher=failing_fetcher, now=lambda: NOW)


@pytest.mark.parametrize(
    "bbox",
    [
        (-91.0, 5.0, 5.0, 6.0),
        (5.0, 200.0, 6.0, 7.0),
        (5.0, 6.0, 6.0, 5.0),
        (6.0, 5.0, 5.0, 6.0),
        (-40.0, -60.0, 40.0, 60.0),
    ],
)
def test_load_snapshot_rejects_invalid_bounds(bbox):
    with pytest.raises(Exception) as error:
        roads.load_snapshot(*bbox, fetcher=lambda *_: payload(), now=lambda: NOW)
    message = str(error.value).lower()
    assert any(word in message for word in ("emprise", "degrés", "longitude", "latitude"))


def test_roads_endpoint_loads_in_the_background_then_serves_roads(monkeypatch):
    monkeypatch.setattr(
        roads,
        "_fetch_payload",
        lambda south, west, north, east: payload(way(7, "secondary", maxspeed="50")),
    )
    params = {"west": -4.05, "south": 5.30, "east": -3.99, "north": 5.36}

    pending = client.get("/api/v1/live/roads", params=params)
    assert pending.status_code == 202
    assert pending.json()["status"] == "loading"
    assert pending.json()["roads"] == []

    roads.wait_for_background_loads()

    ready = client.get("/api/v1/live/roads", params=params)
    assert ready.status_code == 200
    body = ready.json()
    assert body["status"] == "ready"
    assert body["count"] == 1
    assert body["roads"][0]["class"] == "secondary"
    assert body["roads"][0]["points"] == [[-4.03, 5.31], [-4.02, 5.32], [-4.01, 5.33]]
    assert "OpenStreetMap" in body["attribution"]
    assert body["license"].startswith("ODbL")
    assert body["limitations"]


def test_snapshot_or_start_reports_pending_only_once_per_area():
    release = threading.Event()

    def slow_fetcher(south, west, north, east):
        release.wait(5)
        return payload(way(1, "primary"))

    first, pending_first = roads.snapshot_or_start(*BBOX, fetcher=slow_fetcher, now=lambda: NOW)
    second, pending_second = roads.snapshot_or_start(*BBOX, fetcher=slow_fetcher, now=lambda: NOW)
    assert first is None and pending_first is True
    assert second is None and pending_second is True

    release.set()
    roads.wait_for_background_loads()
    ready, pending = roads.snapshot_or_start(*BBOX, fetcher=slow_fetcher, now=lambda: NOW + 5)
    assert pending is False
    assert ready is not None and len(ready.roads) == 1


def test_roads_endpoint_rejects_a_continent_wide_view():
    response = client.get(
        "/api/v1/live/roads",
        params={"west": -60.0, "south": -40.0, "east": 60.0, "north": 40.0},
    )
    assert response.status_code == 422
