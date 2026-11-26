"""#4640 / #4641 (décisions Louis 27/10/2026, qui RÉVISENT celles des 24 et 25/10).

⚠️ #4640 (arrêt à la région) a été RENVERSÉ le 27/10 au soir par la règle FINALE de Louis : 100 km, puis
département, région, PUIS la France — RENVERSÉ à son tour (c144) : voir `test_4640_zone_automatique_s_arrete_a_la_region.py`.

#4640 — l'élargissement automatique s'arrête à la grande région : ville → 100 km → grande région, puis STOP. Le pays
n'est JAMAIS interrogé tout seul, même avec 0 compte au dernier barreau ; quand la région ne suffit pas, l'écran le DIT.
La France reste un geste explicite de l'utilisateur (retirer la ville, web `widenZoneOneStep`).

#4641 — une ville seule cherche par défaut dans 100 km. `/near_point` plafonne à 50 km : le rayon de 100 km (choisi ou
par défaut) reprend le mécanisme du barreau `radius_100` (`zone_cover` : sept cercles de 50 km, comptes mesurés au-delà
du rayon écartés). Aucun rayon > 50 km ne part jamais au registre.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as router
from app.services import zone_tiers
from tests import test_4429_echelle_100km as echelle
from tests.test_4429_echelle_100km import _LILLE, _at, _row

#: La source gouv.fr doublée par maille, celle des tests de l'échelle du 25/10 (même faux, mêmes traces d'appels).
stub = echelle.stub

# ── #4640 — RENVERSÉ le soir même (Louis 27/10, règle FINALE) ────────────
# L'arrêt à la grande région n'est plus la règle : 100 km, puis département, région, PUIS la France, sans jamais
# s'arrêter ni demander. Les tests qui gravaient l'arrêt (et la phrase « s'arrête là ») sont réécrits dans
# `test_4640_zone_automatique_s_arrete_a_la_region.py` ; un seul garde ici la trace du renversement.


def test_l_arret_a_la_region_est_retabli_france_reste_nommable_hors_echelle() -> None:
    assert zone_tiers.ZONE_TIERS[-1] == "france"
    assert zone_tiers.ZONE_AUTO_MAX_TIER == "region"
    assert not hasattr(zone_tiers, "zone_exhausted_line"), "plus aucune phrase « l'élargissement s'arrête là »"


# ── #4641 — 100 km par défaut ────────────────────────────────────────────────


def test_100_km_est_un_choix_de_la_liste_le_defaut_est_25_depuis_le_01_11() -> None:
    # Louis 01/11/2026 (#4515) RÉVISE #4641 : le défaut d'une ville seule est 25 km, 100 km reste un choix.
    assert router.DEFAULT_CITY_RADIUS_KM == 25
    assert zone_tiers.MANUAL_RADIUS_KM == (10, 25, 50, 100)
    assert 100 in zone_tiers.LAURA_RADIUS_KM


def test_un_rayon_de_100_km_est_accepte_au_dela_il_est_refuse(client: TestClient, stub) -> None:
    stub({"radius_50": []})
    assert client.post("/discover/registry", json={"filters": {"city": "Lille", "radiusKm": 100}}).status_code == 200
    assert client.post("/discover/registry", json={"filters": {"city": "Lille", "radiusKm": 150}}).status_code == 422


def test_100_km_un_compte_a_90_km_sort_un_compte_a_150_km_non(client: TestClient, stub) -> None:
    near, far = _at(1, 90), _at(2, 150)
    stub({"radius_50": lambda f: [near, far], "region": []})

    body = _post(client, {"city": "Lille", "radiusKm": 100})

    sirens = [c["siren"] for c in body["candidates"]]
    assert near["siren"] in sirens
    assert far["siren"] not in sirens
    # Dans le rayon demandé : un compte de la zone voulue, jamais « hors du périmètre ».
    assert next(c for c in body["candidates"] if c["siren"] == near["siren"])["qualification"]["verdict"] != "excluded"


def test_100_km_jamais_un_rayon_au_dela_de_50_km_n_est_envoye_au_registre(client: TestClient, stub) -> None:
    gouv = stub({"radius_50": [_at(i, 20) for i in range(3)], "region": []})

    _post(client, {"city": "Lille", "radiusKm": 100})

    circles = [f for f in gouv.calls if f.radius_km]
    assert circles and all(f.radius_km <= 50 for f in circles)
    assert len({(round(f.latitude, 4), round(f.longitude, 4)) for f in circles}) == 7, "les sept cercles de 50 km"
    assert "city" not in gouv.zones(), "le rayon de 100 km REMPLACE la commune, comme tout rayon"


def test_100_km_choisi_a_la_main_est_la_maille_aucun_elargissement(client: TestClient, stub) -> None:
    """Louis 02/11 : 100 km n'est plus un barreau ; choisi au curseur, c'est la maille voulue (comme 50 km)."""
    gouv = stub({"radius_50": [_at(1, 30)], "department": [_row(70 + i) for i in range(30)]})

    body = _post(client, {"city": "Lille", "radiusKm": 100})

    assert not body.get("zoneWidening")
    assert "department" not in gouv.zones() and "region" not in gouv.zones() and "france" not in gouv.zones()


def test_un_rayon_choisi_plus_etroit_reste_la_maille() -> None:
    commune = {**_LILLE}
    assert router._widenable_city(router.DiscoverFilters(city="Lille", radiusKm=25), commune)
    assert not router._widenable_city(router.DiscoverFilters(city="Lille", radiusKm=100), commune)
    assert not router._widenable_city(router.DiscoverFilters(city="Lille", radiusKm=50), commune)
    assert router._tiers_to_try(router.DiscoverFilters(city="Lille", radiusKm=100)) == ("department", "region")
    assert router._tiers_to_try(router.DiscoverFilters(city="Lille", radiusKm=25)) == (
        "radius_50",
        "department",
        "region",
    )
    assert router._tiers_to_try(router.DiscoverFilters(city="Lille")) == (
        "radius_50",
        "department",
        "region",
    )


async def test_laura_une_ville_seule_part_a_25_km_et_accepte_100_km(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import chat_tools
    from tests.test_4429_laura_zone_tiers import _TOULOUSE, USER, _stub_registry

    async def _resolve(name: str) -> dict[str, Any] | None:
        return _TOULOUSE if name == "Toulouse" else None

    monkeypatch.setattr("app.services.data_sources.geo_communes.resolve_commune_by_name", _resolve)
    seen = _stub_registry(monkeypatch, candidates=[], zone_widening=None)
    await chat_tools.execute_chat_tool("run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None)
    assert seen[0].filters.radiusKm == 25, "une ville seule, sans rayon demandé : 25 km, comme à Découvrir"

    seen.clear()
    await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse", "radius_km": 100}, user_id=USER, profile_data=None
    )
    assert seen[0].filters.radiusKm == 100
    assert chat_tools.RUN_ACCOUNT_SEARCH_TOOL["input_schema"]["properties"]["radius_km"]["enum"] == [25, 50, 100]


def _post(client: TestClient, filters: dict[str, Any]) -> dict:
    response = client.post("/discover/registry", json={"filters": filters, "limit": 30})
    assert response.status_code == 200, response.text
    return response.json()


def test_laura_finalement_la_ville_seule_retire_bien_les_100_km() -> None:
    """« finalement Toulouse seule » (`drop: ["radius_km"]`) : la ville SEULE, jamais le défaut de 100 km revenu."""
    from app.services.chat_thread_state import ThreadStateCollector

    collector = ThreadStateCollector()
    collector.record("run_account_search", {"city": "Toulouse", "radius_km": 100}, {"accounts": []})
    effective, _ = collector.prepare("run_account_search", {"refine": True, "drop": ["radius_km"]})
    assert effective["city"] == "Toulouse"
    assert "radius_km" in effective and effective["radius_km"] is None


async def test_laura_un_rayon_explicitement_retire_cherche_la_ville_seule(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import chat_tools
    from tests.test_4429_laura_zone_tiers import _TOULOUSE, USER, _stub_registry

    async def _resolve(name: str) -> dict[str, Any] | None:
        return _TOULOUSE if name == "Toulouse" else None

    monkeypatch.setattr("app.services.data_sources.geo_communes.resolve_commune_by_name", _resolve)
    seen = _stub_registry(monkeypatch, candidates=[], zone_widening=None)
    await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse", "radius_km": None}, user_id=USER, profile_data=None
    )
    assert seen[0].filters.radiusKm is None
