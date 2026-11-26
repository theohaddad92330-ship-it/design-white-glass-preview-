"""DISCOVER-PARTIEL-2 (16/10) — attendre NOTRE limiteur n'est pas une panne de la source."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import rate_limiter, source_health
from app.services.company_filters import CompanyDiscoveryFilters, DegradeReason
from app.services.data_sources import public_tenders as pt
from app.services.data_sources import recherche_entreprises as re_
from app.services.data_sources import ted
from app.services.distributed_rate_limiter import RateLimitTimeout

_SLOT = "rate limit slot for provider 'ted' not available within 0.1s"


def test_deferral_is_counted_apart_and_never_a_degradation() -> None:
    cid = "t-defer-1"
    with source_health.watch_fetch_errors() as errors:
        source_health.record_deferral(cid, source="adzuna", reason="RateLimitTimeout")
    assert source_health.get_degradations(cid) == []
    assert source_health.get_deferrals(cid) == {"adzuna": 1}
    # le vide d'une carte différée ne se range pas « rien » : l'erreur est notée, code différé
    assert [getattr(e, "code", "") for e in errors] == [DegradeReason.TIME_BUDGET]


def test_record_degradation_with_limiter_code_or_text_is_a_deferral() -> None:
    cid = "t-defer-2"
    source_health.record_degradation(cid, source="adzuna", reason="RateLimitTimeout", code=DegradeReason.TIME_BUDGET)
    source_health.record_degradation(cid, source="ted", reason=_SLOT)
    assert source_health.get_degradations(cid) == []
    assert source_health.get_deferrals(cid) == {"adzuna": 1, "ted": 1}


def test_a_real_refusal_still_degrades() -> None:
    cid = "t-defer-3"
    source_health.record_degradation(cid, source="workable", reason="HTTP 429", code=DegradeReason.RATE_LIMITED)
    assert [d["source"] for d in source_health.get_degradations(cid)] == ["workable"]
    assert source_health.get_deferrals(cid) == {}


def test_ted_is_serial() -> None:
    assert rate_limiter._config_for("ted")["concurrency"] == 1


def _resp(status: int, headers: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status, json={"notices": []}, headers=headers or {}, request=httpx.Request("POST", "https://api.ted.europa.eu")
    )


@asynccontextmanager
async def _free_slot(_name: str):
    yield


@pytest.mark.asyncio
async def test_ted_429_is_retried_once_within_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ted, "throttle", _free_slot)
    backed: list = []
    monkeypatch.setattr(ted, "back_off_provider", lambda *a, **k: backed.append(a))
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=[_resp(429, {"retry-after": "1"}), _resp(200)])
    with rate_limiter.wait_deadline(time.monotonic() + 30):
        assert await ted.ted_tenders("Ville de Paris", client=c) == []
    assert c.post.await_count == 2 and len(backed) == 1


@pytest.mark.asyncio
async def test_ted_second_429_is_a_real_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ted, "throttle", _free_slot)
    monkeypatch.setattr(ted, "back_off_provider", lambda *a, **k: None)
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=[_resp(429), _resp(429), _resp(200)])
    with rate_limiter.wait_deadline(time.monotonic() + 30), pytest.raises(ted.TedUnavailable) as err:
        await ted.ted_tenders("Ville de Paris", client=c)
    assert c.post.await_count == 2 and not err.value.deferred


@pytest.mark.asyncio
async def test_ted_without_budget_does_not_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ted, "throttle", _free_slot)
    monkeypatch.setattr(ted, "back_off_provider", lambda *a, **k: None)
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=[_resp(429), _resp(200)])
    with pytest.raises(ted.TedUnavailable):
        await ted.ted_tenders("Ville de Paris", client=c)
    assert c.post.await_count == 1


@pytest.mark.asyncio
async def test_ted_waiting_on_our_limiter_is_deferred_not_down(monkeypatch: pytest.MonkeyPatch) -> None:
    @asynccontextmanager
    async def full(_name: str):
        raise RateLimitTimeout("ted", 0.1)
        yield

    monkeypatch.setattr(ted, "throttle", full)
    cid = "t-ted-defer"
    monkeypatch.setattr(pt, "get_correlation_id", lambda: cid)
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=httpx.Response(200, json={"results": []}, request=httpx.Request("GET", "https://x")))
    assert await pt.public_tenders("Ville de Paris", client=c) == []
    assert source_health.get_degradations(cid) == []
    assert source_health.get_deferrals(cid) == {"ted": 1}


@pytest.mark.asyncio
async def test_ted_real_failure_still_degrades(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ted, "throttle", _free_slot)
    monkeypatch.setattr(ted, "back_off_provider", lambda *a, **k: None)
    cid = "t-ted-real"
    monkeypatch.setattr(pt, "get_correlation_id", lambda: cid)
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=httpx.Response(200, json={"results": []}, request=httpx.Request("GET", "https://x")))
    c.post = AsyncMock(return_value=_resp(503))
    await pt.public_tenders("Ville de Paris", client=c)
    assert [d["source"] for d in source_health.get_degradations(cid)] == ["ted"]


@pytest.mark.asyncio
async def test_registry_waiting_on_our_limiter_is_time_budget_not_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    @asynccontextmanager
    async def full(_name: str):
        raise RateLimitTimeout("recherche_entreprises", 0.1)
        yield

    monkeypatch.setattr(re_, "throttle", full)
    sink: list[dict] = []
    out = await re_.list_companies(CompanyDiscoveryFilters(q="banque"), 5, degraded=sink, client=AsyncMock())
    assert out == []
    assert [d["reason"] for d in sink] == [DegradeReason.TIME_BUDGET]


@pytest.mark.asyncio
async def test_registry_real_429_stays_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(re_, "throttle", _free_slot)
    monkeypatch.setattr(re_, "_back_off_from", lambda *_: None)
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=httpx.Response(429, request=httpx.Request("GET", "https://x")))
    sink: list[dict] = []
    await re_.list_companies(CompanyDiscoveryFilters(q="banque"), 5, degraded=sink, client=c)
    assert [d["reason"] for d in sink] == [DegradeReason.RATE_LIMITED]


@pytest.mark.asyncio
async def test_registry_429_then_our_limiter_wait_stays_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    @asynccontextmanager
    async def slot(_name: str):
        calls["n"] += 1
        if calls["n"] > 1:
            raise RateLimitTimeout("recherche_entreprises", 0.1)
        yield

    monkeypatch.setattr(re_, "throttle", slot)
    monkeypatch.setattr(re_, "_back_off_from", lambda *_: None)
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=httpx.Response(429, request=httpx.Request("GET", "https://x")))
    sink: list[dict] = []
    with rate_limiter.wait_deadline(time.monotonic() + 30):
        await re_.list_companies(CompanyDiscoveryFilters(q="banque"), 5, degraded=sink, client=c)
    assert [d["reason"] for d in sink] == [DegradeReason.RATE_LIMITED]
