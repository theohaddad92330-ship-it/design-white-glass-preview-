"""Tests for the per-provider outbound throttle.

The ``throttle()`` factory is module-cached, so each test that mutates env
clears the cache to read fresh values.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Iterator
from unittest.mock import patch

import pytest

from app.services import rate_limiter
from app.services.rate_limiter import (
    WAIT_WARNING_THRESHOLD_S,
    ProviderThrottle,
    RateLimitTimeout,
    get_throttle,
    throttle,
)


@pytest.fixture(autouse=True)
def _clear_cache() -> Iterator[None]:
    # Reset the per-loop throttle cache before AND after each test so no throttle
    # instance (or a test-mutated one) can leak into another module. The cache is
    # keyed by ``id(event_loop)``, which the interpreter reuses after a loop is
    # GC'd, so a stale entry that survives this module can otherwise resurface in
    # an unrelated test and make the suite order-dependent.
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


async def test_unknown_provider_falls_back_to_default(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An unknown provider no longer raises — it throttles with a safe default."""
    caplog.set_level(logging.WARNING, logger=rate_limiter.logger.name)
    t = get_throttle("xxx")
    assert t.rpm == rate_limiter._UNKNOWN_DEFAULT["rpm"]
    assert t.concurrency == rate_limiter._UNKNOWN_DEFAULT["concurrency"]
    assert any("unknown provider 'xxx'" in m for m in caplog.messages)


async def test_defaults_used_when_env_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("CLAUDE_RPM", "CLAUDE_CONCURRENCY"):
        monkeypatch.delenv(var, raising=False)
    t = get_throttle("claude")
    assert t.rpm == 50
    assert t.concurrency == 12


async def test_env_overrides_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAUDE_RPM", "5")
    monkeypatch.setenv("CLAUDE_CONCURRENCY", "2")
    t = get_throttle("claude")
    assert t.rpm == 5
    assert t.concurrency == 2


async def test_invalid_env_falls_back_to_default(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger=rate_limiter.logger.name)
    monkeypatch.setenv("CLAUDE_RPM", "not-a-number")
    t = get_throttle("claude")
    assert t.rpm == 50
    assert any("invalid CLAUDE_RPM" in m for m in caplog.messages)


async def test_concurrency_blocks_extra_callers() -> None:
    t = ProviderThrottle("test", rpm=600, concurrency=2)

    in_critical = 0
    peak = 0

    async def worker() -> None:
        nonlocal in_critical, peak
        async with t:
            in_critical += 1
            peak = max(peak, in_critical)
            await asyncio.sleep(0.05)
            in_critical -= 1

    await asyncio.gather(*(worker() for _ in range(6)))
    assert peak == 2


async def test_rate_limit_throttles_burst() -> None:
    """At 60 rpm + concurrency 100, an 11-call burst spans more than one window."""
    t = ProviderThrottle("test", rpm=60, concurrency=100)

    start = time.monotonic()
    async with t:
        pass
    # Drain the bucket as fast as possible.
    for _ in range(60):
        async with t:
            pass
    # The 62nd acquisition must wait — the limiter is now empty.
    pre = time.monotonic()
    async with t:
        pass
    waited = time.monotonic() - pre
    assert waited > 0.1, f"expected wait but only {waited:.3f}s"
    elapsed = time.monotonic() - start
    assert elapsed > 0.1


