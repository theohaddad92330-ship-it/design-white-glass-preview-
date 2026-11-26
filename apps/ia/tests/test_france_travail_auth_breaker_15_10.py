"""R17 15/10 (#3901) — « accès refusé — clé invalide ou expirée » : une source en 401/403
répété est mise hors circuit, pas rappelée à chaque carte (chaque appel refaisait le POST OAuth)."""

from __future__ import annotations

import httpx
import pytest

from app.services import rate_limiter
from app.services.data_sources import france_travail as ft


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    monkeypatch.setenv("FRANCE_TRAVAIL_RPS", "100")
    rate_limiter._reset_cache_for_tests()
    ft._reset_token_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()
    ft._reset_token_cache_for_tests()


class _Denied:
    def __init__(self, status: int) -> None:
        self.status = status
        self.posts = 0

    async def post(self, url: str, **_kw: object) -> httpx.Response:
        self.posts += 1
        return httpx.Response(self.status, request=httpx.Request("POST", url), json={"error": "invalid_client"})


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 403])
async def test_oauth_refused_is_not_retried_on_every_call(status: int) -> None:
    http = _Denied(status)
    for _ in range(5):
        assert await ft._token(http, "id", "secret") is None  # type: ignore[arg-type]
    assert http.posts == 1


@pytest.mark.asyncio
async def test_breaker_reopens_after_pause() -> None:
    http = _Denied(403)
    await ft._token(http, "id", "secret")  # type: ignore[arg-type]
    ft._auth_denied_until = 0.0
    await ft._token(http, "id", "secret")  # type: ignore[arg-type]
    assert http.posts == 2


@pytest.mark.asyncio
async def test_server_error_does_not_trip_breaker() -> None:
    http = _Denied(500)
    for _ in range(3):
        await ft._token(http, "id", "secret")  # type: ignore[arg-type]
    assert http.posts == 3
