"""Tests du catalogue produit : résumé compact et détail ciblé.

Ces tests n'importent ni la base de données ni le service IA : ils portent
uniquement sur la couche domaine.
"""

from __future__ import annotations

import json

import pytest

from app.domain import platform_catalog as catalog


def size(payload) -> int:
    return len(json.dumps(payload, ensure_ascii=False))


def test_le_resume_compact_reste_sous_le_plafond():
    assert size(catalog.catalog_summary()) <= 3500


def test_le_detail_est_vide_hors_sujet_produit():
    assert catalog.catalog_detail("") == {}
    assert catalog.catalog_detail("   ") == {}
    assert catalog.catalog_detail("Compare les tendances de la semaine.") == {}


def test_le_detail_repond_sur_la_circulation_et_les_cartes():
    detail = catalog.catalog_detail("Parle-moi de la circulation et du globe")
    assert "layers" in detail
    assert "maps" in detail


def test_le_detail_repond_sur_la_simulation():
    detail = catalog.catalog_detail("Comment fonctionne la simulation d'inondation ?")
    assert "simulation" in detail
    assert size(detail) <= catalog.DETAIL_BUDGET_CHARS


def test_le_detail_repond_sur_les_sources_et_reduit_la_section():
    detail = catalog.catalog_detail("Quelles sources de données utilisez-vous ?")
    assert "data_sources" in detail
    # La section complète dépasse le budget : elle doit être ajustée, pas exclue.
    assert size(detail) <= catalog.DETAIL_BUDGET_CHARS
    assert size(catalog.PLATFORM_CATALOG["data_sources"]) > catalog.DETAIL_BUDGET_CHARS


def test_le_detail_ignore_les_diacritiques_et_la_casse():
    detail = catalog.catalog_detail("GÉOLOCALISATION et VIE PRIVÉE : que gardez-vous ?")
    assert "privacy" in detail


def test_les_mots_courts_ne_matchent_pas_au_milieu_d_un_mot():
    # « ia » ne doit pas être reconnu dans « situation » ni dans « Asie ».
    assert catalog.catalog_detail("Quelle est la situation en Asie ?") == {}


@pytest.mark.parametrize("budget", [0, 120, 600, 1500])
def test_le_budget_est_respecte(budget):
    detail = catalog.catalog_detail("Parle-moi des couches et des sources", budget=budget)
    # `{}` pèse 2 caractères : c'est le plancher incompressible.
    assert size(detail) <= max(budget, 2)


def test_le_detail_ne_contient_que_des_sections_reelles():
    detail = catalog.catalog_detail("Parle-moi des alertes et des seuils")
    assert detail
    for key in detail:
        assert key in catalog.PLATFORM_CATALOG


def test_le_texte_markdown_reste_disponible_pour_le_mode_hors_ligne():
    text = catalog.catalog_text()
    assert "MasterEarth" in text
    assert "Couches" in text


def test_le_catalogue_decrit_les_endpoints_mondiaux():
    text = json.dumps(catalog.PLATFORM_CATALOG, ensure_ascii=False)
    assert "/api/v1/weather/global-rain" in text
    assert "/api/v1/live/aircraft/global" in text
    assert "198 points" in text
    assert "rain_places" in text
    assert "Aucun maillage" in text
    assert "runtime" in catalog.PLATFORM_CATALOG


def test_la_couche_avions_ne_se_met_plus_en_pause_en_vue_mondiale():
    layer = next(
        item for item in catalog.PLATFORM_CATALOG["layers"]
        if item["id"] == "aircraft"
    )
    assert "/api/v1/live/aircraft/global" in layer["availability"]
    assert "se met en pause" not in layer["availability"]


def test_le_detail_couvre_l_execution_et_les_statistiques():
    detail = catalog.catalog_detail("Pourquoi 0 point en pluie et l'application hors ligne ?")
    assert "runtime" in detail
    assert size(detail) <= catalog.DETAIL_BUDGET_CHARS
    assert "198" in json.dumps(detail, ensure_ascii=False)


def test_la_regle_donnee_indisponible_egale_pas_zero_est_dans_le_catalogue():
    text = json.dumps(catalog.PLATFORM_CATALOG, ensure_ascii=False)
    assert "rain_points=null" in text
    assert "Aucun zéro n'est affiché" in text
