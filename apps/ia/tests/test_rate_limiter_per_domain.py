"""#3925.a — pages carrières et presse RSS : un seau de débit PAR DOMAINE.

Le seau global ``careers_pages`` (30 rpm) était partagé par tous les sites : deux
analyses en parallèle sur deux comptes différents se volaient le budget, et un
site lent bloquait la concurrence de tous les autres. Le budget déclaré reste
celui du fournisseur ; il s'applique désormais à CHAQUE domaine séparément.
"""

from __future__ import annotations

import pytest

from app.services import rate_limiter
from app.services.rate_limiter import _DEFAULTS, throttle_per_domain


@pytest.fixture(autouse=True)
def _fresh():
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["careers_pages", "press_rss"])
async def test_one_bucket_per_domain_with_the_provider_budget(provider: str) -> None:
    async with throttle_per_domain(provider, "acme.fr") as a1:
        pass
    async with throttle_per_domain(provider, "WWW.Acme.fr") as a2:
        pass
    async with throttle_per_domain(provider, "globex.fr") as b:
        pass
    assert a1 is a2  # même domaine (casse et www. repliés) → même seau
    assert a1 is not b  # deux domaines → deux seaux
    assert a1.rpm == b.rpm == _DEFAULTS[provider]["rpm"]
    assert a1.concurrency == _DEFAULTS[provider]["concurrency"]
    async with rate_limiter.throttle(provider) as glob:
        pass
    assert glob is not a1  # jamais le seau global


@pytest.mark.asyncio
async def test_unknown_provider_is_refused() -> None:
    with pytest.raises(KeyError):
        throttle_per_domain("typo", "acme.fr")


@pytest.mark.asyncio
async def test_domain_cache_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rate_limiter, "_MAX_DOMAIN_BUCKETS", 3)
    for i in range(10):
        async with throttle_per_domain("careers_pages", f"d{i}.fr"):
            pass
    assert len(rate_limiter._domain_throttles) <= 3


@pytest.mark.asyncio
async def test_careers_pages_fetch_uses_the_domain_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.data_sources import careers_pages

    seen: list[tuple[str, str]] = []
    real = careers_pages.throttle_per_domain

    def spy(provider: str, domain: str):
        seen.append((provider, domain))
        return real(provider, domain)

    monkeypatch.setattr(careers_pages, "throttle_per_domain", spy)

    async def allowed(*_a, **_k):
        return True

    async def no_sleep(_s):
        return None

    from unittest.mock import AsyncMock

    from app.services import safe_fetch

    monkeypatch.setattr(safe_fetch, "_getaddrinfo_ips", AsyncMock(return_value=["93.184.216.34"]))
    monkeypatch.setattr(careers_pages, "_allowed", allowed)
    monkeypatch.setattr(careers_pages, "_sleep", no_sleep)

    class _Http:
        async def get(self, url, **_k):
            import httpx

            return httpx.Response(200, text="ok", request=httpx.Request("GET", url))

    await careers_pages._fetch(_Http(), "https://jobs.acme.fr/carrieres", "acme.fr")
    assert seen == [("careers_pages", "jobs.acme.fr")]


@pytest.mark.asyncio
async def test_press_feed_fetch_uses_the_domain_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.data_sources import press_rss

    seen: list[tuple[str, str]] = []
    real = press_rss.throttle_per_domain

    def spy(provider: str, domain: str):
        seen.append((provider, domain))
        return real(provider, domain)

    async def passthrough(namespace, key, fetch, ttl=None):
        return await fetch()

    monkeypatch.setattr(press_rss, "throttle_per_domain", spy)
    monkeypatch.setattr(press_rss.provider_cache, "cached_json", passthrough)

    class _Http:
        async def get(self, url, **_k):
            import httpx

            return httpx.Response(200, text="<rss/>", request=httpx.Request("GET", url))

    await press_rss.fetch_feed("https://www.silicon.fr/feed", client=_Http())
    assert seen == [("press_rss", "www.silicon.fr")]
