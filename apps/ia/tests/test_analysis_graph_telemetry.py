"""Per-node telemetry (v2, increment 4).

Each phase node records its wall-time and the Claude token usage it incurred
into its envelope meta; ``summarize_telemetry`` rolls them into run totals.
research + plan carry real usage via ``data['_api_metrics']['token_usage']``;
contacts (Apollo-only) and the current classifier report zero tokens.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langgraph.checkpoint.memory import MemorySaver

import app.graph.nodes as nodes
from app.graph.builder import build_analysis_graph, run_analysis_graph, summarize_telemetry
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse


def _metrics(inp: int, out: int, cost: float, cache_read: int = 0) -> dict:
    return {
        "_api_metrics": {
            "token_usage": {
                "input_tokens": inp,
                "output_tokens": out,
                "cost_usd": cost,
                "cache_read_input_tokens": cache_read,
                "cache_creation_input_tokens": 0,
            }
        }
    }


@pytest.fixture
def telemetry_phases(monkeypatch: pytest.MonkeyPatch):
    research = AsyncMock(
        return_value=ResearchResponse(
            data={"businessDescription": "Banque", "executives": [], **_metrics(13000, 4000, 0.10, cache_read=400)}
        )
    )
    contacts = AsyncMock(return_value=ContactsResponse(data={"contacts": [{"fullName": "A B"}]}))  # no metrics
    plan = AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S"}, **_metrics(40000, 13000, 0.33)}))

    class _Cls:
        run = AsyncMock(
            return_value=SimpleNamespace(
                status=AgentStatus.SUCCESS,
                data=SimpleNamespace(model_dump=lambda **_k: {"contacts": [{"fullName": "A B"}]}),
                error=None,
                meta=None,  # classifier doesn't yet populate token_usage
            )
        )

    monkeypatch.setattr(nodes, "_research", research)
    monkeypatch.setattr(nodes, "_contacts", contacts)
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)
    return SimpleNamespace(research=research, contacts=contacts, plan=plan)


@pytest.mark.asyncio
async def test_each_phase_meta_carries_usage_and_duration(telemetry_phases) -> None:
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="tel-1", graph=graph)

    by_phase = {e["phase"]: e for e in final["envelopes"]}
    assert by_phase["research"]["input_tokens"] == 13000
    assert by_phase["research"]["output_tokens"] == 4000
    assert by_phase["research"]["cost_usd"] == pytest.approx(0.10)
    assert by_phase["research"]["cache_read_input_tokens"] == 400
    assert by_phase["plan"]["cost_usd"] == pytest.approx(0.33)
    # Apollo-only / classifier report zero tokens but still a duration.
    assert by_phase["contacts"]["input_tokens"] == 0
    assert by_phase["classify"]["cost_usd"] == 0
    for meta in by_phase.values():
        assert "duration_ms" in meta and meta["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_summarize_telemetry_rolls_up_totals(telemetry_phases) -> None:
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="tel-2", graph=graph)

    summary = summarize_telemetry(final)
    assert summary["total_input_tokens"] == 13000 + 40000
    assert summary["total_output_tokens"] == 4000 + 13000
    assert summary["total_cost_usd"] == pytest.approx(0.43)
    assert summary["total_cache_read_input_tokens"] == 400
    assert len(summary["phases"]) == 4


@pytest.mark.asyncio
async def test_failed_phase_meta_has_duration_and_zero_usage(monkeypatch, telemetry_phases) -> None:
    telemetry_phases.research.side_effect = RuntimeError("boom")
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="tel-3", graph=graph)

    meta = final["envelopes"][0]
    assert meta["phase"] == "research" and meta["ok"] is False
    assert meta["cost_usd"] == 0 and meta["input_tokens"] == 0
    assert "duration_ms" in meta


# ── Reproducibility stamp (LOT 11, GA-310) ───────────────────────────────────
#
# `analysis_runs.prompt_versions` was NULL on 40/40 real runs — read by nobody
# but the public-API "don't leak internal debug fields" test, written by
# nobody. `research` already computes `prompt_registry_fingerprint(profile)`
# and stamps it onto its OWN `_api_metrics.prompt_versions`
# (`phase1_research.py`) — the reproducibility stamp Théo p.15 asked for — but
# nothing downstream ever read it: `_usage_from_metrics` (nodes.py) only pulls
# `token_usage` out of `_api_metrics`, so the fingerprint was computed and
# thrown away before `summarize_telemetry` ever saw it. These three tests are
# the guard: it must READ the stamp when research produced one (not fabricate
# one), say NO (omit the key, not synthesize `{}`) when research didn't, and
# not choke on a malformed shape (an old IA deploy predating this, or a
# corrupted checkpoint) — `NULL` downstream means "not captured", never
# "no prompt used".
def _research_response_with_prompt_versions(prompt_versions: object) -> ResearchResponse:
    payload = {"businessDescription": "Banque", "executives": [], **_metrics(13000, 4000, 0.10)}
    payload["_api_metrics"]["prompt_versions"] = prompt_versions
    return ResearchResponse(data=payload)


@pytest.mark.asyncio
async def test_summarize_telemetry_reads_the_prompt_fingerprint_research_already_stamps(
    monkeypatch: pytest.MonkeyPatch, telemetry_phases
) -> None:
    """GA-310, proof 2/3 — LIT vraiment quelque chose (corpus non vide)."""
    from app.services.claude_service import CLAUDE_MODEL

    fingerprint = {"facts": "abc123def456", "signals": "112233445566", "plan": "aa11bb22cc33"}
    telemetry_phases.research.return_value = _research_response_with_prompt_versions(fingerprint)

    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="tel-pv-1", graph=graph)
    summary = summarize_telemetry(final)

    stamp = summary["prompt_versions"]
    assert stamp["prompts"] == fingerprint
    assert stamp["model"] == CLAUDE_MODEL
    # Per-phase token counts "s'ils sont déjà là" (they are — the envelopes):
    # the reproducibility stamp doesn't just say WHICH prompt, it says what
    # each phase actually cost, so a regression can be pinned to a phase.
    by_phase = {p["phase"]: p for p in stamp["phases"]}
    assert by_phase["research"]["input_tokens"] == 13000
    assert set(by_phase) == {"research", "contacts", "classify", "plan"}


@pytest.mark.asyncio
async def test_summarize_telemetry_omits_prompt_versions_when_research_never_stamped_one(
    telemetry_phases,
) -> None:
    """GA-310, proof 1/3 — sait dire NON : un run ANCIEN (sans le stamp) ne doit
    JAMAIS faire apparaître un `prompt_versions` fabriqué. `telemetry_phases`
    (no `_api_metrics.prompt_versions`) is exactly "a run predating this
    column" — the exact shape read from prod on all 40 runs today."""
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="tel-pv-2", graph=graph)
    summary = summarize_telemetry(final)

    assert "prompt_versions" not in summary


