"""#2528.3 — le pont IA -> API pour l'alerte "source à court de crédits".

No-op strict sans configuration ; une fois par fenêtre PAR SOURCE ; ne lève
jamais (un rapport d'alerte ne doit jamais casser une recherche).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services import backoffice_alerts as ba


@pytest.fixture(autouse=True)
def _reset():
    ba.reset_report_window()
    yield
    ba.reset_report_window()


async def test_noop_without_api_internal_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.setenv("INTERNAL_API_SECRET", "s")
    with patch("httpx.AsyncClient.post", new=AsyncMock()) as post:
        await ba.report_provider_credits_exhausted("BRAVE_API_KEY", "x")
    post.assert_not_called()


async def test_noop_without_internal_api_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)
    with patch("httpx.AsyncClient.post", new=AsyncMock()) as post:
        await ba.report_provider_credits_exhausted("BRAVE_API_KEY", "x")
    post.assert_not_called()


async def test_posts_to_the_internal_endpoint_with_the_secret_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s3cret")
    response = httpx.Response(202, request=httpx.Request("POST", "http://api.internal/x"))
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=response)) as post:
        await ba.report_provider_credits_exhausted("BRAVE_API_KEY", "dégradé pour tous")

    post.assert_awaited_once()
    args, kwargs = post.call_args
    assert args[0] == "http://api.internal/internal/admin/backoffice-alerts/provider-credits-exhausted"
    assert kwargs["headers"] == {"X-Internal-Secret": "s3cret"}
    assert kwargs["json"]["source"] == "BRAVE_API_KEY"
    assert kwargs["json"]["degraded"] == "dégradé pour tous"
    assert "sinceIso" in kwargs["json"]


async def test_second_call_within_the_window_is_a_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cinquante requêtes en 402 dans le même run ne doivent PAS faire
    cinquante appels internes pour un seul et même fait."""
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s")
    response = httpx.Response(202, request=httpx.Request("POST", "http://api.internal/x"))
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=response)) as post:
        await ba.report_provider_credits_exhausted("BRAVE_API_KEY", "x")
        await ba.report_provider_credits_exhausted("BRAVE_API_KEY", "x")
        await ba.report_provider_credits_exhausted("BRAVE_API_KEY", "x")

    post.assert_awaited_once()


async def test_a_different_source_gets_its_own_window(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s")
    response = httpx.Response(202, request=httpx.Request("POST", "http://api.internal/x"))
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=response)) as post:
        await ba.report_provider_credits_exhausted("BRAVE_API_KEY", "x")
        await ba.report_provider_credits_exhausted("PAPPERS_API_KEY", "y")

    assert post.await_count == 2


async def test_network_failure_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s")
    with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=httpx.ConnectError("down"))):
        await ba.report_provider_credits_exhausted("BRAVE_API_KEY", "x")  # must not raise
