"""#4429.2 — « Toulouse » ne remonte que la commune : élargir par paliers VISIBLES.

Retour client du 21/10 (ESN à quatre agences) : demander « Toulouse » arrêtait la recherche à la
commune, très peu de comptes sortaient, et rien ne proposait d'aller plus loin. Décision Louis
21/10, RÉVISÉE le 25/10 (`test_4429_echelle_100km.py`) : ville stricte → 100 km → grande région → France,
barreau suivant tenté tant que le courant rend MOINS de 10 comptes ; les comptes exacts restent en tête,
les élargis sont étiquetés, et l'élargissement s'ÉCRIT (`zoneWidening`). #3876 tient : au-dessus du seuil,
la requête reste la commune — jamais son département en silence.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.services import zone_tiers

_CONSTANTS = Path(__file__).resolve().parents[3] / "packages/contracts/src/schemas/zone-tiers.constants.json"

_TOULOUSE = {
    "code": "31555",
    "name": "Toulouse",
    "postalCodes": ["31000"],
    "department": "31",
    "departmentName": "Haute-Garonne",
    "region": "76",
    "latitude": 43.6045,
    "longitude": 1.4440,
}


def _row(index: int, city: str = "TOULOUSE", department: str = "31", **over: Any) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{300000000 + index}",
        "nafCode": "62.02A",
        "sector": "Conseil en systèmes et logiciels informatiques",
        "city": city,
        "department": department,
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
        **over,
    }


class _Gouv:
    """La source gouv.fr, par maille : la commune, un cercle, un département, une région, la France."""

    def __init__(self, by_zone: dict[str, list[dict]]) -> None:
        self.by_zone = by_zone
        self.calls: list[Any] = []

    def _zone(self, filters) -> str:
        if filters.radius_km:
            return f"radius_{int(filters.radius_km)}"
        if filters.commune_code:
            return "city"
        if filters.department:
            return "department"
        if filters.region:
            return "region"
        return "france"

    async def __call__(self, filters, limit, degraded=None, *, page: int = 1):
        self.calls.append(filters)
        return [dict(row) for row in self.by_zone.get(self._zone(filters), [])][:limit]


async def _no_pappers(filters, limit, degraded=None):
    return []


@pytest.fixture
def stub(monkeypatch):
    def install(by_zone: dict[str, list[dict]]) -> _Gouv:
        source = _Gouv(by_zone)
        monkeypatch.setattr("app.routers.discover._registry_search", _no_pappers)
        monkeypatch.setattr("app.routers.discover._fallback_search", source)
        monkeypatch.setattr("app.routers.discover._fallback_search_page", source)
        monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))
        monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[_TOULOUSE]))

        async def _no_signals(*args: Any, **kwargs: Any) -> list[dict]:
            return []

        for name in ("public_tenders", "it_job_signals", "legal_signals", "funding_signals", "_press_for",
                     "_ats_for_card", "_peek_shared_jobs", "_adzuna_for_card", "_page_volumes"):  # fmt: skip
            monkeypatch.setattr(f"app.routers.discover.{name}", _no_signals)
        return source

    return install


def _post(client: TestClient, filters: dict, limit: int = 30) -> dict:
    response = client.post("/discover/registry", json={"filters": filters, "limit": limit})
    assert response.status_code == 200, response.text
    return response.json()


def test_le_miroir_python_dit_exactement_ce_que_dit_le_contrat() -> None:
    snapshot = json.loads(_CONSTANTS.read_text(encoding="utf-8"))
    assert snapshot == zone_tiers.ZONE_TIERS_CONSTANTS
    assert zone_tiers.ZONE_WIDEN_MIN_RESULTS == 25


def test_peu_de_comptes_a_toulouse_elargit_a_100_km_exacts_en_tete_elargis_etiquetes(client: TestClient, stub) -> None:
    exact = [_row(i) for i in range(3)]
    around = [_row(10 + i, city="BLAGNAC", latitude=43.6370, longitude=1.3900) for i in range(22)]  # 3 + 22 = le seuil (25)
    gouv = stub({"city": exact, "radius_50": exact + around})

    # #4673.1 — cible = max(25, limit) (Louis 31/10) : à limit 25, la cible est 25.
    body = _post(client, {"city": "Toulouse"}, limit=25)

    assert body["zoneWidening"] == {
        "place": "Toulouse",
        "tier": "radius_50",  # lot S : Blagnac (5,6 km) est servi par le barreau 50 km, avant 100 km
        "steps": ["radius_50"],
        "exactCount": 3,
        "widenedCount": 22,
    }
    sirens = [c["siren"] for c in body["candidates"]]
    assert sirens[:3] == [r["siren"] for r in exact], "les comptes exacts restent en tête"
    widened = [c for c in body["candidates"] if c["siren"] not in {r["siren"] for r in exact}]
    assert widened and all(c["zone"]["tier"] == "radius_50" for c in widened)
    assert widened[0]["zone"]["distanceKm"] == pytest.approx(5.6, abs=0.5)
    assert all("zone" not in c for c in body["candidates"][:3])
    # Un compte élargi n'est pas « hors zone » : c'est le palier demandé.
    assert all(c["qualification"]["code"] != "out_of_zone" for c in widened)
    # La position du site sert à mesurer, elle ne voyage pas.
    assert all("latitude" not in c for c in body["candidates"])
    # Le registre plafonne à 50 km : le cercle de 100 km s'ouvre par son disque central, et s'arrête au seuil.
    # (25 lignes = une page pleine du registre : la page 2 du même cercle se lit aussi, d'où `set`.)
    assert sorted({round(f.radius_km or 0) for f in gouv.calls}) == [0, 50]


def test_un_palier_vide_passe_au_suivant_jusqu_a_la_region_nommee(client: TestClient, stub) -> None:
    exact = [_row(i) for i in range(2)]
    region = exact + [_row(20 + i, city="MURET") for i in range(23)]  # 2 + 23 = le seuil (25)
    stub({"city": exact, "radius_50": exact, "region": region})

    body = _post(client, {"city": "Toulouse"})

    assert body["zoneWidening"]["tier"] == "region"
    assert body["zoneWidening"]["area"] == "Occitanie"
    widened = [c for c in body["candidates"] if "zone" in c]
    assert widened[0]["zone"] == {"tier": "region", "area": "Haute-Garonne"}


def test_dit_non_a_partir_du_seuil_de_comptes_la_requete_reste_la_commune(client: TestClient, stub) -> None:
    gouv = stub({"city": [_row(i) for i in range(25)], "radius_50": [_row(i) for i in range(40)]})

    # #4673.1 — cible = max(25, limit) (Louis 31/10) : à limit 25, la cible est 25.
    body = _post(client, {"city": "Toulouse"}, limit=25)

    assert "zoneWidening" not in body or body["zoneWidening"] is None
    # 25 lignes = une page pleine : la page 2 de la COMMUNE se lit, aucun cercle ni aire ne s'ouvre.
    assert gouv.calls and all(c.commune_code == "31555" and not c.radius_km for c in gouv.calls)
    assert all("zone" not in c for c in body["candidates"])


def test_revenir_a_toulouse_seule_ne_tente_aucun_palier(client: TestClient, stub) -> None:
    gouv = stub({"city": [_row(0)], "radius_50": [_row(i) for i in range(20)]})

    body = _post(client, {"city": "Toulouse", "zoneStrict": True})

    assert body.get("zoneWidening") is None
    assert len(gouv.calls) == 1


def test_un_departement_demande_n_est_jamais_elargi(client: TestClient, stub) -> None:
    gouv = stub({"department": [_row(0)], "france": [_row(i) for i in range(20)]})

    body = _post(client, {"department": "31"})

    assert body.get("zoneWidening") is None
    assert len(gouv.calls) == 1


def test_la_phrase_de_laura_est_celle_de_l_ecran() -> None:
    assert (
        zone_tiers.zone_widening_headline({"place": "Toulouse", "tier": "radius_50"})
        == "Peu de comptes à Toulouse : recherche élargie à 50 km"
    )
    assert (
        zone_tiers.zone_widening_headline({"place": "Toulouse", "tier": "region", "area": "Occitanie"})
        == "Peu de comptes à Toulouse : recherche élargie à la région (Occitanie)"
    )


def test_la_ligne_registre_porte_la_position_publiee_jamais_inventee() -> None:
    from app.services.company_filters import CompanyDiscoveryFilters
    from app.services.data_sources.geo_communes import _commune
    from app.services.data_sources.recherche_entreprises import _list_row

    fixture = Path(__file__).parent / "fixtures" / "discover_establishment" / "arquus_bfc_dept.json"
    row = json.loads(fixture.read_text(encoding="utf-8"))["results"][0]
    assert "latitude" not in (_list_row(row, CompanyDiscoveryFilters()) or {})  # non publiée : rien
    placed = {**row, "siege": {**row["siege"], "latitude": "48.80", "longitude": "2.13"}}
    projected = _list_row(placed, CompanyDiscoveryFilters()) or {}
    assert (projected["latitude"], projected["longitude"]) == (48.80, 2.13)

    commune = _commune(
        {
            "nom": "Toulouse",
            "code": "31555",
            "centre": {"coordinates": [1.44, 43.6]},
            "departement": {"code": "31", "nom": "Haute-Garonne"},
            "region": {"code": "76", "nom": "Occitanie"},
        }
    )
    assert commune and commune["region"] == "76"


def test_4433_3_etiquette_de_rayon_sans_distance_mesuree_ne_ment_pas():
    """#4433.3 — « à moins de 50 km d'Albi » posé sur un compte parisien : sans distance mesurée (ou hors
    cercle), on dit le critère d'entrée, jamais une proximité."""
    from app.services.zone_tiers import candidate_zone_label

    assert candidate_zone_label({"tier": "radius_50", "distanceKm": 8.0}, "Albi") == "Élargi à 50 km · à 8 km de Albi"
    assert candidate_zone_label({"tier": "radius_50"}, "Albi") == "Ajouté par l'élargissement de zone"
    assert candidate_zone_label({"tier": "radius_50", "distanceKm": 590.0}, "Albi") == (
        "Ajouté par l'élargissement de zone"
    )
