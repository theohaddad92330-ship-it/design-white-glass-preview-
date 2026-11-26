"""Per-run metrics: time, cost, call count and failures, for every provider.

Sibling of :mod:`app.services.source_health` (which records *what was lost*);
this records *what was spent*.

Why: the pipeline reported one `duration_ms` per phase and a Claude token cost,
and nothing else. "The analysis is too long" could not be split into Brave vs
Firecrawl vs Claude vs rate-limiter waiting, and "how much does a run cost" only
ever answered for Claude — never for Apollo, Firecrawl, Pappers or the dozen
free-tier sources whose latency is nonetheless paid in seconds.

Every external call in this codebase goes through ``rate_limiter.throttle()``,
so hooking that one seam instruments all of them at once. Claude adds its token
cost on top via :func:`record_cost`.

Two numbers per provider are deliberately kept apart:

* ``duration_ms`` — time spent in the call itself.
* ``wait_ms`` — time spent queued on our own rate limiter *before* the call.

They have opposite remedies. A slow provider needs a smaller budget or fewer
calls; a long wait needs more concurrency or a higher rpm. Collapsing them into
one number is how a throttle problem gets misdiagnosed as a slow API.

Best-effort and in-process: a worker restart loses it, which is fine because the
run is lost with it.
"""

from __future__ import annotations

import logging
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any

logger = logging.getLogger(__name__)

MAX_PROVIDERS_PER_RUN = 96
MAX_TRACKED_RUNS = 256


def _blank() -> dict[str, Any]:
    return {"calls": 0, "errors": 0, "duration_ms": 0, "wait_ms": 0, "cost_usd": 0.0}


# correlation_id → {provider: metric}
_RUNS: OrderedDict[str, dict[str, dict[str, Any]]] = OrderedDict()


def _bucket(correlation_id: str, provider: str) -> dict[str, Any] | None:
    cid = (correlation_id or "").strip()
    if not cid:
        # Sync/profiler paths carry no correlation id. Dropping beats pooling
        # unrelated runs under a shared "" bucket.
        return None
    name = (provider or "unknown").strip()

    providers = _RUNS.get(cid)
    if providers is None:
        providers = {}
        _RUNS[cid] = providers
        while len(_RUNS) > MAX_TRACKED_RUNS:
            _RUNS.popitem(last=False)
    else:
        _RUNS.move_to_end(cid)

    if name not in providers:
        if len(providers) >= MAX_PROVIDERS_PER_RUN:
            return None
        providers[name] = _blank()
    return providers[name]


def record_call(
    correlation_id: str,
    provider: str,
    *,
    duration_ms: int,
    wait_ms: int = 0,
    cost_usd: float = 0.0,
    ok: bool = True,
) -> None:
    """Record one outbound call. Never raises."""
    bucket = _bucket(correlation_id, provider)
    if bucket is None:
        return
    bucket["calls"] += 1
    if not ok:
        bucket["errors"] += 1
    bucket["duration_ms"] += max(int(duration_ms), 0)
    bucket["wait_ms"] += max(int(wait_ms), 0)
    bucket["cost_usd"] += max(float(cost_usd), 0.0)


def record_cost(correlation_id: str, provider: str, cost_usd: float) -> None:
    """Attach a cost to a provider without counting an extra call.

    Claude's cost is only known after the response is parsed, by which point the
    throttle that timed the call has already closed.

    Never raises: a metrics registry must never be able to break the run it
    measures.
    """
    try:
        bucket = _bucket(correlation_id, provider)
        if bucket is None:
            return
        bucket["cost_usd"] += max(float(cost_usd), 0.0)
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais un run
        logger.debug("run_metrics.record_cost ignoré: %s", exc)


def record_results(correlation_id: str, provider: str, *, returned: int = 0, kept: int = 0) -> None:
    """SIG-A (11/10) — offres RENDUES par un agrégateur et GARDÉES au tri.

    Un agrégateur payé à l'offre facture ce qu'il rend, pas ce qu'on garde : sans
    les deux nombres côte à côte, une offre payée puis jetée était invisible.
    Les deux clés n'apparaissent que sur un fournisseur qui a compté — les
    autres gardent leur forme d'avant. Never raises.
    """
    try:
        bucket = _bucket(correlation_id, provider)
        if bucket is None:
            return
        bucket["results_returned"] = bucket.get("results_returned", 0) + max(int(returned), 0)
        bucket["results_kept"] = bucket.get("results_kept", 0) + max(int(kept), 0)
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais un run
        logger.debug("run_metrics.record_results ignoré: %s", exc)


def record_skip(correlation_id: str, provider: str, reason: str) -> None:
    """SIG-A (11/10) — un fournisseur payant volontairement NON appelé, et pourquoi.

    Un appel évité ne laisse aucune trace d'appel : sans cette ligne, « Mantiks
    n'a rien coûté » ne se distingue pas de « Mantiks est en panne ». Never raises.
    """
    try:
        bucket = _bucket(correlation_id, provider)
        if bucket is not None:
            bucket["skipped"] = str(reason)
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais un run
        logger.debug("run_metrics.record_skip ignoré: %s", exc)


@asynccontextmanager
async def timed(correlation_id: str, provider: str):
    """Measure a block that does not go through ``throttle()``.

    Records even when the block raises — a step that timed out is precisely the
    one whose duration matters most — and marks it as an error.
    """
    t0 = time.monotonic()
    ok = True
    try:
        yield
    except BaseException:
        ok = False
        raise
    finally:
        record_call(
            correlation_id,
            provider,
            duration_ms=int((time.monotonic() - t0) * 1000),
            ok=ok,
        )


def get_metrics(correlation_id: str) -> dict[str, dict[str, Any]]:
    """``{provider: {calls, errors, duration_ms, wait_ms, cost_usd}}``."""
    providers = _RUNS.get((correlation_id or "").strip())
    if not providers:
        return {}
    return {name: dict(metric) for name, metric in providers.items()}


def total_cost_usd(correlation_id: str) -> float:
    return round(sum(m["cost_usd"] for m in get_metrics(correlation_id).values()), 6)


def summarise(correlation_id: str) -> str:
    """One-line log summary, slowest provider first. Empty when nothing measured."""
    metrics = get_metrics(correlation_id)
    if not metrics:
        return ""
    ordered = sorted(metrics.items(), key=lambda kv: (-kv[1]["duration_ms"], kv[0]))
    parts = []
    for name, m in ordered:
        part = f"{name}={m['duration_ms'] / 1000:.1f}s"
        if m["calls"] > 1:
            part += f"×{m['calls']}"
        if m["wait_ms"] > 500:
            part += f" (wait {m['wait_ms'] / 1000:.1f}s)"
        if m["errors"]:
            part += f" [{m['errors']} err]"
        if m["cost_usd"] > 0:
            part += f" ${m['cost_usd']:.4f}"
        parts.append(part)
    return ", ".join(parts)


def clear_metrics(correlation_id: str) -> None:
    _RUNS.pop((correlation_id or "").strip(), None)
