"""Tests for the Redis-backed distributed token bucket and its wiring into the
``throttle()`` factory.

Hermetic by construction — every test uses ``fakeredis.aioredis`` (in-memory,
supports Lua via lupa). No real Redis is ever contacted. The in-process fallback
path is covered by ``test_rate_limiter`` plus the Redis-down cases below.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Iterator

import fakeredis.aioredis as fa
import pytest

from app.services import distributed_rate_limiter as drl
from app.services import rate_limiter
from app.services.distributed_rate_limiter import (
    RateLimitTimeout,
    RedisTokenBucket,
    RedisUnavailable,
    redis_url,
)


@pytest.fixture(autouse=True)
def _clear_caches() -> Iterator[None]:
    # Reset the per-loop throttle cache and the Redis client pool BOTH before and
    # after each test. The teardown half is load-bearing: some tests reach into a
    # *cached* ProviderThrottle and mutate it (e.g. ``t.bucket = _FullBucket()`` in
    # ``test_throttle_timeout_propagates``). Without an after-reset that poisoned
    # instance lingers in the global ``_throttles`` cache and — because the cache is
    # keyed by ``id(event_loop)``, which the interpreter reuses once a loop is GC'd —
    # can resurface in an unrelated later test that happens to draw a loop with the
    # same id, making the whole suite order-dependent.
    rate_limiter._reset_cache_for_tests()
    drl._reset_clients_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()
    drl._reset_clients_for_tests()


def _fake() -> fa.FakeRedis:
    # Fresh server per call → isolated keyspace, decode like the real client.
    return fa.FakeRedis(decode_responses=True)


async def test_bucket_grants_then_blocks_when_empty() -> None:
    """A burst drains the bucket; the next acquire must report a wait."""
    bucket = RedisTokenBucket(_fake(), "test", rpm=60, burst=3)
    # Burst capacity is 3 → three immediate grants.
    for _ in range(3):
        assert await bucket.try_acquire() == 0.0
    # Fourth is refused with a positive wait (≈ 1s at 60 rpm).
    wait = await bucket.try_acquire()
    assert wait > 0.0


async def test_bucket_shared_across_clients_same_keyspace() -> None:
    """Two bucket instances on the same server share one limit (multi-process)."""
    server = _fake()
    a = RedisTokenBucket(server, "shared", rpm=60, burst=2)
    # Second client pointing at the same fake server (same connection here).
    b = RedisTokenBucket(server, "shared", rpm=60, burst=2)
    assert await a.try_acquire() == 0.0
    assert await b.try_acquire() == 0.0
    # Capacity 2 spent across both instances → third must wait.
    assert await a.try_acquire() > 0.0


async def test_acquire_waits_then_returns_after_refill() -> None:
    """acquire() blocks on an empty bucket and returns once a token refills."""
    # 600 rpm → 10 tokens/s → a token every ~100ms. burst=1 so it empties fast.
    bucket = RedisTokenBucket(_fake(), "wait", rpm=600, burst=1)
    assert await bucket.try_acquire() == 0.0  # drain the single token
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    await bucket.acquire(max_wait_s=5.0)  # must wait for the next token, not error
    waited = loop.time() - t0
    assert waited >= 0.05, f"expected a real wait, got {waited:.3f}s"


async def test_acquire_times_out_when_starved() -> None:
    """A very slow bucket with a tiny deadline raises RateLimitTimeout."""
    bucket = RedisTokenBucket(_fake(), "slow", rpm=6, burst=1)  # 1 token / 10s
    assert await bucket.try_acquire() == 0.0
    with pytest.raises(RateLimitTimeout):
        await bucket.acquire(max_wait_s=0.05)


async def test_try_acquire_wraps_redis_error_as_unavailable() -> None:
    class _Boom:
        def register_script(self, _script: str):  # noqa: ANN202 - test stub
            async def _run(*, keys, args):  # noqa: ANN001, ANN202
                from redis.exceptions import ConnectionError as RedisConnError

                raise RedisConnError("down")

            return _run

    bucket = RedisTokenBucket(_Boom(), "boom", rpm=60)  # type: ignore[arg-type]
    with pytest.raises(RedisUnavailable):
        await bucket.try_acquire()


async def test_redis_url_helper(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert redis_url() is None
    monkeypatch.setenv("REDIS_URL", "")
    assert redis_url() is None
    monkeypatch.setenv("REDIS_URL", "redis://x:6379")
    assert redis_url() == "redis://x:6379"


# --- throttle() integration: distributed path wired in, with fallback ---


async def test_throttle_uses_redis_bucket_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With REDIS_URL set and a reachable (fake) client, throttle attaches a bucket."""
    monkeypatch.setenv("REDIS_URL", "redis://fake:6379")
    server = _fake()

    async def _fake_get_client(_url: str):  # noqa: ANN202
        return server

    monkeypatch.setattr(rate_limiter, "get_client", _fake_get_client)

    t = rate_limiter.get_throttle("claude")
    # Attachment is scheduled as a task; let it run.
    await asyncio.sleep(0)
    assert t.bucket is not None
    # The throttle still works as an async CM through the Redis gate.
    async with t:
        pass


