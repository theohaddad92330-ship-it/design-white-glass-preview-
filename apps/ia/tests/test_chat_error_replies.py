"""#1914.9 — une réponse d'erreur du service IA est une CARTE « donnée manquante ».

Les replis que ce service rend COMME une réponse — ils s'affichent dans le fil et
l'app web les persiste avec le reste du fil (`Chat.tsx`, `persistTurn`) :

  * ``_TIMEOUT_REPLY`` — le tour a dépassé son budget (`ChatTurnTimeout`) ou le
    plafond dur du handler (`TimeoutError`) ;
  * ``_GENERIC_FAILURE_REPLY`` — une panne imprévue, rattrapée par le filet de
    `_run_chat_turn` OU par celui du flux SSE (`chat_message._pump`).

Ils n'existaient qu'en phrase. Une carte sépare à l'œil ce qui a échoué de ce qui
se fait ensuite, et elle se relit pareille depuis l'historique.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.routers import chat as chat_router
from app.services.chat_orchestrator import ChatTurnTimeout
from app.services.reply_blocks import normalize_reply_blocks, reply_card, split_reply_blocks

_ERROR_REPLIES = ("_TIMEOUT_REPLY", "_GENERIC_FAILURE_REPLY")


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(chunk.strip()[len("data:") :].strip())
        for chunk in text.strip().split("\n\n")
        if chunk.strip().startswith("data:")
    ]
    return events[-1]


def _card_of(reply: str) -> dict:
    segments = split_reply_blocks(reply)
    assert [s.kind for s in segments] == ["block"], f"pas une carte seule : {reply!r}"
    return segments[0].block


@pytest.mark.parametrize("name", _ERROR_REPLIES)
def test_an_error_reply_is_a_single_missing_data_card(name: str) -> None:
    reply = getattr(chat_router, name)
    card = _card_of(reply)
    assert card["type"] == "missing_data"
    assert card["failed"], "ce qui a échoué est NOMMÉ"
    assert card["missing"][0]["how"], "et le geste qui suit aussi"
    assert normalize_reply_blocks(reply) == reply, "la normalisation ne la réécrit pas"


def test_the_timeout_card_still_names_the_time_and_what_did_not_happen() -> None:
    failed = " ".join(_card_of(chat_router._TIMEOUT_REPLY)["failed"])
    assert "temps imparti" in failed
    assert "Rien n'a été envoyé ni modifié" in failed


def test_the_generic_card_claims_nothing_it_cannot_know() -> None:
    """Une panne imprévue peut survenir APRÈS un outil : dire « rien n'a été
    modifié » serait une affirmation que ce filet n'a aucun moyen de vérifier."""
    assert "Rien n'a été" not in chat_router._GENERIC_FAILURE_REPLY


def test_a_card_that_the_contract_refuses_cannot_be_built() -> None:
    with pytest.raises(ValueError):
        reply_card({"type": "missing_data", "missing": []})


def test_the_named_timeout_ends_the_stream_with_its_card(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)
    save_turn = AsyncMock()
    with (
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            side_effect=ChatTurnTimeout("budget"),
        ),
        patch("app.routers.chat.conversation_service.save_turn", save_turn),
    ):
        res = client.post("/chat/message", json={"message": "enrichis ce contact", "user_id": "u1"})
    body = _terminal_event(res.text)
    assert body["success"] is False
    assert _card_of(body["data"]["reply"])["type"] == "missing_data"
    # Le service IA ne persiste toujours rien d'un tour qui n'a pas eu lieu ;
    # c'est le fil de l'app web qui garde la carte, comme toute réponse.
    save_turn.assert_not_awaited()


def test_an_unexpected_failure_ends_the_stream_with_its_card(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        side_effect=RuntimeError("connexion perdue"),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    body = _terminal_event(res.text)
    assert body["data"]["reply"] == chat_router._GENERIC_FAILURE_REPLY
    assert _card_of(body["data"]["reply"])["type"] == "missing_data"


def test_the_stream_safety_net_also_ends_with_the_card(client: TestClient) -> None:
    """Le filet DU filet (`_pump`) : même carte, quand `_run_chat_turn` lui-même lève."""
    with patch("app.routers.chat._run_chat_turn", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    body = _terminal_event(res.text)
    assert body["success"] is False
    assert _card_of(body["data"]["reply"])["type"] == "missing_data"


def test_an_unexpected_failure_is_logged_with_its_type_and_traceback(client: TestClient, monkeypatch, caplog) -> None:
    """#3493 — « Réponse indisponible » quatre fois de suite en prod, et le journal ne
    disait que `Chat error: <message>` : ni le type, ni la ligne. Une panne dont la
    cause ne se lit pas ne se corrige pas — type + traceback, jamais le contenu du
    message de l'utilisateur."""
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)
    with (
        caplog.at_level("ERROR"),
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            side_effect=KeyError("champ_manquant"),
        ),
    ):
        client.post("/chat/message", json={"message": "Question confidentielle", "user_id": "u1"})
    failures = [r for r in caplog.records if r.getMessage().startswith("Chat error")]
    assert failures, "la panne doit être journalisée"
    assert "KeyError" in failures[0].getMessage()
    assert failures[0].exc_info is not None, "la trace de la ligne fautive"
    assert "Question confidentielle" not in failures[0].getMessage()
