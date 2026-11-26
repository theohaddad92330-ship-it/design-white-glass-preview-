"""#4447 — IA-X/IA-Y/IA-T : une source de /discover qui échoue (créneau du limiteur refusé,
400 fournisseur, attente de la file au-delà du budget) est RENDUE comme valeur, jamais levée
hors d'une tâche asyncio (Sentry capture toute exception de tâche, même rattrapée après)."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.routers import discover as discover_router
from app.services.distributed_rate_limiter import RateLimitTimeout


async def _raise(exc: Exception) -> list[dict]:
    raise exc


def _http_400() -> httpx.HTTPStatusError:
    req = httpx.Request("GET", "https://example.test")
    return httpx.HTTPStatusError("400", request=req, response=httpx.Response(400, request=req))


@pytest.mark.asyncio
@pytest.mark.parametrize("exc", [RateLimitTimeout("france_travail", 1.3), _http_400()])
async def test_bounded_source_rend_l_echec_au_lieu_de_le_lever(exc: Exception) -> None:
    assert await discover_router._bounded_source(_raise(exc)) is exc


@pytest.mark.asyncio
async def test_source_en_file_en_echec_ne_laisse_pas_d_exception_de_tache() -> None:
    exc = RateLimitTimeout("france_travail", 1.3)
    queued = discover_router._QueuedSource(_raise(exc))
    assert await discover_router._bounded_source(queued) is exc
    assert queued.task.exception() is None


@pytest.mark.asyncio
async def test_attente_de_la_file_au_dela_du_budget_est_rendue(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le plafond ~19,9 s des logs : ``DISCOVER_TIME_BUDGET_S`` borne l'attente de la file."""
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 0.05)
    gate = asyncio.Semaphore(0)

    async def _never() -> list[dict]:
        return []

    queued = discover_router._QueuedSource(discover_router._queued_jobs_fetch(gate, _never))
    result = await asyncio.shield(queued.task)
    assert isinstance(result, TimeoutError)
    assert queued.task.exception() is None
