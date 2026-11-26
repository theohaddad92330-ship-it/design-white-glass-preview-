"""#4722 (TS-A, épopée #4721) — un appel payant concurrent sur la même clé n'est JAMAIS payé deux fois.

Le verrou vaut entre PROCESSUS (Redis ``SET NX PX``), pas seulement dans la boucle d'événements :
``source_cache.single_flight`` ne voit que sa boucle. Ici, deux « processus » = deux ``_inflight`` vides
(on rejoue ``produce`` directement) partageant le même Redis factice.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock

import pytest

from app.services import provider_cache, source_cache


class LockRedis:
    """Redis minimal : ``get`` / ``set`` (nx, px, ex) / ``delete``, expiration lue sur l'horloge."""

    def __init__(self) -> None:
        self.store: dict[str, tuple[str, float | None]] = {}

    def _live(self, key: str) -> str | None:
        item = self.store.get(key)
        if item is None:
            return None
        value, deadline = item
        if deadline is not None and deadline <= time.monotonic():
            del self.store[key]
            return None
        return value

    async def get(self, key: str):
        return self._live(key)

    async def set(self, key: str, value: str, ex: int | None = None, px: int | None = None, nx: bool = False):
        if nx and self._live(key) is not None:
            return None
        seconds = ex if ex is not None else (px / 1000 if px is not None else None)
        self.store[key] = (value, time.monotonic() + seconds if seconds is not None else None)
        return True

    async def delete(self, key: str):
        return 1 if self.store.pop(key, None) else 0

    def locks(self) -> list[str]:
        return [k for k in list(self.store) if ":lock:" in k and self._live(k) is not None]


@pytest.fixture
def redis(monkeypatch: pytest.MonkeyPatch) -> LockRedis:
    fake = LockRedis()
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=fake))
    monkeypatch.setattr(source_cache, "put", AsyncMock(return_value=None))
    monkeypatch.setattr(source_cache, "get", AsyncMock(return_value=None))
    monkeypatch.setattr(provider_cache, "LOCK_POLL_S", 0.005)
    return fake


async def test_deux_appels_concurrents_sur_la_meme_cle_font_un_seul_appel_reseau(redis: LockRedis) -> None:
    calls: list[int] = []

    async def produce() -> dict:
        calls.append(1)
        await asyncio.sleep(0.05)
        value = {"offers": [1, 2, 3]}
        await provider_cache.set_json("jobs:skills", "k", value, 100)
        return value

    # Deux appelants SANS partage de boucle : on contourne l'anti-ruée en mémoire en appelant le verrou nu.
    results = await asyncio.gather(
        provider_cache.single_flight_shared("jobs:skills", "k", produce),
        provider_cache.single_flight_shared("jobs:skills", "k", produce),
    )
    assert len(calls) == 1
    assert results[0][0] == results[1][0] == {"offers": [1, 2, 3]}
    assert sorted(produced for _v, produced in results) == [False, True]
    assert redis.locks() == []


async def test_cached_json_deux_appels_concurrents_un_seul_fetch_meme_reponse(redis: LockRedis) -> None:
    calls: list[int] = []

    async def fetch() -> dict:
        calls.append(1)
        await asyncio.sleep(0.03)
        return {"offers": ["a"]}

    a, b = await asyncio.gather(
        provider_cache.cached_json("jobs:theirstack", "same", fetch, 100),
        provider_cache.cached_json("jobs:theirstack", "same", fetch, 100),
    )
    assert len(calls) == 1 and a == b == {"offers": ["a"]}


async def test_un_verrou_perime_laisse_repartir_un_appel(redis: LockRedis) -> None:
    lock = provider_cache._lock_key("jobs:skills", "k")
    # Un appelant est tombé : son verrou existe encore, mais expire dans 30 ms.
    await redis.set(lock, "mort", px=30)
    calls: list[int] = []

    async def produce() -> str:
        calls.append(1)
        return "ok"

    value, produced = await provider_cache.single_flight_shared("jobs:skills", "k", produce)
    assert (value, produced, len(calls)) == ("ok", True, 1)
    assert redis.locks() == []


