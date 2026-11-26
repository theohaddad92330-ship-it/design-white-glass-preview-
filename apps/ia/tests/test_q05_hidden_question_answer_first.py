"""#3393 (LOT Q05, recette prod du 30/09) — « Qui est le DSI de Société
Générale ? » faisait poser à Laura une question de désambiguïsation (outil
`ask_clarification`, 4 puces) AU LIEU de répondre : la demande explicite doit
passer en premier, la question plus utile ne vient qu'APRÈS (gabarit « derrière
ta question… »).

Le tour est rejoué entrée → catalogue d'outils vu par le modèle → outil appelé
→ réponse, avec le même faux client que ``test_chat_orchestrator.py``. Question
exacte à poser en recette dans /chat : « Qui est le DSI de Société Générale ? »
puis « Qui est déjà chez Decathlon ? »."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.explicit_question_first import answer_first_note, is_explicit_lookup_form
from tests.test_chat_orchestrator import (  # noqa: F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)


@pytest.mark.parametrize(
    "message",
    [
        "Qui est le DSI de Société Générale ?",
        "qui est la DSI chez Decathlon",
        "Qui est le directeur des achats d'Airbus ?",
        "Qui est déjà chez Decathlon ?",
        "qui est deja chez eux",
    ],
)
def test_the_canonical_lookup_forms_are_detected(message):
    assert is_explicit_lookup_form(message)


@pytest.mark.parametrize(
    "message",
    [
        "",
        "Écris au CTO de Decathlon",
        "Qu'est-ce que le score d'accès ?",
        "Analyse Decathlon",
        "Quel est le DSI idéal à contacter ?",
    ],
)
def test_the_guard_knows_how_to_say_no(message):
    assert not is_explicit_lookup_form(message)


def test_the_note_answers_first_without_the_template_sentence():
    note = answer_first_note()
    assert "ask_clarification" not in note or "JAMAIS" in note
    # R22-LG (recette prod 22/10, #4438) — la phrase « Et derrière ta question… » est retirée.
    assert "deuxième sujet" not in note


@pytest.mark.asyncio
async def test_replayed_turn_dsi_question_is_answered_not_clarified(monkeypatch):
    fake = _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("find_contacts", {"company": "Société Générale", "role": "DSI"})]),
            _resp(
                "end_turn",
                [
                    _text(
                        "Le DSI de Société Générale, d'après ton vivier : Jeanne Martin. "
                        "Et derrière ta question, il y a probablement un deuxième sujet : "
                        "qui peut réellement ouvrir ce périmètre ? Je peux le qualifier."
                    )
                ],
            ),
        ],
    )

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Qui est le DSI de Société Générale ?",
        user_id="u1",
        profile_data=None,
        user_message="Qui est le DSI de Société Générale ?",
    )

    first_call = fake.messages.calls[0]
    offered = {tool["name"] for tool in first_call["tools"]}
    assert "ask_clarification" not in offered
    assert all(a.get("status") != "clarification" for a in actions)
    # R22-LG — la phrase-gabarit écrite par le modèle est retirée en sortie, la réponse reste.
    assert reply == "Le DSI de Société Générale, d'après ton vivier : Jeanne Martin."


@pytest.mark.asyncio
async def test_a_non_lookup_turn_keeps_the_clarification_tool(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools(
        "sys", "Analyse Decathlon", user_id="u1", profile_data=None, user_message="Analyse Decathlon"
    )
    assert "ask_clarification" in {tool["name"] for tool in fake.messages.calls[0]["tools"]}


# ── #3430 — « Écris au CTO pour lui présenter notre offre Java » ─────────────
#
# Question exacte à poser en recette dans /chat : « Écris au CTO pour lui
# présenter notre offre Java. » — Laura doit dire qu'elle ne commencerait pas
# par le CTO, proposer le responsable applicatif et garder le CTO en route
# sponsor ; elle ne demande pas « quel CTO ? ».

from app.services.explicit_question_first import (  # noqa: E402
    closest_role_first_note,
    is_high_level_contact_request,
)


@pytest.mark.parametrize(
    "message",
    [
        "Écris au CTO pour lui présenter notre offre Java.",
        "écris au DSI de Decathlon",
        "Contacte le CTO",
        "Envoie un message au DSI groupe",
        "Prépare un mail à la directrice technique",
    ],
)
def test_3430_high_level_contact_forms_are_detected(message):
    assert is_high_level_contact_request(message)


@pytest.mark.parametrize(
    "message",
    ["", "Qui est le CTO de Decathlon ?", "Écris au responsable applicatif", "Analyse Decathlon", "Quel est le rôle du CTO ?"],
)
def test_3430_the_guard_knows_how_to_say_no(message):
    assert not is_high_level_contact_request(message)


def test_3430_note_keeps_the_sponsor_route_and_never_sends():
    note = closest_role_first_note()
    assert "ROUTE SPONSOR" in note
    assert "jamais" in note and "l'envoies" in note


@pytest.mark.asyncio
async def test_3430_replayed_turn_substitutes_the_role_instead_of_asking_which_cto(monkeypatch):
    message = "Écris au CTO pour lui présenter notre offre Java."
    fake = _install_client(
        monkeypatch,
        [
            _resp(
                "end_turn",
                [
                    _text(
                        "Je peux préparer le message, mais je ne commencerais pas par le CTO. Le problème "
                        "documenté est dans l'équipe applications : je te prépare d'abord l'approche du "
                        "responsable applicatif, et je garde le CTO comme route sponsor."
                    )
                ],
            )
        ],
    )

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", message, user_id="u1", profile_data=None, user_message=message
    )

    first_call = fake.messages.calls[0]
    assert "ask_clarification" not in {tool["name"] for tool in first_call["tools"]}
    assert "ROUTE SPONSOR" in str(first_call["system"])
    assert not actions
    assert "responsable applicatif" in reply and "sponsor" in reply


# ── #3393 formes 2 et 3 (Y1 01/10, Y3 02/10) — le rappel au tour et la phrase garantie en sortie sont
# RETIRÉS par R22-LG (recette prod 22/10, #4438) : voir `tests/test_r22_laura_agit_phrase.py`.
