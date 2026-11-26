"""No phase may eat the whole job budget.

The graph path had NO per-phase cap — only BullMQ's 20-minute `JOB_TIMEOUT_MS`.
A single wedged phase (a Claude call retrying, a provider hanging under its own
generous client timeout) burned the entire budget, and the user watched a
progress bar sit still for twenty minutes before getting nothing. The four
budgets sum to exactly the job timeout, so a hung phase now fails fast and the
phases after it still get their share.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from app.graph.builder import (
    CANCEL_GRACE_S,
    JOB_TIMEOUT_S,
    OBSERVED_PHASE_SECONDS,
    PHASE_TIMEOUTS_S,
    TERMINAL_REPORT_HEADROOM_S,
    _with_phase_timeout,
)


@pytest.mark.asyncio
async def test_a_fast_node_is_untouched() -> None:
    async def node(_state):
        return {"ok": True}

    wrapped = _with_phase_timeout("phase_research", node)
    assert await wrapped({}) == {"ok": True}


@pytest.mark.asyncio
async def test_a_hung_node_fails_with_a_timeout_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(PHASE_TIMEOUTS_S, "phase_research", 0.05)

    async def node(_state):
        await asyncio.sleep(5)
        return {"never": True}

    result = await _with_phase_timeout("phase_research", node)({})
    assert result["error"]["code"] == "PHASE_TIMEOUT"
    assert result["error"]["phase"] == "research"
    assert result["failed_phase"] == "research"


@pytest.mark.asyncio
async def test_timeout_message_names_the_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    """The failure must say how long it waited — otherwise it is just another
    opaque 'analysis failed'."""
    monkeypatch.setitem(PHASE_TIMEOUTS_S, "phase_plan", 0.05)

    async def node(_state):
        await asyncio.sleep(5)

    result = await _with_phase_timeout("phase_plan", node)({})
    assert "0.05" in result["error"]["message"] or "0" in result["error"]["message"]


@pytest.mark.asyncio
async def test_a_node_raising_is_not_swallowed_by_the_wrapper() -> None:
    """The wrapper only converts timeouts. Real errors keep their own handling."""

    async def node(_state):
        raise ValueError("boom")

    with pytest.raises(ValueError, match="boom"):
        await _with_phase_timeout("phase_research", node)({})


@pytest.mark.asyncio
async def test_cancellation_still_propagates(monkeypatch: pytest.MonkeyPatch) -> None:
    """A client disconnect must cancel the run, not be reported as a timeout."""

    async def node(_state):
        raise asyncio.CancelledError()

    with pytest.raises(asyncio.CancelledError):
        await _with_phase_timeout("phase_research", node)({})


def test_budgets_leave_headroom_under_the_job_timeout() -> None:
    """BullMQ kills the job at 20 min (JOB_TIMEOUT_MS in analysis.worker.ts).

    Summing to EXACTLY the job ceiling was not enough. The budgets are what makes
    a hang *legible*: the graph converts it into a typed French message, streams
    ``run_failed``, and the worker persists it. All of that happens AFTER the last
    phase's budget expires — so with zero headroom BullMQ kills the job first and
    the user gets the generic "analyse interrompue" instead of "phase X, budget
    dépassé". The failure has to outrun the killer that hides it.
    """
    assert sum(PHASE_TIMEOUTS_S.values()) <= JOB_TIMEOUT_S - TERMINAL_REPORT_HEADROOM_S


def test_every_node_in_the_graph_has_a_budget() -> None:
    """Including the judge. An invariant with one exception is how the exception
    later grows an HTTP call and becomes the next unbounded wait."""
    from app.graph.builder import _PHASES, JUDGE_NODE

    for name, _node, _next in _PHASES:
        assert name in PHASE_TIMEOUTS_S, f"{name} has no timeout budget"
    assert JUDGE_NODE in PHASE_TIMEOUTS_S


@pytest.mark.asyncio
async def test_a_node_that_swallows_its_cancellation_is_still_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The budget must not be defeatable by the code it is meant to bound.

    ``asyncio.timeout`` cancels the task exactly ONCE. A node that catches that
    ``CancelledError`` and then awaits anything else is never cancelled again, so
    the budget silently stops existing and the phase hangs forever — precisely the
    "no error, no timeout, frozen progress bar" shape we are fixing. And this is
    not hypothetical: ``ClassifierAgent.run`` converts ``CancelledError`` into a
    CANCELLED envelope, after which ``classify_node`` still awaits the contact
    enrichment.
    """
    monkeypatch.setitem(PHASE_TIMEOUTS_S, "phase_classify", 0.05)

    async def node(_state):
        try:  # noqa: SIM105 — spelled out on purpose: this IS the bug shape
            await asyncio.sleep(30)  # (ClassifierAgent.run), not a tidy idiom
        except asyncio.CancelledError:
            pass
        await asyncio.sleep(30)  # …and then keeps waiting, uncancellable
        return {"never": True}

    result = await asyncio.wait_for(_with_phase_timeout("phase_classify", node)({}), timeout=10)

    assert result["error"]["code"] == "PHASE_TIMEOUT"
    assert result["failed_phase"] == "classify"


