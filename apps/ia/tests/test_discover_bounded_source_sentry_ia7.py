"""BELLUM-IA-7/8/F — le budget dépassé d'une source est un cas PRÉVU : il ne sort
jamais d'une tâche asyncio (Sentry capture toute exception non rattrapée d'une tâche)."""

from __future__ import annotations

import asyncio

import pytest

from app.routers import discover as discover_router


async def _slow() -> list[dict]:
    await asyncio.sleep(10)
    return [{"x": 1}]


@pytest.mark.asyncio
async def test_budget_depasse_ne_leve_pas_dans_la_tache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discover_router, "SIGNALS_SOURCE_BUDGET_S", 0.05)
    result = await discover_router._bounded_source(_slow())
    assert isinstance(result, TimeoutError)


@pytest.mark.asyncio
async def test_source_en_file_depassee_ne_leve_pas(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discover_router, "SIGNALS_SOURCE_BUDGET_S", 0.05)
    queued = discover_router._QueuedSource(_slow())
    result = await discover_router._bounded_source(queued)
    assert isinstance(result, TimeoutError)
    assert not queued.task.done()  # continue en arrière-plan
    queued.task.cancel()
    await asyncio.gather(queued.task, return_exceptions=True)


@pytest.mark.asyncio
async def test_aucune_exception_de_tache_dans_le_gather(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discover_router, "SIGNALS_SOURCE_BUDGET_S", 0.05)
    seen: list[dict] = []
    loop = asyncio.get_running_loop()
    loop.set_exception_handler(lambda _l, ctx: seen.append(ctx))
    tasks = [asyncio.ensure_future(discover_router._bounded_source(_slow())) for _ in range(3)]
    done = await asyncio.gather(*tasks)
    assert all(isinstance(r, TimeoutError) for r in done)
    assert all(t.exception() is None for t in tasks)
