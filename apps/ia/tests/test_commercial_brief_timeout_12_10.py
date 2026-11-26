"""Brief commercial : le timeout de l'appel modèle couvre une sortie de 8 000 tokens.

Prouvé en prod le 12/10/2026 : ``_call_text`` créait son client Anthropic avec
``timeout=60.0`` ; le brief (sortie longue, 2-3 min) était coupé à 60 s
pile (502 ``commercial_brief_failed``, latencyMs ≈ 60 100) sur TOUTES les analyses.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.claude_service import call_claude

_PATCH = "app.routers.commercial_brief.call_claude"


def _text_response() -> MagicMock:
    block = MagicMock(type="text")
    block.text = "ok"
    response = MagicMock()
    response.content = [block]
    response.stop_reason = "end_turn"
    response.usage.input_tokens = 10
    response.usage.output_tokens = 5
    return response


def _client_mock() -> MagicMock:
    client = MagicMock()
    client.messages.create = AsyncMock(return_value=_text_response())
    return client


@pytest.mark.asyncio
async def test_text_call_without_timeout_keeps_60_seconds() -> None:
    with patch("anthropic.AsyncAnthropic", return_value=_client_mock()) as ctor:
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude("sys", "usr", prompt_name="t")
    assert ctor.call_args.kwargs["timeout"] == 60.0


@pytest.mark.asyncio
async def test_text_call_with_timeout_reaches_the_sdk_client() -> None:
    with patch("anthropic.AsyncAnthropic", return_value=_client_mock()) as ctor:
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude("sys", "usr", prompt_name="t", timeout=300.0)
    assert ctor.call_args.kwargs["timeout"] == 300.0


def test_the_brief_asks_the_model_with_at_least_300_seconds(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tests.test_commercial_brief import _brief, _payload

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    with patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps(_brief()), None)) as claude:
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 200, res.text
    assert claude.await_args.kwargs["timeout"] >= 300.0
