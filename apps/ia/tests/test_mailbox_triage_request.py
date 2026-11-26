"""#2770.2 — « traite ma boîte mail, ne rien envoyer » : on TRIE, on ne cadre pas, on n'envoie jamais."""

from __future__ import annotations

import pytest

from app.services.mailbox_triage_request import asks_to_triage_mailbox, mailbox_triage_note


@pytest.mark.parametrize(
    "message",
    [
        "traite ma boîte mail, ne rien envoyer",
        "Traite ma boite mail",
        "trie ma messagerie sans rien envoyer",
        "fais le tri de ma boîte mail",
        "process my inbox, don't send anything",
        "triage my mailbox",
    ],
)
def test_the_request_is_recognised(message: str) -> None:
    assert asks_to_triage_mailbox(message)


@pytest.mark.parametrize(
    "message",
    [
        "",
        None,
        "écris un mail à Sophie",
        "que dit le dernier mail de Sophie ?",
        "traite le compte Kiabi",
    ],
)
def test_other_requests_are_not_captured(message: str | None) -> None:
    assert not asks_to_triage_mailbox(message)


def test_with_a_mailbox_laura_sorts_directly_and_never_sends() -> None:
    note = mailbox_triage_note(mailbox_connected=True)
    assert "search_mailbox" in note
    for bucket in ("non lus", "à répondre", "à placer", "Non placé"):
        assert bucket in note
    assert "RAISON" in note
    assert "n'envoies JAMAIS" in note
    assert "question de cadrage" in note
    assert "/integrations" not in note


def test_without_a_mailbox_she_says_so_in_one_sentence_with_the_link() -> None:
    note = mailbox_triage_note(mailbox_connected=False)
    assert "[Connecter ta messagerie](/integrations)" in note
    assert "UNE phrase" in note
    assert "search_mailbox" not in note
