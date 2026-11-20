"""Tests du flux aérien mondial : couverture de tous les continents, sans réseau.

L'endpoint régional refuse les emprises supérieures à 120° de longitude ; sans
route dédiée, l'ouverture du globe n'affichait donc aucun avion. Ces tests
garantissent l'échantillonnage spatial, le cache dédié, le repli sur données
périmées et la route publique réellement mondiale.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import aircraft

BASE_TIME = 1_760_000_000
NOW = float(BASE_TIME)
client = TestClient(app)

# Positions réelles réparties sur plusieurs secteurs de 6°.
POSITIONS = (
    ("abc123", 48.85, 2.35),  # Europe
    ("def456", -33.9, 151.2),  # Océanie
    ("ghi789", 40.7, -73.9),  # Amérique du Nord
    ("jkl012", -23.5, -46.6),  # Amérique du Sud
    ("mno345", 35.7, 139.7),  # Asie
    ("pqr678", -1.3, 103.8),  # Asie du Sud-Est
    ("stu901", -26.2, 28.0),  # Afrique
    ("vwx234", 37.6, -122.4),  # Ouest des Amériques
)


@pytest.fixture(autouse=True)
def _fresh_global_aircraft_state():
    aircraft.reset_global_cache()
    aircraft.reset_rate_limit()
    yield
    aircraft.reset_global_cache()
    aircraft.reset_rate_limit()


def row(icao24: str, lat: float, lon: float, observed_at: int = BASE_TIME) -> list:
    return [
        icao24,
        f"{icao24.upper()}1 ",
        "France",
        observed_at,
        observed_at,
        lon,
        lat,
        10_000.0,
        False,
        220.0,
        90.0,
        0.0,
        None,
        10_000.0,
        "1234",
        False,
        0,
    ]


def payload(*rows: list) -> dict:
    return {"time": BASE_TIME, "states": list(rows)}


def global_payload() -> dict:
    return payload(*(row(*position) for position in POSITIONS))


def test_repartition_spatiale_evite_la_concentration_sur_une_seule_zone():
    dense = [
        aircraft.AircraftState(
            icao24=f"dense{index:03d}",
            callsign=f"DNS{index}",
            country="France",
            lat=48.0 + index * 0.01,
            lon=2.0 + index * 0.01,
            altitude_m=10_000.0,
            on_ground=False,
            velocity_m_s=220.0,
            heading_deg=90.0,
            vertical_rate_m_s=0.0,
            observed_at=BASE_TIME,
            source="ADS-B",
        )
        for index in range(60)
    ]
    scattered = [
        aircraft.AircraftState(
            icao24=icao24,
            callsign=icao24.upper(),
            country="Monde",
            lat=lat,
            lon=lon,
            altitude_m=10_000.0,
            on_ground=False,
            velocity_m_s=220.0,
            heading_deg=90.0,
            vertical_rate_m_s=0.0,
            observed_at=BASE_TIME - 10,
            source="ADS-B",
        )
        for icao24, lat, lon in POSITIONS
    ]

    # Trois observations maximum par secteur : avec 8 secteurs et une limite
    # de 9, une troncature naïve ne garderait que la zone dense européenne.
    selected = aircraft.distribute_states(dense + scattered, limit=9)

    assert len(selected) == 9
    cells = {
        (int(state.lat // aircraft.GLOBAL_CELL_DEG), int(state.lon // aircraft.GLOBAL_CELL_DEG))
        for state in selected
    }
    assert len(cells) >= 7
    assert sum(1 for state in selected if state.icao24.startswith("dense")) <= aircraft.GLOBAL_MAX_PER_CELL
    assert aircraft.distribute_states(dense + scattered, limit=9) == selected


def test_parse_states_distribue_et_borne_le_nombre_d_observations():
    rows = [row(f"a{index:05d}", -60 + index * 6, -170 + index * 12) for index in range(30)]
    snapshot = aircraft.parse_states(
        payload(*rows),
        bbox=aircraft.GLOBAL_BBOX,
        fetched_at=NOW,
        limit=10,
        distribute=True,
    )

    assert len(snapshot.states) == 10
    assert snapshot.bbox == aircraft.GLOBAL_BBOX
    assert all(-85 <= state.lat <= 85 for state in snapshot.states)
    # Sans répartition, la troncature ne garderait que les 10 premiers secteurs.
    assert len({int(state.lon // aircraft.GLOBAL_CELL_DEG) for state in snapshot.states}) >= 8


def test_charge_utile_mondiale_est_explicite_sur_l_echantillonnage():
    snapshot = aircraft.parse_states(
        global_payload(),
        bbox=aircraft.GLOBAL_BBOX,
        fetched_at=NOW,
        limit=aircraft.MAX_GLOBAL_STATES,
        distribute=True,
    )
    body = aircraft.global_payload(snapshot)

    assert body["scope"] == "worldwide"
    assert body["count"] == len(POSITIONS)
    assert body["bbox"] == {"south": -85.0, "west": -180.0, "north": 85.0, "east": 180.0}
    assert any("échantillon réparti" in line for line in body["limitations"])
    assert body["attribution"] == "OpenSky Network"


def test_snapshot_mondial_est_mis_en_cache_et_rejoue_sur_panne():
    calls: list[str] = []

    def fetcher():
        calls.append("fetch")
        return global_payload()

    first = aircraft.load_global_snapshot(fetcher=fetcher, now=lambda: NOW)
    cached = aircraft.load_global_snapshot(fetcher=fetcher, now=lambda: NOW + 30)
    assert calls == ["fetch"]
    assert cached == first

    def failing():
        raise OSError("réseau coupé")

    stale = aircraft.load_global_snapshot(fetcher=failing, now=lambda: NOW + 120)
    assert stale.degraded is True
    assert stale.states == first.states

    aircraft.reset_global_cache()
    with pytest.raises(aircraft.AircraftUnavailable):
        aircraft.load_global_snapshot(fetcher=failing, now=lambda: NOW + 120)


def test_route_mondiale_renvoie_des_avions_sur_tous_les_continents(monkeypatch):
    monkeypatch.setattr(aircraft, "_fetch_payload", lambda *_: global_payload())

    response = client.get("/api/v1/live/aircraft/global")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scope"] == "worldwide"
    assert body["count"] == len(POSITIONS)
    assert body["bbox"]["west"] == -180.0
    assert any(state["lat"] < 0 for state in body["states"])
    assert any(state["lat"] > 0 for state in body["states"])
    assert any(state["lon"] < -100 for state in body["states"])
    assert any(state["lon"] > 100 for state in body["states"])


def test_route_mondiale_signale_la_panne_sans_inventer_de_positions(monkeypatch):
    def failing(*_):
        raise OSError("OpenSky injoignable")

    monkeypatch.setattr(aircraft, "_fetch_payload", failing)

    response = client.get("/api/v1/live/aircraft/global")

    assert response.status_code == 503
    assert "mondial" in response.json()["message"].lower()


def test_route_mondiale_limite_le_debit_par_client(monkeypatch):
    monkeypatch.setattr(aircraft, "_fetch_payload", lambda *_: global_payload())

    for _ in range(aircraft.RATE_LIMIT_MAX_REQUESTS):
        assert client.get("/api/v1/live/aircraft/global").status_code == 200

    limited = client.get("/api/v1/live/aircraft/global")
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "60"
