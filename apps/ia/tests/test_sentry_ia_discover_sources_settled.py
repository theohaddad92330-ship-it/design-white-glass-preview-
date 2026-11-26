"""BELLUM-IA-E/B/4/H/G — un échec de source déjà géré ne sort pas d'une tâche asyncio
(Sentry capture toute exception non rattrapée d'une tâche) et ne logge pas en error."""

from __future__ import annotations

import asyncio
import logging

import httpx
import pytest

from app.services.data_sources import france_travail, recherche_entreprises
from app.services.data_sources.signal_errors import settled
from app.services.distributed_rate_limiter import RateLimitTimeout


async def _boom(exc: Exception) -> list[dict]:
    raise exc


@pytest.mark.asyncio
async def test_settled_rend_l_exception_sans_la_lever() -> None:
    err = RateLimitTimeout("france_travail", 1.0) if False else ValueError("x")
    assert await settled(_boom(err)) is err


@pytest.mark.asyncio
async def test_settled_laisse_passer_l_annulation() -> None:
    async def _slow() -> None:
        await asyncio.sleep(10)

    task = asyncio.ensure_future(settled(_slow()))
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_aucune_tache_ne_finit_en_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le critère exact de Sentry : la TÂCHE créée par gather ne porte pas l'exception."""
    req = httpx.Request("GET", "https://example.test")
    err = httpx.HTTPStatusError("400", request=req, response=httpx.Response(400, request=req))
    tasks = [asyncio.ensure_future(settled(_boom(err))), asyncio.ensure_future(_noop())]
    await asyncio.gather(*tasks)
    assert all(t.exception() is None for t in tasks)


async def _noop() -> list[dict]:
    return []


@pytest.mark.asyncio
async def test_recherche_entreprises_429_est_un_warning_pas_une_exception_de_tache(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    req = httpx.Request("GET", "https://example.test")
    err = httpx.HTTPStatusError("429", request=req, response=httpx.Response(429, request=req))
    seen: list[asyncio.Task] = []
    real = asyncio.gather

    def _spy(*aws, **kw):  # noqa: ANN002, ANN003
        tasks = [asyncio.ensure_future(a) for a in aws]
        seen.extend(tasks)
        return real(*tasks, **kw)

    async def _fail(*_a, **_k):  # noqa: ANN002, ANN003
        raise err

    monkeypatch.setattr(recherche_entreprises, "_search_page", _fail)
    monkeypatch.setattr(recherche_entreprises.asyncio, "gather", _spy)
    with caplog.at_level(logging.WARNING):
        rows = await recherche_entreprises.search_companies("Acme", client=object())  # type: ignore[arg-type]
    assert rows == []
    assert all(t.exception() is None for t in seen)
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


class _Api400:
    async def post(self, url: str, **_kw: object) -> httpx.Response:
        body = {"access_token": "tok", "expires_in": 1499}
        return httpx.Response(200, request=httpx.Request("POST", url), json=body)

    async def get(self, url: str, **_kw: object) -> httpx.Response:
        return httpx.Response(400, request=httpx.Request("GET", url), json={"message": "Bad Request"})


@pytest.mark.asyncio
async def test_france_travail_400_dit_la_panne_sans_tache_en_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    monkeypatch.setenv("FRANCE_TRAVAIL_RPS", "100")
    france_travail._reset_token_cache_for_tests()
    seen: list[asyncio.Future] = []
    real = asyncio.gather

    def _spy(*aws, **kw):  # noqa: ANN002, ANN003
        tasks = [asyncio.ensure_future(a) for a in aws]
        seen.extend(tasks)
        return real(*tasks, **kw)

    monkeypatch.setattr(france_travail.asyncio, "gather", _spy)
    rows = await france_travail.it_job_signals("Acme", client=_Api400())  # type: ignore[arg-type]
    assert rows == []
    assert seen and all(t.exception() is None for t in seen)
