"""#3495 — un fournisseur routé À COURT DE CRÉDIT ne met plus Laura en panne.

Incident prod du 01/10/2026 : OpenAI répondait ``429 insufficient_quota`` à
chaque appel, ``/chat`` affichait « Réponse indisponible » et la phase 1 rendait
502. Ces tests savent dire NON : un 429 de DÉBIT (rate limit ordinaire) garde le
comportement d'avant, à l'octet.
"""

from __future__ import annotations

import logging
import time
from unittest.mock import AsyncMock

import httpx
import openai
import pytest

from app.services import claude_service, llm_gateway


def _rate_limit(code: str | None, message: str = "x") -> openai.RateLimitError:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(429, request=request)
    body = {"error": {"code": code, "message": message}} if code is not None else None
    return openai.RateLimitError(message, response=response, body=body)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for name in ("LLM_GATEWAY_RETRY_ON_ERROR", "LLM_QUOTA_BREAKER_S", "LLM_GATEWAY_DISABLED"):
        monkeypatch.delenv(name, raising=False)
    llm_gateway.reset_provider_exhausted()
    llm_gateway.reset_degraded_route_streak()
    yield
    llm_gateway.reset_provider_exhausted()
    llm_gateway.reset_degraded_route_streak()


@pytest.mark.parametrize("code", ["insufficient_quota", "credit_balance_exhausted"])
def test_quota_codes_are_exhaustion(code):
    assert llm_gateway.is_quota_exhausted(_rate_limit(code))


def test_message_without_code_is_exhaustion():
    assert llm_gateway.is_quota_exhausted(_rate_limit(None, "You have no credits remaining on this account"))


def test_ordinary_rate_limit_is_not_exhaustion():
    assert not llm_gateway.is_quota_exhausted(_rate_limit("rate_limit_exceeded", "Rate limit reached"))
    assert not llm_gateway.is_quota_exhausted(ValueError("insufficient_quota"))


def test_breaker_is_bounded(monkeypatch):
    monkeypatch.setenv("LLM_QUOTA_BREAKER_S", "30")
    llm_gateway.mark_provider_exhausted("openai")
    assert llm_gateway.is_provider_exhausted("openai")
    assert not llm_gateway.is_provider_exhausted("anthropic")
    real = time.monotonic()
    monkeypatch.setattr(time, "monotonic", lambda: real + 31)
    assert not llm_gateway.is_provider_exhausted("openai")


def test_exhausted_provider_is_skipped_by_dispatch(monkeypatch, caplog):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    llm_gateway.mark_provider_exhausted("openai")
    provider, model = llm_gateway.resolve_dispatch("bellum_strategy", "claude-sonnet-5")
    assert provider is llm_gateway.ANTHROPIC_PROVIDER
    assert model == "claude-sonnet-5"  # le modèle suit son fournisseur


@pytest.mark.asyncio
async def test_quota_exhausted_falls_back_to_anthropic_without_retry(monkeypatch, caplog):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    invoke = AsyncMock(side_effect=_rate_limit("insufficient_quota"))
    monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", invoke)
    usage = claude_service.TokenUsage(input_tokens=1, output_tokens=1, model="claude-sonnet-5", cost_usd=0.0)
    dispatch = AsyncMock(return_value=("anthropic-out", usage))
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)

    with caplog.at_level("WARNING", logger="app.services.llm_gateway"):
        out, _ = await llm_gateway.complete("bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5")
    assert out == "anthropic-out"
    assert invoke.await_count == 1  # le fournisseur épuisé n'est jamais réessayé
    assert llm_gateway.is_provider_exhausted("openai")
    alerts = [r for r in caplog.records if r.levelno >= logging.ERROR and "llm_provider_quota_exhausted" in r.getMessage()]
    assert len(alerts) == 1

    # Disjoncteur : le tour suivant ne touche même plus le fournisseur épuisé.
    out2, _ = await llm_gateway.complete("bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5")
    assert out2 == "anthropic-out"
    assert invoke.await_count == 1


@pytest.mark.asyncio
async def test_ordinary_rate_limit_keeps_current_behaviour(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    monkeypatch.setattr(
        llm_gateway.OPENAI_PROVIDER, "_invoke", AsyncMock(side_effect=_rate_limit("rate_limit_exceeded"))
    )
    dispatch = AsyncMock(side_effect=AssertionError("Anthropic ne doit pas être appelé sur un 429 de débit"))
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", dispatch)

    with pytest.raises(openai.RateLimitError):
        await llm_gateway.complete("bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5")
    dispatch.assert_not_called()
    assert not llm_gateway.is_provider_exhausted("openai")
