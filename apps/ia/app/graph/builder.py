"""Assemble + run the analysis StateGraph.

Wiring: START → research → contacts → classify → plan → END, with a conditional
edge after every phase that jumps straight to END the moment ``state['error']``
is set (early-exit). The module-level ``_GRAPH`` uses an in-memory checkpointer;
for a durable, resumable run use ``analysis_graph_session`` (Postgres when
LANGGRAPH_PG_URL/DATABASE_URL is set) and pass the yielded graph to
``run_analysis_graph`` / ``resume_analysis_graph``.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.graph.checkpoint import make_checkpointer
from app.graph.events import JUDGE_COMPLETED, PHASE_OUTPUT_KEYS, PHASE_PROGRESS, GraphEvent
from app.graph.judge import judge_node
from app.graph.nodes import _fail, classify_node, contacts_node, plan_node, research_node
from app.graph.state import AnalysisState
from app.middleware.correlation_id import get_correlation_id
from app.services import cost_ledger, langfuse_client
from app.services.claude_service import CLAUDE_MODEL
from app.services.kill_switch import JUDGE_KILL_SWITCH, disabled
from app.services.provider_pricing import price_run
from app.services.provider_pricing import total_cost_usd as providers_cost_usd
from app.services.run_metrics import get_metrics
from app.services.run_metrics import summarise as summarise_metrics
from app.services.source_health import get_degradations

logger = logging.getLogger(__name__)
# The anti-hallucination validation node — part of the product, always in the
# graph. Deterministic, zero-cost, advisory (never sets ``error``). Tests can pin
# the legacy 4-phase topology with ``build_analysis_graph(judge=False)``.
# Break-glass: ``JUDGE_DISABLED=true`` (kill_switch.py) removes the node at graph
# build time — prod runs go through ``analysis_graph_session`` (a fresh build per
# run), so the switch takes effect on the next run; the module-level ``_GRAPH``
# is compiled at import (restart applies it there).
JUDGE_NODE = "phase_judge"


# Ordered phases: (node name, callable, next node on success). Node names are
# prefixed so they never collide with the same-named state channels (LangGraph
# forbids a node name equal to a state key).
_PHASES = [
    ("phase_research", research_node, "phase_contacts"),
    ("phase_contacts", contacts_node, "phase_classify"),
    ("phase_classify", classify_node, "phase_plan"),
    ("phase_plan", plan_node, END),
]


# ── Per-phase wall-clock budgets ──────────────────────────────────────────────
# The graph path had no per-phase cap at all: only BullMQ's 20-min JOB_TIMEOUT_MS
# (analysis.worker.ts). One wedged phase — a Claude call in its retry path, a
# provider hanging under its own generous client timeout — consumed the entire
# budget while the progress bar sat still, and the run produced nothing.
#
# Generous on purpose: this catches a hang, it must not cut a legitimately slow
# analysis. A healthy full run measures ~6 min end to end — les durées mesurées
# vivent dans ``OBSERVED_PHASE_SECONDS`` ci-dessous, et chaque budget vaut AU
# MOINS 2× la sienne.
#
# Ce commentaire disait « roughly 3× » et se trompait : `phase_plan` était à
# 1,7×, et c'est précisément la phase qui expirait. Une règle écrite en prose
# n'est pas tenue — celle-ci l'est maintenant par
# ``test_every_budget_is_at_least_twice_its_measured_phase``.
JOB_TIMEOUT_S = 1200.0  # JOB_TIMEOUT_MS in apps/api/src/.../analysis.constants.ts

# What we refuse to spend on phases, reserved for REPORTING a failure: the graph
# has to convert the timeout into a typed message, stream ``run_failed``, and let
# the worker persist it. The budgets used to sum to exactly JOB_TIMEOUT_S, which
# left none of that room — BullMQ killed the job at the same instant the last
# phase gave up, so the very failure the budgets exist to produce was the one
# thing they could never deliver, and the user got the generic "analyse
# interrompue" instead of the phase that actually hung.
TERMINAL_REPORT_HEADROOM_S = 120.0

#: Ce qu'une phase SAINE dure réellement — les mesures que le commentaire
#: ci-dessus citait sans les nommer, sorties de leur prose pour devenir
#: vérifiables (`test_graph_phase_timeout.py`).
#:
#: Un commentaire qui énonce une règle ne la tient pas : trois semaines plus
#: tard, la valeur qui s'en écarte est celle que personne ne recompte. C'était
#: le cas de `phase_plan`, à 1,7× quand la règle dit « environ 3× ».
OBSERVED_PHASE_SECONDS: dict[str, float] = {
    "phase_research": 140.0,
    "phase_contacts": 45.0,
    "phase_classify": 75.0,
    "phase_plan": 155.0,
}

# ── Le rééquilibrage du 31/08/2026, et ce qu'il repose sur ──────────────────
#
# Mesuré en production sur 30 jours (Railway, `bellum-ia-service`) :
# **10 `PHASE_TIMEOUT`, dont 8 sur `phase=plan`** (budget 260 s), 2 sur
# `classify`, et **ZÉRO sur `research`**. Les ratios budget/mesure expliquent
# exactement ce classement :
#
#     research  450 / 140 = 3,2×   → jamais approché en 30 jours
#     classify  200 /  75 = 2,7×   → 2 fois
#     plan      260 / 155 = 1,7×   → 8 fois
#
# La somme des budgets touche déjà le plafond (JOB_TIMEOUT_S moins la réserve
# de report), donc donner de l'air au plan EXIGE d'en reprendre ailleurs. On le
# prend à `research`, la seule qui n'a jamais expiré : ses 22 erreurs de la
# période sont des ANNULATIONS externes, la plus longue à 2 m 40 — soit 160 s
# pour un budget de 450.
#
# ⚠️ Ce que ce rééquilibrage NE corrige PAS : la phase 4 lance ~12 appels
# concurrents, mais la latence enregistrée de chacun INCLUT son attente dans le
# seau `claude` (50 rpm, partagé par toutes les analyses via Redis) —
# `claude_service.py` démarre son chrono AVANT `async with throttle`. La
# concurrence existe et ne sert à rien tant que le seau est vide. Ceci convertit
# donc des dossiers INCOMPLETS en dossiers COMPLETS mais lents ; la contention
# reste, et sa correction est un arbitrage de coût (monter le rpm, seau dédié,
# réduire le fan-out) qui demande de connaître les limites réelles du compte.
PHASE_TIMEOUTS_S: dict[str, float] = {
    "phase_research": float(os.getenv("PHASE_RESEARCH_TIMEOUT_S", "360")),
    "phase_contacts": float(os.getenv("PHASE_CONTACTS_TIMEOUT_S", "140")),
    "phase_classify": float(os.getenv("PHASE_CLASSIFY_TIMEOUT_S", "200")),
    "phase_plan": float(os.getenv("PHASE_PLAN_TIMEOUT_S", "350")),
    # Deterministic, zero-I/O validator — a wedge detector, not a budget.
    JUDGE_NODE: float(os.getenv("PHASE_JUDGE_TIMEOUT_S", "30")),
}

# How long we wait for a timed-out phase to actually unwind before abandoning it.
# A healthy coroutine reacts to ``cancel()`` in microseconds; this only bites on a
# phase that swallows its own cancellation. We do not let such a phase hold the
# run hostage — the report goes out and the orphan is reaped by the loop.
CANCEL_GRACE_S = 5.0


def _with_phase_timeout(name: str, node):
    """Wrap a phase node so it fails fast instead of hanging the whole job.

    Only ``TimeoutError`` is converted — a real exception keeps the node's own
    error handling, and ``CancelledError`` (client disconnect) propagates
    untouched so a disconnect is never mis-reported as a timeout.

    The node runs as its own TASK rather than inline under ``asyncio.timeout``,
    and that is the load-bearing detail. ``asyncio.timeout`` cancels the running
    task exactly once; a node that catches that ``CancelledError`` and then awaits
    anything else is never cancelled again, so the budget silently ceases to
    exist. ``ClassifierAgent.run`` does exactly that (it converts a cancellation
    into a CANCELLED envelope), after which ``classify_node`` still awaits contact
    enrichment — one swallowed cancellation and the phase hangs forever with no
    error, which is the worst outcome available to us: the user waits on a run
    that will never finish and never fails loudly enough to be retried.

    Owning the task means the budget is enforced from OUTSIDE the code it bounds:
    we cancel, wait a bounded grace, and report the timeout regardless of whether
    the node cooperated.
    """

    async def _run(state):
        budget = PHASE_TIMEOUTS_S.get(name)
        if not budget:
            return await node(state)
        phase = name.removeprefix("phase_")
        t0 = time.monotonic()
        task = asyncio.create_task(node(state), name=name)
        try:
            # Span Langfuse (no-op sans clés / hors trace) : la durée réelle de
            # la phase, et un niveau ERROR quand elle déborde son budget.
            with langfuse_client.span(name):
                return await asyncio.wait_for(asyncio.shield(task), budget)
        except TimeoutError:
            task.cancel()
            # Bounded: never block the failure report on a phase that refuses to die.
            done, _pending = await asyncio.wait({task}, timeout=CANCEL_GRACE_S)
            if not done:
                logger.error(
                    "Phase %s ignored its cancellation after %.0fs — abandoning the task "
                    "and failing the run anyway",
                    phase,
                    CANCEL_GRACE_S,
                    extra={"tags": {"phase": phase, "code": "PHASE_TIMEOUT_UNCANCELLABLE"}},
                )
            return _fail(
                phase,
                f"Phase interrompue après {budget:g}s (budget dépassé). "
                "Le dossier est incomplet — relancer l'analyse.",
                code="PHASE_TIMEOUT",
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
        except asyncio.CancelledError:
            # Client disconnect: cancel the phase with us, then propagate.
            task.cancel()
            raise

    return _run


def _route_after(name: str, next_node: str):
    """Continue to ``next_node`` unless a phase failed — or, after research, the
    go/no-go gate returned ``no_go`` (early-exit before spending downstream)."""

    def _route(state: AnalysisState) -> str:
        if state.get("error"):
            return END
        if name == "phase_research" and state.get("gate", {}).get("decision") == "no_go":
            return END
        return next_node

    return _route


def build_analysis_graph(*, checkpointer: Any | None = None, judge: bool | None = None):
    """Compile the analysis StateGraph. Pass a checkpointer to enable resume.

    ``judge`` toggles the anti-hallucination node (``None`` → the product
    default: ON, unless the break-glass ``JUDGE_DISABLED=true`` kill-switch is
    set). ``judge=False`` gives the legacy 4-phase topology (tests).
    """
    enable_judge = (not disabled(JUDGE_KILL_SWITCH)) if judge is None else judge
    builder = StateGraph(AnalysisState)
    # Judge on: re-point the last phase (plan) at the judge, then judge → END.
    # judge=False = phases untouched, last phase still routes straight to END.
    phases = list(_PHASES)
    if enable_judge:
        last_name, last_node, _ = phases[-1]
        phases[-1] = (last_name, last_node, JUDGE_NODE)
    for name, node, _next in phases:
        builder.add_node(name, _with_phase_timeout(name, node))
    if enable_judge:
        # Bounded like every other node. The judge is deterministic and does no
        # I/O today, so this should never fire — which is exactly why it is cheap
        # to keep: the invariant is "no node in this graph can run unbounded",
        # and an invariant with one documented exception is how the exception
        # later grows an HTTP call.
        builder.add_node(JUDGE_NODE, _with_phase_timeout(JUDGE_NODE, judge_node))
    builder.add_edge(START, "phase_research")
    for name, _node, next_node in phases:
        if next_node is END:
            builder.add_conditional_edges(name, _route_after(name, END), {END: END})
        else:
            builder.add_conditional_edges(name, _route_after(name, next_node), {next_node: next_node, END: END})
    if enable_judge:
        builder.add_edge(JUDGE_NODE, END)
    return builder.compile(checkpointer=checkpointer or MemorySaver())


# Compiled once at import — the graph topology is static and stateless; all
# per-run state lives in the checkpointer keyed by thread_id.
_GRAPH = build_analysis_graph()


def _config(thread_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": thread_id}}


async def run_analysis_graph(
    inputs: dict[str, Any],
    *,
    thread_id: str,
    graph: Any | None = None,
) -> dict[str, Any]:
    """Run the pipeline to completion (or early-exit) and return the final state.

    ``thread_id`` keys the checkpointer so a run can later be resumed/inspected.
    """
    compiled = graph or _GRAPH
    with langfuse_client.bind_trace(
        "analysis_run",
        session_id=get_correlation_id() or None,
        metadata={"thread_id": thread_id},
    ):
        return await compiled.ainvoke(inputs, config=_config(thread_id))


async def stream_analysis_graph(
    inputs: dict[str, Any],
    *,
    thread_id: str,
    graph: Any | None = None,
) -> AsyncIterator[GraphEvent]:
    """Un run d'analyse = une trace Langfuse (env-gated, no-op sans clés) :
    les appels Claude des phases y sont des générations, chaque phase un span
    (posé par ``_with_phase_timeout``). ``sessionId`` = correlation-id, pour
    regrouper ce run avec les requêtes voisines du même dossier. Délègue tel
    quel au flux réel ci-dessous, qui porte le contrat détaillé."""
    with langfuse_client.bind_trace(
        "analysis_run",
        session_id=get_correlation_id() or None,
        metadata={"thread_id": thread_id},
    ):
        async for event in _stream_analysis_graph(inputs, thread_id=thread_id, graph=graph):
            yield event


async def _stream_analysis_graph(
    inputs: dict[str, Any],
    *,
    thread_id: str,
    graph: Any | None = None,
) -> AsyncIterator[GraphEvent]:
    """Run the pipeline, yielding a typed ``GraphEvent`` as each phase resolves.

    Drives ``astream(stream_mode="updates")``: one update per node. A node that
    returned nothing (resume short-circuit) → ``phase_skipped``; a node that set
    ``error`` → ``phase_failed``; otherwise ``phase_completed`` with that phase's
    telemetry meta. A terminal ``run_completed``/``run_failed`` carries the
    aggregated telemetry summary — and so does ``phase_failed``, see below.
    """
    compiled = graph or _GRAPH
    config = _config(thread_id)
    # The run so far, rebuilt as we stream. ``stream_mode="updates"`` hands us
    # each node's DELTA, not the accumulated state (``envelopes`` uses an
    # ``operator.add`` reducer, so an update carries only the envelope that node
    # just added), and the checkpoint for a failing node is not readable at the
    # moment we need it. Accumulating here is what lets ``phase_failed`` report
    # the same telemetry the terminal frame would have.
    seen: dict[str, Any] = {"envelopes": []}
    async for chunk in compiled.astream(inputs, config=config, stream_mode="updates"):
        for node_name, update in chunk.items():
            if isinstance(update, dict):
                seen["envelopes"].extend(update.get("envelopes") or [])
                if update.get("gate") is not None:
                    seen["gate"] = update["gate"]
            # The judge is a validator, not a phase — emit a dedicated
            # judge_completed carrying the verdict, never a phase_*.
            if str(node_name) == JUDGE_NODE:
                if update:
                    yield GraphEvent(
                        type=JUDGE_COMPLETED,
                        phase="judge",
                        progress=PHASE_PROGRESS["plan"],
                        data={"judge": update.get("judge", {})},
                    )
                continue
            phase = str(node_name).removeprefix("phase_")
            progress = PHASE_PROGRESS.get(phase, 0)
            if not update:
                yield GraphEvent(type="phase_skipped", phase=phase, progress=progress)
            elif update.get("error"):
                # NEST under "error" — same shape as the terminal ``run_failed``
                # below, because the NestJS worker reads ``ev.data.error?.message``
                # for BOTH. Splatting the error flat here made that lookup
                # undefined, so every failure surfaced as the generic
                # "Analysis failed in phase research: research failed" with the
                # real cause dropped on the floor. ``phase_failed`` is emitted
                # mid-stream and the worker throws on it at once, so it always
                # beats ``run_failed`` — this was the only shape that mattered.
                #
                # ``summary`` carries the run's telemetry — crucially the
                # per-provider metrics and the degraded sources — because THIS
                # is the failure frame the worker actually reads. It throws on
                # it at once (deliberately: an ``UnrecoverableError`` keeps a
                # real failure off the BullMQ retry budget), which means the
                # terminal ``run_failed`` below is in practice never consumed.
                # While only that terminal frame carried the summary,
                # ``stampSourceHealth`` was dead code on the failure path that
                # actually fires — so the "which upstream is down, since when"
                # screen (#628) went blind precisely during an outage, the only
                # time anyone opens it. Same shape as the incident that
                # motivated all this: a mechanism present, green in tests, and
                # absent exactly when needed.
                #
                # ADDITIVE and optional by contract: an API deploy that predates
                # this reads the frame exactly as before (unknown keys pass
                # through, never stripped — see packages/contracts
                # graph-events.ts), and an IA rolled back below it simply stamps
                # nothing, which reads downstream as "unknown" rather than as a
                # clean bill of health. Neither service has to deploy first.
                yield GraphEvent(
                    type="phase_failed",
                    phase=update.get("failed_phase", phase),
                    progress=progress,
                    data={
                        "error": update["error"],
                        # Not logged again: the terminal frame logs the same
                        # breakdown a moment later, and one run must not look
                        # like two in the provider-cost log.
                        "summary": summarize_telemetry(seen, log_breakdown=False),
                    },
                )
            else:
                meta = (update.get("envelopes") or [{}])[-1]
                output = {k: update[k] for k in PHASE_OUTPUT_KEYS.get(str(node_name), ()) if k in update}
                yield GraphEvent(
                    type="phase_completed",
                    phase=phase,
                    progress=progress,
                    data={"telemetry": meta, "output": output},
                )

    final = await get_analysis_state(thread_id, graph=compiled)
    summary = summarize_telemetry(final)
    if final.get("error"):
        failed = final.get("failed_phase") or ""
        yield GraphEvent(
            type="run_failed",
            phase=failed or None,
            progress=PHASE_PROGRESS.get(failed, 0),
            data={"error": final["error"], "summary": summary},
        )
    elif final.get("gate", {}).get("decision") == "no_go":
        # Research ran but the account was a no-go — a deliberate early-exit,
        # not a failure.
        yield GraphEvent(
            type="run_skipped",
            phase="research",
            progress=PHASE_PROGRESS["research"],
            data={"gate": final["gate"], "summary": summary},
        )
    else:
        # Ce que le run a coûté, fournisseur par fournisseur (D19). Le registre
        # est ouvert pour toute la requête SSE, donc ce cliché final couvre TOUTES
        # les phases. Il voyage dans `data` (passthrough côté contrat) plutôt que
        # dans un nouveau type d'événement : un type inconnu du worker ferait
        # tomber un run complet, une clé en plus ne fait rien.
        # Clé ajoutée UNIQUEMENT s'il y a quelque chose à déclarer : un run sans
        # consommation enregistrée garde un événement terminal byte-identique,
        # donc la fixture de contrat partagée reste vraie.
        run_costs = cost_ledger.snapshot()
        terminal_data: dict = {"summary": summary}
        if run_costs:
            terminal_data["provider_costs"] = run_costs
        yield GraphEvent(type="run_completed", progress=100, data=terminal_data)


async def resume_analysis_graph(thread_id: str, *, graph: Any | None = None) -> dict[str, Any]:
    """Resume a previously-failed run on the same thread.

    Clearing ``error``/``failed_phase`` re-opens the linear path; each node that
    already succeeded short-circuits on its ``completed`` marker, so only the
    failed phase + downstream re-run — no re-paying Claude/providers for phases
    that already landed. Requires the same checkpointer (Postgres in prod) that
    held the original run.
    """
    compiled = graph or _GRAPH
    with langfuse_client.bind_trace(
        "analysis_resume",
        session_id=get_correlation_id() or None,
        metadata={"thread_id": thread_id},
    ):
        return await compiled.ainvoke({"error": None, "failed_phase": None}, config=_config(thread_id))


async def get_analysis_state(thread_id: str, *, graph: Any | None = None) -> dict[str, Any]:
    """Return the persisted state values for a thread (empty dict if none)."""
    compiled = graph or _GRAPH
    snapshot = await compiled.aget_state(_config(thread_id))
    return dict(snapshot.values) if snapshot and snapshot.values else {}


def _prompt_versions_stamp(state: dict[str, Any], phases: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Reproducibility stamp (LOT 11 / GA-310) — WHICH prompt template versions
    and model produced this dossier, so a quality regression can be pinned to a
    prompt change instead of guessed at.

    ``research_node`` already computes this: ``phase1_research.py`` stamps
    ``prompt_registry_fingerprint(profile)`` — a short content HASH per
    registered prompt (Théo p.15) — onto its own
    ``research._api_metrics.prompt_versions``. Nothing downstream ever read it:
    ``_usage_from_metrics`` (nodes.py) only pulls ``token_usage`` out of
    ``_api_metrics``, so the fingerprint was computed on every single run and
    thrown away before it ever reached ``analysis_runs.prompt_versions`` —
    which is why the column reads NULL on all 40 real runs. This reads the
    value that is ALREADY there; it recomputes nothing and calls nothing paid.

    Additive and defensive, like ``run_costs`` below: an old IA deploy or a
    run that failed before research completed simply has no stamp to read, and
    ``None`` here means the caller omits the key entirely — NULL on the column
    then reads as "not captured", never as "no prompt used". A malformed shape
    (not a non-empty dict of strings) is likewise treated as absent rather than
    persisted — a corrupt fingerprint must not look like a real one.

    Content is per-prompt NAMES and content HASHES plus the per-phase token
    counts already summed into ``phases`` — never a prompt's text, a model
    output, or anything personal (doctrine: ``analysis_runs`` has no RLS).
    """
    research_metrics = (state.get("research") or {}).get("_api_metrics")
    prompts = research_metrics.get("prompt_versions") if isinstance(research_metrics, dict) else None
    if not isinstance(prompts, dict) or not prompts:
        return None
    if not all(isinstance(k, str) and isinstance(v, str) for k, v in prompts.items()):
        return None
    return {
        "model": CLAUDE_MODEL,
        "prompts": prompts,
        "phases": [
            {
                "phase": p.get("phase"),
                "input_tokens": p.get("input_tokens", 0),
                "output_tokens": p.get("output_tokens", 0),
                "cache_read_input_tokens": p.get("cache_read_input_tokens", 0),
                "cache_creation_input_tokens": p.get("cache_creation_input_tokens", 0),
            }
            for p in phases
        ],
    }


