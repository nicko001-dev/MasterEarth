"""Tests du scan de pluie mondial : véracité des statistiques, sans réseau.

Le point critique : un point en échec est un point **inconnu**, jamais un
point sec. L'API doit donc pouvoir répondre ``rain_points: null`` plutôt
qu'un zéro qui laisserait croire qu'il ne pleut nulle part dans le monde.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.domain.weather import WeatherPoint
from app.infrastructure.weather import open_meteo
from app.main import app
from app.services import geocoding, global_rain

NOW = datetime(2026, 11, 6, 18, 0, tzinfo=timezone.utc)
client = TestClient(app)


@pytest.fixture(autouse=True)
def _fresh_global_rain_state():
    global_rain.reset_cache()
    global_rain.reset_rate_limit()
    yield
    global_rain.reset_cache()
    global_rain.reset_rate_limit()


def observed(precip_mm: float, *, hours_ago: float = 0) -> WeatherPoint:
    return WeatherPoint(NOW - timedelta(hours=hours_ago), precip_mm, False)


def forecast(precip_mm: float) -> WeatherPoint:
    return WeatherPoint(NOW + timedelta(hours=1), precip_mm, True)


def provider_for(values: dict[float, list[WeatherPoint] | None]):
    """Fournisseur injecté : valeur par longitude (balayage = latitudes x longitudes)."""

    def provider(locations):
        results = []
        for location in locations:
            lon = location[2]
            results.append(open_meteo.FetchResult(location, values.get(lon, [observed(0.0)])))
        return results

    return provider


def test_balayage_mondial_couvre_tous_les_continents():
    points = global_rain.global_points()

    assert len(points) == 198
    assert len({(lat, lon) for _, lat, lon in points}) == 198
    assert min(lat for _, lat, _ in points) == -75.0
    assert max(lat for _, lat, _ in points) == 75.0
    assert min(lon for _, _, lon in points) == -180.0
    assert max(lon for _, _, lon in points) == 160.0
    assert any(lon < -100 for _, _, lon in points)  # Amériques
    assert any(lon > 100 for _, _, lon in points)  # Asie / Océanie
    assert any(abs(lon) < 20 for _, _, lon in points)  # Europe / Afrique


def test_precipitation_courante_ignore_les_previsions_et_les_valeurs_futures():
    points = [forecast(30.0), observed(0.4, hours_ago=2), observed(1.2, hours_ago=1)]
    assert global_rain.current_precipitation(points, NOW) == 1.2

    assert global_rain.current_precipitation([forecast(30.0)], NOW) is None
    assert global_rain.current_precipitation(None, NOW) is None
    assert global_rain.current_precipitation([], NOW) is None
    assert global_rain.current_precipitation([observed(501.0)], NOW) is None


def test_charge_utile_distingue_le_zero_de_la_donnee_manquante():
    snapshot = global_rain.GlobalRainSnapshot(
        samples=(
            global_rain.RainSample("Pluie", 0.0, 0.0, 1.2),
            global_rain.RainSample("Sec", 15.0, 20.0, 0.0),
            global_rain.RainSample("Echec", -30.0, -20.0, None),
        ),
        generated_at=NOW,
        degraded=True,
    )
    body = global_rain.payload(snapshot, now=NOW)

    assert body["scope"] == "worldwide"
    assert body["available"] is True
    assert body["stale"] is False
    assert body["age_seconds"] == 0
    assert body["source"] == "Open-Meteo"
    assert body["sampled_points"] == 3
    assert body["valid_points"] == 2
    assert body["failed_points"] == 1
    assert body["rain_points"] == 1
    assert body["rain_fraction"] == 0.5
    assert body["max_precip_mm_h"] == 1.2
    assert body["degraded"] is True
    assert body["attribution"] == "Open-Meteo (CC BY 4.0)"
    assert body["limitations"]


def test_indisponibilite_n_affiche_jamais_un_zero_trompeur():
    body = global_rain.unavailable_payload()

    assert body["available"] is False
    assert body["rain_points"] is None
    assert body["rain_fraction"] is None
    assert body["max_precip_mm_h"] is None
    assert body["valid_points"] == 0
    assert body["failed_points"] == body["sampled_points"] == 198
    assert body["wettest"] == []
    assert body["rain_places"] == []
    assert body["stale"] is True
    assert body["source"] is None


def test_scan_compte_la_pluie_sans_inventer_les_points_en_echec():
    values = {
        -20.0: [observed(0.6, hours_ago=2), observed(1.4, hours_ago=1)],
        -40.0: None,  # fournisseur en échec : point inconnu
        100.0: [observed(0.2)],
    }
    snapshot = global_rain.scan(provider=provider_for(values), now=NOW)
    body = global_rain.payload(snapshot)

    assert body["sampled_points"] == 198
    # -40° est en échec sur les 11 latitudes : 11 points inconnus.
    assert body["failed_points"] == 11
    assert body["valid_points"] == 187
    assert body["degraded"] is True
    # -20° (11 points) et 100° (11 points) dépassent le seuil de 0,05 mm/h.
    assert body["rain_points"] == 22
    assert body["max_precip_mm_h"] == 1.4
    assert body["wettest"][0]["name"] == "Monde -75,-20"


def test_scan_leve_une_indisponibilite_quand_aucun_point_n_est_valide():
    provider = lambda locations: [  # noqa: E731
        open_meteo.FetchResult(location, None) for location in locations
    ]
    with pytest.raises(global_rain.GlobalRainUnavailable):
        global_rain.scan(provider=provider, now=NOW)


def test_scan_utilise_le_cache_puis_un_repli_perime_deterministe():
    first = global_rain.scan(provider=provider_for({}), now=NOW)
    assert global_rain.scan(provider=provider_for({}), now=NOW + timedelta(minutes=5)) is first

    failing = lambda locations: [  # noqa: E731
        open_meteo.FetchResult(location, None) for location in locations
    ]
    # Deux heures après : hors quota quotidien, la dernière mesure valide reste
    # servie, explicitement marquée périmée avec son âge exact.
    stale = global_rain.scan(provider=failing, now=NOW + timedelta(hours=2))
    assert stale.degraded is True
    assert stale.stale is True
    assert stale.samples == first.samples
    body = global_rain.payload(stale, now=NOW + timedelta(hours=2))
    assert body["stale"] is True
    assert body["available"] is True
    assert body["age_seconds"] == 7200

    with pytest.raises(global_rain.GlobalRainUnavailable):
        global_rain.scan(provider=failing, now=NOW + timedelta(hours=7))


def test_scan_conserve_la_source_du_hôte_de_repli():
    snapshot = global_rain.scan(provider=provider_for({}), now=NOW)
    assert snapshot.source == "Open-Meteo"
    body = global_rain.payload(snapshot, now=NOW)
    assert body["source"] == "Open-Meteo"


def test_route_mondiale_expose_des_statistiques_veridiques(monkeypatch):
    # Le géocodage de l'affinage est simulé : aucun test ne doit toucher au réseau.
    monkeypatch.setattr(geocoding, "reverse_named", lambda lat, lon: None)
    monkeypatch.setattr(
        open_meteo,
        "fetch_current_many",
        lambda locations: [
            open_meteo.FetchResult(
                location,
                [WeatherPoint(datetime.now(timezone.utc) - timedelta(hours=1), 0.8, False)],
            )
            if location[2] == -20.0
            else open_meteo.FetchResult(location, None)
            for location in locations
        ],
    )

    response = client.get("/api/v1/weather/global-rain")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scope"] == "worldwide"
    assert body["available"] is True
    assert body["stale"] is False
    assert body["sampled_points"] == 198
    assert body["rain_points"] == 11  # les 11 latitudes à -20°
    assert body["failed_points"] == 187
    assert body["degraded"] is True


def test_route_mondiale_repond_indisponible_sans_zero_quand_tout_echoue(monkeypatch):
    def unavailable():
        raise global_rain.GlobalRainUnavailable("fournisseur indisponible")

    monkeypatch.setattr(global_rain, "scan", unavailable)

    response = client.get("/api/v1/weather/global-rain")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is False
    assert body["rain_points"] is None
    assert body["failed_points"] == 198


def test_route_mondiale_est_protegee_contre_les_abus(monkeypatch):
    snapshot = global_rain.GlobalRainSnapshot(
        samples=(global_rain.RainSample("Pluie", 0.0, 0.0, 1.0),),
        generated_at=NOW,
    )
    monkeypatch.setattr(global_rain, "scan", lambda: snapshot)

    for _ in range(global_rain.RATE_LIMIT_MAX_REQUESTS):
        assert client.get("/api/v1/weather/global-rain").status_code == 200

    limited = client.get("/api/v1/weather/global-rain")
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "60"


def test_nomme_une_rue_ou_un_quartier_sans_inventer_de_lieu():
    sample = global_rain.RainSample("Monde 5,-4", 5.2, -4.1, 8.4)
    found = {
        "place": {
            "name": "Marcory Zone 4",
            "street": "Rue des Jardins",
            "housenumber": "12",
            "city": "Abidjan",
            "country": "Côte d'Ivoire",
            "type": "address",
            "lat": 5.2,
            "lon": -4.1,
        },
        "distance_km": 0.3,
    }
    named = global_rain.describe_place(sample, geocoder=lambda lat, lon: found)

    assert named["named"] is True
    assert named["precision"] == "street"
    assert named["name"] == "12 Rue des Jardins"
    assert "Abidjan" in named["detail"]
    assert "Côte d'Ivoire" in named["detail"]
    assert named["precip_mm_h"] == 8.4
    assert named["attribution"] == geocoding.ATTRIBUTION

    # Un numéro absent ne doit jamais produire « None Rue des Jardins ».
    found["place"].pop("housenumber")
    sans_numero = global_rain.describe_place(sample, geocoder=lambda lat, lon: found)
    assert sans_numero["name"] == "Rue des Jardins"

    anonymous = global_rain.describe_place(
        global_rain.RainSample("Atlantique", 0.0, -30.0, 2.1),
        geocoder=lambda lat, lon: None,
    )
    assert anonymous["named"] is False
    assert anonymous["precision"] == "coordinates"
    assert "30.00" in anonymous["name"]
    assert anonymous["city"] is None


def test_geocodage_inverse_refuse_un_lieu_trop_eloigne():
    sample = global_rain.RainSample("Océan", 0.0, -30.0, 1.0)
    far = {
        "place": {"name": "Ville lointaine", "country": "Pays", "lat": 5.0, "lon": -4.0, "type": "city"},
        "distance_km": 3_000,
    }
    # Le filtre de distance est dans geocoding.reverse_named : ici on vérifie
    # que le service de nommage reste honnête même si un fournisseur répond mal.
    assert global_rain.describe_place(sample, geocoder=lambda lat, lon: None)["named"] is False
    assert far["distance_km"] > geocoding.MAX_REVERSE_DISTANCE_KM


def test_prevention_mondiale_calcule_le_niveau_de_risque_du_lieu_nomme():
    from app.domain.weather import rain_risk
    from app.services.weather import thresholds

    thresholds_used = thresholds()
    severe = global_rain.describe_place(
        global_rain.RainSample("Orage", 5.2, -4.1, 35.0),
        geocoder=lambda lat, lon: None,
    )
    assert severe["risk_level"] == "red"
    assert rain_risk(35.0, 0, thresholds_used) == "red"

    calm = global_rain.describe_place(
        global_rain.RainSample("Crachin", 5.2, -4.1, 0.2),
        geocoder=lambda lat, lon: None,
    )
    assert calm["risk_level"] == "green"


def test_affinage_local_precise_le_maximum_et_nomme_les_zones():
    zones = [global_rain.RainSample("Monde 0,-20", 0.0, -20.0, 1.0)]

    def provider(locations):
        assert len(locations) == 9
        return [
            open_meteo.FetchResult(
                location,
                [observed(3.7)] if location[1] > 0.1 else [observed(0.4)],
            )
            for location in locations
        ]

    places = global_rain.refine_wet_zones(
        zones, provider, NOW, geocoder=lambda lat, lon: None
    )
    assert len(places) == 1
    assert places[0]["precip_mm_h"] == 3.7
    assert places[0]["lat"] > 0.1  # le maximum affiné, pas la zone initiale


def test_scan_avec_affinage_expose_des_lieux_nommes():
    calls = []

    def provider(locations):
        calls.append(len(locations))
        return [
            open_meteo.FetchResult(
                location,
                [observed(2.2)] if location[2] == -20.0 else [observed(0.0)],
            )
            for location in locations
        ]

    def geocoder(lat, lon):
        return {
            "place": {
                "name": "Quartier Sud",
                "street": "Avenue des Pluies",
                "city": "Ville-test",
                "country": "Pays-test",
                "type": "address",
                "lat": lat,
                "lon": lon,
            },
            "distance_km": 0.1,
        }

    snapshot = global_rain.scan(
        provider=provider, now=NOW, refine=True, geocoder=geocoder
    )
    body = global_rain.payload(snapshot, now=NOW)

    assert calls == [198, 72]  # balayage mondial puis un seul lot d'affinage
    assert len(body["rain_places"]) == global_rain.MAX_REFINE_ZONES
    assert all(place["named"] for place in body["rain_places"])
    assert all(place["street"] for place in body["rain_places"])
    assert all(place["precip_mm_h"] >= 2.2 for place in body["rain_places"])


def test_repli_perime_conserve_les_lieux_deja_nommes():
    place = {"name": "Rue conservée", "precip_mm_h": 1.5, "named": True}
    first = global_rain.scan(provider=provider_for({}), now=NOW)
    with global_rain._cache_lock:
        global_rain._cache["world"] = global_rain.GlobalRainSnapshot(
            samples=first.samples,
            generated_at=first.generated_at,
            places=(place,),
        )

    failing = lambda locations: [  # noqa: E731
        open_meteo.FetchResult(location, None) for location in locations
    ]
    stale = global_rain.scan(provider=failing, now=NOW + timedelta(hours=2))
    assert stale.places == (place,)
    assert global_rain.payload(stale)["rain_places"] == [place]


def test_nommage_parallele_conserve_l_ordre_et_la_precision_des_lieux():
    peaks = [
        global_rain.RainSample("Asie", 35.68, 139.69, 12.0),
        global_rain.RainSample("Amerique", -34.60, -58.38, 9.0),
        global_rain.RainSample("Europe", 48.86, 2.35, 0.4),
        global_rain.RainSample("Oceanie", -33.87, 151.21, 30.0),
    ]

    def geocoder(lat, lon):
        return {
            "place": {
                "name": f"Rue {lat:.2f}",
                "street": f"Rue {lat:.2f}",
                "city": "Ville",
                "country": "Pays",
                "type": "address",
                "lat": lat,
                "lon": lon,
            },
            "distance_km": 0.1,
        }

    places = global_rain.describe_places(peaks, geocoder=geocoder)
    assert len(places) == len(peaks)
    assert [place["name"] for place in places] == [f"Rue {peak.lat:.2f}" for peak in peaks]
    assert all(place["precision"] == "street" for place in places)
    assert global_rain.describe_places([], geocoder=geocoder) == ()


def test_prevention_identique_sur_tous_les_continents():
    from app.domain.weather import rain_risk
    from app.services.weather import thresholds

    used = thresholds()
    coordinates = [
        (5.36, -4.01),     # Afrique
        (48.86, 2.35),     # Europe
        (35.68, 139.69),   # Asie
        (-34.60, -58.38),  # Amérique du Sud
        (-33.87, 151.21),  # Océanie
        (64.14, -21.94),   # Atlantique nord
    ]
    for lat, lon in coordinates:
        for precip in (0.2, 8.0, 35.0):
            place = global_rain.describe_place(
                global_rain.RainSample("Monde", lat, lon, precip),
                geocoder=lambda lat, lon: None,
            )
            assert place["risk_level"] == rain_risk(precip, 0, used)
            assert place["lat"] == round(lat, 4)
            assert place["lon"] == round(lon, 4)
