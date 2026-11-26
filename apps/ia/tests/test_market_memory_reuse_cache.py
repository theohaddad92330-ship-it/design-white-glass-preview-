"""`market_memory_reuse_cache.py` — #220.5 / épopée #3232.

Une BRIQUE, pas le chantier entier : #3232 demande la réutilisation branchée
sur `compare_scenarios` (#3214), qui n'existe QUE sur `feat/lau-219-220-28-09`
(absent de `main` au 28/09 — voir le docstring du module). Ce fichier défend
le cache lui-même : ce que `search_market_memory` (les deux axes de #3225)
en fait est couvert par `test_search_market_memory_tool.py`.

#220.5 (reste, audité 28/09 soir) — le cache PAR PROCESSUS documenté comme
limite dans le dernier bilan de #3232 : « à reconsidérer (Redis) si la
réutilisation doit survivre plus longtemps ou traverser des instances ». Ce
lot ajoute un tier Redis best-effort (même patron que `provider_cache.py` —
`_redis()` mockable, jamais bloquant), le tier mémoire restant le filet de
sécurité quand Redis est absent ou en panne — jamais une panne visible.
"""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, patch

import pytest

from app.services import market_memory_reuse_cache as cache


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value


class BrokenRedis:
    """Simule une panne réseau — jamais un échec visible pour l'appelant."""

    async def get(self, key: str):
        raise ConnectionError("redis unreachable")

    async def set(self, key: str, value: str, ex: int | None = None):
        raise ConnectionError("redis unreachable")


@pytest.fixture(autouse=True)
def _clear() -> None:
    cache.clear()


@pytest.fixture(autouse=True)
def _no_redis_by_default():
    """Sans mock explicite, aucun test ne doit taper un vrai Redis."""
    with patch.object(cache, "_redis", AsyncMock(return_value=None)):
        yield


@pytest.mark.asyncio
async def test_a_miss_is_none() -> None:
    assert await cache.get("u-1", "filters", {"technology": "java"}) is None


@pytest.mark.asyncio
async def test_a_put_then_get_round_trips() -> None:
    value = {"status": "ok", "matches": [], "truncated": False}
    await cache.put("u-1", "filters", {"technology": "java"}, value)

    assert await cache.get("u-1", "filters", {"technology": "java"}) == value


@pytest.mark.asyncio
async def test_an_unavailable_read_is_never_cached() -> None:
    """Une panne mise en cache resterait figée alors que le pont peut
    répondre au prochain appel — jamais un `unavailable` retenu."""
    await cache.put("u-1", "filters", {"technology": "java"}, {"status": "unavailable", "reason": "read_failed"})

    assert await cache.get("u-1", "filters", {"technology": "java"}) is None


@pytest.mark.asyncio
async def test_scoped_by_user_never_leaks_one_workspaces_account_route_to_another() -> None:
    value = {"status": "ok", "matches": [{"companyName": "Thales", "accountRoute": "/accounts/abc"}]}
    await cache.put("u-1", "filters", {"technology": "java"}, value)

    assert await cache.get("u-2", "filters", {"technology": "java"}) is None


@pytest.mark.asyncio
async def test_scoped_by_axis_identity_and_filters_never_collide() -> None:
    """#3225 — les deux axes de `search_market_memory` (critères / identité)
    ne doivent jamais se répondre l'un l'autre, même à charge utile égale."""
    value = {"status": "ok", "matches": []}
    await cache.put("u-1", "filters", {"technology": "java"}, value)

    assert await cache.get("u-1", "identity", {"technology": "java"}) is None


@pytest.mark.asyncio
async def test_a_different_payload_is_a_different_entry() -> None:
    await cache.put("u-1", "filters", {"technology": "java"}, {"status": "ok", "matches": ["java"]})
    await cache.put("u-1", "filters", {"technology": "python"}, {"status": "ok", "matches": ["python"]})

    assert await cache.get("u-1", "filters", {"technology": "java"}) == {"status": "ok", "matches": ["java"]}
    assert await cache.get("u-1", "filters", {"technology": "python"}) == {"status": "ok", "matches": ["python"]}


