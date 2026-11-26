"""Unit tests for the per-URL Firecrawl scrape cache.

Asserts the safety guarantee (no Redis → silent no-op, never raises) and a
roundtrip through an in-memory fake Redis.
"""

from __future__ import annotations

import fakeredis.aioredis
import pytest

from app.services import scrape_cache


@pytest.mark.asyncio
async def test_no_redis_is_a_silent_noop(monkeypatch):
    # No REDIS_URL configured → caching is off; get is a miss, set never raises.
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert await scrape_cache.get_markdown("https://x.com") is None
    await scrape_cache.set_markdown("https://x.com", "content")  # must not raise


@pytest.mark.asyncio
async def test_roundtrip_with_fake_redis(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)

    async def _fake_redis():
        return fake

    monkeypatch.setattr(scrape_cache, "_redis", _fake_redis)

    url = "https://doctolib.fr/about"
    assert await scrape_cache.get_markdown(url) is None  # cold
    await scrape_cache.set_markdown(url, "# Doctolib\nscraped markdown")
    assert await scrape_cache.get_markdown(url) == "# Doctolib\nscraped markdown"
    # Distinct URL stays a miss (keyed per URL).
    assert await scrape_cache.get_markdown("https://other.fr") is None


@pytest.mark.asyncio
async def test_empty_markdown_is_not_cached(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)

    async def _fake_redis():
        return fake

    monkeypatch.setattr(scrape_cache, "_redis", _fake_redis)
    await scrape_cache.set_markdown("https://x.com", "")
    assert await scrape_cache.get_markdown("https://x.com") is None
