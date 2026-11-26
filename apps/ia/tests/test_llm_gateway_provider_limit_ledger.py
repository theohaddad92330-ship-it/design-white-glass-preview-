"""#2440.46 — une limite fournisseur (429 / surcharge) laisse UNE ligne datée dans le registre.

Sans débit : aucune ligne de crédit n'est touchée, le coût vaut 0 (un appel refusé n'a
rien facturé — c'est une mesure, pas un « non mesuré »), et seul un refus de DISPONIBILITÉ
écrit la ligne : une erreur de forme (400) ne dit rien d'une limite.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import anthropic
import httpx
import openai
import pytest

from app.services import claude_service, cost_ledger, llm_gateway

_REQ = httpx.Request("POST", "https://example.invalid/v1")


def _anthropic_status(code: int) -> anthropic.APIStatusError:
    cls = anthropic.RateLimitError if code == 429 else anthropic.APIStatusError
    return cls("x", response=httpx.Response(code, request=_REQ), body=None)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for name in ("LLM_GATEWAY_RETRY_ON_ERROR", "LLM_QUOTA_BREAKER_S", "LLM_GATEWAY_DISABLED"):
        monkeypatch.delenv(name, raising=False)
    llm_gateway.reset_provider_exhausted()
    llm_gateway.reset_degraded_route_streak()
    yield
    llm_gateway.reset_provider_exhausted()
    llm_gateway.reset_degraded_route_streak()


async def _complete_expecting(exc_type):
    with cost_ledger.bind_run("run-1"):
        with pytest.raises(exc_type):
            await llm_gateway.complete("bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5")
        return cost_ledger.snapshot()


@pytest.mark.asyncio
@pytest.mark.parametrize("code", [429, 529])
async def test_anthropic_limit_writes_one_dated_row_without_cost(monkeypatch, code):
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", AsyncMock(side_effect=_anthropic_status(code)))
    rows = await _complete_expecting(anthropic.APIStatusError)
    assert len(rows) == 1
    row = rows[0]
    assert row["provider"] == "anthropic"
    assert row["status"] == "provider_limit"
    assert row["calls"] == 1
    assert row["units"] == 0
    assert row["cost_usd"] == 0.0  # refusé = rien facturé ; jamais un prix inventé


@pytest.mark.asyncio
async def test_openai_rate_limit_is_recorded_under_its_own_provider(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    err = openai.RateLimitError(
        "x", response=httpx.Response(429, request=_REQ), body={"error": {"code": "rate_limit_exceeded"}}
    )
    monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "_invoke", AsyncMock(side_effect=err))
    rows = await _complete_expecting(openai.RateLimitError)
    assert [(r["provider"], r["status"]) for r in rows] == [("openai", "provider_limit")]


@pytest.mark.asyncio
async def test_non_limit_error_writes_no_row(monkeypatch):
    # Savoir dire NON : une erreur de forme (400) n'est pas une limite fournisseur.
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", AsyncMock(side_effect=_anthropic_status(400)))
    assert await _complete_expecting(anthropic.APIStatusError) == []


@pytest.mark.asyncio
async def test_success_writes_no_limit_row(monkeypatch):
    usage = claude_service.TokenUsage(input_tokens=1, output_tokens=1, model="claude-sonnet-5", cost_usd=0.0)
    monkeypatch.setattr(claude_service, "_dispatch_anthropic", AsyncMock(return_value=("ok", usage)))
    with cost_ledger.bind_run("run-1"):
        await llm_gateway.complete("bellum_strategy", "sys", "usr", response_model=None, model="claude-sonnet-5")
        assert all(r.get("status") != "provider_limit" for r in cost_ledger.snapshot())
