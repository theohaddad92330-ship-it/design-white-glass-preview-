"""#4627 — l'écran n'affirme rien qu'il ne tienne : le bandeau de zone et la liste sortent de la MÊME liste.

Mesuré en recette de production le 26/10 (Albi, 25 km) : « 25 ajoutés par l'élargissement » au-dessus de 6 lignes
rendues, et « Résultats partiels » à côté de « volume demandé atteint ». Ces tests savent dire NON : un compte élargi
que la qualification écarte, ou que la coupe à ``limit`` retire, ne compte plus dans le bandeau.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.services.zone_tiers import zone_widening_of_list

_ALBI = {
    "code": "81004",
    "name": "Albi",
    "postalCodes": ["81000"],
    "department": "81",
    "departmentName": "Tarn",
    "region": "76",
    "latitude": 43.9298,
    "longitude": 2.1480,
}


def _row(index: int, **over: Any) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{510000000 + index}",
        "nafCode": "62.02A",
        "sector": "Conseil en systèmes et logiciels informatiques",
        "city": "ALBI",
        "department": "81",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
        **over,
    }


def _around(index: int, **over: Any) -> dict:
    """Un compte à ~30 km au nord d'Albi, position publiée."""
    return _row(index, city="GAILLAC", latitude=_ALBI["latitude"] + 30 / 111.19, longitude=_ALBI["longitude"], **over)


# ── La fonction pure : le bandeau se recompte sur la liste rendue ───────────


def _shown(zone: dict | None = None, verdict: str = "recommended") -> dict:
    return {"zone": zone, "qualification": {"verdict": verdict}} if zone else {"qualification": {"verdict": verdict}}


def test_le_bandeau_se_recompte_sur_les_lignes_non_ecartees() -> None:
    widening = {"place": "Albi", "tier": "radius_50", "steps": ["radius_50"], "exactCount": 3, "widenedCount": 25}
    rows = [_shown() for _ in range(3)] + [_shown({"tier": "radius_50"}) for _ in range(3)]
    rows += [_shown({"tier": "radius_50"}, verdict="excluded") for _ in range(19)]

    out = zone_widening_of_list(widening, rows)

    assert out is not None
    assert out["exactCount"] == 3 and out["widenedCount"] == 3


def test_aucun_compte_elargi_rendu_pas_de_bandeau() -> None:
    widening = {"place": "Albi", "tier": "radius_50", "steps": ["radius_50"], "exactCount": 3, "widenedCount": 25}
    rows = [_shown() for _ in range(3)] + [_shown({"tier": "radius_50"}, verdict="excluded") for _ in range(25)]
    assert zone_widening_of_list(widening, rows) is None


def test_le_barreau_dit_est_le_plus_loin_atteint_par_une_ligne_rendue() -> None:
    """Le bandeau ne dit pas « grande région » quand seules des lignes à 50 km ont survécu à la coupe."""
    widening = {
        "place": "Albi",
        "tier": "region",
        "steps": ["radius_50", "region"],
        "area": "Occitanie",
        "exactCount": 2,
        "widenedCount": 20,
    }
    rows = [_shown(), _shown(), _shown({"tier": "radius_50"})]

    out = zone_widening_of_list(widening, rows)

    assert out is not None
    assert out["tier"] == "radius_50" and out["steps"] == ["radius_50"] and "area" not in out


# ── Le chemin entier : annoncé = rendu ──────────────────────────────────────


@pytest.fixture
def stub(monkeypatch: pytest.MonkeyPatch):
    def install(city_rows: list[dict], radius_rows: list[dict]) -> None:
        async def source(filters: Any, limit: int, degraded: Any = None, *, page: int = 1) -> list[dict]:
            rows = radius_rows if filters.radius_km and filters.radius_km > 25 else city_rows
            return [dict(row) for row in rows][:limit]

        async def _no(filters: Any, limit: int, degraded: Any = None) -> list[dict]:
            return []

        async def _none(*args: Any, **kwargs: Any) -> list[dict]:
            return []

        monkeypatch.setattr("app.routers.discover._registry_search", _no)
        monkeypatch.setattr("app.routers.discover._fallback_search", source)
        monkeypatch.setattr("app.routers.discover._fallback_search_page", source)
        monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))
        monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[_ALBI]))
        for name in ("public_tenders", "it_job_signals", "legal_signals", "funding_signals", "_press_for",
                     "_ats_for_card", "_peek_shared_jobs", "_adzuna_for_card", "_page_volumes"):  # fmt: skip
            monkeypatch.setattr(f"app.routers.discover.{name}", _none)

    return install


