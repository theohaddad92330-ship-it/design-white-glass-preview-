"""#3704.4 — la reprise d'UNE source du registre, sans relancer celles qui ont répondu.

Avant : `resume` disait « relance avec refine: true » et le registre rejouait TOUT
le waterfall. Les sources sont anonymisées par doctrine (jamais le nom d'un
fournisseur à Laura) : la reprise passe donc par un JETON OPAQUE, dérivé du nom,
que le serveur re-dérive — aucun état à garder entre deux tours.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.routers import discover
from app.routers.discover import (
    REGISTRY_SOURCE_NAMES,
    DiscoverFilters,
    source_resume_token,
    sources_from_resume_tokens,
)
from app.services import chat_tools
from app.services.chat_tools import execute_chat_tool
from tests.test_run_account_search_scope import MAISON_LUXE, _Response, _stub


def test_tokens_are_opaque_stable_and_round_trip():
    for name in REGISTRY_SOURCE_NAMES:
        token = source_resume_token(name)
        assert name not in token and token.startswith("src-")
        assert token == source_resume_token(name)
        assert sources_from_resume_tokens([token]) == (name,)
    assert len({source_resume_token(n) for n in REGISTRY_SOURCE_NAMES}) == len(REGISTRY_SOURCE_NAMES)
    assert sources_from_resume_tokens(["src-00000000", "pappers"]) == (), "un jeton inconnu ou un nom ne résout rien"


@pytest.mark.asyncio
async def test_waterfall_interrogates_only_the_resumed_source(monkeypatch):
    called: list[str] = []

    async def _pappers(filters: Any, size: int, degraded: Any) -> list[dict]:
        called.append("pappers")
        return [{"siren": "111111111", "name": "A"}]

    async def _fallback(filters: Any, size: int, degraded: Any) -> list[dict]:
        called.append("recherche-entreprises")
        return [{"siren": "222222222", "name": "B"}]

    monkeypatch.setattr(discover, "_registry_search", _pappers)
    monkeypatch.setattr(discover, "_fallback_search", _fallback)
    monkeypatch.setattr(discover, "_registry_row", lambda row: dict(row))

    token = discover._ONLY_REGISTRY_SOURCES.set(("pappers",))
    try:
        rows = await discover._collect_registry(DiscoverFilters(), 5, [])
    finally:
        discover._ONLY_REGISTRY_SOURCES.reset(token)
    assert called == ["pappers"] and [r["siren"] for r in rows] == ["111111111"]

    called.clear()
    await discover._collect_registry(DiscoverFilters(), 5, [])
    assert called == ["pappers"], "sans reprise : le waterfall d'avant (la première qui répond suffit)"


@pytest.mark.asyncio
async def test_outage_returns_an_opaque_token_and_resume_sends_it_back(monkeypatch):
    seen = _stub(
        monkeypatch,
        _Response([MAISON_LUXE], degraded=[{"source": "pappers", "reason": "HTTP 500"}]),
    )
    out = await execute_chat_tool(
        "run_account_search", {"sectors": ["luxury"]}, user_id="u-1", profile_data=None
    )
    resume = out["resume"]
    token = source_resume_token("pappers")
    assert resume["resume_sources"] == [token]
    assert "pappers" not in str(out), "nos fournisseurs ne se nomment jamais"
    assert not getattr(seen[0], "onlySources", None)

    seen.clear()
    again = await execute_chat_tool(
        "run_account_search",
        {"sectors": ["luxury"], "resume_sources": [token]},
        user_id="u-1",
        profile_data=None,
    )
    assert seen[0].onlySources == ["pappers"]
    assert again["resumed"]["sources_count"] == 1


@pytest.mark.asyncio
async def test_unknown_resume_token_is_said_not_guessed(monkeypatch):
    seen = _stub(monkeypatch, _Response([MAISON_LUXE]))
    out = await execute_chat_tool(
        "run_account_search",
        {"sectors": ["luxury"], "resume_sources": ["src-deadbeef"]},
        user_id="u-1",
        profile_data=None,
    )
    assert not getattr(seen[0], "onlySources", None)
    assert "resume_tokens_unknown" in out and "resumed" not in out


def test_schema_exposes_resume_sources():
    props = chat_tools.RUN_ACCOUNT_SEARCH_TOOL["input_schema"]["properties"]
    assert props["resume_sources"]["items"] == {"type": "string"}
