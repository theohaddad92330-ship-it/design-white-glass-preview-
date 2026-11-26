"""#3227 (recette prod 01/10) — « Prends La Poste comme racine du groupe » : le TOUR rejoué
(modèle simulé → vrai outil ``note_thread_context`` → routeur ``/chat/message``).
L'appel n'était observable nulle part depuis l'écran : il l'est maintenant par
``context.thread_scope`` (racine, filiales incluses/exclues), lu par « Ce qui a servi à
cette réponse » → « Périmètre de recherche ».

Question exacte à poser en recette : « Cherche les entreprises du portefeuille dans
l'informatique en Île-de-France », puis « Prends La Poste comme racine du groupe » →
ouvrir « Ce qui a servi à cette réponse » : « Périmètre de recherche » doit nommer
La Poste comme racine du groupe.
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

import json

from fastapi.testclient import TestClient

ROOT_ID = "22222222-2222-4222-8222-222222222222"


def _parse_sse(text: str) -> list[dict]:
    events: list[dict] = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if block.startswith("data:"):
            events.append(json.loads(block[len("data:") :].strip()))
    return events


def _post(client: TestClient, monkeypatch, note: dict, message: str) -> dict:
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("note_thread_context", note, "t1")]),
            _resp("end_turn", [_text("La Poste est désormais la racine du groupe.")]),
        ],
    )
    res = client.post("/chat/message", json={"message": message, "user_id": USER})
    assert res.status_code == 200
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    return done["data"]


def test_the_group_root_note_is_observable_from_the_turn_context(monkeypatch, client: TestClient) -> None:
    data = _post(
        client,
        monkeypatch,
        {
            "group_scope_root": {"id": ROOT_ID, "label": "La Poste"},
            "group_scope_includes": [{"id": "33333333-3333-4333-8333-333333333333", "label": "Docaposte"}],
            "group_scope_excludes": [{"id": "44444444-4444-4444-8444-444444444444", "label": "Geopost"}],
        },
        "Prends La Poste comme racine du groupe.",
    )

    scope = data["context"]["thread_scope"]
    assert scope == {"root": "La Poste", "included": ["Docaposte"], "excluded": ["Geopost"], "unresolved": []}
    # L'état complet, lui, repart vers l'API (jamais vers le navigateur) : l'id y est.
    assert data["thread_state"]["persistent_scope"]["root_entity"]["id"] == ROOT_ID


def test_without_a_scope_note_the_context_has_no_thread_scope(monkeypatch, client: TestClient) -> None:
    _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour.")])])
    res = client.post("/chat/message", json={"message": "Bonjour", "user_id": USER})

    context = _parse_sse(res.text)[-1]["data"]["context"]
    assert "thread_scope" not in context
