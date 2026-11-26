"""Brave web search is the last uncached provider.

Every other source goes through ``provider_cache`` — registry 14d, news 2d,
jobs 2d — and ``TTL_SEARCH`` (3 days) was declared for exactly this and then
never used. Meanwhile Phase 1 fires 21 static queries plus up to 8 profile-driven
ones, every one of them a billed call ($5/1000) queued behind a 60 rpm limiter
and a semaphore of 5, on the critical path in front of Firecrawl.

Caching per query costs no coverage — the same query returns the same corpus
within the window — and takes the whole Brave leg off a re-run.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services import brave_search


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch: pytest.MonkeyPatch):
    """Default: caching unavailable, so tests assert the uncached path unless
    they opt into a fake cache."""
    monkeypatch.setattr("app.services.provider_cache.redis_url", lambda: None, raising=False)
    yield


class _FakeCache:
    """Minimal stand-in for provider_cache.cached_json: get-or-fetch, truthy-only."""

    def __init__(self) -> None:
        self.store: dict[tuple[str, str], object] = {}
        self.fetches = 0

    async def cached_json(self, namespace, key, fetch, ttl=None):
        hit = self.store.get((namespace, key))
        if hit is not None:
            return hit
        self.fetches += 1
        value = await fetch()
        if value:
            self.store[(namespace, key)] = value
        return value


@pytest.mark.asyncio
async def test_identical_queries_hit_the_cache_the_second_time(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = _FakeCache()
    monkeypatch.setattr(brave_search, "cached_json", cache.cached_json)
    raw = AsyncMock(return_value=[{"title": "t", "url": "https://x.fr", "description": "d"}])
    monkeypatch.setattr(brave_search, "_execute_query_uncached", raw)

    first = await brave_search._execute_query("ACME DSI", "key", object())
    second = await brave_search._execute_query("ACME DSI", "key", object())

    assert first == second
    assert raw.await_count == 1, "the second identical query must not hit Brave"


@pytest.mark.asyncio
async def test_different_queries_are_cached_separately(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = _FakeCache()
    monkeypatch.setattr(brave_search, "cached_json", cache.cached_json)
    raw = AsyncMock(return_value=[{"title": "t", "url": "https://x.fr", "description": "d"}])
    monkeypatch.setattr(brave_search, "_execute_query_uncached", raw)

    await brave_search._execute_query("ACME presse", "key", object())
    await brave_search._execute_query("ACME emploi", "key", object())

    assert raw.await_count == 2


@pytest.mark.asyncio
async def test_an_empty_result_is_not_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    """A query that returned nothing because Brave was rate-limited must not
    poison the window with an empty answer."""
    cache = _FakeCache()
    monkeypatch.setattr(brave_search, "cached_json", cache.cached_json)
    raw = AsyncMock(return_value=[])
    monkeypatch.setattr(brave_search, "_execute_query_uncached", raw)

    await brave_search._execute_query("ACME rien", "key", object())
    await brave_search._execute_query("ACME rien", "key", object())

    assert raw.await_count == 2


@pytest.mark.asyncio
async def test_the_cache_never_breaks_the_search(monkeypatch: pytest.MonkeyPatch) -> None:
    """Redis down must degrade to a live call, never fail the research phase."""

    async def _boom(*_a, **_k):
        raise RuntimeError("redis down")

    monkeypatch.setattr(brave_search, "cached_json", _boom)
    raw = AsyncMock(return_value=[{"title": "t", "url": "https://x.fr", "description": "d"}])
    monkeypatch.setattr(brave_search, "_execute_query_uncached", raw)

    assert await brave_search._execute_query("ACME", "key", object()) == [
        {"title": "t", "url": "https://x.fr", "description": "d"}
    ]
    assert raw.await_count == 1


@pytest.mark.asyncio
async def test_cache_key_ignores_the_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Rotating the Brave key must not invalidate the whole cache."""
    cache = _FakeCache()
    monkeypatch.setattr(brave_search, "cached_json", cache.cached_json)
    raw = AsyncMock(return_value=[{"title": "t", "url": "https://x.fr", "description": "d"}])
    monkeypatch.setattr(brave_search, "_execute_query_uncached", raw)

    await brave_search._execute_query("ACME", "key-a", object())
    await brave_search._execute_query("ACME", "key-b", object())

    assert raw.await_count == 1
