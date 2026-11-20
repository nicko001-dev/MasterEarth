"""Tests du géocodage mondial (service, sans réseau ni base de données)."""

from __future__ import annotations

import pytest

from app.core.exceptions import ValidationAppError
from app.services import geocoding


@pytest.fixture(autouse=True)
def _reset_state():
    geocoding.reset_cache()
    geocoding.reset_rate_limit()
    yield
    geocoding.reset_cache()
    geocoding.reset_rate_limit()


def feature(
    name: str,
    lon: float,
    lat: float,
    *,
    osm_key: str = "place",
    osm_value: str = "city",
    feature_type: str = "city",
    country: str | None = None,
    state: str | None = None,
) -> dict:
    properties = {
        "name": name,
        "osm_key": osm_key,
        "osm_value": osm_value,
        "type": feature_type,
    }
    if country is not None:
        properties["country"] = country
    if state is not None:
        properties["state"] = state
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": properties,
    }


def collection(*features: dict) -> dict:
    return {"type": "FeatureCollection", "features": list(features)}


def test_normalize_ignore_casse_et_diacritiques():
    assert geocoding.normalize("Abidjan") == geocoding.normalize("  abidjan ")
    assert geocoding.normalize("Bouaké") == "bouake"
    assert geocoding.normalize("São Paulo") == "sao paulo"


def test_haversine_donne_une_distance_plausible():
    # Abidjan -> Yamoussoukro : environ 215 km à vol d'oiseau.
    distance = geocoding.haversine_km(5.36, -4.01, 6.83, -5.28)
    assert 190 < distance < 240
    assert geocoding.haversine_km(5.36, -4.01, 5.36, -4.01) == pytest.approx(0, abs=1e-9)


def test_classe_les_types_de_lieux():
    assert geocoding.place_type({"osm_key": "place", "osm_value": "city"}) == "city"
    assert geocoding.place_type({"osm_key": "place", "osm_value": "village"}) == "city"
    assert geocoding.place_type({"osm_key": "place", "osm_value": "suburb"}) == "district"
    assert geocoding.place_type({"osm_key": "boundary", "osm_value": "administrative"}) == "region"
    assert geocoding.place_type({"osm_key": "place", "osm_value": "country"}) == "country"
    assert geocoding.place_type({"osm_key": "highway", "osm_value": "residential"}) == "address"
    assert geocoding.place_type({}) == "other"


def test_parse_places_accepte_le_monde_entier():
    payload = collection(
        feature("Paris", 2.35, 48.85, country="France"),
        feature("Jakarta", 106.84, -6.21, country="Indonésie"),
        feature("Sydney", 151.21, -33.87, country="Australie"),
    )
    places = geocoding.parse_places(payload, 10)
    assert [place["name"] for place in places] == ["Paris", "Jakarta", "Sydney"]
    assert places[0]["country"] == "France"
    assert places[0]["type"] == "city"


def test_parse_places_dedoublonne_et_borne():
    payload = collection(
        feature("Paris", 2.35, 48.85),
        feature("Paris", 2.350001, 48.850001),
        feature("Paris 15e", 2.29, 48.84, osm_value="suburb"),
        feature("Lyon", 4.83, 45.76),
    )
    places = geocoding.parse_places(payload, 2)
    assert len(places) == 2
    assert places[0]["name"] == "Paris"


def test_parse_places_ignore_les_features_inutilisables():
    payload = {
        "features": [
            {"type": "Feature", "properties": {"name": "Sans géométrie"}},
            {"geometry": {"coordinates": [1, 2]}, "properties": "pas un objet"},
            feature("", 2.0, 48.0),
            {
                "geometry": {"coordinates": ["a", "b"]},
                "properties": {"name": "Coordonnées invalides"},
            },
            feature("Coordonnées hors domaine", 400.0, 200.0),
            feature("Valide", 2.0, 48.0),
        ]
    }
    places = geocoding.parse_places(payload, 10)
    assert [place["name"] for place in places] == ["Valide"]


def test_search_interroge_photon_et_marque_la_source():
    seen: list[str] = []

    def fetcher(url: str) -> object:
        seen.append(url)
        return collection(feature("Nairobi", 36.82, -1.29, country="Kenya"))

    result = geocoding.search("Nairobi", 5, fetcher=fetcher)
    assert result.degraded is False
    assert result.source == "photon"
    assert result.places[0]["name"] == "Nairobi"
    assert "q=Nairobi" in seen[0]
    assert "limit=5" in seen[0]


