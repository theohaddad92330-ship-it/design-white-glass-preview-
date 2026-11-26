"""SIGNAUX-OPTI (16/10) point 1 — disjoncteur 401/403 partagé (Redis).

ALERTES-402 (30/10/2026) — le 402 (crédits à sec) l'ouvre aussi : réessayer avant qu'un humain
recharge ne rend jamais autre chose. Une cadence (429), elle, passe toute seule."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import httpx
import pytest

from app.services import source_silence
from app.services.data_sources import job_aggregators as agg


@pytest.fixture
def redis():
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    with patch.object(source_silence, "_redis", AsyncMock(return_value=fake)):
        with patch.object(source_silence.backoffice_alerts, "report_provider_silent", AsyncMock()):
            yield fake


async def _refuse(n: int, status: int = 403) -> None:
    for _ in range(n):
        await source_silence.record_outcome("jooble", ok=False, reason=f"HTTP {status}", status=status)


async def test_four_refusals_keep_the_source_open(redis) -> None:
    await _refuse(4)
    assert await source_silence.skip_auth_refused("jooble") is False


async def test_five_refusals_skip_with_one_probe_per_hour(redis, caplog) -> None:
    await _refuse(5)
    with caplog.at_level("INFO"):
        first = await source_silence.skip_auth_refused("jooble")  # la sonde de l'heure
        second = await source_silence.skip_auth_refused("jooble")
        third = await source_silence.skip_auth_refused("jooble")
    assert (first, second, third) == (False, True, True)
    assert "source_skipped" in caplog.text and "reason=auth_refused" in caplog.text


async def test_success_resets_the_counter(redis) -> None:
    await _refuse(5)
    await source_silence.record_outcome("jooble", ok=True)
    assert await source_silence.skip_auth_refused("jooble") is False
    assert await source_silence.skip_auth_refused("jooble") is False


async def test_non_auth_error_is_not_counted_as_refusal(redis) -> None:
    await _refuse(4)
    await source_silence.record_outcome("jooble", ok=False, reason="HTTP 500", status=500)
    await _refuse(1)
    assert await source_silence.skip_auth_refused("jooble") is False


async def test_without_redis_nothing_is_skipped() -> None:
    with patch.object(source_silence, "_redis", AsyncMock(return_value=None)):
        await _refuse(9)
        assert await source_silence.skip_auth_refused("jooble") is False


async def test_request_skips_the_network_when_open(redis) -> None:
    await _refuse(5)
    await source_silence.skip_auth_refused("jooble")  # consomme la sonde
    calls = 0

    async def send(_http):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={})

    class Gate:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *a):
            return False

    out = await agg._request("jooble", "ACME", httpx.AsyncClient(), send, lambda: Gate())
    assert out is None and calls == 0


async def test_le_402_ouvre_le_disjoncteur(redis) -> None:
    """ALERTES-402 — cinq 402 d'affilée : la source est sautée, une sonde par heure exceptée."""
    with patch.object(source_silence.backoffice_alerts, "report_provider_credits_exhausted", AsyncMock()):
        await _refuse(5, status=402)
    assert await source_silence.skip_auth_refused("jooble") is False  # la sonde
    assert await source_silence.skip_auth_refused("jooble") is True


async def test_le_429_ne_ferme_jamais_la_source(redis) -> None:
    """Une cadence refusée n'est pas un refus de servir : le disjoncteur reste ouvert au trafic."""
    await _refuse(9, status=429)
    assert await source_silence.skip_auth_refused("jooble") is False


async def test_un_429_pose_un_refroidissement_partage(redis) -> None:
    """ALERTES-402 point 2 — le 429 pose une clé Redis que les AUTRES répliques voient : plus aucun
    appel réseau tant qu'elle court, alors que `back_off_provider` ne tenait que ce processus."""
    calls = 0

    async def send(_http):
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"Retry-After": "2"}, json={})

    class Gate:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *a):
            return False

    out = await agg._request("mantiks", "ACME", httpx.AsyncClient(), send, lambda: Gate())
    assert out is None and calls == 1
    assert await source_silence.in_cooldown("mantiks") is True

    # Le second appel ne part PAS : c'est tout l'objet du refroidissement partagé.
    out = await agg._request("mantiks", "ACME", httpx.AsyncClient(), send, lambda: Gate())
    assert out is None and calls == 1


async def test_sans_redis_le_refroidissement_ne_bloque_rien(redis) -> None:
    with patch.object(source_silence, "_redis", AsyncMock(return_value=None)):
        assert await source_silence.in_cooldown("mantiks") is False
        await source_silence.start_cooldown("mantiks", 30)  # ne lève pas