def _post(client: TestClient, limit: int = 40, **filters: Any) -> dict:
    response = client.post("/discover/registry", json={"filters": {"city": "Albi", **filters}, "limit": limit})
    assert response.status_code == 200, response.text
    return response.json()


def _announced_equals_rendered(body: dict) -> None:
    shown = [c for c in body["candidates"] if c["qualification"]["verdict"] != "excluded"]
    widened = [c for c in shown if c.get("zone")]
    zone = body.get("zoneWidening")
    if not widened:
        # 2710N — aucun compte élargi rendu : jamais « N ajoutés » ; seul l'arrêt DIT (``autoCapReached``) a un bandeau.
        assert not zone or (zone["widenedCount"] == 0 and zone.get("autoCapReached") is True), (
            "aucun compte élargi rendu : aucun bandeau d'élargissement"
        )
        return
    assert zone["widenedCount"] == len(widened)
    assert zone["exactCount"] == len(shown) - len(widened)


def test_25_ajoutes_dont_19_ecartes_le_bandeau_dit_6(client: TestClient, stub) -> None:
    around = [_around(100 + i, ceased=i >= 6) for i in range(25)]  # 19 cessés : la qualification les écarte
    stub([_row(i) for i in range(3)], around)

    body = _post(client)

    assert body["zoneWidening"]["widenedCount"] == 6
    _announced_equals_rendered(body)


def test_la_coupe_a_limit_ne_laisse_pas_le_bandeau_annoncer_les_coupes(client: TestClient, stub) -> None:
    stub([_row(i) for i in range(3)], [_around(100 + i) for i in range(25)])

    body = _post(client, limit=5)

    assert len(body["candidates"]) <= 5
    _announced_equals_rendered(body)


def test_tous_les_elargis_ecartes_le_bandeau_ne_promet_aucun_ajout(client: TestClient, stub) -> None:
    """2710N — l'échelle a été parcourue, mais aucun compte élargi ne survit : le bandeau ne dit plus « 25 ajoutés »,
    il dit « cherché jusqu'à… sans compte de plus » (``widenedCount == 0`` et ``autoCapReached``) — jamais le silence."""
    stub([_row(i) for i in range(3)], [_around(100 + i, ceased=True) for i in range(25)])

    body = _post(client)

    widening = body.get("zoneWidening") or {}
    assert widening.get("widenedCount") == 0 and widening.get("autoCapReached") is True
    _announced_equals_rendered(body)


# ── Un rayon demandé EST la zone : ses voisines ne sont pas « hors zone » ───


def test_un_compte_d_une_commune_voisine_dans_le_rayon_demande_n_est_pas_ecarte(client: TestClient, stub) -> None:
    """Mesuré : 25 km posés par défaut (#4515.1), et chaque siège d'une commune voisine sortait `out_of_zone` — la liste
    rendait 0 compte « Hors du périmètre » alors que le rayon affiché les contient (#4627.1)."""
    stub([_row(300 + i, city="CARMAUX") for i in range(12)], [])

    body = _post(client, radiusKm=25)

    verdicts = {c["qualification"]["verdict"] for c in body["candidates"]}
    assert len(body["candidates"]) == 12 and "excluded" not in verdicts


def test_sans_rayon_une_commune_voisine_reste_hors_de_la_ville_demandee(client: TestClient, stub) -> None:
    """#2490.11 tient : « Albi » seule n'est pas Carmaux. C'est le RAYON demandé qui change la zone, rien d'autre."""
    stub([_row(400 + i, city="CARMAUX") for i in range(12)], [])

    body = _post(client)

    assert {c["qualification"]["code"] for c in body["candidates"]} == {"out_of_zone"}
