"""#4796 (épopée #4791) — Découvrir rendait 10 à 15 comptes : une chaîne de plafonds, pas un filtre.

Le palier d'équipe gouverne l'AFFICHAGE, jamais la COLLECTE (doctrine ``c76_role_reordonne_jamais_ne_filtre``) ;
les sources GRATUITES se paginent ; la pagination s'arrête sur page incomplète, budget atteint ou plafond dur.
Aucun appel réseau : les sources sont figées.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta

import pytest

from app.routers import discover_signals as mod
from app.services.discover_harvest_paging import harvest_pages
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat()


def _row(name: str, days_ago: int = 3) -> dict:
    return {
        "name": name,
        "siren": None,
        "department": "69",
        "city": None,
        "signal": {"type": "hiring", "label": f"offre {name}", "date": _iso(days_ago), "url": None, "detail": None},
    }


def _selected(siren: str, name: str) -> HomonymResolution:
    return HomonymResolution(
        status="selected",
        selectedSiren=siren,
        confidence=0.9,
        candidates=[
            ScoredCandidate(
                siren=siren,
                name=name,
                nafCode="62.02A",
                nafLabel="Conseil informatique",
                city="LYON",
                department="69",
                headcount=200,
                sizeClass="ETI",
                establishmentCount=1,
                isActive=True,
                score=0.9,
                reasons=[],
                source="test",
            )
        ],
    )


# ── 1. La pagination : trois arrêts, trois tests ───────────────────────────


def _pages(sizes: list[int], asked: int = 100):
    """Une source figée : la page ``i`` rend ``sizes[i]`` enregistrements bruts (autant de lignes)."""
    calls: list[int] = []

    async def fetch(offset: int, stats: dict[str, int]) -> list[dict]:
        index = len(calls)
        calls.append(offset)
        raw = sizes[index] if index < len(sizes) else 0
        stats.update(asked=asked, raw=raw)
        return [_row(f"P{index}-{n}") for n in range(raw)]

    return fetch, calls


async def test_pagination_stops_on_an_incomplete_page() -> None:
    fetch, calls = _pages([100, 100, 40, 100])
    out = await harvest_pages(fetch, page_rows=100, max_pages=10, deadline=time.monotonic() + 60)
    assert out.stopped_on == "last-page"
    assert out.pages == 3 and len(out.rows) == 240
    assert calls == [0, 100, 200], "le décalage avance du nombre d'enregistrements BRUTS lus"


async def test_pagination_stops_when_the_time_budget_is_reached() -> None:
    fetch, calls = _pages([100] * 10)
    out = await harvest_pages(fetch, page_rows=100, max_pages=10, deadline=time.monotonic() - 1)
    assert out.stopped_on == "budget"
    assert out.pages == 1 and calls == [0], "la 1re page est toujours lue ; la suivante attend le budget"


async def test_pagination_does_not_start_a_page_that_cannot_finish_in_the_budget() -> None:
    """Une page dure ~0,2 s ; il reste 0,1 s : la page suivante dépasserait le budget, elle ne part pas."""
    calls: list[int] = []

    async def slow(offset: int, stats: dict[str, int]) -> list[dict]:
        calls.append(offset)
        await asyncio.sleep(0.2)
        stats.update(asked=100, raw=100)
        return [_row("x")]

    out = await harvest_pages(slow, page_rows=100, max_pages=10, deadline=time.monotonic() + 0.3)
    assert out.stopped_on == "budget" and out.pages == 1 and calls == [0]


async def test_pagination_stops_at_the_hard_page_cap() -> None:
    fetch, calls = _pages([100] * 10)
    out = await harvest_pages(fetch, page_rows=100, max_pages=3, deadline=time.monotonic() + 60)
    assert out.stopped_on == "page-cap"
    assert out.pages == 3 and len(calls) == 3


async def test_a_filtered_but_full_raw_page_keeps_paging() -> None:
    """Une page de 150 offres dont 12 seulement survivent aux filtres locaux est PLEINE, pas incomplète."""
    calls: list[int] = []

    async def fetch(offset: int, stats: dict[str, int]) -> list[dict]:
        calls.append(offset)
        stats.update(asked=150, raw=150 if len(calls) < 3 else 20)
        return [_row(f"R{len(calls)}-{n}") for n in range(12)]

    out = await harvest_pages(fetch, page_rows=150, max_pages=10, deadline=time.monotonic() + 60)
    assert calls == [0, 150, 300] and len(out.rows) == 36 and out.stopped_on == "last-page"


async def test_a_failing_first_page_raises_but_a_failing_next_page_keeps_the_first() -> None:
    async def boom(offset: int, stats: dict[str, int]) -> list[dict]:
        raise RuntimeError("source HS")

    with pytest.raises(RuntimeError):
        await harvest_pages(boom, page_rows=100, max_pages=3, deadline=time.monotonic() + 60)

    calls: list[int] = []

    async def second_fails(offset: int, stats: dict[str, int]) -> list[dict]:
        calls.append(offset)
        if len(calls) > 1:
            raise RuntimeError("429")
        stats.update(asked=100, raw=100)
        return [_row("seul")]

    out = await harvest_pages(second_fails, page_rows=100, max_pages=3, deadline=time.monotonic() + 60)
    assert [r["name"] for r in out.rows] == ["seul"] and out.stopped_on == "page-failed"


# ── 2. Le palier d'équipe ne change plus ce qu'on collecte ─────────────────


@pytest.fixture()
def harvest_log(monkeypatch):
    """Sources figées qui NOTENT ce qu'on leur demande ; France Travail rend 200 employeurs sur 2 pages."""
    asked: dict[str, list[int]] = {"hiring": [], "tender": [], "award": [], "apec": []}
    attempted: list[str] = []

    async def _hiring(dept, kw, days, lim, *, offset=0, page_stats=None, **_kw):
        asked["hiring"].append(lim)
        n = 100 if offset < 200 else 0
        if page_stats is not None:
            page_stats.update(asked=100, raw=n)
        return [_row(f"Employeur {offset + i}", (offset + i) % 60) for i in range(n)]

    async def _empty(*a, **kw):
        return []

    async def _resolve(name, **kw):
        attempted.append(name)
        return _selected(f"{100000000 + len(attempted)}", name)

    monkeypatch.setattr(mod, "list_hiring_companies", _hiring)
    for name in (
        "list_hiring_companies_apec",
        "list_tender_buyers",
        "list_award_buyers",
        "list_hiring_companies_wttj",
        "list_hiring_companies_search",
        "list_capital_increase_companies",
        "it_job_signals_wttj",
        "it_job_signals_ats",
    ):
        monkeypatch.setattr(mod, name, _empty)
    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    return asked, attempted


