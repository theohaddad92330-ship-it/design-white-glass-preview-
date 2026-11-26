"""A run that dies mid-phase must still say which upstream broke.

#628 built source-health visibility on ``analysis_runs.source_health``, stamped
from the telemetry summary the graph emits. Its whole purpose is answering
"which provider is down, and since when". But only the TERMINAL frames carried a
summary, and the terminal frames are the ones a failing run never reaches: the
worker throws on ``phase_failed`` the instant it arrives (deliberately — see
``analysis.worker.ts``), so ``run_failed`` is read only in the rare case where no
phase ever reported the failure. The health screen was therefore blindest during
an outage, which is the only time anyone opens it.

These tests pin the closure at the producer: ``phase_failed`` now carries the
same ``summary`` as ``run_failed``, built from the same in-process registries
(``source_health`` + ``run_metrics``), so the frame the consumer ACTUALLY reads
is the one that names the broken provider.

The degradation below is recorded by PRODUCTION code — ``research_pappers``
turning a typed ``PappersUnavailableError`` into a source-health entry — rather
than by the test calling ``record_degradation`` itself. A test that records its
own telemetry would prove only that a dict survives a round trip.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from langgraph.checkpoint.memory import MemorySaver

import app.graph.nodes as nodes
from app.graph.builder import build_analysis_graph, stream_analysis_graph
from app.middleware import correlation_id as correlation
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse
from app.services import source_health
from app.services.company_filters import DegradeReason
from app.services.pappers.models import PappersUnavailableError
from app.services.research import pappers as research_pappers

CID = "cid-failed-run-telemetry"


@pytest.fixture(autouse=True)
def _run_correlation():
    """Bind the run's correlation id the way the middleware does in production.

    Both halves of the mechanism key off it: ``record_degradation`` writes under
    it, ``summarize_telemetry`` reads under it. Binding the real ContextVar (not
    a monkeypatched getter) is what makes this test exercise the actual seam.
    """
    token = correlation._correlation_id.set(CID)
    source_health.clear_degradations(CID)
    yield
    source_health.clear_degradations(CID)
    correlation._correlation_id.reset(token)


def _raise(exc: Exception):
    async def _fn(*_args, **_kwargs):
        raise exc

    return _fn


def _dead_classify() -> SimpleNamespace:
    """A classify phase that terminally fails — the shape that emits ``phase_failed``."""
    return SimpleNamespace(
        status=AgentStatus.TERMINAL_FAILURE,
        data=None,
        error=SimpleNamespace(
            code="CLAUDE_BAD_REQUEST",
            message="Analyse impossible : le modèle a refusé la requête.",
            user_message="Analyse impossible : le modèle a refusé la requête.",
            debug_message="400 'temperature' is deprecated for this model",
        ),
        meta=None,
    )


@pytest.fixture
def failing_run(monkeypatch: pytest.MonkeyPatch) -> None:
    """A realistic broken run: Pappers 401 (spent quota), then classify dies.

    Two independent failures on purpose — a DEGRADED source the run survived, and
    the TERMINAL one that killed it. The dashboard question ("which upstream is
    down") is about the first; the frame that carries the answer is produced by
    the second.
    """
    monkeypatch.setattr(
        research_pappers,
        "search_company",
        _raise(PappersUnavailableError(401, DegradeReason.QUOTA_EXCEEDED, '{"error":"quota de jetons atteint"}')),
    )

    async def _research_with_dead_pappers(*_args: Any, **_kwargs: Any) -> ResearchResponse:
        # The real phase-1 helper: it swallows the provider failure (a partial
        # dossier beats none) and records WHY in the source-health registry.
        assert await research_pappers.research_pappers("Wire") is None
        return ResearchResponse(data={"businessDescription": "Banque", "executives": []})

    monkeypatch.setattr(nodes, "_research", _research_with_dead_pappers)
    monkeypatch.setattr(nodes, "_contacts", AsyncMock(return_value=ContactsResponse(data={"contacts": []})))
    monkeypatch.setattr(nodes, "_plan", AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S"}})))
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", AsyncMock(return_value=[]))

    class _Cls:
        run = AsyncMock(return_value=_dead_classify())

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)


async def _collect(thread: str) -> list[dict[str, Any]]:
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    return [
        json.loads(event.model_dump_json())
        async for event in stream_analysis_graph(
            {"company_name": "Wire", "profile_data": {}}, thread_id=thread, graph=graph
        )
    ]


def _frame(frames: list[dict[str, Any]], kind: str) -> dict[str, Any]:
    match = next((f for f in frames if f["type"] == kind), None)
    assert match is not None, f"expected a {kind} frame, got {[f['type'] for f in frames]}"
    return match


@pytest.mark.asyncio
async def test_the_frame_the_worker_reads_names_the_broken_provider(failing_run: None) -> None:
    """The test that matters: not "the field exists" but "the answer is right".

    ``phase_failed`` is the frame the worker acts on, so it is the frame that has
    to carry the health data. Asserting on ``run_failed`` instead would pass
    while production stayed blind — that is exactly how this gap survived.
    """
    frames = await _collect("failed-telemetry-provider")

    summary = _frame(frames, "phase_failed")["data"]["summary"]
    degraded = summary["degraded_sources"]

    pappers = next((d for d in degraded if d["source"] == "pappers"), None)
    assert pappers is not None, f"the failing provider is not named in {degraded}"
    # The typed code is what a dashboard groups on; "recharger le forfait" and
    # "tourner la clé" are opposite repairs, so the distinction has to survive.
    assert pappers["code"] == DegradeReason.QUOTA_EXCEEDED
    assert "quota" in pappers["reason"].lower()


@pytest.mark.asyncio
async def test_both_failure_frames_agree_on_the_health_data(failing_run: None) -> None:
    """``phase_failed`` and ``run_failed`` must not tell different stories.

    Whichever one the consumer happens to read, the stamped row has to be the
    same — otherwise "which source broke" depends on a race between a throw and a
    stream flush.
    """
    frames = await _collect("failed-telemetry-agree")

    phase_failed = _frame(frames, "phase_failed")["data"]["summary"]
    run_failed = _frame(frames, "run_failed")["data"]["summary"]

    assert phase_failed["degraded_sources"] == run_failed["degraded_sources"]
    assert phase_failed["providers"] == run_failed["providers"]


@pytest.mark.asyncio
async def test_the_failed_phase_is_accounted_for_in_the_telemetry(failing_run: None) -> None:
    """The summary describes the run AS IT DIED — phases that landed, plus the
    one that broke. A summary that silently omitted the failing phase would
    understate the run and misattribute where the time went."""
    frames = await _collect("failed-telemetry-phases")

    summary = _frame(frames, "phase_failed")["data"]["summary"]
    phases = [p.get("phase") for p in summary["phases"]]

    assert phases == ["research", "contacts", "classify"]
    # The failing phase is recorded as such, not quietly counted as a success.
    assert summary["phases"][-1]["ok"] is False


@pytest.mark.asyncio
async def test_a_healthy_run_that_fails_reports_no_degraded_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    """An empty list means "observed, nothing degraded" — a real answer.

    It must never be conflated with the absent-summary case, which means
    "unknown". The consumer draws that line (a missing summary stamps ``null``);
    the producer's job is to not fake the observation.
    """
    monkeypatch.setattr(
        nodes,
        "_research",
        AsyncMock(return_value=ResearchResponse(data={"businessDescription": "Banque", "executives": []})),
    )
    monkeypatch.setattr(nodes, "_contacts", AsyncMock(return_value=ContactsResponse(data={"contacts": []})))
    monkeypatch.setattr(nodes, "_plan", AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S"}})))
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", AsyncMock(return_value=[]))

    class _Cls:
        run = AsyncMock(return_value=_dead_classify())

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)

    frames = await _collect("failed-telemetry-healthy")

    assert _frame(frames, "phase_failed")["data"]["summary"]["degraded_sources"] == []


@pytest.mark.asyncio
async def test_the_failure_cause_is_not_displaced_by_the_telemetry(failing_run: None) -> None:
    """Adding the summary must not disturb the error placement that #634 fixed.

    ``data.error`` nested, with a readable message and a greppable code, is what
    stops a hard Anthropic 400 from reaching a customer as the word "Erreur".
    """
    frames = await _collect("failed-telemetry-cause")

    error = _frame(frames, "phase_failed")["data"]["error"]
    assert error["code"] == "CLASSIFY_TERMINAL"
    # The sentence a human reads — the thing that used to arrive as "Erreur".
    assert "temperature" in error["message"]
