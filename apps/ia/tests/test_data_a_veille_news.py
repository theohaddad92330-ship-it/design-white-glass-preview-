"""LOT (15/10) DATA-A point 2 — la veille quotidienne voit les NOUVEAUTÉS malgré le cache 30 j :
Brave News ``freshness=pd``, 1 appel par compte, TTL 1 j, dans un cache À PART."""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.models.research import ResearchRequest
from app.services import provider_cache
from app.services.data_sources import brave_news


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")


class _Cache:
    """cached_json de test : mémorise (namespace, key, ttl) et sert un second appel du cache."""

    def __init__(self) -> None:
        self.store: dict[tuple[str, str], object] = {}
        self.ttls: dict[str, int | None] = {}

    async def cached_json(self, namespace, key, fetch, ttl=None, empty_ttl=None):
        self.ttls[namespace] = ttl
        if (namespace, key) in self.store:
            return self.store[(namespace, key)]
        value = await fetch()
        if value:
            self.store[(namespace, key)] = value
        return value


def _client() -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"results": [{"title": "Levée", "url": "https://m/1", "description": "d", "age": "il y a 3 heures"}]},
            request=httpx.Request("GET", "https://x"),
        )
    )
    return client


async def test_fresh_news_asks_the_past_day_and_lives_one_day_apart_from_the_30_day_cache(monkeypatch) -> None:
    cache = _Cache()
    monkeypatch.setattr(provider_cache, "cached_json", cache.cached_json)
    client = _client()
    out = await brave_news.recent_news("Acme Veille", client=client, freshness="pd")
    assert client.get.call_args.kwargs["params"]["freshness"] == "pd"
    assert out and out[0]["url"] == "https://m/1"
    assert cache.ttls["news:brave_pd"] == provider_cache.TTL_BRAVE_NEWS_FRESH == 24 * 3600
    assert "news:brave" not in cache.ttls  # jamais le cache 30 j


async def test_one_call_per_account_per_day(monkeypatch) -> None:
    cache = _Cache()
    monkeypatch.setattr(provider_cache, "cached_json", cache.cached_json)
    client = _client()
    await brave_news.recent_news("Acme Veille", client=client, freshness="pd")
    await brave_news.recent_news("ACME veille ", client=client, freshness="pd")
    assert client.get.await_count == 1


async def test_the_default_news_path_is_unchanged(monkeypatch) -> None:
    cache = _Cache()
    monkeypatch.setattr(provider_cache, "cached_json", cache.cached_json)
    client = _client()
    await brave_news.recent_news("Acme Veille", client=client)
    assert "freshness" not in client.get.call_args.kwargs["params"]
    assert cache.ttls["news:brave"] == provider_cache.TTL_NEWS  # une seule constante presse 30 j (GA-26)


def test_the_research_request_carries_the_watch_flag_off_by_default() -> None:
    assert ResearchRequest(company_name="Acme").watch_refresh is False
    assert ResearchRequest(company_name="Acme", watch_refresh=True).watch_refresh is True


def test_the_phase1_route_merges_fresh_news_only_for_a_watch_refresh() -> None:
    from pathlib import Path

    source = (Path(__file__).parent.parent / "app" / "routers" / "phase1_research.py").read_text(encoding="utf-8")
    assert 'freshness="pd"' in source and "req.watch_refresh" in source
