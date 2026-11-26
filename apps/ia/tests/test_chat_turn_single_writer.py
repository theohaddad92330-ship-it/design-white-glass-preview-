"""#3367 (V01, 01/10) — UN SEUL écrivain par tour de chat.

Recette prod 01/10 : la liste des fils affichait 3 lignes pour un seul fil, les
questions suivantes en « En attente » sans `conversation_id`. Cause : l'app web
écrit déjà chaque message sous la clé de fil (`POST /ia/chat/messages`), ET ce
service réécrivait le même tour dans `chat_messages` SANS clé de fil — chaque
question devenait un faux « fil » d'une ligne (`COALESCE(conversation_id, id)`).
Quand le tour porte une clé de fil, c'est le client qui persiste ; ce service
n'écrit plus (le chemin sans clé, ancien, reste inchangé).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


class _Throttle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _Stream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for chunk in ["Bon", "jour !"]:
            yield type("Ev", (), {"type": "text", "text": chunk})()

    async def get_final_message(self):
        return self._response


class _Client:
    def __init__(self, response):
        outer = response

        class _Messages:
            def stream(self, **_kw):
                return _Stream(outer)

        self.messages = _Messages()


def _post(client: TestClient, body: dict) -> AsyncMock:
    import anthropic

    from app.services import chat_orchestrator

    block = type("Blk", (), {"type": "text", "text": "Bonjour !"})()
    response = type("Resp", (), {"stop_reason": "end_turn", "content": [block], "usage": None})()
    save_turn = AsyncMock()
    with (
        patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}),
        patch.object(chat_orchestrator, "throttle", lambda _p: _Throttle()),
        patch.object(anthropic, "AsyncAnthropic", lambda **_kw: _Client(response)),
        patch("app.services.conversation_service.save_turn", save_turn),
        patch("app.services.conversation_service.load_recent_history", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post("/chat/message", json=body)
    assert res.status_code == 200
    return save_turn


def test_a_turn_with_a_thread_key_is_not_rewritten_without_one(client: TestClient) -> None:
    save_turn = _post(
        client,
        {"message": "Bonjour", "user_id": "u1", "workspace_id": "w1", "conversation_id": "c-1"},
    )
    save_turn.assert_not_awaited()


def test_a_legacy_turn_without_a_thread_key_is_still_written(client: TestClient) -> None:
    save_turn = _post(client, {"message": "Bonjour", "user_id": "u1", "workspace_id": "w1"})
    assert save_turn.await_count == 2
