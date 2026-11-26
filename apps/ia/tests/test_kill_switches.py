"""Break-glass kill-switches for the 4 always-on IA v2 axes (kill_switch.py).

Politique zéro-flag : chaque axe est ON par défaut (aucune env à poser) ; le
kill-switch (``*_DISABLED=true``) est le SEUL contrôle restant, absent par
défaut. Chaque axe est testé trois fois : défaut (absent) = actif ; ``=true`` =
coupé ; valeur non-truthy (``false``/``0``/garbage) = actif. Hermetic — les
seams réseau/Claude sont patchés.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.graph.builder import build_analysis_graph
from app.services import data_gateway as dg
from app.services import grounding_citations as gc
from app.services import llm_gateway as lg
from app.services.claude_service import TokenUsage
from app.services.kill_switch import (
    DATA_GATEWAY_KILL_SWITCH,
    GROUNDING_KILL_SWITCH,
    JUDGE_KILL_SWITCH,
    LLM_GATEWAY_KILL_SWITCH,
    disabled,
)

# ── the helper itself ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on", " True "])
def test_disabled_truthy_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("SOME_KILL_SWITCH", value)
    assert disabled("SOME_KILL_SWITCH") is True


@pytest.mark.parametrize("value", ["", "false", "0", "off", "no", "banana"])
def test_disabled_non_truthy_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("SOME_KILL_SWITCH", value)
    assert disabled("SOME_KILL_SWITCH") is False


def test_disabled_absent_env_is_active(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SOME_KILL_SWITCH", raising=False)
    assert disabled("SOME_KILL_SWITCH") is False


# ── JUDGE_DISABLED — removes the judge node from the graph topology ───────────


def test_judge_default_is_in_graph(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(JUDGE_KILL_SWITCH, raising=False)
    graph = build_analysis_graph()
    assert "phase_judge" in set(graph.get_graph().nodes.keys())


def test_judge_kill_switch_removes_node(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(JUDGE_KILL_SWITCH, "true")
    graph = build_analysis_graph()
    assert "phase_judge" not in set(graph.get_graph().nodes.keys())


def test_judge_kill_switch_non_truthy_keeps_node(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(JUDGE_KILL_SWITCH, "false")
    graph = build_analysis_graph()
    assert "phase_judge" in set(graph.get_graph().nodes.keys())


def test_judge_explicit_param_wins_over_kill_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    # ``judge=True`` is an explicit caller decision (tests) — the break-glass
    # only drives the ``None`` product default.
    monkeypatch.setenv(JUDGE_KILL_SWITCH, "true")
    graph = build_analysis_graph(judge=True)
    assert "phase_judge" in set(graph.get_graph().nodes.keys())


# ── DATA_GATEWAY_DISABLED — search short-circuits to [] with zero network ─────


_HIT = {"title": "t", "url": "https://x.test/a", "description": "d", "source": "serper"}


async def test_data_gateway_default_searches(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(DATA_GATEWAY_KILL_SWITCH, raising=False)
    monkeypatch.setenv("SERPER_API_KEY", "k")
    monkeypatch.setattr(dg, "serper_search", AsyncMock(return_value=[_HIT]))
    hits = await dg.DataGateway().search("Doctolib")
    assert hits == [_HIT]


async def test_data_gateway_kill_switch_returns_empty_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(DATA_GATEWAY_KILL_SWITCH, "true")
    monkeypatch.setenv("SERPER_API_KEY", "k")
    provider = AsyncMock(return_value=[_HIT])
    monkeypatch.setattr(dg, "serper_search", provider)
    hits = await dg.DataGateway().search("Doctolib")
    assert hits == []
    provider.assert_not_awaited()  # zero network — provider never consulted


async def test_data_gateway_kill_switch_non_truthy_still_searches(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(DATA_GATEWAY_KILL_SWITCH, "0")
    monkeypatch.setenv("SERPER_API_KEY", "k")
    monkeypatch.setattr(dg, "serper_search", AsyncMock(return_value=[_HIT]))
    hits = await dg.DataGateway().search("Doctolib")
    assert hits == [_HIT]


# ── GROUNDING_DISABLED — ground_facts_v2 short-circuits, zero Claude call ─────


_DOCS = [{"title": "Registre", "text": "SIREN 794 598 813 — Doctolib"}]
_FACTS = {"siren": "794598813"}


async def test_grounding_default_calls_claude(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(GROUNDING_KILL_SWITCH, raising=False)
    seam = AsyncMock(return_value=("{}", [], TokenUsage(input_tokens=1, output_tokens=1, model="m", cost_usd=0.0)))
    monkeypatch.setattr(gc, "call_claude_with_citations", seam)
    grounding, usage = await gc.ground_facts_v2("Doctolib", _FACTS, _DOCS)
    seam.assert_awaited_once()
    assert grounding is not None and grounding["flag"] == "GROUNDING_V2"


async def test_grounding_kill_switch_short_circuits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(GROUNDING_KILL_SWITCH, "true")
    seam = AsyncMock()
    monkeypatch.setattr(gc, "call_claude_with_citations", seam)
    grounding, usage = await gc.ground_facts_v2("Doctolib", _FACTS, _DOCS)
    assert (grounding, usage) == (None, None)
    seam.assert_not_awaited()  # zero Claude call


async def test_grounding_kill_switch_non_truthy_still_grounds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(GROUNDING_KILL_SWITCH, "off")
    seam = AsyncMock(return_value=("{}", [], TokenUsage(input_tokens=1, output_tokens=1, model="m", cost_usd=0.0)))
    monkeypatch.setattr(gc, "call_claude_with_citations", seam)
    grounding, _usage = await gc.ground_facts_v2("Doctolib", _FACTS, _DOCS)
    seam.assert_awaited_once()
    assert grounding is not None


# ── LLM_GATEWAY_DISABLED — routing overrides ignored, direct Anthropic path ───


def _usage() -> TokenUsage:
    return TokenUsage(input_tokens=1, output_tokens=1, model="m", cost_usd=0.0)


async def test_llm_gateway_default_honours_route_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(LLM_GATEWAY_KILL_SWITCH, raising=False)
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    openai_seam = AsyncMock(return_value=("ok", lg._ProviderUsage(1, 1, 0)))
    monkeypatch.setattr(lg.OPENAI_PROVIDER, "_invoke", openai_seam)
    monkeypatch.setattr(lg.OPENAI_PROVIDER, "is_available", lambda: True)
    result, _ = await lg.complete("strategy", "sys", "user")
    openai_seam.assert_awaited_once()
    assert openai_seam.await_args.kwargs["model"] == "gpt-4o"
    assert result == "ok"


async def test_llm_gateway_kill_switch_forces_direct_anthropic(monkeypatch: pytest.MonkeyPatch) -> None:
    # Even with an explicit OpenAI route override, the break-glass must dispatch
    # direct Anthropic + the caller's model (the pre-gateway path).
    monkeypatch.setenv(LLM_GATEWAY_KILL_SWITCH, "true")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    openai_seam = AsyncMock(return_value=("ok", lg._ProviderUsage(1, 1, 0)))
    monkeypatch.setattr(lg.OPENAI_PROVIDER, "_invoke", openai_seam)
    monkeypatch.setattr(lg.OPENAI_PROVIDER, "is_available", lambda: True)
    anthropic_seam = AsyncMock(return_value=("direct", _usage()))
    monkeypatch.setattr(lg.claude_service, "_dispatch_anthropic", anthropic_seam)
    result, _ = await lg.complete("strategy", "sys", "user", model="claude-caller-model")
    openai_seam.assert_not_awaited()
    anthropic_seam.assert_awaited_once()
    assert anthropic_seam.await_args.kwargs["model"] == "claude-caller-model"  # caller model inherited
    assert result == "direct"


async def test_llm_gateway_kill_switch_non_truthy_keeps_routing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(LLM_GATEWAY_KILL_SWITCH, "false")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    openai_seam = AsyncMock(return_value=("ok", lg._ProviderUsage(1, 1, 0)))
    monkeypatch.setattr(lg.OPENAI_PROVIDER, "_invoke", openai_seam)
    monkeypatch.setattr(lg.OPENAI_PROVIDER, "is_available", lambda: True)
    await lg.complete("strategy", "sys", "user")
    openai_seam.assert_awaited_once()
