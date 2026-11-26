"""#4447 — un 503 Pappers ou un créneau de limiteur refusé est DIT dans ``degraded[]`` et
journalisé en warning : un ``logger.error`` part à Sentry (LoggingIntegration)."""

from __future__ import annotations

import logging

import httpx
import pytest

from app.services.company_filters import CompanyDiscoveryFilters
from app.services.distributed_rate_limiter import RateLimitTimeout
from app.services.pappers import discovery


def _filters() -> CompanyDiscoveryFilters:
    return CompanyDiscoveryFilters(naf_code="62.01Z", department="69")


@pytest.mark.asyncio
async def test_pappers_503_degrade_sans_log_error(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    transport = httpx.MockTransport(lambda _req: httpx.Response(503, json={}))
    sink: list[dict] = []
    async with httpx.AsyncClient(transport=transport) as client:
        with caplog.at_level(logging.WARNING):
            rows = await discovery.search_companies_filtered(_filters(), 5, degraded=sink, http_client=client)
    assert rows == []
    assert sink and sink[0]["source"] == "pappers"
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


@pytest.mark.asyncio
async def test_pappers_creneau_refuse_degrade_sans_log_error(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "k")

    class _Boom:
        async def __aenter__(self) -> None:
            raise RateLimitTimeout("pappers", 1.3)

        async def __aexit__(self, *_a: object) -> None:
            return None

    monkeypatch.setattr(discovery, "throttle", lambda _name: _Boom())
    sink: list[dict] = []
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _r: httpx.Response(200, json={}))) as client:
        with caplog.at_level(logging.WARNING):
            rows = await discovery.search_companies_filtered(_filters(), 5, degraded=sink, http_client=client)
    assert rows == []
    assert sink
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]
