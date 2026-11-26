"""#4406.5 — Laura LIT une conversation Beeper de L'UTILISATEUR pour préparer une réponse.

Décision Louis du 21/10/2026 : l'exception c96 (Laura lit le corps de la boîte de l'utilisateur)
COUVRE les conversations Beeper. Ce que ces tests tiennent :

1. **Ses propres conversations seulement** : le pont ne reçoit que l'identifiant du tour.
2. **Un outil qui ne peut pas lire le DIT** : non branché, injoignable → nommé, jamais « vide ».
3. **Le corps ne va jamais à un autre humain** : ni table de rejeu, ni sources citées.
4. **Borné** et **jamais un envoi** : l'outil n'a aucun chemin d'envoi.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.chat_tools import READ_BEEPER_CONVERSATION_TOOL, tools_for

_BODY = "Le comité d'achat est avancé à lundi : budget validé à 120 k€."


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


def _chat(messages: list[dict[str, object]] | None = None) -> dict[str, object]:
    return {
        "state": "connected",
        "chatId": "c1",
        "messages": messages
        or [
            {"id": "m1", "senderName": "Vous", "isSender": True, "timestamp": "2026-10-20T09:00:00Z", "text": "Bonjour"},
            {"id": "m2", "senderName": "Nadia Perrin", "isSender": False, "timestamp": "2026-10-21T09:00:00Z", "text": _BODY},
        ],
    }


def test_tool_is_registered_read_only_and_never_takes_a_user_identifier() -> None:
    assert READ_BEEPER_CONVERSATION_TOOL["name"] == "read_beeper_conversation"
    assert "read_beeper_conversation" in {t["name"] for t in tools_for([])}
    props = READ_BEEPER_CONVERSATION_TOOL["input_schema"]["properties"]  # type: ignore[index]
    assert "user_id" not in props and "userId" not in props
    assert "text" not in props, "l'outil lit ; il n'a aucun champ d'envoi"
    assert "envoie jamais" in str(READ_BEEPER_CONVERSATION_TOOL["description"])
    from app.access.rights_matrix import READ_ONLY_TOOLS

    assert "read_beeper_conversation" in READ_ONLY_TOOLS


@pytest.mark.asyncio
async def test_unconfigured_bridge_says_so() -> None:
    result = await chat_tools.execute_chat_tool("read_beeper_conversation", {}, user_id="u1", profile_data=None)
    assert "error" in result and "Beeper" in result["error"]


@pytest.mark.asyncio
async def test_lists_then_reads_only_the_authenticated_users_conversations(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: list[tuple[str, object]] = []

    async def fake_list(user_id: str) -> dict[str, object]:
        seen.append(("list", user_id))
        return {
            "state": "connected",
            "conversations": [
                {
                    "chatId": "c1",
                    "network": "WhatsApp",
                    "title": "Nadia Perrin",
                    "type": "single",
                    "unreadCount": 1,
                    "lastActivity": "2026-10-21T09:00:00Z",
                    "participants": [{"id": "u2", "fullName": "Nadia Perrin", "phoneNumber": "+33 6 39 98 41 27", "email": None, "username": None, "isSelf": False}],
                    "contact": {"contactId": "k1", "fullName": "Nadia Perrin", "accountId": "a1", "matchedOn": "phone"},
                }
            ],
        }

    async def fake_read(user_id: str, *, chat_id: str) -> dict[str, object]:
        seen.append(("read", (user_id, chat_id)))
        return _chat()

    monkeypatch.setattr(bellum_api, "list_beeper_conversations", fake_list)
    monkeypatch.setattr(bellum_api, "read_beeper_chat", fake_read)
    listing = await chat_tools.execute_chat_tool(
        "read_beeper_conversation", {"user_id": "collegue"}, user_id="u1", profile_data=None
    )
    assert listing["conversations"][0]["network"] == "WhatsApp"
    # Coordonnées pro en clair (c87).
    assert listing["conversations"][0]["participants"][0]["phone"] == "+33 6 39 98 41 27"
    chat = await chat_tools.execute_chat_tool(
        "read_beeper_conversation", {"chat_id": "c1", "userId": "collegue"}, user_id="u1", profile_data=None
    )
    assert seen == [("list", "u1"), ("read", ("u1", "c1"))]
    assert chat["messages"][-1]["text"] == _BODY
    assert chat["messages"][-1]["direction"] == "inbound"


@pytest.mark.asyncio
async def test_unreachable_and_disconnected_are_named_never_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def unreachable(*_a: object, **_k: object) -> dict[str, object]:
        return {"state": "unreachable", "reason": "Beeper Desktop ne répond pas (application fermée ou tunnel coupé)."}

    async def disconnected(*_a: object, **_k: object) -> dict[str, object]:
        return {"state": "disconnected"}

    monkeypatch.setattr(bellum_api, "read_beeper_chat", unreachable)
    result = await chat_tools.execute_chat_tool("read_beeper_conversation", {"chat_id": "c1"}, user_id="u1", profile_data=None)
    assert "error" in result and "tunnel" in result["error"]
    monkeypatch.setattr(bellum_api, "list_beeper_conversations", disconnected)
    result = await chat_tools.execute_chat_tool("read_beeper_conversation", {}, user_id="u1", profile_data=None)
    assert "error" in result and "Intégrations" in result["error"]


@pytest.mark.asyncio
async def test_bounded_and_never_reaches_the_replay_table(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    many = [{"id": f"m{i}", "senderName": "X", "isSender": False, "timestamp": None, "text": "y" * 20_000} for i in range(40)]
    many.append({"id": "last", "senderName": "Nadia", "isSender": False, "timestamp": None, "text": _BODY})

    async def fake_read(*_a: object, **_k: object) -> dict[str, object]:
        return _chat(many)

    monkeypatch.setattr(bellum_api, "read_beeper_chat", fake_read)
    monkeypatch.setattr(chat_tools, "current_turn_id", lambda: "turn-1")
    recorded: list[tuple[str, object]] = []

    async def fake_snapshot(turn_id: str, name: str, result: object, *, user_id: str) -> None:
        recorded.append((name, result))

    monkeypatch.setattr(chat_tools, "record_tool_call_snapshot", fake_snapshot)
    result = await chat_tools.execute_chat_tool("read_beeper_conversation", {"chat_id": "c1"}, user_id="u1", profile_data=None)
    assert len(result["messages"]) <= 10
    assert all(len(m["text"] or "") <= 4_000 for m in result["messages"])
    assert result["truncated"] is True
    assert "120 k€" not in repr(recorded), "le corps d'une conversation ne s'écrit pas dans la table de rejeu"
    assert "120 k€" not in repr(chat_tools.cited_sources("read_beeper_conversation", result))
