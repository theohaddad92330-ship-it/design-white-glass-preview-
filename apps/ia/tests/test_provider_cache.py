"""Global provider cache — stop re-fetching public firmographic data every run
(Louis: cache global + par-user, plus de rescrape inutile). Best-effort Redis."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services import provider_cache


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value


@pytest.mark.asyncio
async def test_set_get_roundtrip():
    fake = FakeRedis()
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await provider_cache.set_json("ns", "k1", {"a": 1, "b": [2, 3], "c": "é"})
        assert await provider_cache.get_json("ns", "k1") == {"a": 1, "b": [2, 3], "c": "é"}


@pytest.mark.asyncio
async def test_get_miss_returns_none():
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=FakeRedis())):
        assert await provider_cache.get_json("ns", "missing") is None


@pytest.mark.asyncio
async def test_cached_json_fetches_once_then_hits():
    fake = FakeRedis()
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return {"v": calls}

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        first = await provider_cache.cached_json("ns", "k", fetch)
        second = await provider_cache.cached_json("ns", "k", fetch)
    assert first == {"v": 1} and second == {"v": 1}  # 2nd is a cache hit
    assert calls == 1  # fetch ran ONCE


@pytest.mark.asyncio
async def test_no_redis_degrades_to_plain_fetch():
    async def fetch():
        return {"live": True}

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=None)):
        assert await provider_cache.cached_json("ns", "k", fetch) == {"live": True}


@pytest.mark.asyncio
async def test_empty_result_is_not_cached():
    fake = FakeRedis()
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return []  # falsy → never cached, so it re-fetches

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await provider_cache.cached_json("ns", "k", fetch)
        await provider_cache.cached_json("ns", "k", fetch)
    assert calls == 2


@pytest.mark.asyncio
async def test_cached_by_decorator_caches_by_key():
    fake = FakeRedis()
    calls = 0

    @provider_cache.cached_by("ns", lambda company, **_: company.lower())
    async def fetch(company: str, *, client=None):
        nonlocal calls
        calls += 1
        return [{"company": company}]

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        a = await fetch("SNCF")
        b = await fetch("SNCF")  # same key → cache hit, fn skipped
        c = await fetch("Doctolib")  # different key → fetched
    assert a == [{"company": "SNCF"}] and b == a
    assert calls == 2  # SNCF once + Doctolib once


@pytest.mark.asyncio
async def test_cached_by_empty_key_bypasses_cache():
    @provider_cache.cached_by("ns", lambda company, **_: company.strip())
    async def fetch(company: str):
        return [{"x": 1}]

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=FakeRedis())):
        # Empty key → straight passthrough (no cache lookup / write).
        assert await fetch("") == [{"x": 1}]


@pytest.mark.asyncio
async def test_redis_error_is_swallowed():
    class Boom:
        async def get(self, *_):
            raise RuntimeError("redis down")

        async def set(self, *_a, **_k):
            raise RuntimeError("redis down")

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=Boom())):
        assert await provider_cache.get_json("ns", "k") is None
        await provider_cache.set_json("ns", "k", {"x": 1})  # must not raise
