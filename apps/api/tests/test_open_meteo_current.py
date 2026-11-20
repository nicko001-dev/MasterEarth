"""Tests du repli d'hôte Open-Meteo pour la précipitation courante, sans réseau.

Scénario réel rencontré : l'hôte principal renvoie 429 « quota quotidien
dépassé » pendant plusieurs heures. Le scan mondial doit alors utiliser l'hôte
de repli (quota distinct) au lieu de compter 198 points inconnus, et ne plus
interroger l'hôte refroidi avant la fin du ``Retry-After`` annoncé.
"""

import json
import urllib.error
from datetime import datetime, timezone

import pytest

from app.infrastructure.weather import open_meteo

PRIMARY = "https://api.open-meteo.com/v1/forecast"
SECONDARY = "https://historical-forecast-api.open-meteo.com/v1/forecast"


@pytest.fixture(autouse=True)
def _fresh_current_state():
    open_meteo.reset_current_state()
    yield
    open_meteo.reset_current_state()


class FakeResponse:
    def __init__(self, payload):
        self._raw = json.dumps(payload).encode()

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def current_payload(precip: float = 0.4) -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
    return {"current": {"time": stamp, "interval": 900, "precipitation": precip}}


def http_429(retry_after: str = "3600"):
    headers = {"Retry-After": retry_after}
    return urllib.error.HTTPError(
        PRIMARY, 429, "Too Many Requests", headers, None
    )


def test_requete_courante_sans_serie_horaire_et_avec_repli(monkeypatch):
    calls = []

    def fake_urlopen(url, timeout=None):
        calls.append(url)
        if url.startswith(PRIMARY):
            raise http_429()
        return FakeResponse(current_payload(0.4))

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    locations = [("Monde 0,0", 0.0, 0.0)]
    results = open_meteo.fetch_current_many(locations, (PRIMARY, SECONDARY))

    assert len(results) == 1
    assert results[0].points is not None
    assert results[0].points[0].precip_mm == pytest.approx(0.4)
    assert results[0].points[0].is_forecast is False
    # La requête ne demande QUE la précipitation courante : pas de série
    # horaire ni de jours passés/à venir (économie de quota).
    assert "current=precipitation" in calls[0]
    assert "hourly" not in calls[0]
    assert "past_days" not in calls[0]
    assert "forecast_days" not in calls[0]
    # Le repli a bien servi la réponse.
    assert calls[1].startswith(SECONDARY)
    assert open_meteo.current_host() == SECONDARY


def test_hote_refroidi_n_est_plus_interroge(monkeypatch):
    calls = []

    def fake_urlopen(url, timeout=None):
        calls.append(url)
        if url.startswith(PRIMARY):
            raise http_429("600")
        return FakeResponse([current_payload(0.2), current_payload(0.2)])

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    locations = [("Monde 0,0", 0.0, 0.0), ("Monde 1,1", 1.0, 1.0)]

    first = open_meteo.fetch_current_many(locations, (PRIMARY, SECONDARY))
    assert [r.error for r in first] == [None, None]
    assert len(calls) == 2  # primaire (429) puis secondaire

    calls.clear()
    second = open_meteo.fetch_current_many(locations, (PRIMARY, SECONDARY))
    # Primaire refroidi : on va directement au secondaire, sans requête perdue.
    assert [c.startswith(SECONDARY) for c in calls] == [True]
    assert [r.error for r in second] == [None, None]


def test_tous_les_hotes_en_echec_laissent_les_points_inconnus(monkeypatch):
    def fake_urlopen(url, timeout=None):
        raise urllib.error.URLError("réseau coupé")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    results = open_meteo.fetch_current_many([("Monde 0,0", 0.0, 0.0)], (PRIMARY, SECONDARY))

    assert len(results) == 1
    assert results[0].points is None
    assert results[0].error == "Unavailable"
    assert open_meteo.current_host() is None


def test_lot_multi_lieux_parse_chaque_point(monkeypatch):
    def fake_urlopen(url, timeout=None):
        return FakeResponse([current_payload(0.0), current_payload(1.1)])

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    locations = [("A", 0.0, 0.0), ("B", 10.0, 10.0)]
    results = open_meteo.fetch_current_many(locations, (PRIMARY,))

    assert [r.error for r in results] == [None, None]
    assert results[0].points[0].precip_mm == pytest.approx(0.0)
    assert results[1].points[0].precip_mm == pytest.approx(1.1)


def test_reponse_200_sans_valeur_courante_declenche_le_repli(monkeypatch):
    calls = []

    def fake_urlopen(url, timeout=None):
        calls.append(url)
        if url.startswith(PRIMARY):
            return FakeResponse({"current": {"precipitation": None}})
        return FakeResponse(current_payload(0.3))

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    results = open_meteo.fetch_current_many([("A", 0.0, 0.0)], (PRIMARY, SECONDARY))

    assert results[0].error is None
    assert results[0].points[0].precip_mm == pytest.approx(0.3)
    assert calls[1].startswith(SECONDARY)
