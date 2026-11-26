"""#3393 (recette prod 02/10, Y11) — « Je te réponds. » parasite + une réponse par tour."""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_HIDDEN_QUESTION
from app.services.explicit_question_first import one_answer_per_turn

SENTENCE = "Et derrière ta question, il y a probablement un deuxième sujet : lequel ?"


def test_the_template_never_hands_the_model_a_parasite_to_copy():
    assert "Je te réponds" not in _BLOCK_HIDDEN_QUESTION


def test_the_stray_acknowledgement_is_removed_in_front_of_the_sentence():
    out = one_answer_per_turn(f"Voici les comptes.\n\nJe te réponds. {SENTENCE}")
    assert "Je te réponds" not in out
    assert SENTENCE in out and out.startswith("Voici les comptes.")


def test_the_stray_acknowledgement_is_removed_on_its_own_line():
    assert one_answer_per_turn("Je te réponds.\nLe DSI n'est pas confirmé.") == "Le DSI n'est pas confirmé."


def test_a_paragraph_said_twice_is_kept_once():
    para = "Le compte est en veille : aucun signal d'achat depuis trois mois, un contact chaud."
    out = one_answer_per_turn(f"{para}\n\nProchaine étape : relancer.\n\n{para}")
    assert out.count(para) == 1 and "Prochaine étape" in out


def test_a_whole_answer_said_twice_is_kept_once():
    answer = "Le compte est suivi.\n\nLe dernier échange date du 12 septembre, sans réponse."
    assert one_answer_per_turn(f"{answer}\n\n{answer}") == answer


def test_the_guard_knows_how_to_say_no():
    text = "Oui.\n\nOui.\n\nDeux courtes réponses identiques mais trop brèves pour être un doublon."
    assert one_answer_per_turn(text) == text
    fenced = "Texte.\n\n```bellum-block\n{}\n```\n\n```bellum-block\n{}\n```"
    assert one_answer_per_turn(fenced) == fenced
    assert one_answer_per_turn("") == ""
