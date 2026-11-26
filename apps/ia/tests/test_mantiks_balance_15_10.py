"""DISCOVER-OFFRES (15/10, E) — alerte solde Mantiks < 10 %, lue au plus 1×/h ; coût et journal par appel."""

from __future__ import annotations

import logging
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import provider_cache
from app.services.data_sources import job_aggregators as agg
from app.services.data_sources import mantiks_balance as mb


def _resp(payload: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=payload, request=httpx.Request("GET", "https://x"))


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "k")
    monkeypatch.setattr(mb, "_last_check", 0.0)
    monkeypatch.setattr(provider_cache, "get_json", AsyncMock(return_value=None))
    monkeypatch.setattr(provider_cache, "set_json", AsyncMock())


def _client(payload: object, status: int = 200) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp(payload, status))
    return client


def test_low_balance_threshold_is_ten_percent() -> None:
    assert mb.low_balance({"remaining": 99, "total": 1000}) == (99.0, 1000.0)
    assert mb.low_balance({"remaining": 100, "total": 1000}) is None  # 10 % pile : pas sous le seuil
    assert mb.low_balance({"remaining": 500, "total": 1000}) is None


@pytest.mark.parametrize("payload", [{}, {"remaining": 5}, {"total": 100}, {"remaining": 5, "total": 0}, "x", None, {"remaining": True, "total": 10}])
def test_unreadable_balance_raises_no_alert_never_a_guessed_ratio(payload: object) -> None:
    assert mb.low_balance(payload) is None


async def test_alert_is_logged_below_ten_percent(caplog: pytest.LogCaptureFixture) -> None:
    client = _client({"remaining": 40, "total": 1000})
    with caplog.at_level(logging.INFO):
        await mb.check_balance(client=client)
    assert any("solde de crédits bas" in r.message and r.levelno == logging.WARNING for r in caplog.records)
    assert client.get.call_args.args[0].endswith("/api/v2/credits/balance")
    assert client.get.call_args.kwargs["headers"]["X-API-KEY"] == "k"
    assert any(r.message == "mantiks credits/balance cache=miss coût=0" for r in caplog.records)


async def test_no_alert_when_the_balance_is_fine(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO):
        await mb.check_balance(client=_client({"remaining": 800, "total": 1000}))
    assert not any("solde de crédits bas" in r.message for r in caplog.records)


async def test_read_at_most_once_per_hour() -> None:
    client = _client({"remaining": 800, "total": 1000})
    await mb.check_balance(client=client)
    await mb.check_balance(client=client)
    assert client.get.call_count == 1


async def test_the_hourly_marker_is_shared_across_processes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(provider_cache, "get_json", AsyncMock(return_value={"at": 1}))
    client = _client({"remaining": 1, "total": 1000})
    await mb.check_balance(client=client)
    client.get.assert_not_called()


async def test_no_key_no_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MANTIKS_API_KEY")
    client = _client({})
    await mb.check_balance(client=client)
    client.get.assert_not_called()


async def test_a_failing_balance_call_never_raises() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    await mb.check_balance(client=client)
    await mb.check_balance(client=_client({}, status=500))


async def test_the_jobs_call_triggers_the_check_and_logs_its_cost(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    check = AsyncMock()
    monkeypatch.setattr(agg.mantiks_balance, "check_balance", check)
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp([{"id": 7, "name": "Decathlon"}]))
    client.post = AsyncMock(return_value=_resp({"jobs": []}))
    with caplog.at_level(logging.INFO):
        await agg.mantiks_jobs("Decathlon", client=client)
    check.assert_awaited_once()
    assert any(r.message.startswith("mantiks companies/jobs cache=miss coût=0.22") for r in caplog.records)
    assert any(r.message == "mantiks companies/search cache=miss coût=0.0" for r in caplog.records)
