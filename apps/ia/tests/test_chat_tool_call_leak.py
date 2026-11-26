"""#3218 (recette prod 02/10) — ``{{functions.offer_reply_options(...)}}`` dans le texte
d'un message de Laura. Rejeu du tour : le modèle recopie l'appel d'outil comme du
texte, coupé EN PLEIN MILIEU par le flux ; ni un delta, ni leur concaténation, ni
le ``reply`` terminal ne le portent."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

LEAK = '{{functions.offer_reply_options({"question":"Quel canal ?","options":["E-mail","LinkedIn"]})}}'
FULL = f"Je prépare le message. {LEAK}"


def _parse_sse(text: str) -> list[dict]:
    return [json.loads(b.strip()[5:].strip()) for b in text.strip().split("\n\n") if b.strip().startswith("data:")]


def test_a_tool_call_recopied_as_text_never_reaches_the_wire(client: TestClient) -> None:
    from app.services import chat_orchestrator

    cut = FULL.index("functions") + 4
    chunks = [FULL[:cut], FULL[cut:]]

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
            for chunk in chunks:
                yield type("Ev", (), {"type": "text", "text": chunk})()

        async def get_final_message(self):
            return self._response

    class _Messages:
        def __init__(self, response):
            self._response = response

        def stream(self, **_kw):
            return _Stream(self._response)

    class _Client:
        def __init__(self, response):
            self.messages = _Messages(response)

    import anthropic

    block = type("Blk", (), {"type": "text", "text": FULL})()
    response = type("Resp", (), {"stop_reason": "end_turn", "content": [block], "usage": None})()

    with (
        patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}),
        patch.object(chat_orchestrator, "throttle", lambda _p: _Throttle()),
        patch.object(anthropic, "AsyncAnthropic", lambda **_kw: _Client(response)),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch("app.services.conversation_service.load_recent_history", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post("/chat/message", json={"message": "Prépare un message", "user_id": "u1"})

    events = _parse_sse(res.text)
    terminal = events[-1]
    assert terminal["type"] == "done" and terminal["success"] is True
    streamed = "".join(e["text"] for e in events if e["type"] == "delta")
    assert "Je prépare le message." in streamed
    for surface in (streamed, terminal["data"]["reply"]):
        assert "functions." not in surface and "{{" not in surface
