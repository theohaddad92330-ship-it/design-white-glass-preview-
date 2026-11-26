"""SIGNAUX-OPTI (16/10) points 2-5 — message d'erreur jamais vide, timeouts, ATS DNS, coupure APEC partagée."""

from __future__ import annotations

import socket
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import httpx
import pytest

from app.services import source_health
from app.services.data_sources import apec, ats_boards_more, decp, tech_detect


def _degradations(cid: str):
    return source_health.get_degradations(cid)


# ── point 2 : reason jamais vide ─────────────────────────────────────────────
def test_error_reason_falls_back_to_the_type_name() -> None:
    assert source_health.error_reason(httpx.ReadTimeout("")) == "ReadTimeout"
    assert source_health.error_reason(ValueError("boom")) == "boom"


async def test_tech_detect_timeout_reason_is_not_empty() -> None:
    class Boom:
        async def get(self, *a, **k):
            raise httpx.ReadTimeout("")

    with patch.object(tech_detect, "get_correlation_id", return_value="cid-td"):
        out = await tech_detect.detect_stack.__wrapped__("https://acme.example", client=Boom())  # type: ignore[attr-defined]
    assert out == []
    assert _degradations("cid-td") == [{"source": "tech_detect", "reason": "ReadTimeout"}]


# ── point 3 : timeouts ───────────────────────────────────────────────────────
def test_free_sources_timeouts_raised() -> None:
    assert decp._TIMEOUT_S == 20.0
    assert tech_detect._TIMEOUT_S == 15.0


# ── point 4 : DNS = pas de compte ────────────────────────────────────────────
def _dns_error() -> httpx.ConnectError:
    err = httpx.ConnectError("[Errno -2] Name or service not known")
    err.__cause__ = socket.gaierror(-2, "Name or service not known")
    return err


async def test_ats_dns_failure_is_absent_without_degradation() -> None:
    class Dns:
        async def get(self, *a, **k):
            raise _dns_error()

    with patch.object(ats_boards_more, "get_correlation_id", return_value="cid-dns"):
        status, body = await ats_boards_more._fetch(Dns(), "https://ghost.example/x", "ats_more")  # type: ignore[arg-type]
    assert (status, body) == ("absent", None)
    assert _degradations("cid-dns") == []


async def test_ats_other_connect_error_still_degrades_with_a_reason() -> None:
    class Down:
        async def get(self, *a, **k):
            raise httpx.ConnectTimeout("")

    with patch.object(ats_boards_more, "get_correlation_id", return_value="cid-ct"):
        await ats_boards_more._fetch(Down(), "https://x.example/x", "ats_more")  # type: ignore[arg-type]
    assert _degradations("cid-ct") == [{"source": "ats_more", "reason": "ConnectTimeout"}]


# ── point 5 : coupure APEC partagée via Redis ────────────────────────────────
def _ddg() -> httpx.Response:
    return httpx.Response(403, headers={"x-datadome": "protected"})


async def test_apec_pause_is_shared_through_redis() -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    with patch.object(apec, "_redis", AsyncMock(return_value=fake)):
        assert await apec._note_antibot(_ddg()) is True
        assert 0 < await fake.ttl(apec._ANTIBOT_KEY) <= 6 * 3600
        apec._reset_antibot_for_tests()  # une AUTRE réplique : mémoire vierge
        assert await apec._antibot_paused() is True


async def test_apec_pause_falls_back_to_process_without_redis() -> None:
    with patch.object(apec, "_redis", AsyncMock(return_value=None)):
        assert await apec._antibot_paused() is False
        await apec._note_antibot(_ddg())
        assert await apec._antibot_paused() is True
