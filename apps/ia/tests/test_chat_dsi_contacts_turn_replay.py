"""#3229 (recette prod 01/10) — « Donne-moi les contacts DSI » sur un compte : le TOUR entier,
routeur ``/chat/message`` compris, rejoué (modèle simulé → vrai outil
``search_workspace_contacts`` → pont simulé). Prouve que « Périmètre de recherche »
(``context.coverage_report``) voyage jusqu'à l'événement ``done`` quand la liste est
tronquée (10 lues sur 37) — le cas de la recette, où seul « détecté » est posé.

Question exacte à poser en recette : sur un compte, « Donne-moi les contacts DSI »,
puis ouvrir « Ce qui a servi à cette réponse » → « Périmètre de recherche » doit
afficher « 37 détectés » (et aucune ligne « 0 »).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator

USER = "11111111-1111-4111-8111-111111111111"


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _FakeMessageStream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in getattr(self._response, "content", None) or []:
            if getattr(block, "type", None) == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)

    def stream(self, **_kwargs):
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(
        input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install_client(monkeypatch, responses) -> None:
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


import json

from fastapi.testclient import TestClient

ACCOUNT = "0125b778-0000-4000-8000-000000000000"


def _parse_sse(text: str) -> list[dict]:
    events: list[dict] = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if block.startswith("data:"):
            events.append(json.loads(block[len("data:") :].strip()))
    return events


def _truncated_dsi_result() -> dict:
    rows = [
        {"contact_id": f"c{i}", "decision_role": "technical", "has_email": True, "has_network_profile": False}
        for i in range(10)
    ]
    return {"total": 37, "truncated": True, "contacts": rows}


def test_the_dsi_contacts_turn_carries_the_search_perimeter_to_the_done_event(monkeypatch, client: TestClient) -> None:
    from app.services import bellum_api

    asked: list[dict] = []

    async def _workspace_contacts(*_a, **kw):
        asked.append(kw)
        return _truncated_dsi_result()

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "workspace_contacts", _workspace_contacts)
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("search_workspace_contacts", {"role": "technical", "limit": 10}, "t1")]),
            _resp("end_turn", [_text("10 premiers contacts DSI lus, 37 au total.")]),
        ],
    )

    res = client.post(
        "/chat/message",
        json={"message": "Donne-moi les contacts DSI", "user_id": USER, "account_id": ACCOUNT},
    )

    assert res.status_code == 200
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    assert asked, "l'outil réel n'a pas appelé le pont"
    report = done["data"]["context"]["coverage_report"]
    assert report["detected"] == 37
    # Liste tronquée : aucun palier extrapolé de l'échantillon — non mesuré, jamais 0.
    assert report["resolved"] is None and report["relevant"] is None and report["enriched"] is None
