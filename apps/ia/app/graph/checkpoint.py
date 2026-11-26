"""Checkpointer factory for the analysis graph.

A checkpointer persists graph state after every super-step, which is what makes
a run resumable. In-process work uses ``MemorySaver``; a durable, cross-process
run uses ``AsyncPostgresSaver`` against the same Postgres the rest of the stack
uses (it adds its own ``checkpoints*`` tables, owned by the graph — NestJS stays
the owner of the business tables).

``make_checkpointer`` is always an async context manager so the Postgres
connection is opened and closed correctly around the graph's lifetime.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from langgraph.checkpoint.memory import MemorySaver

logger = logging.getLogger(__name__)


def pg_url() -> str | None:
    """Resolve the Postgres URL for the checkpointer, or None for in-memory.

    ``LANGGRAPH_PG_URL`` takes precedence so the checkpoint store can be pointed
    at a dedicated database/schema independently of the app's ``DATABASE_URL``.
    """
    return os.environ.get("LANGGRAPH_PG_URL") or os.environ.get("DATABASE_URL") or None


@asynccontextmanager
async def make_checkpointer(url: str | None = None) -> AsyncIterator[Any]:
    """Yield a checkpointer: durable Postgres when a URL is configured, else
    an in-process ``MemorySaver``."""
    resolved = url or pg_url()
    if not resolved:
        yield MemorySaver()
        return
    # Imported lazily: psycopg/the Postgres saver are only needed when a URL is
    # actually configured, so in-memory dev/test never pays for them.
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    logger.info("Analysis graph using Postgres checkpointer")
    async with AsyncPostgresSaver.from_conn_string(resolved) as saver:
        await saver.setup()  # idempotent: creates checkpoint tables if absent
        yield saver
