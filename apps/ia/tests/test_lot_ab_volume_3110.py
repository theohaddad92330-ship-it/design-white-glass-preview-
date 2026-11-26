"""Lot AB, volet B (Louis 31/10) — Découvrir va jusqu'au volume DEMANDÉ (100), pas seulement 25.

Chaque seuil a son test qui sait dire NON : l'élargissement vise ``max(25, limit)`` (#4673.1), le registre lit
autant de pages que le volume l'exige (#4419.1, budget d'appels nommé), le budget total monte à ~55 s (#4517.2), et
la moisson des signaux a SA fenêtre, hors du budget de la liste (#4677.1).
"""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.routers import discover
from app.routers.discover import DiscoverFilters
from app.services import criteria_referential as ref
from app.services import zone_tiers
from app.services.data_sources.recherche_entreprises import LIST_PAGE_MAX

_COMMUNE = {"code": "59350", "name": "Lille", "department": "59", "region": "32", "latitude": 50.6, "longitude": 3.06}


def _row(index: int, naf: str = "62.01Z") -> dict[str, Any]:
    return {"siren": str(400000000 + index), "name": f"SOC {index}", "headcountRange": None, "nafCode": naf}


# ── #4673.1 — la cible d'élargissement = le volume demandé ─────────────────────────────────────────────────────


def test_la_cible_d_elargissement_suit_le_volume_demande() -> None:
    assert ref.widen_target(100) == 100
    assert ref.widen_target(10) == ref.CRITERIA_WIDEN_MIN_RESULTS  # jamais sous 25
    assert ref.widen_target(None) == ref.CRITERIA_WIDEN_MIN_RESULTS


def test_le_barreau_de_zone_lit_la_cible_demandee() -> None:
    assert zone_tiers.needs_zone_widening(30, target=100)
    assert not zone_tiers.needs_zone_widening(30)  # défaut inchangé : 25
    assert zone_tiers.auto_cap_reached(["department", "region"], 30, target=100)
    assert not zone_tiers.auto_cap_reached(["department", "region"], 30)


async def _skill_zone(monkeypatch: pytest.MonkeyPatch, by_tier: dict[str, int], exact: int, target: int):
    calls: list[str] = []

    async def fake_find(skills, zone, profile, deadline, city):  # noqa: ANN001
        tier = "department" if len(zone) == 1 else "region"
        calls.append(tier)
        return SimpleNamespace(accounts=[_row(1000 * len(calls) + i) for i in range(by_tier.get(tier, 0))])

    monkeypatch.setattr(discover, "find_skill_accounts", fake_find)
    monkeypatch.setattr(discover, "_skill_rows", lambda accounts: list(accounts))
    monkeypatch.setattr("app.services.geo_labels.region_departments", lambda region: ["59", "62"])
    rows = await discover._widen_skill_by_zone(
        ["java"],
        [_row(i) for i in range(exact)],
        DiscoverFilters(city="Lille"),
        SimpleNamespace(commune=_COMMUNE),
        "Lille",
        [],
        {},
        time.monotonic() + 60,
        {},
        target=target,
    )
    return rows, calls


@pytest.mark.asyncio
async def test_cent_demandes_le_departement_a_40_ouvre_la_region(monkeypatch) -> None:
    rows, calls = await _skill_zone(monkeypatch, {"department": 40, "region": 30}, exact=2, target=100)
    assert calls == ["department", "region"]
    assert len(rows) == 72


@pytest.mark.asyncio
async def test_vingt_cinq_demandes_le_departement_a_40_suffit(monkeypatch) -> None:
    rows, calls = await _skill_zone(monkeypatch, {"department": 40, "region": 30}, exact=2, target=25)
    assert calls == ["department"]


async def _widen_registry(monkeypatch: pytest.MonkeyPatch, exact: int, limit: int, spent: int = 0) -> list[int]:
    fetched: list[int] = []

    async def fake_collect(wider, place_lookup, lim, degraded, applied, registry_deadline, deadline):  # noqa: ANN001
        fetched.append(lim)
        return [_row(5000 + i) for i in range(30)]

    monkeypatch.setattr(discover, "_collect_for_request", fake_collect)
    monkeypatch.setattr(discover, "sector_widening_tiers", lambda sectors: [(1, ["voisin"])])
    monkeypatch.setattr(discover, "size_widening_tiers", lambda wanted: [])
    monkeypatch.setattr(discover, "APPLICATION_SECTOR_NAF", {"voisin": ("62.01Z",)})
    monkeypatch.setattr(discover, "naf_codes_for_sectors", lambda sectors: ["62.01Z"])
    token = discover._REGISTRY_CALLS.set([spent])
    try:
        await discover._widen_registry(
            DiscoverFilters(nafCode="62.02A"),
            [_row(i) for i in range(exact)],
            None,
            limit,
            [],
            {},
            time.monotonic() + 60,
            time.monotonic() + 60,
        )
    finally:
        discover._REGISTRY_CALLS.reset(token)
    return fetched