@pytest.mark.parametrize("tier", [10, 24, 50])
def test_the_team_tier_does_not_change_what_is_collected(harvest_log, tier: int) -> None:
    asked, attempted = harvest_log
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=tier, sources=["hiring"])))
    # La collecte : la même page demandée, la même résolution, quel que soit le palier.
    assert set(asked["hiring"]) == {mod.HARVEST_ROWS_PER_PAGE}
    assert len(attempted) == mod.MAX_RESOLUTIONS
    # L'affichage : seul lui suit le palier.
    assert len(resp.candidates) == tier
    assert resp.coverage.candidatesFound == 200 and resp.coverage.resolutionsAttempted == mod.MAX_RESOLUTIONS


def test_two_tiers_collect_the_same_accounts(harvest_log) -> None:
    _asked, attempted = harvest_log
    asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=10, sources=["hiring"])))
    small = list(attempted)
    attempted.clear()
    asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=50, sources=["hiring"])))
    assert small == attempted and len(small) == mod.MAX_RESOLUTIONS


# ── 3. Les constantes : bornées, et le total tient sous les 2 minutes ──────


def test_the_ceilings_stay_bounded_and_under_two_minutes() -> None:
    assert mod.HARVEST_BUDGET_S == 90.0
    assert mod.HARVEST_BUDGET_S + mod.RESOLUTION_BUDGET_S < 120.0, "UN run long, sous les 2 min annoncées"
    assert 40 < mod.MAX_RESOLUTIONS <= 100, "monté, mais BORNÉ : le registre est partagé"
    assert mod.HARVEST_MAX_PAGES >= 2
    assert not hasattr(mod, "_RESOLUTION_OVERSHOOT"), "le palier ne règle plus la résolution"


# ── 4. Les sources acceptent la page suivante, sans changer l'appel d'avant ─


async def test_apec_reads_the_requested_start_index_and_reports_the_raw_page() -> None:
    from unittest.mock import AsyncMock

    import httpx

    from app.services.data_sources.apec import list_hiring_companies_apec

    resp = httpx.Response(200, json={"resultats": [{"intitule": "x"}] * 7}, request=httpx.Request("POST", "https://x"))
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=resp)

    stats: dict[str, int] = {}
    await list_hiring_companies_apec(client=client, limit=150, offset=200, page_stats=stats)
    assert client.post.call_args.kwargs["json"]["pagination"] == {"range": 100, "startIndex": 200}
    assert stats == {"asked": 100, "raw": 7}, "brut = ce que la source a rendu, avant les filtres locaux"

    await list_hiring_companies_apec(client=client)
    assert client.post.call_args.kwargs["json"]["pagination"]["startIndex"] == 0, "défaut : l'appel d'avant"


async def test_boamp_page_two_carries_an_offset_and_page_one_does_not() -> None:
    from unittest.mock import AsyncMock, MagicMock

    import httpx

    from app.services.data_sources.public_tenders import list_tender_buyers

    resp = MagicMock()
    resp.status_code = 200
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"results": [{}] * 3})
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=resp)

    stats: dict[str, int] = {}
    await list_tender_buyers("69", 90, 150, client=client, offset=100, page_stats=stats)
    assert client.get.call_args.kwargs["params"]["offset"] == "100"
    assert stats == {"asked": 100, "raw": 3}
    await list_tender_buyers("69", 90, 150, client=client)
    assert "offset" not in client.get.call_args.kwargs["params"]
