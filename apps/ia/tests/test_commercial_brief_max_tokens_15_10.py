"""Brief commercial : plafond de sortie 16 000 + UNE reprise si la sortie est tronquée.

Prouvé en prod (journaux Railway 13-15/10/2026) : 6 appels ``POST /commercial-brief``
finissent en 502 — « 8000 tokens de sortie jetés » puis « sortie sans objet JSON
lisible ». 0 compte sur 79 avait un brief.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.prompts.bellum_commercial_brief import build_system_prompt

_PATCH = "app.routers.commercial_brief.call_claude"


def _usage(out: int) -> SimpleNamespace:
    return SimpleNamespace(input_tokens=100, output_tokens=out, cost_usd=0.1)


def test_the_router_passes_a_16000_token_ceiling(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from tests.test_commercial_brief import _brief, _payload

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    with patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps(_brief()), _usage(500))) as claude:
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 200, res.text
    assert claude.await_count == 1
    assert claude.await_args.kwargs["max_tokens"] == 16_000


def test_a_truncated_output_is_retried_once_with_a_doubled_ceiling(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tests.test_commercial_brief import _brief, _payload

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    truncated = ('{"account_name": "x", "kpis": [', _usage(16_000))
    complete = (json.dumps(_brief()), _usage(9_000))
    with patch(_PATCH, new_callable=AsyncMock, side_effect=[truncated, complete]) as claude:
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 200, res.text
    assert [c.kwargs["max_tokens"] for c in claude.await_args_list] == [16_000, 32_000]


def test_a_second_truncation_still_fails_502_without_a_third_call(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tests.test_commercial_brief import _payload

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    cut = ('{"kpis": [', _usage(16_000))
    cut2 = ('{"kpis": [', _usage(32_000))
    with patch(_PATCH, new_callable=AsyncMock, side_effect=[cut, cut2]) as claude:
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 502
    assert claude.await_count == 2


def test_unparseable_output_that_is_not_a_truncation_is_not_retried(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from tests.test_commercial_brief import _payload

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    with patch(_PATCH, new_callable=AsyncMock, return_value=("pas de json", _usage(40))) as claude:
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 502
    assert claude.await_count == 1


def test_the_prompt_asks_for_concision() -> None:
    assert "CONCISION" in build_system_prompt()
