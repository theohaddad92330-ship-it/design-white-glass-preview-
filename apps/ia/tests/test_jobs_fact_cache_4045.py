"""#4045 (14/10) — UN cache partagé des OFFRES par SIREN, même variante côté analyse
et côté Découvrir : ``jobs_fact_variant`` en est l'unique fabrique ; ``peek_fact``
relit sans jamais appeler le réseau."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services import provider_cache, public_facts, source_cache


class MemoryStore:
    def __init__(self) -> None:
        self.rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    async def get(self, source: str, category: str, key: str):
        row = self.rows.get((source, category, key))
        if row is None or row[1] <= datetime.now(UTC):
            return None
        return row

    async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
        self.rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))


@pytest.fixture
def store(monkeypatch) -> MemoryStore:
    ms = MemoryStore()

    async def _fake_store():
        return ms

    monkeypatch.setattr(source_cache, "_store", _fake_store)
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    return ms


def test_variant_is_one_string_per_source_pack_and_roles() -> None:
    assert public_facts.jobs_fact_variant("france_travail", None, False) == "ft:esn_it:it"
    assert public_facts.jobs_fact_variant("apec", "esn_it", False) == "apec:esn_it:it"
    # CACHE-SOURCES (15/10) : les agrégateurs rangent le fait BRUT — une variante par SOURCE.
    assert public_facts.jobs_fact_variant("theirstack", "industrie", True) == "theirstack"
    assert public_facts.jobs_fact_variant("ats", "industrie", True) == "ats:industrie:all"
    # Toutes les sources d'offres ont leur variante, aucune n'en partage une autre.
    variants = {public_facts.jobs_fact_variant(s, None, False) for s in public_facts.JOBS_SOURCES}
    assert len(variants) == len(public_facts.JOBS_SOURCES) == 10  # +« merged » (DISCOVER-OFFRES D)


def test_unknown_source_is_refused() -> None:
    with pytest.raises(ValueError):
        public_facts.jobs_fact_variant("linkedin", None, False)


async def test_peek_never_calls_the_network_and_tells_absent_from_empty(store: MemoryStore) -> None:
    key = public_facts.company_fact_key(siren="552032534")
    variant = public_facts.jobs_fact_variant("theirstack", None, False)
    assert await public_facts.peek_fact("jobs", key, variant) is None  # jamais cherché
    fetch = AsyncMock(return_value=[{"title": "Dev", "date": "2026-10-10", "url": "https://x/1"}])
    await public_facts.cached_fact("jobs", key, variant, fetch)
    rows = await public_facts.peek_fact("jobs", key, variant)
    assert rows is not None and rows[0]["title"] == "Dev"
    fetch.assert_awaited_once()


async def test_peek_of_an_empty_search_is_an_empty_list_not_none(store: MemoryStore) -> None:
    key = public_facts.company_fact_key(siren="552032534")
    variant = public_facts.jobs_fact_variant("fantastic", None, False)
    await public_facts.cached_fact("jobs", key, variant, AsyncMock(return_value=[]))
    assert await public_facts.peek_fact("jobs", key, variant) == []


async def test_peek_without_company_key_is_none(store: MemoryStore) -> None:
    assert await public_facts.peek_fact("jobs", None, "ft:esn_it:it") is None


async def test_peeking_never_counts_as_a_hit_or_a_miss(store: MemoryStore) -> None:
    """Une lecture de curiosité n'est ni un appel évité ni un appel à venir : la ligne de
    mesure d'une requête (``cache=x, réseau=y``) ne doit pas être faussée par elle."""
    await source_cache.begin_run(account_id="")
    key = public_facts.company_fact_key(siren="552032534")
    for source in public_facts.JOBS_SOURCES:
        await public_facts.peek_fact("jobs", key, public_facts.jobs_fact_variant(source, None, False))
    stats = source_cache.run_stats()
    assert stats["hits"].get("public_facts", 0) == 0
    assert stats["misses"].get("public_facts", 0) == 0
