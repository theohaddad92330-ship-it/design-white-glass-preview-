"""16/10/2026 — brief commercial : clé obligatoire omise, troncature nommée, erreurs lisibles.

Prod (DECATHLON FRANCE) : ``Brief commercial hors contrat (schema) : (racine)`` puis 502,
0,18 $ payés pour rien. Une erreur à la racine = ``required`` : le journal doit nommer le
message, et une section absente-mais-vidable reste vide (jamais inventée).
"""

from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.test_commercial_brief import _brief, _payload

_PATCH = "app.routers.commercial_brief.call_claude"
_EMPTYABLE = ("kpis", "charts", "prices", "esn", "people", "sections")
_NOT_EMPTYABLE = ("what_i_know", "guardrails", "headquarters")


def _usage(out: int, stop: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(input_tokens=100, output_tokens=out, cost_usd=0.1, stop_reason=stop)


@pytest.mark.parametrize("key", _EMPTYABLE)
def test_an_omitted_emptyable_key_is_completed_with_an_empty_array(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, key: str
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    brief = _brief()
    del brief[key]
    with patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps(brief), _usage(500))):
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 200, res.text
    assert res.json()["data"]["brief"][key] == []


@pytest.mark.parametrize("key", _NOT_EMPTYABLE)
def test_an_omitted_key_that_cannot_be_empty_stays_a_502(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, key: str
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    brief = _brief()
    del brief[key]
    with patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps(brief), _usage(500))):
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 502


def test_the_off_contract_log_names_the_validator_and_message_not_free_values(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    brief = _brief()
    del brief["what_i_know"]
    with caplog.at_level(logging.WARNING), patch(
        _PATCH, new_callable=AsyncMock, return_value=(json.dumps(brief), _usage(500))
    ):
        client.post("/commercial-brief", json=_payload())
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "required" in text
    assert "what_i_know" in text


def test_a_stop_reason_max_tokens_is_logged_as_truncation_not_off_contract(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    brief = _brief()
    del brief["guardrails"]
    cut = (json.dumps(brief), _usage(32_000, "max_tokens"))
    with caplog.at_level(logging.WARNING), patch(_PATCH, new_callable=AsyncMock, return_value=cut):
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 502
    assert any("tronqu" in r.getMessage() for r in caplog.records)


def test_a_stop_reason_max_tokens_triggers_the_single_retry_even_below_the_ceiling(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    bad = _brief()
    del bad["guardrails"]
    first = (json.dumps(bad), _usage(11_000, "max_tokens"))
    second = (json.dumps(_brief()), _usage(12_000, "end_turn"))
    with patch(_PATCH, new_callable=AsyncMock, side_effect=[first, second]) as claude:
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 200, res.text
    assert claude.await_count == 2
