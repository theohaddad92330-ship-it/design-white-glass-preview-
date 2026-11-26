"""Apollo People-Match cache: a matched result is served from cache on repeat,
a miss is never cached, and no Redis is a silent no-op."""

from __future__ import annotations

import fakeredis.aioredis
import pytest

from app.models.contacts import ApolloEnrichmentResult
from app.services import apollo


def _matched() -> ApolloEnrichmentResult:
    return ApolloEnrichmentResult(matched=True, email="a@b.com", email_status="verified", phone=None, linkedin_url=None)


def _miss() -> ApolloEnrichmentResult:
    return ApolloEnrichmentResult(matched=False, email=None, email_status=None, phone=None, linkedin_url=None)


@pytest.mark.asyncio
async def test_matched_result_served_from_cache(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(apollo, "_enrich_cache_redis", lambda: _wrap(fake))

    calls = {"n": 0}

    async def _uncached(**_kw):
        calls["n"] += 1
        return _matched()

    monkeypatch.setattr(apollo, "_enrich_person_uncached", _uncached)

    r1 = await apollo.enrich_person(linkedin_url="https://linkedin.com/in/x")
    r2 = await apollo.enrich_person(linkedin_url="https://linkedin.com/in/x")
    assert r1.email == "a@b.com" and r2.email == "a@b.com"
    assert calls["n"] == 1  # second call served from cache, Apollo not re-hit


@pytest.mark.asyncio
async def test_miss_is_not_cached(monkeypatch):
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(apollo, "_enrich_cache_redis", lambda: _wrap(fake))

    calls = {"n": 0}

    async def _uncached(**_kw):
        calls["n"] += 1
        return _miss()

    monkeypatch.setattr(apollo, "_enrich_person_uncached", _uncached)

    await apollo.enrich_person(linkedin_url="https://linkedin.com/in/y")
    await apollo.enrich_person(linkedin_url="https://linkedin.com/in/y")
    assert calls["n"] == 2  # a miss is re-tried (Apollo data may improve)


@pytest.mark.asyncio
async def test_no_redis_noop(monkeypatch):
    monkeypatch.setattr(apollo, "_enrich_cache_redis", _none)

    async def _uncached(**_kw):
        return _matched()

    monkeypatch.setattr(apollo, "_enrich_person_uncached", _uncached)
    r = await apollo.enrich_person(linkedin_url="https://linkedin.com/in/z")
    assert r.email == "a@b.com"  # works fine with caching off


async def _wrap(client):
    return client


async def _none():
    return None


# ── CACHE-API (15/10) : 30 j, clé = la PERSONNE seule, une ligne de journal ────────


def test_contact_cache_default_ttl_is_thirty_days():
    assert apollo._ENRICH_CACHE_TTL_S == 30 * 24 * 3600


def test_linkedin_variants_of_one_person_share_one_key():
    keys = {
        apollo._enrich_cache_key(url, None, None, None)
        for url in (
            "https://www.linkedin.com/in/Jean-Dupont/",
            "http://linkedin.com/in/jean-dupont",
            "https://fr.linkedin.com/in/jean-dupont?trk=public_profile",
        )
    }
    assert len(keys) == 1


@pytest.mark.asyncio
async def test_same_person_two_calls_one_paid_call_and_a_log_line_without_pii(monkeypatch, caplog):
    import logging

    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(apollo, "_enrich_cache_redis", lambda: _wrap(fake))
    calls = {"n": 0}

    async def _uncached(**_kw):
        calls["n"] += 1
        return _matched()

    monkeypatch.setattr(apollo, "_enrich_person_uncached", _uncached)
    with caplog.at_level(logging.INFO, logger="app.services.apollo"):
        await apollo.enrich_person(linkedin_url="https://www.linkedin.com/in/jean-dupont/")
        await apollo.enrich_person(linkedin_url="https://linkedin.com/in/jean-dupont")
    assert calls["n"] == 1
    lines = [r.getMessage() for r in caplog.records if "cache=" in r.getMessage()]
    assert lines == ["contact:apollo cache=miss payé=oui", "contact:apollo cache=hit payé=non"]
    assert "a@b.com" not in " ".join(lines) and "dupont" not in " ".join(lines)
