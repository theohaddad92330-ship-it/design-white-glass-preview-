"""KEVIN-FIX K.4 (recette prod 20/10) — « zone Lille » excluait TOUT.

Cause : à la maille COMMUNE, la ligne rendue portait le SIÈGE et le conseil de qualification
excluait (`out_of_zone`) tout siège hors de la commune tapée — alors que le registre avait trouvé
l'entreprise par un ÉTABLISSEMENT dans la commune. Même base que département/région (#2544.1,
#3983) : `presence` par défaut, `headquarters` sur demande.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.account_qualification import qualify_candidate
from app.services.company_filters import CompanyDiscoveryFilters
from app.services.data_sources.recherche_entreprises import _has_zone, _list_row

FIXTURE = Path(__file__).parent / "fixtures" / "discover_establishment" / "arquus_bfc_dept.json"
ROW = json.loads(FIXTURE.read_text(encoding="utf-8"))["results"][0]


def test_k4_une_commune_tenue_par_un_etablissement_montre_le_site_pas_le_siege() -> None:
    row = _list_row(ROW, CompanyDiscoveryFilters(commune_code="58121"))
    assert row is not None
    assert row["city"] == "GARCHIZY", row
    assert row["department"] == "58", row
    assert row["geography"]["basis"] == "establishment"
    assert row["geography"]["headquarters"]["city"] == "VERSAILLES"


def test_k4_le_site_dans_la_commune_n_est_plus_exclu_hors_zone() -> None:
    row = _list_row(ROW, CompanyDiscoveryFilters(commune_code="58121"))
    verdict = qualify_candidate(row, filters={"cityCommuneName": "Garchizy"})
    assert verdict["verdict"] != "excluded", verdict


def test_k4_une_commune_que_la_source_ne_prouve_pas_reste_exclue() -> None:
    # La garde sait dire NON : aucun établissement listé dans CETTE commune → le siège décide.
    row = _list_row(ROW, CompanyDiscoveryFilters(commune_code="59350"))
    assert row is not None
    assert row["city"] == "VERSAILLES", row
    assert "geography" not in row
    assert qualify_candidate(row, filters={"cityCommuneName": "Lille"})["code"] == "out_of_zone"


def test_k4_siege_dans_la_commune_ecarte_les_lignes_dont_le_siege_n_y_est_pas() -> None:
    row = _list_row(ROW, CompanyDiscoveryFilters(commune_code="58121", on_headquarters_only=True))
    assert row is None


def test_k4_la_commune_compte_comme_une_zone_pour_la_base() -> None:
    assert _has_zone(CompanyDiscoveryFilters(commune_code="59350"))
