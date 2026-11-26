"""DISCOVER-OFFRES (15/10, point C) — réserve quotidienne Adzuna : le quota (500/jour) sert d'abord les analyses.

Compteur commun des appels RÉSEAU (le cache = 0), remis à zéro à minuit Europe/Paris. Découvrir n'appelle que
sous ``ADZUNA_DAILY_LIMIT - ADZUNA_ANALYSIS_RESERVE`` ; l'analyse va jusqu'à la limite. Au-delà : ni erreur ni bandeau.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import httpx
import pytest

from app.routers import discover as discover_router
from app.services import adzuna_budget, provider_cache
from app.services.data_sources import job_aggregators as agg


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, int] = {}
        self.expiries: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    async def get(self, key: str) -> str | None:
        return str(self.values[key]) if key in self.values else None

    async def expire(self, key: str, seconds: int) -> None:
        self.expiries[key] = seconds


@pytest.fixture
def redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    fake = FakeRedis()
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=fake))
    for k in ("ADZUNA_DAILY_LIMIT", "ADZUNA_ANALYSIS_RESERVE"):
        monkeypatch.delenv(k, raising=False)
    return fake


async def test_defaults_are_500_and_150(redis: FakeRedis) -> None:
    assert adzuna_budget.daily_limit() == 500
    assert adzuna_budget.analysis_reserve() == 150
    assert adzuna_budget.discover_ceiling() == 350


async def test_discover_is_cut_at_limit_minus_reserve_analysis_goes_to_the_limit(redis: FakeRedis) -> None:
    for _ in range(349):
        await adzuna_budget.record_network_call()
    assert await adzuna_budget.discover_allowed() is True  # 349 < 350
    await adzuna_budget.record_network_call()
    assert await adzuna_budget.discover_allowed() is False  # 350 : la réserve est aux analyses
    assert await adzuna_budget.analysis_allowed() is True
    for _ in range(150):
        await adzuna_budget.record_network_call()
    assert await adzuna_budget.analysis_allowed() is False  # 500 : plus rien


async def test_settings_are_read_from_the_environment(redis: FakeRedis, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_DAILY_LIMIT", "10")
    monkeypatch.setenv("ADZUNA_ANALYSIS_RESERVE", "4")
    for _ in range(6):
        await adzuna_budget.record_network_call()
    assert await adzuna_budget.discover_allowed() is False
    assert await adzuna_budget.analysis_allowed() is True


async def test_counter_key_is_the_paris_day_and_expires(redis: FakeRedis) -> None:
    # 22 h 30 UTC le 14/10 = 00 h 30 à Paris (UTC+2) le 15/10 : c'est le compteur du 15.
    at = datetime(2026, 10, 14, 22, 30, tzinfo=UTC)
    assert adzuna_budget.day_key(at) == "adzuna:calls:2026-10-15"
    await adzuna_budget.record_network_call()
    (key,) = redis.expiries
    assert 0 < redis.expiries[key] <= 26 * 3600


async def test_without_redis_the_counter_still_counts_in_process(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    adzuna_budget._local.clear()
    monkeypatch.setenv("ADZUNA_DAILY_LIMIT", "3")
    monkeypatch.setenv("ADZUNA_ANALYSIS_RESERVE", "1")
    for _ in range(2):
        await adzuna_budget.record_network_call()
    assert await adzuna_budget.discover_allowed() is False


async def test_adzuna_jobs_counts_each_network_page_but_not_a_cache_hit(
    redis: FakeRedis, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "i")
    monkeypatch.setenv("ADZUNA_APP_KEY", "k")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=httpx.Response(200, json={"results": []}, request=httpx.Request("GET", "https://x")))
    await agg.adzuna_jobs("Decathlon", client=client)
    assert sum(redis.values.values()) == client.get.call_count == 1


async def test_discover_skips_adzuna_when_cut_but_still_reads_the_cache_without_error(
    redis: FakeRedis, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "i")
    monkeypatch.setenv("ADZUNA_APP_KEY", "k")
    monkeypatch.setenv("ADZUNA_DAILY_LIMIT", "2")
    monkeypatch.setenv("ADZUNA_ANALYSIS_RESERVE", "1")
    monkeypatch.setattr(adzuna_budget, "_last_cut_log", 0.0)
    await adzuna_budget.record_network_call()  # 1 ≥ 2 - 1 : Découvrir est coupé
    adz = AsyncMock(return_value=[])
    monkeypatch.setattr(discover_router, "adzuna_jobs", adz)
    for name in ("it_job_signals", "it_job_signals_ats"):
        monkeypatch.setattr(discover_router, name, AsyncMock(return_value=[]))
    for fn in ("public_tenders", "legal_signals", "press_signals", "funding_signals"):
        monkeypatch.setattr(discover_router, fn, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))
    candidate = {"name": "ACME", "siren": "620000001"}
    with caplog.at_level("INFO"):
        tasks = discover_router._start_signal_tasks([candidate], profile_data={})
        degraded: list[dict] = []
        await discover_router._finish_signal_tasks(tasks, degraded, time.monotonic() + 10, profile_data={}, filters={})
    adz.assert_not_called()
    assert degraded == []  # ni erreur ni bandeau
    assert any("Adzuna" in r.message and "Découvrir" in r.message for r in caplog.records)