def summarize_telemetry(state: dict[str, Any], *, log_breakdown: bool = True) -> dict[str, Any]:
    """Aggregate the per-phase envelope metas into run totals.

    Sums token usage, cost and wall-time across the executed phases. The
    per-phase breakdown is kept under ``phases`` so a dashboard can show both
    the total and where it was spent.

    Callable mid-run: ``providers`` and ``degraded_sources`` come from the
    correlation-scoped in-process registries and are complete as of NOW, so a
    partial ``state`` (the phases that landed, plus the one that broke) yields an
    honest picture of the run as it died. ``log_breakdown=False`` suppresses the
    provider-cost log line for such an interim call, so a single run does not
    report its breakdown twice.
    """
    phases = state.get("envelopes", []) or []

    def _sum(field: str) -> Any:
        return sum(p.get(field, 0) for p in phases)

    # Per-provider time/cost/calls/errors for the WHOLE run — every outbound call
    # goes through rate_limiter.throttle(), which records here. This is what makes
    # "the analysis is too long" and "what does a run cost" answerable beyond
    # Claude tokens: Firecrawl, Apollo, Brave, Pappers and the free sources all
    # cost wall-clock even when they cost no money, and time queued on our own
    # limiter is reported apart from time spent in the provider.
    cid = get_correlation_id() or ""
    providers = price_run(get_metrics(cid))
    if providers and log_breakdown:
        logger.info("Run provider breakdown [%s]: %s", cid, summarise_metrics(cid))

    # Phase envelopes only ever carried LLM token cost, so the billing dashboard
    # reported ~$1.11/analysis while Apollo credits, Firecrawl pages, Pappers
    # lookups and the paid search providers went unbilled. `providers_cost_usd`
    # is the full picture; `total_llm_cost_usd` keeps the old number so a
    # regression in either half stays visible.
    llm_cost = round(float(_sum("cost_usd")), 6)
    result: dict[str, Any] = {
        "total_cost_usd": providers_cost_usd(get_metrics(cid)) or llm_cost,
        "total_llm_cost_usd": llm_cost,
        "total_input_tokens": _sum("input_tokens"),
        "total_output_tokens": _sum("output_tokens"),
        "total_cache_read_input_tokens": _sum("cache_read_input_tokens"),
        "total_cache_creation_input_tokens": _sum("cache_creation_input_tokens"),
        "total_duration_ms": _sum("duration_ms"),
        "providers": providers,
        "degraded_sources": get_degradations(cid),
        "gate": state.get("gate"),
        "phases": phases,
    }
    # Key added ONLY when there is something to declare (same convention as
    # `provider_costs` in `run_analysis_graph` below): a run whose research
    # phase never stamped a fingerprint keeps a byte-identical summary.
    prompt_versions = _prompt_versions_stamp(state, phases)
    if prompt_versions:
        result["prompt_versions"] = prompt_versions
    # #3235 / #3212.3 — la version de la mémoire marché que la phase `plan` a
    # RÉELLEMENT lue (`phase4_plan._market_memory_reinforced_expertises`). Même
    # convention : clé absente quand le plan ne l'a pas consultée — jamais une
    # version devinée par une lecture indépendante.
    plan_metrics = (state.get("plan") or {}).get("_api_metrics")
    market_memory_version = plan_metrics.get("market_memory_version") if isinstance(plan_metrics, dict) else None
    if isinstance(market_memory_version, str) and market_memory_version.strip():
        result["market_memory_version"] = market_memory_version.strip()
    return result


@asynccontextmanager
async def analysis_graph_session(*, url: str | None = None) -> AsyncIterator[Any]:
    """Yield a compiled graph backed by the configured checkpointer.

    Use for durable, cross-process runs: ``async with analysis_graph_session()
    as graph: await run_analysis_graph(..., graph=graph)``. Falls back to an
    in-memory checkpointer when no Postgres URL is configured.
    """
    async with make_checkpointer(url) as checkpointer:
        yield build_analysis_graph(checkpointer=checkpointer)