@pytest.mark.asyncio
async def test_key_order_in_the_payload_does_not_matter() -> None:
    """Le payload est un dict CONSTRUIT par l'appelant, pas une chaîne — deux
    appels qui posent les mêmes clés dans un ordre différent doivent rester
    la MÊME entrée (`json.dumps(..., sort_keys=True)`)."""
    await cache.put("u-1", "filters", {"technology": "java", "location": "Paris"}, {"status": "ok", "matches": []})

    assert await cache.get("u-1", "filters", {"location": "Paris", "technology": "java"}) == {
        "status": "ok",
        "matches": [],
    }


@pytest.mark.asyncio
async def test_an_expired_entry_is_a_miss_and_is_evicted(monkeypatch: pytest.MonkeyPatch) -> None:
    await cache.put("u-1", "filters", {"technology": "java"}, {"status": "ok", "matches": []})

    future = time.monotonic() + cache.TTL_SECONDS + 1
    monkeypatch.setattr(time, "monotonic", lambda: future)

    assert await cache.get("u-1", "filters", {"technology": "java"}) is None
    # Purgée, pas seulement ignorée — la ligne interne ne traîne pas.
    assert len(cache._store) == 0


@pytest.mark.asyncio
async def test_the_store_never_grows_past_max_entries() -> None:
    for index in range(cache.MAX_ENTRIES + 5):
        await cache.put("u-1", "filters", {"technology": f"lang-{index}"}, {"status": "ok", "matches": [index]})

    assert len(cache._store) <= cache.MAX_ENTRIES


# ─────────────────────────────────────────────────────────────────────────
# Tier Redis (#220.5 reste, 28/09 soir) — best-effort, jamais bloquant.
# ─────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_redis_hit_is_served_even_when_the_local_process_never_wrote_it() -> None:
    """La raison d'être du tier : un redéploiement ou un routage vers une
    autre instance ne doit PAS perdre la réutilisation — seul un magasin
    partagé (Redis) peut servir un HIT que CE processus n'a jamais écrit."""
    fake = FakeRedis()
    with patch.object(cache, "_redis", AsyncMock(return_value=fake)):
        await cache.put("u-1", "filters", {"technology": "java"}, {"status": "ok", "matches": ["java"]})

    # Un « autre processus » : le tier mémoire local est vide, seul Redis a la valeur.
    cache._store.clear()
    with patch.object(cache, "_redis", AsyncMock(return_value=fake)):
        assert await cache.get("u-1", "filters", {"technology": "java"}) == {
            "status": "ok",
            "matches": ["java"],
        }


@pytest.mark.asyncio
async def test_redis_is_written_with_the_ttl_in_seconds() -> None:
    fake = FakeRedis()
    with patch.object(cache, "_redis", AsyncMock(return_value=fake)), patch.object(
        fake, "set", AsyncMock(wraps=fake.set)
    ) as spy_set:
        await cache.put("u-1", "filters", {"technology": "java"}, {"status": "ok", "matches": []})

    assert spy_set.call_args.kwargs.get("ex") == cache.TTL_SECONDS


@pytest.mark.asyncio
async def test_an_unavailable_read_is_never_written_to_redis_either() -> None:
    fake = FakeRedis()
    with patch.object(cache, "_redis", AsyncMock(return_value=fake)):
        await cache.put("u-1", "filters", {"technology": "java"}, {"status": "unavailable", "reason": "read_failed"})

    assert fake.store == {}


@pytest.mark.asyncio
async def test_a_broken_redis_degrades_to_the_local_tier_without_raising() -> None:
    """Best-effort comme `provider_cache` : Redis en panne dégrade vers le
    tier mémoire, jamais une exception qui remonterait à l'appelant."""
    with patch.object(cache, "_redis", AsyncMock(return_value=BrokenRedis())):
        await cache.put("u-1", "filters", {"technology": "java"}, {"status": "ok", "matches": ["java"]})
        assert await cache.get("u-1", "filters", {"technology": "java"}) == {
            "status": "ok",
            "matches": ["java"],
        }


@pytest.mark.asyncio
async def test_no_redis_configured_still_serves_the_local_tier() -> None:
    """`_redis()` rend `None` sans `REDIS_URL` (même contrat que
    `provider_cache`) — dégradation, jamais une panne visible."""
    with patch.object(cache, "_redis", AsyncMock(return_value=None)):
        await cache.put("u-1", "filters", {"technology": "java"}, {"status": "ok", "matches": ["java"]})
        assert await cache.get("u-1", "filters", {"technology": "java"}) == {
            "status": "ok",
            "matches": ["java"],
        }
