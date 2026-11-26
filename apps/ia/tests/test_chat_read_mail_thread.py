"""#4016 L3 — Laura lit le CORPS des fils de SA PROPRE boîte.

Décision Louis du 11/10 : résumé, relance dans le ton, objections, besoins. Ce que
ces tests tiennent, dans l'ordre :

1. **Sa propre boîte seulement** : l'outil n'envoie QUE l'identifiant de
   l'utilisateur authentifié au pont (jamais un identifiant pris du modèle).
2. **Un outil qui ne peut pas lire le DIT** (jamais « fil vide »).
3. **Le corps ne va jamais à un autre humain** : il n'entre ni dans les
   sources citées, ni dans l'état de conversation, ni dans l'enregistrement de
   rejeu (table lue côté espace), ni dans `search_mailbox` (inchangé).
4. **Borné** : le modèle ne reçoit jamais un fil entier de plusieurs Mo.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.chat_tools import READ_MAIL_THREAD_TOOL, TOOL_REQUIRED_FAMILIES, tools_for

_BODY = "Bonjour, notre budget est de 80 k€, mais le TJM de 650 est trop élevé pour nous. Cordialement, Jean"


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


def _thread_payload() -> dict[str, object]:
    return {
        "threadId": "t1",
        "subject": "Proposition",
        "truncated": False,
        "messages": [
            {"direction": "outbound", "date": "2026-10-01T09:00:00Z", "from": "moi@esn.fr", "text": "Voici notre offre."},
            {"direction": "inbound", "date": "2026-10-03T09:00:00Z", "from": "jean@acme.com", "text": _BODY},
        ],
    }


def test_tool_is_registered_and_requires_the_mail_family() -> None:
    assert READ_MAIL_THREAD_TOOL["name"] == "read_mail_thread"
    assert TOOL_REQUIRED_FAMILIES["read_mail_thread"] == ("email",)
    assert "read_mail_thread" not in {t["name"] for t in tools_for([])}
    assert "read_mail_thread" in {t["name"] for t in tools_for(["email"])}
    props = READ_MAIL_THREAD_TOOL["input_schema"]["properties"]  # type: ignore[index]
    # Jamais un identifiant d'utilisateur ni d'espace dans ce que le modèle écrit.
    assert "user_id" not in props and "userId" not in props and "workspace_id" not in props


@pytest.mark.asyncio
async def test_unconfigured_bridge_says_so_instead_of_returning_an_empty_thread() -> None:
    result = await chat_tools.execute_chat_tool("read_mail_thread", {"thread_id": "t1"}, user_id="u1", profile_data=None)
    assert "error" in result and "messagerie" in result["error"]


@pytest.mark.asyncio
async def test_missing_thread_id_is_refused() -> None:
    result = await chat_tools.execute_chat_tool("read_mail_thread", {}, user_id="u1", profile_data=None)
    assert "error" in result


@pytest.mark.asyncio
async def test_reads_only_the_authenticated_users_mailbox(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def fake_read(user_id: str, **kwargs: object) -> dict[str, object]:
        seen["user_id"] = user_id
        seen.update(kwargs)
        return _thread_payload()

    monkeypatch.setattr(bellum_api, "read_mail_thread", fake_read)
    result = await chat_tools.execute_chat_tool(
        "read_mail_thread",
        # Le modèle tente de viser la boîte d'un collègue : l'argument est ignoré.
        {"thread_id": "t1", "counterpart": "jean@acme.com", "user_id": "collegue", "userId": "collegue"},
        user_id="u1",
        profile_data=None,
    )
    assert seen["user_id"] == "u1"
    assert seen["thread_id"] == "t1"
    assert seen["counterpart"] == "jean@acme.com"
    assert result["messages"][1]["text"] == _BODY
    assert result["thread_id"] == "t1"


@pytest.mark.asyncio
async def test_bridge_down_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_read(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "read_mail_thread", fake_read)
    result = await chat_tools.execute_chat_tool("read_mail_thread", {"thread_id": "t1"}, user_id="u1", profile_data=None)
    assert "error" in result


@pytest.mark.asyncio
async def test_each_message_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    payload = _thread_payload()
    payload["messages"] = [
        {"direction": "inbound", "date": f"2026-10-0{i}T09:00:00Z", "from": "j@a.com", "text": "x" * 20_000}
        for i in range(1, 9)
    ]

    async def fake_read(*_a: object, **_k: object) -> dict[str, object]:
        return payload

    monkeypatch.setattr(bellum_api, "read_mail_thread", fake_read)
    result = await chat_tools.execute_chat_tool("read_mail_thread", {"thread_id": "t1"}, user_id="u1", profile_data=None)
    assert len(result["messages"]) <= 6
    assert all(len(m["text"]) <= 4_000 for m in result["messages"])
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_body_never_reaches_the_replay_table_the_workspace_reads(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_read(*_a: object, **_k: object) -> dict[str, object]:
        return _thread_payload()

    monkeypatch.setattr(bellum_api, "read_mail_thread", fake_read)
    monkeypatch.setattr(chat_tools, "current_turn_id", lambda: "turn-1")
    recorded: list[tuple[str, object]] = []

    async def fake_snapshot(turn_id: str, name: str, result: object, *, user_id: str) -> None:
        recorded.append((name, result))

    monkeypatch.setattr(chat_tools, "record_tool_call_snapshot", fake_snapshot)
    await chat_tools.execute_chat_tool("read_mail_thread", {"thread_id": "t1"}, user_id="u1", profile_data=None)
    assert "80 k€" not in repr(recorded), "le corps d'un message ne s'écrit pas dans la table de rejeu"


def test_body_never_enters_cited_sources_or_conversation_hints() -> None:
    output = {"thread_id": "t1", "subject": "Proposition", "messages": [{"text": _BODY}], "truncated": False}
    assert "80 k€" not in repr(chat_tools.cited_sources("read_mail_thread", output))
    assert chat_tools.mail_thread_hints("read_mail_thread", output) == []


# ── #4016.3b — synthèse multi-fils : plusieurs fils de SA boîte, dans un seul tour ──────────────────


def _multi_payload(thread_id: str) -> dict[str, object]:
    return {
        "threadId": thread_id,
        "subject": f"Sujet {thread_id}",
        "truncated": False,
        "messages": [
            {"direction": "inbound", "date": "2026-10-03T09:00:00Z", "from": "jean@acme.com", "text": f"Corps {thread_id}"}
        ],
    }


def test_schema_offers_thread_ids_and_still_never_a_user_identifier() -> None:
    props = READ_MAIL_THREAD_TOOL["input_schema"]["properties"]  # type: ignore[index]
    assert props["thread_ids"]["type"] == "array"
    assert props["thread_ids"]["maxItems"] == 5
    assert "user_id" not in props and "userId" not in props
    assert "synthèse" in str(READ_MAIL_THREAD_TOOL["description"]).lower()


@pytest.mark.asyncio
async def test_reads_several_threads_of_the_authenticated_mailbox_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: list[tuple[str, str]] = []

    async def fake_read(user_id: str, **kwargs: object) -> dict[str, object]:
        seen.append((user_id, str(kwargs["thread_id"])))
        return _multi_payload(str(kwargs["thread_id"]))

    monkeypatch.setattr(bellum_api, "read_mail_thread", fake_read)
    result = await chat_tools.execute_chat_tool(
        "read_mail_thread",
        {"thread_ids": ["t1", "t2", "t3"], "user_id": "intrus"},
        user_id="u1",
        profile_data=None,
    )
    assert seen == [("u1", "t1"), ("u1", "t2"), ("u1", "t3")]
    assert [t["thread_id"] for t in result["threads"]] == ["t1", "t2", "t3"]
    assert result["threads_read"] == 3


@pytest.mark.asyncio
async def test_multi_is_bounded_deduplicated_and_names_what_it_did_not_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    calls: list[str] = []

    async def fake_read(_user_id: str, **kwargs: object) -> dict[str, object]:
        calls.append(str(kwargs["thread_id"]))
        return _multi_payload(str(kwargs["thread_id"]))

    monkeypatch.setattr(bellum_api, "read_mail_thread", fake_read)
    ids = ["t1", "t1", "t2", "t3", "t4", "t5", "t6", "t7"]
    result = await chat_tools.execute_chat_tool(
        "read_mail_thread", {"thread_ids": ids}, user_id="u1", profile_data=None
    )
    assert calls == ["t1", "t2", "t3", "t4", "t5"]
    assert result["threads_not_read"] == ["t6", "t7"]
    assert result["threads_truncated"] is True


@pytest.mark.asyncio
async def test_one_unreadable_thread_is_named_not_hidden(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_read(_user_id: str, **kwargs: object) -> dict[str, object] | None:
        if kwargs["thread_id"] == "t2":
            return {"error": "Fil introuvable."}
        return _multi_payload(str(kwargs["thread_id"]))

    monkeypatch.setattr(bellum_api, "read_mail_thread", fake_read)
    result = await chat_tools.execute_chat_tool(
        "read_mail_thread", {"thread_ids": ["t1", "t2"]}, user_id="u1", profile_data=None
    )
    assert result["threads_read"] == 1
    assert result["threads"][1] == {"thread_id": "t2", "error": "Fil introuvable."}


@pytest.mark.asyncio
async def test_mailbox_down_for_the_whole_batch_is_an_error_not_an_empty_synthesis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_read(_user_id: str, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "read_mail_thread", fake_read)
    result = await chat_tools.execute_chat_tool(
        "read_mail_thread", {"thread_ids": ["t1", "t2"]}, user_id="u1", profile_data=None
    )
    assert "error" in result and "messagerie" in result["error"]
    assert "threads" not in result


@pytest.mark.asyncio
async def test_multi_bodies_stay_out_of_replay_like_the_single_thread() -> None:
    assert "read_mail_thread" in chat_tools._BODY_BEARING_TOOLS