@pytest.mark.asyncio
async def test_summarize_telemetry_ignores_a_malformed_or_empty_prompt_fingerprint(
    telemetry_phases,
) -> None:
    """GA-310, proof 3/3 — ne casse pas et n'attrape pas ce qu'elle ne vise pas :
    un `{}` (rien à déclarer) ou une valeur de forme inattendue (checkpoint
    corrompu, déploiement IA hétérogène) ne doit ni faire tomber le run ni
    produire un `prompt_versions` vide/mensonger."""
    for malformed in ({}, "not-a-dict", ["facts", "signals"], None):
        telemetry_phases.research.return_value = _research_response_with_prompt_versions(malformed)
        graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
        final = await run_analysis_graph(
            {"company_name": "X", "profile_data": {}}, thread_id=f"tel-pv-3-{malformed}", graph=graph
        )
        summary = summarize_telemetry(final)

        assert "prompt_versions" not in summary, f"malformed input leaked through: {malformed!r}"


# #3235 / #3212.3 — le timbre `market_memory_version` posé par le plan voyage
# jusqu'au résumé terminal (celui que `analysis.worker.ts` écrit sur la colonne).
@pytest.mark.asyncio
async def test_summarize_telemetry_relays_the_market_memory_version_the_plan_stamped(telemetry_phases) -> None:
    plan_payload = {"plan": {}, "_api_metrics": {"token_usage": {}, "market_memory_version": "2026-09-v3"}}
    telemetry_phases.plan.return_value = PlanResponse(success=True, data=plan_payload)
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="tel-mm-1", graph=graph)
    assert summarize_telemetry(final)["market_memory_version"] == "2026-09-v3"


@pytest.mark.asyncio
async def test_summarize_telemetry_omits_market_memory_version_when_plan_never_read_it(telemetry_phases) -> None:
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="tel-mm-2", graph=graph)
    assert "market_memory_version" not in summarize_telemetry(final)
