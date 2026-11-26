"""BELLUM-IA-1/2/3/5/6/A — une issue de scrape attendue (403, vide, timeout,
panne fournisseur) ne doit jamais sortir de la tâche single-flight sans que
quelqu'un la récupère : sinon asyncio journalise « Task exception was never
retrieved » (error) et l'intégration Sentry la capture."""

from __future__ import annotations

import asyncio
import gc

import pytest

from app.services import source_cache


@pytest.mark.asyncio
async def test_cancelled_waiter_does_not_leave_unretrieved_task_exception() -> None:
    seen: list[dict] = []
    loop = asyncio.get_running_loop()
    loop.set_exception_handler(lambda _l, ctx: seen.append(ctx))

    async def fetch() -> str:
        await asyncio.sleep(0.01)
        raise ValueError("expected scrape outcome")

    waiter = asyncio.ensure_future(source_cache.single_flight("t-unretrieved", "k", fetch))
    await asyncio.sleep(0)
    waiter.cancel()  # le waiter part (budget dépassé) ; la tâche partagée continue
    with pytest.raises(asyncio.CancelledError):
        await waiter
    await asyncio.sleep(0.05)
    gc.collect()
    await asyncio.sleep(0)
    assert [c for c in seen if "never retrieved" in str(c.get("message"))] == []


@pytest.mark.asyncio
async def test_waiters_still_receive_the_exception() -> None:
    async def fetch() -> str:
        raise ValueError("boom")

    with pytest.raises(ValueError):
        await source_cache.single_flight("t-unretrieved", "k2", fetch)
