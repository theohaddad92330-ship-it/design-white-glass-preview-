"""Client-disconnect guard for long-running phase handlers.

Without this, when the API worker aborts its HTTP request to FastAPI
(user cancel, retry timeout, …), the underlying ASGI stream closes
but FastAPI keeps executing the request: Claude calls finish, tokens
get billed, and the result is dropped on the floor.

``run_or_cancel`` races the actual work against a disconnect watcher
and cancels the work the moment the client goes away — including all
sub-tasks spawned via ``asyncio.create_task`` / ``asyncio.gather`` /
``asyncio.as_completed`` (Python's cancellation cascades).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Coroutine
from typing import TypeVar

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Poll the ASGI receive() channel this often. 1s is fast enough that a user
# pressing "Annuler" sees Claude stop within a second, slow enough that we
# don't burn cycles on idle requests.
_DISCONNECT_POLL_INTERVAL_S = 1.0

# HTTP status code for "Client Closed Request" — semi-standard (NGINX). The
# API worker treats anything 4xx as a permanent failure, which matches what
# we want: don't retry, the user asked us to stop.
_CLIENT_DISCONNECT_STATUS = 499

# Cap on how long cleanup waits for cancelled sub-tasks to actually unwind. A
# healthy sub-task (Claude/Apollo/Firecrawl httpx call, or the watcher parked
# in ``asyncio.sleep``) reacts to ``cancel()`` in microseconds; this cap only
# bites when a task is stuck in an *uncancellable* await — e.g. the disconnect
# watcher bridged through Starlette's TestClient portal ``receive()``. We must
# never block the response on such a straggler; the loop reaps it at shutdown.
_CLEANUP_TIMEOUT_S = 0.5


async def _watch_disconnect(request: Request, poll_interval: float) -> None:
    while True:
        if await request.is_disconnected():
            return
        await asyncio.sleep(poll_interval)


async def run_or_cancel(
    request: Request,
    coro: Coroutine[object, object, T],
    *,
    poll_interval: float = _DISCONNECT_POLL_INTERVAL_S,
) -> T:
    """Run ``coro`` to completion, or cancel it if the HTTP client disconnects.

    If the client (API worker) closes the connection before ``coro`` returns,
    this raises ``HTTPException(499)`` and the in-flight task is cancelled.
    Cancellation propagates through ``asyncio.gather`` / ``as_completed`` to
    every spawned sub-task, so Claude / Apollo / Firecrawl calls all abort
    instead of running to completion on the user's dime.
    """
    main_task = asyncio.create_task(coro)
    watcher = asyncio.create_task(_watch_disconnect(request, poll_interval))
    try:
        done, pending = await asyncio.wait(
            [main_task, watcher],
            return_when=asyncio.FIRST_COMPLETED,
        )
    except asyncio.CancelledError:
        main_task.cancel()
        watcher.cancel()
        raise

    for t in pending:
        t.cancel()
    # Give the cancelled sub-tasks a brief, bounded window to unwind. Awaiting
    # each one unboundedly (the previous behaviour) deadlocks the response when
    # a task is parked in an uncancellable await — e.g. the disconnect watcher
    # stuck in a portal-bridged ``receive()`` under the test client.
    if pending:
        finished, _ = await asyncio.wait(pending, timeout=_CLEANUP_TIMEOUT_S)
        for t in finished:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                t.result()  # retrieve so it isn't flagged "never retrieved"

    if watcher in done:
        logger.info("client disconnected mid-request — phase cancelled")
        raise HTTPException(status_code=_CLIENT_DISCONNECT_STATUS, detail="Client disconnected")

    return main_task.result()