async def test_un_appel_qui_leve_n_ecrit_ni_cache_ni_verrou(redis: LockRedis) -> None:
    async def fetch() -> dict:
        raise RuntimeError("panne")

    with pytest.raises(RuntimeError):
        await provider_cache.cached_json("jobs:theirstack", "boom", fetch, 100)
    assert redis.locks() == []
    assert not [k for k in redis.store if ":lock:" not in k]
    assert await provider_cache.get_json("jobs:theirstack", "boom") is None


async def test_le_second_appelant_repart_si_le_premier_a_leve(redis: LockRedis) -> None:
    calls: list[int] = []

    async def produce() -> str:
        calls.append(1)
        if len(calls) == 1:
            await asyncio.sleep(0.03)
            raise RuntimeError("panne")
        return "second"

    first, second = await asyncio.gather(
        provider_cache.single_flight_shared("ns", "k", produce),
        provider_cache.single_flight_shared("ns", "k", produce),
        return_exceptions=True,
    )
    assert isinstance(first, RuntimeError)
    assert second == ("second", True)
    assert len(calls) == 2


async def test_le_verrou_d_un_autre_n_est_pas_libere(redis: LockRedis) -> None:
    lock = provider_cache._lock_key("ns", "k")

    async def produce() -> str:
        # Notre verrou a expiré, un autre processus a pris le sien : on ne le supprime pas.
        await redis.set(lock, "autre", px=5000)
        return "v"

    await provider_cache.single_flight_shared("ns", "k", produce)
    assert redis._live(lock) == "autre"


async def test_sans_redis_ni_verrou_un_appel_simple(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    calls: list[int] = []

    async def produce() -> str:
        calls.append(1)
        return "v"

    assert await provider_cache.single_flight_shared("ns", "k", produce) == ("v", True)
    assert len(calls) == 1


async def test_redis_en_panne_ne_gele_pas_l_appel(redis: LockRedis, monkeypatch: pytest.MonkeyPatch) -> None:
    redis.set = AsyncMock(side_effect=RuntimeError("redis down"))  # type: ignore[method-assign]
    calls: list[int] = []

    async def produce() -> str:
        calls.append(1)
        return "v"

    assert await provider_cache.single_flight_shared("ns", "k", produce) == ("v", True)


async def test_deux_cles_differentes_ne_s_attendent_pas(redis: LockRedis) -> None:
    calls: list[str] = []

    async def make(tag: str) -> str:
        calls.append(tag)
        await asyncio.sleep(0.02)
        return tag

    await asyncio.gather(
        provider_cache.single_flight_shared("ns", "a", lambda: make("a")),
        provider_cache.single_flight_shared("ns", "b", lambda: make("b")),
    )
    assert sorted(calls) == ["a", "b"]


async def test_paid_skill_offers_deux_recherches_concurrentes_un_seul_achat(
    redis: LockRedis, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import discover_skill_offers as skill
    from app.services.data_sources import job_aggregators

    monkeypatch.setenv("THEIRSTACK_API_KEY", "cle-de-test")
    calls: list[int] = []

    async def theirstack(term, *, forms=(), zone=None, page=0, meta=None, **_):
        calls.append(page)
        await asyncio.sleep(0.05)
        return [{"company": "ACME", "title": "Dev Java"}]

    monkeypatch.setattr(job_aggregators, "theirstack_skill_offers", theirstack)
    h1, h2 = skill.SkillHarvest(), skill.SkillHarvest()
    a, b = await asyncio.gather(
        skill.paid_skill_offers("theirstack", "java", h1),
        skill.paid_skill_offers("theirstack", "java", h2),
    )
    assert len(calls) == 1
    assert a == b and a[0]["employer"] == "ACME"
    assert h1.by_source["theirstack"]["paid"] + h2.by_source["theirstack"]["paid"] == 1