async def test_throttle_falls_back_when_redis_unreachable(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A failing connect leaves bucket=None and logs the fallback; CM still works."""
    caplog.set_level(logging.WARNING, logger=rate_limiter.logger.name)
    monkeypatch.setenv("REDIS_URL", "redis://unreachable:6379")

    async def _boom(_url: str):  # noqa: ANN202
        raise RedisUnavailable("connect refused")

    monkeypatch.setattr(rate_limiter, "get_client", _boom)

    t = rate_limiter.get_throttle("brave")
    await asyncio.sleep(0)
    assert t.bucket is None
    assert any("rate_limit_redis_unavailable" in m for m in caplog.messages)
    # Falls through to the in-process limiter — still usable.
    async with t:
        pass


async def test_throttle_no_redis_url_stays_in_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("REDIS_URL", raising=False)
    t = rate_limiter.get_throttle("apollo")
    await asyncio.sleep(0)
    assert t.bucket is None
    async with t:
        pass


async def test_throttle_degrades_mid_flight_on_redis_error(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """If the attached bucket errors during acquire, the throttle degrades live."""
    caplog.set_level(logging.WARNING, logger=rate_limiter.logger.name)

    class _BrokenBucket:
        async def acquire(self, _max_wait_s: float) -> None:
            raise RedisUnavailable("connection lost mid-flight")

    t = rate_limiter.get_throttle("pappers")
    t.bucket = _BrokenBucket()  # type: ignore[assignment]
    async with t:  # must not raise — falls back to AsyncLimiter
        pass
    assert t.bucket is None
    assert any("rate_limit_redis_unavailable" in m for m in caplog.messages)


async def test_throttle_timeout_propagates(monkeypatch: pytest.MonkeyPatch) -> None:
    """A genuinely full queue surfaces RateLimitTimeout (not a silent fallback)."""

    class _FullBucket:
        async def acquire(self, max_wait_s: float) -> None:
            raise RateLimitTimeout("pappers", max_wait_s)

    t = rate_limiter.get_throttle("pappers")
    t.bucket = _FullBucket()  # type: ignore[assignment]
    with pytest.raises(RateLimitTimeout):
        async with t:
            pass


async def test_le_premier_appel_attend_le_seau_partage(monkeypatch: pytest.MonkeyPatch) -> None:
    """ALERTES-402 point 3 — le rattachement du seau PARTAGÉ est une tâche de fond ; sans attente, les
    premiers appels d'une boucle neuve passaient par le limiteur LOCAL, hors budget commun. C'est la
    rafale de démarrage qui récolte les 429 (mesurée sur Mantiks les 28, 29 et 30/10/2026)."""
    monkeypatch.setenv("REDIS_URL", "redis://fake:6379")
    server = _fake()

    async def _slow_get_client(_url: str):  # noqa: ANN202
        await asyncio.sleep(0.05)
        return server

    monkeypatch.setattr(rate_limiter, "get_client", _slow_get_client)

    t = rate_limiter.get_throttle("claude")
    assert t.bucket is None  # la tâche n'a pas encore eu la main
    async with rate_limiter.throttle("claude") as entered:
        assert entered.bucket is not None  # le premier appel l'a ATTENDU


async def test_un_rattachement_qui_traine_ne_bloque_pas_l_appel(monkeypatch: pytest.MonkeyPatch) -> None:
    """Et l'attente est BORNÉE : un Redis lent dé-partage le budget, il ne rallonge pas l'appel."""
    monkeypatch.setenv("REDIS_URL", "redis://fake:6379")

    async def _trainard(_url: str):  # noqa: ANN202
        await asyncio.sleep(5)
        raise AssertionError("jamais atteint")

    monkeypatch.setattr(rate_limiter, "get_client", _trainard)
    monkeypatch.setattr(rate_limiter, "BUCKET_ATTACH_WAIT_S", 0.01)

    t = rate_limiter.get_throttle("brave")
    t0 = time.monotonic()
    async with rate_limiter.throttle("brave") as entered:
        pass
    assert time.monotonic() - t0 < 1.0
    assert entered.bucket is None  # repli sur le limiteur local, comme avant
    if t._bucket_task is not None:
        t._bucket_task.cancel()


async def test_new_providers_present() -> None:
    for provider in ("insee", "france_travail", "inpi", "bodacc", "recherche_entreprises"):
        t = rate_limiter.get_throttle(provider)
        assert t.rpm > 0
        assert t.concurrency > 0
