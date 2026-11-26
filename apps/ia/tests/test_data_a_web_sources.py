"""LOT (15/10) DATA-A point 8 — Tavily en Bearer (la clé ne voyage plus dans le corps), GitHub :
dépôts « sources » seulement (pas les forks) et « pas d'organisation » gardé en cache."""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import provider_cache
from app.services.data_sources import github_org, tavily


def _resp(payload: object, url: str = "https://x") -> httpx.Response:
    return httpx.Response(200, json=payload, request=httpx.Request("GET", url))


async def test_tavily_key_travels_as_a_bearer_header_not_in_the_body(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "tvly-secret")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp({"results": []}))
    await tavily.tavily_search("Acme DSI", client=client)
    kwargs = client.post.call_args.kwargs
    assert kwargs["headers"]["Authorization"] == "Bearer tvly-secret"
    assert "api_key" not in kwargs["json"]
    assert "tvly-secret" not in str(kwargs["json"])


async def test_github_lists_source_repos_only(monkeypatch: pytest.MonkeyPatch) -> None:
    github_org.reset_quota_state()
    seen: list[tuple[str, dict | None]] = []

    async def fake_get(url: str, params: dict | None = None, headers: dict | None = None) -> httpx.Response:
        seen.append((url, params))
        if url.endswith("/search/users"):
            return _resp({"items": [{"login": "acmecorp"}]}, url)
        if url.endswith("/orgs/acmecorp"):
            return _resp({"html_url": "https://github.com/acmecorp", "public_repos": 3}, url)
        return _resp([{"language": "Python", "pushed_at": "2026-09-01T00:00:00Z"}], url)

    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=fake_get)
    monkeypatch.setattr(provider_cache, "cached_json", lambda ns, key, fetch, ttl=None, empty_ttl=None: fetch())
    out = await github_org.org_tech_signals("Acme Corp", client=client)
    assert out and out["org"] == "acmecorp"
    repos_params = next(p for u, p in seen if u.endswith("/repos"))
    assert repos_params["type"] == "sources"


def test_no_github_org_is_remembered_as_a_negative() -> None:
    ttl = provider_cache.empty_ttl_of(github_org.org_tech_signals)
    assert ttl == provider_cache.TTL_EMPTY_TECH and ttl > 0