@pytest.mark.asyncio
async def test_registre_cent_demandes_trente_exacts_s_elargit(monkeypatch) -> None:
    assert await _widen_registry(monkeypatch, exact=30, limit=100) == [100]


@pytest.mark.asyncio
async def test_registre_dix_demandes_trente_exacts_ne_s_elargit_pas(monkeypatch) -> None:
    assert await _widen_registry(monkeypatch, exact=30, limit=10) == []


# ── #4419.1 — le budget d'appels registre suit la profondeur demandée ──────────────────────────────────────────


def test_le_budget_d_appels_registre_suit_le_volume() -> None:
    assert discover.registry_call_budget(25) == discover.REGISTRY_CALLS_PER_PAGE_DEPTH  # 6, comme avant
    assert discover.registry_call_budget(100) == 4 * discover.REGISTRY_CALLS_PER_PAGE_DEPTH
    assert discover.registry_call_budget(10_000) == discover.MAX_REGISTRY_PAGES * discover.REGISTRY_CALLS_PER_PAGE_DEPTH


@pytest.mark.asyncio
async def test_cent_demandes_six_appels_deja_faits_l_elargissement_part_encore(monkeypatch) -> None:
    """Quatre pages lues pour 100 = quatre appels : l'ancien plafond fixe (6) coupait l'élargissement aussitôt."""
    assert await _widen_registry(monkeypatch, exact=30, limit=100, spent=6) == [100]


@pytest.mark.asyncio
async def test_vingt_cinq_demandes_six_appels_faits_le_budget_est_atteint(monkeypatch) -> None:
    assert await _widen_registry(monkeypatch, exact=10, limit=25, spent=6) == []


class _Registry:
    def __init__(self, total: int) -> None:
        self.rows = [
            {
                "name": f"SOCIETE {i:04d} SAS",
                "siren": f"{100000000 + i}",
                "nafCode": "30.30Z",
                "city": "TOULOUSE",
                "department": "31",
                "headcountRange": "50 à 99 salariés",
                "headcountTranche": "21",
                "legalCategory": "5710",
            }
            for i in range(total)
        ]
        self.pages: list[int] = []

    def page_of(self, page: int) -> list[dict]:
        start = (page - 1) * LIST_PAGE_MAX
        return [dict(row) for row in self.rows[start : start + LIST_PAGE_MAX]]

    async def first(self, filters, limit, degraded=None):  # noqa: ANN001
        return self.page_of(1)

    async def page(self, filters, limit, degraded=None, *, page: int = 1):  # noqa: ANN001
        self.pages.append(page)
        return self.page_of(page)


def _pages_read(client: TestClient, monkeypatch: pytest.MonkeyPatch, limit: int) -> list[int]:
    source = _Registry(100)
    monkeypatch.setattr("app.routers.discover._registry_search", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover._fallback_search", source.first)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", source.page)
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        response = client.post(
            "/discover/registry",
            json={"filters": {"nafCode": "30.30Z,29.10Z"}, "limit": limit, "strictCriteria": True},
        )
    assert response.status_code == 200, response.text
    return [1, *source.pages]


def test_cent_demandes_quatre_pages_lues(client: TestClient, monkeypatch) -> None:
    assert _pages_read(client, monkeypatch, 100) == [1, 2, 3, 4]


def test_vingt_cinq_demandes_une_page_lue(client: TestClient, monkeypatch) -> None:
    assert _pages_read(client, monkeypatch, 25) == [1]


# ── #4517.2 / #4677.1 — budget total ~55 s ; la moisson des signaux a sa fenêtre, hors de la liste ────────────


def test_le_budget_total_est_55_s() -> None:
    assert discover.DISCOVER_TIME_BUDGET_S == 55.0


def test_les_signaux_ont_leur_fenetre_apres_la_liste() -> None:
    registry_deadline, list_deadline, deadline = discover._budget_clocks(1000.0)
    assert deadline == 1000.0 + discover.DISCOVER_TIME_BUDGET_S
    # La liste (registre + angle) finit AVANT que la fenêtre des signaux ne se referme : les signaux ne lui
    # prennent rien, et ils ont toujours au moins leur budget plein après elle.
    assert deadline - list_deadline >= discover.SIGNALS_TIME_BUDGET_S
    assert registry_deadline < list_deadline
    assert list_deadline == 1000.0 + discover.DISCOVER_LIST_BUDGET_S
    assert discover.DISCOVER_LIST_BUDGET_S + discover.SIGNALS_TIME_BUDGET_S <= discover.DISCOVER_TIME_BUDGET_S


@pytest.mark.asyncio
async def test_l_attente_des_signaux_lit_sa_propre_echeance() -> None:
    """La liste passe son échéance ; la moisson des signaux, la sienne (plus tardive) — jamais celle de la liste."""
    token = discover._SIGNALS_DEADLINE.set(5000.0)
    try:
        assert discover._signals_deadline(4000.0) == 5000.0
    finally:
        discover._SIGNALS_DEADLINE.reset(token)
    assert discover._signals_deadline(4000.0) == 4000.0  # hors requête : l'échéance passée