@pytest.mark.asyncio
async def test_an_abandoned_node_does_not_delay_the_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reporting the timeout must not wait on the wedged phase to unwind."""
    monkeypatch.setitem(PHASE_TIMEOUTS_S, "phase_research", 0.05)

    stop = asyncio.Event()

    async def node(_state):
        while not stop.is_set():
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                continue  # pathological: refuses to die at all

    t0 = time.monotonic()
    try:
        result = await asyncio.wait_for(_with_phase_timeout("phase_research", node)({}), timeout=10)
        elapsed = time.monotonic() - t0
    finally:
        # Le noeud abandonné est immortel PAR CONSTRUCTION. Sans ce nettoyage, le
        # runner de pytest-asyncio >= 1.x (qui annule puis ATTEND les tâches
        # restantes au teardown) bloque à jamais : le job CI « Test (IA) » se
        # figeait à 58 % jusqu'au timeout de 15 min. On le laisse mourir ici.
        stop.set()
        me = asyncio.current_task()
        leftovers = [t for t in asyncio.all_tasks() if t is not me]
        for t in leftovers:
            t.cancel()
        await asyncio.gather(*leftovers, return_exceptions=True)

    assert result["error"]["code"] == "PHASE_TIMEOUT"
    assert elapsed < CANCEL_GRACE_S + 2, f"took {elapsed:.1f}s to report a timeout"


def test_every_budget_is_at_least_twice_its_measured_phase() -> None:
    """La règle que le module DÉCLARE — « roughly 3× its observed phase » — et
    que la phase plan était seule à ne pas respecter.

    Mesuré en production sur 30 jours (Railway, `bellum-ia-service`) :
    **8 `PHASE_TIMEOUT` sur `phase=plan`** contre 2 sur `classify` et **zéro sur
    `research`**. Les ratios expliquent exactement ce classement :

        research  450 / 140 = 3,2×     ← jamais approché
        classify  200 /  75 = 2,7×     ← 2 fois
        plan      260 / 155 = **1,7×** ← 8 fois

    Un commentaire qui énonce une règle ne la tient pas : trois semaines plus
    tard, la valeur qui s'en écarte est celle que personne ne recompte. Cette
    garde la tient, et elle mord dans les DEUX sens — un budget trop serré
    échoue ici avant d'échouer chez un client.
    """
    for phase, observed in OBSERVED_PHASE_SECONDS.items():
        budget = PHASE_TIMEOUTS_S[phase]
        assert budget >= 2 * observed, (
            f"{phase} : budget {budget:g}s pour une phase mesurée à {observed:g}s "
            f"({budget / observed:.1f}×). Sous 2×, la phase expire sur un run "
            f"normalement lent et le dossier sort incomplet."
        )


def test_the_measurements_cover_every_budgeted_phase_that_does_io() -> None:
    """Garde de corpus : une mesure retirée rendrait la garde ci-dessus muette
    sur la phase concernée, en restant verte."""
    from app.graph.builder import _PHASES

    for name, _node, _next in _PHASES:
        assert name in OBSERVED_PHASE_SECONDS, f"{name} n'a aucune durée mesurée"
