"""LOT (15/10) DATA-A point 7 — Brave : marché français, extraits en plus, fraîcheur à la place des
années en dur, et chaque appel payant inscrit au registre de coûts."""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.routers import phase2_contacts
from app.services import brave_search, cost_ledger
from app.services.data_sources import brave_news
from app.services.research.sources import SourceCategory


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    monkeypatch.delenv("BRAVE_EXTRA_SNIPPETS", raising=False)


def _client(payload: object) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(
        return_value=httpx.Response(200, json=payload, request=httpx.Request("GET", "https://x"))
    )
    return client


def _ledger_keys(ledger_rows: list[dict]) -> set[tuple[str, str]]:
    return {(row["provider"], row["operation"]) for row in ledger_rows}


async def test_web_query_targets_france_with_extra_snippets_and_freshness() -> None:
    client = _client({"web": {"results": [{"title": "T", "url": "https://a.fr", "description": "d", "extra_snippets": ["x1"]}]}})
    out = await brave_search._execute_query_uncached("Acme DSI", "k", client, freshness="py")
    params = client.get.call_args.kwargs["params"]
    assert params["country"] == "FR" and params["search_lang"] == "fr"
    assert params["extra_snippets"] == "true" and params["freshness"] == "py"
    assert out[0]["description"] == "d x1"


async def test_without_freshness_the_param_is_absent() -> None:
    client = _client({"web": {"results": []}})
    await brave_search._execute_query_uncached("Acme DSI", "k", client)
    assert "freshness" not in client.get.call_args.kwargs["params"]


def test_no_year_is_hardcoded_in_the_queries() -> None:
    queries = brave_search._build_queries("Acme", {"personas": ["DSI"], "sectors": ["banque"], "offers": ["cloud"]})
    for lane in queries.values():
        for q in lane:
            assert not any(year in q for year in ("2023", "2024", "2025", "2026")), q


def test_time_sensitive_lanes_carry_a_freshness() -> None:
    assert brave_search._freshness_for(SourceCategory.PRESS, "Acme actualité") == "py"
    assert brave_search._freshness_for(SourceCategory.INTERVIEW, "Acme DSI interview") == "py"
    assert brave_search._freshness_for(SourceCategory.OFFICIAL, "Acme site officiel") is None


async def test_each_paid_web_call_is_in_the_ledger() -> None:
    client = _client({"web": {"results": []}})
    with cost_ledger.bind_run("t"):
        await brave_search._execute_query_uncached("Acme", "k", client)
        rows = cost_ledger.snapshot()
    assert ("brave_search", "search") in _ledger_keys(rows)


async def test_news_call_is_in_the_ledger() -> None:
    client = _client({"results": []})
    with cost_ledger.bind_run("t"):
        await brave_news.recent_news("Acme Ledger Test", client=client)
        rows = cost_ledger.snapshot()
    assert ("brave_news", "news") in _ledger_keys(rows)


async def test_persona_phase2_call_is_in_the_ledger() -> None:
    client = _client({"web": {"results": []}})
    with cost_ledger.bind_run("t"):
        await phase2_contacts._persona_query(client, "Acme", "DSI")
        rows = cost_ledger.snapshot()
    assert ("brave_search", "persona_phase2") in _ledger_keys(rows)