def test_search_reutilise_le_cache():
    calls = {"count": 0}

    def fetcher(url: str) -> object:
        calls["count"] += 1
        return collection(feature("Lima", -77.03, -12.05))

    geocoding.search("Lima", 5, fetcher=fetcher)
    geocoding.search("Lima", 5, fetcher=fetcher)
    assert calls["count"] == 1


def test_search_se_rabat_sur_le_local_si_photon_echoue():
    def fetcher(url: str) -> object:
        raise OSError("réseau indisponible")

    result = geocoding.search("Abidjan", 5, fetcher=fetcher)
    assert result.degraded is True
    assert result.source == "local"
    assert result.places[0]["name"] == "Abidjan"


def test_le_repli_local_n_est_pas_mis_en_cache():
    calls = {"count": 0}

    def fetcher(url: str) -> object:
        calls["count"] += 1
        raise OSError("réseau indisponible")

    geocoding.search("Bouaké", 5, fetcher=fetcher)
    geocoding.search("Bouaké", 5, fetcher=fetcher)
    assert calls["count"] == 2


def test_search_refuse_une_requete_vide():
    with pytest.raises(ValidationAppError):
        geocoding.search("   ", 5, fetcher=lambda url: collection())


def test_search_refuse_une_requete_trop_longue():
    with pytest.raises(ValidationAppError):
        geocoding.search("a" * 200, 5, fetcher=lambda url: collection())


def test_reverse_utilise_photon():
    def fetcher(url: str) -> object:
        assert "lat=48.8566" in url
        return collection(feature("Paris", 2.3522, 48.8566, country="France"))

    result = geocoding.reverse(48.8566, 2.3522, fetcher=fetcher)
    assert result["place"]["name"] == "Paris"
    assert result["distance_km"] == pytest.approx(0, abs=0.2)


def test_reverse_se_rabat_sur_le_local():
    def fetcher(url: str) -> object:
        raise OSError("réseau indisponible")

    result = geocoding.reverse(5.36, -4.01, fetcher=fetcher)
    assert result["place"]["name"] == "Abidjan"
    assert result["distance_km"] < 5


def test_reverse_refuse_des_coordonnees_invalides():
    with pytest.raises(ValidationAppError):
        geocoding.reverse(120, 0, fetcher=lambda url: collection())


def test_reverse_named_conserve_la_rue_et_le_quartier():
    properties = {
        "name": "Cité des Pluies",
        "street": "Rue des Jardins",
        "housenumber": "12",
        "suburb": "Marcory",
        "city": "Abidjan",
        "country": "Côte d'Ivoire",
        "osm_key": "highway",
        "osm_value": "residential",
        "type": "house",
    }
    payload = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-4.008, 5.357]},
            "properties": properties,
        }],
    }
    result = geocoding.reverse_named(5.357, -4.008, fetcher=lambda url: payload)

    assert result is not None
    assert result["place"]["street"] == "Rue des Jardins"
    assert result["place"]["suburb"] == "Marcory"
    assert result["place"]["type"] == "address"
    assert result["distance_km"] < 1


def test_reverse_named_refuse_un_lieu_trop_eloigne_et_les_pannes():
    proche = feature("Ville proche", -4.0, 5.36, country="Côte d'Ivoire")
    lointain = feature("Dakar", -17.45, 14.7, country="Sénégal")

    # En plein Atlantique, le lieu OSM le plus proche est trop loin : aucun nom.
    assert geocoding.reverse_named(0.0, -30.0, fetcher=lambda url: collection(lointain)) is None

    # Une panne réseau ne doit jamais produire un nom de repli trompeur.
    def en_panne(url: str) -> object:
        raise OSError("Photon indisponible")

    assert geocoding.reverse_named(5.36, -4.01, fetcher=en_panne) is None
    assert geocoding.reverse_named(5.36, -4.01, fetcher=lambda url: collection(proche)) is not None


def test_limitation_de_debit_par_hote():
    for _ in range(geocoding.RATE_LIMIT_MAX_REQUESTS):
        assert geocoding.allow_request("10.0.0.1") is True
    assert geocoding.allow_request("10.0.0.1") is False
    # Un autre hôte n'est pas pénalisé.
    assert geocoding.allow_request("10.0.0.2") is True
