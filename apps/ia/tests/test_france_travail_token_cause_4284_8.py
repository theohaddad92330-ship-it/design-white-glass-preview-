"""#4284.8 (#3901.15) — le bandeau « accès refusé — clé invalide ou expirée » ne se dit QUE d'un refus.

`list_hiring_companies` levait `unauthorized` dès que le jeton OAuth manquait, quelle que soit la cause :
un 429 (rafale, quota), un 5xx ou un délai s'affichaient « clé invalide ou expirée » — un faux diagnostic
qui envoie le commercial chez l'administrateur pour une panne passagère. La cause réelle voyage.
"""

from __future__ import annotations

import httpx
import pytest

from app.services import rate_limiter
from app.services.company_filters import DegradeReason
from app.services.data_sources import france_travail as ft
from app.services.data_sources.signal_errors import SignalSourceUnavailable


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


class _Answering:
    def __init__(self, status: int) -> None:
        self.status = status

    async def post(self, url: str, **_kw: object) -> httpx.Response:
        return httpx.Response(self.status, request=httpx.Request("POST", url), json={})

    async def get(self, url: str, **_kw: object) -> httpx.Response:  # pragma: no cover - jamais atteint
        raise AssertionError("pas de recherche sans jeton")


async def _reason(status: int) -> str:
    with pytest.raises(SignalSourceUnavailable) as caught:
        await ft.list_hiring_companies("69", [], 30, 20, client=_Answering(status))  # type: ignore[arg-type]
    return caught.value.reason


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 403])
async def test_a_refusal_is_still_said_unauthorized(status: int) -> None:
    assert await _reason(status) == DegradeReason.UNAUTHORIZED


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "expected"),
    [(429, DegradeReason.RATE_LIMITED), (500, DegradeReason.UPSTREAM_ERROR), (503, DegradeReason.UPSTREAM_ERROR)],
)
async def test_an_outage_is_not_called_a_refusal(status: int, expected: str) -> None:
    assert await _reason(status) == expected


@pytest.mark.asyncio
async def test_the_cause_does_not_leak_to_the_next_call() -> None:
    assert await _reason(500) == DegradeReason.UPSTREAM_ERROR
    assert await _reason(403) == DegradeReason.UNAUTHORIZED
