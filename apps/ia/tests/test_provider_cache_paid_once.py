"""CACHE-API (15/10) — un même appel n'est JAMAIS payé deux fois en 30 jours.

Tests de la règle commune : TTL 30 j par famille, clé = l'objet seul (le paramètre
d'affichage ``limit`` se filtre à la lecture), une ligne de journal par appel
(``<famille> cache=hit|miss payé=oui|non``), jamais de valeur sensible dedans.
"""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock, patch

import pytest

from app.services import provider_cache

_DAY = 24 * 3600


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value


def test_paid_families_default_to_thirty_days():
    assert provider_cache.TTL_SEARCH == 30 * _DAY
    assert provider_cache.TTL_NEWS == 30 * _DAY
    assert provider_cache.TTL_CONTACT == 30 * _DAY
    assert provider_cache.TTL_FIRMO == 30 * _DAY


@pytest.mark.asyncio
async def test_cached_json_logs_one_line_per_call_without_the_key(caplog):
    fake = FakeRedis()

    async def fetch():
        return {"v": 1}

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        with caplog.at_level(logging.INFO, logger="app.services.provider_cache"):
            await provider_cache.cached_json("search:brave", "jean.dupont@exemple.fr", fetch)
            await provider_cache.cached_json("search:brave", "jean.dupont@exemple.fr", fetch)
    lines = [r.getMessage() for r in caplog.records if "cache=" in r.getMessage()]
    assert lines == [
        "search:brave cache=miss payé=oui",
        "search:brave cache=hit payé=non",
    ]
    assert "dupont" not in " ".join(lines)


@pytest.mark.asyncio
async def test_cached_limited_same_text_different_limit_one_call():
    fake = FakeRedis()
    calls: list[int] = []

    async def fetch(limit: int):
        calls.append(limit)
        return [{"n": i} for i in range(limit)]

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        big = await provider_cache.cached_limited("news:brave", "acme", 10, fetch)
        small = await provider_cache.cached_limited("news:brave", "acme", 3, fetch)
        same = await provider_cache.cached_limited("news:brave", "acme", 10, fetch)
    assert len(big) == 10 and len(small) == 3 and len(same) == 10
    assert calls == [10]  # le plus petit se filtre à la lecture


@pytest.mark.asyncio
async def test_cached_limited_refetches_only_when_more_is_asked_than_stored():
    fake = FakeRedis()
    calls: list[int] = []

    async def fetch(limit: int):
        calls.append(limit)
        return [{"n": i} for i in range(limit)]

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await provider_cache.cached_limited("news:brave", "acme", 3, fetch)
        bigger = await provider_cache.cached_limited("news:brave", "acme", 8, fetch)
        again = await provider_cache.cached_limited("news:brave", "acme", 5, fetch)
    assert len(bigger) == 8 and len(again) == 5
    assert calls == [3, 8]


@pytest.mark.asyncio
async def test_cached_limited_source_exhausted_is_not_refetched():
    """La source n'avait que 2 résultats pour limit=10 : redemander 10 ne repaie pas."""
    fake = FakeRedis()
    calls: list[int] = []

    async def fetch(limit: int):
        calls.append(limit)
        return [{"n": 0}, {"n": 1}]

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await provider_cache.cached_limited("news:brave", "acme", 10, fetch)
        await provider_cache.cached_limited("news:brave", "acme", 10, fetch)
        await provider_cache.cached_limited("news:brave", "acme", 20, fetch)
    assert calls == [10]


@pytest.mark.asyncio
async def test_cached_limited_never_caches_empty_or_failure():
    fake = FakeRedis()
    calls = 0

    async def fetch(limit: int):
        nonlocal calls
        calls += 1
        return []

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await provider_cache.cached_limited("news:brave", "acme", 5, fetch)
        await provider_cache.cached_limited("news:brave", "acme", 5, fetch)
    assert calls == 2
    assert fake.store == {}


@pytest.mark.asyncio
async def test_gateway_search_same_text_different_limit_is_paid_once():
    from app.services.data_gateway import DataGateway

    fake = FakeRedis()
    gw = DataGateway()
    calls: list[int] = []

    async def fake_uncached(cleaned: str, *, limit: int):
        calls.append(limit)
        return [{"title": str(i), "url": f"https://x{i}.fr", "description": "", "source": "serper"} for i in range(limit)]

    gw._search_uncached = fake_uncached  # type: ignore[method-assign]
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        three = await gw.search("ACME DSI", limit=3)
        ten = await gw.search("acme dsi", limit=10)
    assert len(three) == 3 and len(ten) == 10
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_brave_news_same_company_two_spaces_and_limits_is_paid_once(monkeypatch):
    """Fait public : aucune notion d'espace dans la clé ; ``limit`` se filtre à la lecture."""
    from app.services.data_sources import brave_news

    monkeypatch.setenv("BRAVE_API_KEY", "k")
    fake = FakeRedis()
    network = 0

    class _Resp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"results": [{"title": f"t{i}", "url": f"https://n{i}.fr", "description": "d"} for i in range(12)]}

    class _Client:
        async def get(self, *_a, **_k):
            nonlocal network
            network += 1
            return _Resp()

    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        a = await brave_news.recent_news("Acme SA", limit=6, client=_Client())
        b = await brave_news.recent_news("  acme sa ", limit=3, client=_Client())
    assert len(a) == 6 and len(b) == 3
    assert network == 1


def test_scrape_url_variants_are_one_page():
    from app.services.scrape_cache import normalize_url

    base = normalize_url("https://acme.fr/equipe")
    assert normalize_url("https://acme.fr/equipe/") == base
    assert normalize_url("https://acme.fr/equipe#contact") == base
    assert normalize_url("https://acme.fr/equipe?utm_source=x&fbclid=y") == base
    assert normalize_url("https://acme.fr/equipe?page=2") != base
    assert normalize_url("https://acme.fr/") == "https://acme.fr"


@pytest.mark.asyncio
async def test_scrape_same_page_two_spaces_one_firecrawl_call():
    from app.services import scrape_cache

    fake = FakeRedis()
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return "# page"

    with patch.object(scrape_cache, "_redis", AsyncMock(return_value=fake)):
        a = await scrape_cache.cached_markdown("https://acme.fr/equipe", fetch)
        b = await scrape_cache.cached_markdown("https://acme.fr/equipe/#x", fetch)
    assert a == b == "# page" and calls == 1


@pytest.mark.asyncio
async def test_pappers_profile_without_graph_is_served_by_the_with_graph_entry():
    from app.services.pappers import detail

    payload = None

    async def fake_get(namespace, key):
        return payload if key == "123456789:1" else None

    with patch.object(provider_cache, "get_json", fake_get):
        # une entrée « avec graphe » déjà payée ; la demande « sans graphe » ne doit pas repayer
        class _Boom(Exception):
            pass

        def _no_key():
            raise _Boom("aucun appel Pappers attendu")

        with patch.object(detail, "get_api_key", _no_key):
            from app.services.pappers.models import CompanyProfile

            profile = CompanyProfile(siren="123456789", name="ACME")
            payload = profile.model_dump(mode="json")
            out = await detail.get_company("123456789", include_graph=False)
    assert out.siren == "123456789"
