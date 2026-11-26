"""#2544.1 — Découvrir montre le SITE qui a fait matcher la zone, pas le siège.

Retour bêta Ludovic Marx (call du 17/09/2026, issue #2544) : une recherche
calibrée sur la Bourgogne-Franche-Comté a rendu un dirigeant PARISIEN du
groupe — « Ludovic vise les équipes réellement implantées sur le territoire,
pas le siège. » Son propre exemple : « Arquus en Bourgogne ».

## La chaîne, mesurée

``departement=21,25,39,58,70,71,89,90`` (les huit départements de
Bourgogne-Franche-Comté) matche une entreprise dès qu'UN de ses établissements
y est — jamais seulement son siège (même mécanisme que `_naf_groups`,
#2490.9). Mesuré sur l'API réelle le 18/09/2026 : ``q=arquus`` + ce filtre
rend ARQUUS, siège à VERSAILLES (78, hors zone), et un ``matching_etablissements``
d'UNE entrée — GARCHIZY (58, Nièvre, dans la zone).

``_list_row`` (``recherche_entreprises.py``) ignorait ce champ et lisait
toujours ``siege.*`` : la ligne rendue par Découvrir portait « VERSAILLES »,
« 78 ». Deux conséquences, toutes deux mesurées ici :

* l'ÉCRAN affiche le siège du groupe, pas le site régional que la recherche a
  trouvé — exactement le reproche de Ludovic ;
* le CONSEIL DE QUALIFICATION (``account_qualification.qualify_candidate``)
  compare ce département à la zone demandée et exclut la ligne
  (``out_of_zone``) — la cible que la recherche a trouvée disparaît purement
  et simplement de la liste, silencieusement.

Fixture : capture VERBATIM de la vraie réponse (``fixtures/discover_bench/
arquus_bfc_dept.json``), même discipline que le banc de pertinence #2490.

⚠️ KEVIN-FIX K.4 (20/10) : la commune précise (``commune_code``) suit désormais la même base que
département et région (``presence``, le siège seul sur demande) — voir
``test_kevin_fix_k4_commune_presence.py``. #2490.11 (Blagnac ≠ Toulouse) tient toujours pour une ligne
dont AUCUN établissement listé n'est dans la commune.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.account_qualification import qualify_candidate
from app.services.company_filters import CompanyDiscoveryFilters
from app.services.data_sources.recherche_entreprises import _list_row

FIXTURE = Path(__file__).parent / "fixtures" / "discover_establishment" / "arquus_bfc_dept.json"
ARQUUS_ROW = json.loads(FIXTURE.read_text(encoding="utf-8"))["results"][0]

BFC_DEPARTMENTS = ["21", "25", "39", "58", "70", "71", "89", "90"]


def test_the_fixture_carries_a_real_matching_establishment() -> None:
    """Une garde qui ne lit rien est verte pour rien."""
    assert ARQUUS_ROW["siege"]["departement"] == "78"
    assert len(ARQUUS_ROW["matching_etablissements"]) == 1
    assert ARQUUS_ROW["matching_etablissements"][0]["libelle_commune"] == "GARCHIZY"


def test_a_department_zone_shows_the_matching_site_not_the_siege() -> None:
    filters = CompanyDiscoveryFilters(departments=BFC_DEPARTMENTS, department=BFC_DEPARTMENTS[0])
    row = _list_row(ARQUUS_ROW, filters)
    assert row is not None
    assert row["city"] == "GARCHIZY", row
    assert row["department"] == "58", row


def test_a_region_zone_shows_the_matching_site_not_the_siege() -> None:
    filters = CompanyDiscoveryFilters(region="27")
    row = _list_row(ARQUUS_ROW, filters)
    assert row is not None
    assert row["city"] == "GARCHIZY", row
    assert row["department"] == "58", row


def test_the_regional_site_is_no_longer_excluded_as_out_of_zone() -> None:
    """#2544.1 — c'est CE verdict qui faisait disparaître la ligne."""
    filters = CompanyDiscoveryFilters(departments=BFC_DEPARTMENTS, department=BFC_DEPARTMENTS[0])
    row = _list_row(ARQUUS_ROW, filters)
    verdict = qualify_candidate(row, filters={"departments": BFC_DEPARTMENTS})
    assert verdict["verdict"] != "excluded", verdict
    assert verdict.get("code") != "out_of_zone", verdict


def test_without_a_department_or_region_filter_the_siege_still_wins() -> None:
    """Zéro régression : une recherche sans zone reste byte-identique."""
    row = _list_row(ARQUUS_ROW, CompanyDiscoveryFilters())
    assert row["city"] == "VERSAILLES", row
    assert row["department"] == "78", row


def test_a_precise_commune_filter_follows_the_presence_basis_since_kevin_fix_k4() -> None:
    """KEVIN-FIX K.4 (20/10) — #2490.11 ne gardait que le siège à la maille COMMUNE, ce qui excluait
    toute entreprise trouvée par un ÉTABLISSEMENT dans la commune (« Lille » : 0 affichée). La commune
    suit désormais la base `presence` ; `headquarters` reste dit par `on_headquarters_only`
    (`test_kevin_fix_k4_commune_presence.py`)."""
    filters = CompanyDiscoveryFilters(commune_code="58121")
    row = _list_row(ARQUUS_ROW, filters)
    assert row["city"] == "GARCHIZY", row