async def test_logs_warning_when_wait_exceeds_threshold(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Make __aenter__ believe it waited longer than the threshold without sleeping."""
    caplog.set_level(logging.WARNING, logger=rate_limiter.logger.name)
    t = ProviderThrottle("test", rpm=60, concurrency=1)

    calls = {"n": 0}
    base = 100.0

    def fake_monotonic() -> float:
        calls["n"] += 1
        return base if calls["n"] == 1 else base + WAIT_WARNING_THRESHOLD_S + 0.5

    with patch.object(rate_limiter.time, "monotonic", side_effect=fake_monotonic):
        async with t:
            pass

    assert any("rate_limit_wait provider=test" in m for m in caplog.messages)


# Phase 4 fires 5 plan phases + 5 sections + messages = 11 Claude calls in one
# gather (phase4_plan.py). At concurrency 10 the 11th could not start until one
# of the first 10 finished — a whole extra Sonnet round-trip on EVERY analysis,
# invisible because nothing timed individual calls. Guard it: the semaphore must
# never drop back below the widest fan-out we issue.
PHASE4_MAX_PARALLEL_CLAUDE_CALLS = 11


def test_claude_concurrency_covers_the_phase4_fanout() -> None:
    assert rate_limiter._DEFAULTS["claude"]["concurrency"] >= PHASE4_MAX_PARALLEL_CLAUDE_CALLS


async def test_throttle_records_call_time_and_wait_for_the_run() -> None:
    """throttle() is the single seam instrumenting every outbound call — if it
    stops recording, per-provider cost and latency silently go to zero."""
    from app.middleware.correlation_id import _correlation_id as correlation_id_var
    from app.services import run_metrics

    cid = "throttle-metrics-test"
    run_metrics.clear_metrics(cid)
    token = correlation_id_var.set(cid)
    try:
        async with rate_limiter.throttle("brave"):
            await asyncio.sleep(0.02)
    finally:
        correlation_id_var.reset(token)

    m = run_metrics.get_metrics(cid)["brave"]
    assert m["calls"] == 1 and m["errors"] == 0
    assert m["duration_ms"] >= 15
    run_metrics.clear_metrics(cid)


async def test_throttle_flags_a_failing_call() -> None:
    from app.middleware.correlation_id import _correlation_id as correlation_id_var
    from app.services import run_metrics

    cid = "throttle-error-test"
    run_metrics.clear_metrics(cid)
    token = correlation_id_var.set(cid)
    try:
        with pytest.raises(RuntimeError):
            async with rate_limiter.throttle("apollo"):
                raise RuntimeError("provider down")
    finally:
        correlation_id_var.reset(token)

    assert run_metrics.get_metrics(cid)["apollo"]["errors"] == 1
    run_metrics.clear_metrics(cid)


async def test_in_process_fallback_is_bounded_like_the_distributed_path() -> None:
    """Une panne Redis DÉGRADE la latence — elle ne SUPPRIME pas le budget (#1191).

    Mesuré en production le 28/08/2026 : `POST /api/ia/chat` rendu en **502 après
    120 076 ms**. Ce nombre-là est le budget de l'APPELANT (`CHAT_CALLER_BUDGET_MS`
    = 120 000 côté NestJS), pas celui du tour (`_DEFAULT_TURN_BUDGET_S` = 90 s).
    Autrement dit la garde intérieure, qui aurait rendu `_TIMEOUT_REPLY`
    proprement, n'a jamais eu la main.

    La raison est ici. Le budget du tour ne borne QUE l'aller-retour Anthropic
    (`timeout=min(_PER_CALL_TIMEOUT_S, remaining)`) ; l'attente du jeton de débit
    le PRÉCÈDE, dans `async with throttle(...)`. Or des deux chemins de ce seau,
    un seul était borné : le chemin distribué s'arrête à `max_wait_s` et lève
    `RateLimitTimeout`, tandis que le repli en-processus — celui qu'on emprunte
    dès que Redis est indisponible, et de façon DÉFINITIVE pour ce processus
    puisque `_acquire_rate` détache le seau — attendait sans aucune borne.

    Un `AsyncLimiter(max_rate=1, time_period=60)` vidé fait donc dormir soixante
    secondes AVANT de parler au modèle, sans que rien dans le tour ne le voie.
    """
    t = ProviderThrottle("claude_chat", rpm=1, concurrency=4, max_wait_s=0.05)
    assert t.bucket is None, "sans Redis attaché, c'est bien le repli en-processus qui est mesuré"

    await t.acquire()  # consomme l'unique jeton de la minute
    t.release()

    started = time.monotonic()
    with pytest.raises(RateLimitTimeout):
        # `wait_for` borne le ROUGE, pas le vert : sans la correction,
        # `limiter.acquire()` dormirait ~60 s et il faudrait les attendre pour
        # voir le test échouer. Il ne peut pas masquer un succès : `RateLimitTimeout`
        # hérite de `RuntimeError`, jamais de `TimeoutError`.
        await asyncio.wait_for(t.acquire(), timeout=5.0)
    assert time.monotonic() - started < 1.0


async def test_bounded_fallback_does_not_hold_the_concurrency_slot() -> None:
    """Le jeton de débit se prend AVANT le créneau de concurrence.

    Si l'échec du premier laissait le second pris, une salve de tours expirés
    fermerait le seau pour de bon — la panne durerait après la panne.
    """
    t = ProviderThrottle("claude_chat", rpm=1, concurrency=1, max_wait_s=0.05)
    await t.acquire()
    t.release()

    with pytest.raises(RateLimitTimeout):
        await asyncio.wait_for(t.acquire(), timeout=5.0)

    assert t.semaphore._value == 1, "le créneau de concurrence doit rester libre"
