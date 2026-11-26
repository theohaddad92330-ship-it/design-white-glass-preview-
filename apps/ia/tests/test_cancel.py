from __future__ import annotations

import asyncio
import contextlib

import pytest

from app.services.cancel import run_or_cancel

# The watcher stays stuck (ignoring cancellation) this long, then reports a
# disconnect so it can unwind for cleanup. The accept threshold sits below it:
# a bounded cleanup returns well under _MAX; a blocking one only returns once
# the watcher unsticks at _STUCK_S.
_STUCK_S = 2.5
_MAX_ACCEPTABLE_S = 1.5


class _StuckRequest:
    """A Request whose ``is_disconnected()`` parks in an await that *ignores*
    cancellation — exactly how Starlette's ``TestClient`` behaves, where the
    poll bridges to a portal-thread ``receive()`` that defers the cancel.
    """

    def __init__(self) -> None:
        self._deadline: float | None = None

    async def is_disconnected(self) -> bool:
        loop = asyncio.get_running_loop()
        if self._deadline is None:
            self._deadline = loop.time() + _STUCK_S
        while loop.time() < self._deadline:
            try:
                await asyncio.sleep(0.05)
            except asyncio.CancelledError:
                continue  # uncancellable, like a portal-bridged receive()
        return True  # past the stuck window: report disconnect so it unwinds


def test_run_or_cancel_does_not_block_on_uncancellable_watcher() -> None:
    """Regression: when the work raises *before* the disconnect watcher leaves
    its first ``is_disconnected()`` call, cancelling that stuck watcher must not
    block the response. Previously ``await t`` on the watcher hung until it
    happened to unstick — the pre-existing 402-firecrawl endpoint test
    deadlocked under the TestClient for this exact reason.
    """

    async def scenario() -> None:
        req = _StuckRequest()

        async def work() -> None:
            raise ValueError("boom")

        task = asyncio.create_task(run_or_cancel(req, work()))
        done, _ = await asyncio.wait({task}, timeout=_MAX_ACCEPTABLE_S)
        try:
            assert task in done, (
                f"run_or_cancel did not return within {_MAX_ACCEPTABLE_S}s — "
                "blocked on a stuck disconnect watcher"
            )
            with pytest.raises(ValueError, match="boom"):
                task.result()
        finally:
            # Let the watcher report disconnect and unwind, then drain the task
            # and retrieve its outcome so it isn't flagged "never retrieved".
            await asyncio.sleep(_STUCK_S)
            if not task.done():
                with contextlib.suppress(Exception):
                    await task
            elif not task.cancelled():
                with contextlib.suppress(Exception):
                    task.exception()

    asyncio.run(scenario())
