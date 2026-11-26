"""R22-LG (#4438, recette prod /chat 22/10) — la phrase fixe « Et derrière ta
question… deuxième sujet… Je peux le qualifier avec toi » finissait 2 réponses
sur 3 : elle était AJOUTÉE par le code (`ensure_hidden_question_sentence`,
#3393 Y3) et rappelée au tour (`hidden_question_template_note`). Laura agit :
la question cachée se traite en AGISSANT, jamais par une phrase-gabarit, et
aucune question de relance ne termine une réponse quand une action est possible.
"""

from __future__ import annotations

import json
import pytest

from app.prompts.bellum_advisor import _BLOCK_HIDDEN_QUESTION
from app.prompts.laura_acts import strip_relaunch_tail
from app.services import chat_orchestrator, explicit_question_first
from tests.test_chat_orchestrator import _install_client, _resp, _text

_TEMPLATE = (
    "Et derrière ta question, il y a probablement un deuxième sujet : quels comptes sont compatibles, "
    "accessibles et activables maintenant ? Je peux le qualifier avec toi avant de préparer quoi que ce soit."
)


def _ranking_card(count: int = 10) -> str:
    """Une carte account_ranking RENDUE : sans elle, la garde #4631.1 remplace toute prose qui annonce N comptes."""
    card = {
        "type": "account_ranking",
        "title": "Comptes",
        "axes": ["Priorité"],
        "items": [{"name": f"Compte {i}", "level": "to_qualify", "why": ["Signal."]} for i in range(count)],
    }
    return "```bellum-block\n" + json.dumps(card, ensure_ascii=False) + "\n```"


# ── le gabarit n'existe plus, ni dans le prompt ni dans le code ─────────────


def test_the_prompt_block_never_hands_the_template_sentence():
    assert "Et derrière ta question" not in _BLOCK_HIDDEN_QUESTION
    assert "Je peux le qualifier" not in _BLOCK_HIDDEN_QUESTION
    assert "tu AGIS" in _BLOCK_HIDDEN_QUESTION


def test_the_answer_first_note_no_longer_asks_for_the_sentence():
    assert "deuxième sujet" not in explicit_question_first.answer_first_note()


def test_the_output_guarantee_and_the_turn_reminder_are_gone():
    assert not hasattr(explicit_question_first, "ensure_hidden_question_sentence")
    assert not hasattr(explicit_question_first, "hidden_question_template_note")


@pytest.mark.asyncio
async def test_a_java_account_search_reply_never_gets_the_sentence(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text(f"Voici 10 comptes Java.\n\n{_ranking_card()}")])])
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Trouve-moi des comptes Java",
        user_id="u1",
        profile_data=None,
        user_message="Trouve-moi des comptes Java",
    )
    assert "derrière ta question" not in reply and reply.startswith("Voici 10 comptes Java.")
    assert "deuxième sujet" not in str(fake.messages.calls[0]["system"])


@pytest.mark.asyncio
async def test_the_sentence_written_by_the_model_is_removed(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    _install_client(monkeypatch, [_resp("end_turn", [_text(f"Voici 10 comptes Java.\n\n{_TEMPLATE}\n\n{_ranking_card()}")])])
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Trouve-moi des comptes Java",
        user_id="u1",
        profile_data=None,
        user_message="Trouve-moi des comptes Java",
    )
    assert "derrière ta question" not in reply and "qualifier avec toi" not in reply
    assert reply.startswith("Voici 10 comptes Java.") and "\n\n\n" not in reply


# ── la fin de réponse : jamais une relance, jamais « reste à faire » ────────


@pytest.mark.parametrize(
    "tail",
    [
        _TEMPLATE,
        "Tu veux que j'élargisse à l'Occitanie ?",
        "Restent à faire : la recherche externe et les contacts.",
        "Reste à faire : lancer l'analyse.",
        "Je peux préparer le mail pour chacun, tu veux ?",
        "Souhaites-tu que je lance l'analyse ?",
    ],
)
def test_a_relaunch_tail_is_removed(tail):
    assert strip_relaunch_tail(f"Voici 10 comptes.\n\n- Airbus\n- Thales\n\n{tail}") == (
        "Voici 10 comptes.\n\n- Airbus\n- Thales"
    )


def test_only_the_last_sentence_goes_when_the_paragraph_carries_a_result():
    out = strip_relaunch_tail("J'ai élargi à l'Occitanie : 10 comptes. Tu veux que je cherche les contacts ?")
    assert out == "J'ai élargi à l'Occitanie : 10 comptes."


def test_the_guard_knows_how_to_say_no():
    plain = "Voici 10 comptes.\n\nToulouse seule en donnait 4, j'ai élargi à l'Occitanie."
    assert strip_relaunch_tail(plain) == plain
    # Une réponse qui n'est QUE la question (homonymes) n'est jamais vidée.
    question = "Thales SA ou Thales Alenia Space, tu veux lequel ?"
    assert strip_relaunch_tail(question) == question
    assert strip_relaunch_tail("") == ""


def test_a_clarification_turn_keeps_its_question():
    # Une précision posée en carte (homonymes) n'est pas une relance : rien n'est retiré.
    text = "Deux comptes portent ce nom.\n\nTu veux Thales SA ou Thales Alenia Space ?"
    assert strip_relaunch_tail(text, actions=[{"clarification": {"question": "?"}}]) == text
    assert strip_relaunch_tail(text, actions=[{"reply_options": [{"question": "?"}]}]) == text


def test_the_laura_acts_block_says_zero_is_never_an_end():
    from app.prompts.laura_acts import BLOCK_LAURA_ACTS

    assert "palier suivant DANS ce tour" in BLOCK_LAURA_ACTS
    assert "« reste à faire »" in BLOCK_LAURA_ACTS
