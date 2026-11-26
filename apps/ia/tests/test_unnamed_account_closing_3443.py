"""#3443.1 — sans compte nommé, la réponse de Laura ne finit pas sur « donne-moi son nom ».

Recette prod : la clôture répondait « dès que tu me donnes son nom, je rattache le
contact au portefeuille » alors que personne n'avait nommé de compte, au lieu de
finir sur l'email ou la synthèse préparée. Le prompt (`_COLD_CALL_FLOW`) le
demande ; ce filet DÉTERMINISTE retire la phrase quand le modèle l'écrit quand
même. Sortie modèle fixe, aucun appel réseau.
"""

from __future__ import annotations

import json
from unittest.mock import patch

from app.prompts.laura_role_and_voice import BLOCK_ROLE_AND_VOICE
from app.services.unnamed_account_closing import strip_unnamed_account_closing

CLOSING = "Quel est le meilleur email pour t'envoyer une synthèse courte ?"
BAD = "Dès que tu me donnes son nom, je prépare le message et je rattache le contact au portefeuille."
BODY = f"Voici le cadre.\n\n1) Permission d'abord.\n\n{CLOSING}"


def test_the_account_request_closing_is_removed_when_no_account_is_named() -> None:
    out = strip_unnamed_account_closing(f"{BODY}\n\n{BAD}", account_named=False)
    assert out == BODY


def test_only_the_offending_sentence_goes_from_a_mixed_paragraph() -> None:
    out = strip_unnamed_account_closing(f"Voici le cadre.\n\n{CLOSING} {BAD}", account_named=False)
    assert out == f"Voici le cadre.\n\n{CLOSING}"


def test_a_portfolio_attached_contact_request_is_removed_too() -> None:
    reply = f"{BODY}\n\nIl me faut le contact rattaché au portefeuille pour continuer."
    assert strip_unnamed_account_closing(reply, account_named=False) == BODY


def test_kept_when_an_account_is_named() -> None:
    reply = f"{BODY}\n\n{BAD}"
    assert strip_unnamed_account_closing(reply, account_named=True) == reply


def test_an_innocent_reply_is_untouched() -> None:
    reply = "Le compte Renault a un projet data documenté.\n\n" + CLOSING
    assert strip_unnamed_account_closing(reply, account_named=False) == reply


def test_never_empties_the_reply() -> None:
    assert strip_unnamed_account_closing(BAD, account_named=False) == BAD


def test_the_prompt_forbids_the_account_request_closing() -> None:
    assert "jamais sur une demande de nom de compte" in BLOCK_ROLE_AND_VOICE


# ── Le tour rejoué : sortie modèle fixe → réponse finale (aucun appel réseau) ──


def _replay(client, message: str, model_reply: str, **extra) -> str:  # type: ignore[no-untyped-def]
    async def _fake_run(system, user, **kwargs):  # type: ignore[no-untyped-def]
        return (model_reply, [])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": message, "user_id": "u1", **extra})
    events = [json.loads(b[len("data:") :]) for b in res.text.strip().split("\n\n") if b.startswith("data:")]
    return events[-1]["data"]["reply"]


def test_replayed_turn_without_account_ends_on_the_email(client) -> None:  # type: ignore[no-untyped-def]
    reply = _replay(client, "Prépare mon appel à froid, responsable Data", f"{BODY}\n\n{BAD}")
    assert reply.rstrip().endswith(CLOSING)
    assert "portefeuille" not in reply


def test_replayed_turn_with_an_active_account_keeps_the_sentence(client) -> None:  # type: ignore[no-untyped-def]
    reply = _replay(client, "Prépare mon appel", f"{BODY}\n\n{BAD}", account_id="acc-1")
    assert "portefeuille" in reply
