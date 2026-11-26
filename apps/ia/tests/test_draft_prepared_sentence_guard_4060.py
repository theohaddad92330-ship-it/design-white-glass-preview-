"""#4060 (R12, prod 15/10) — « Je n'ai pas préparé ni envoyé de brouillon » sous la carte du brouillon.

La consigne `note_pour_laura` ne suffit pas (vue en prod) : le filet est déterministe."""

import pytest

from app.services.draft_prepared_sentence_guard import fix_unprepared_draft_sentence

CARD = [{"tool": "prepare_mail_draft", "status": "pending_confirmation"}]
OBSERVED = "Voici le brouillon pour Cindy.\n\nJe n'ai pas préparé ni envoyé de brouillon.\n\nDis-moi si tu veux l'ajuster."


def test_the_observed_contradiction_is_replaced_by_the_true_sentence() -> None:
    out = fix_unprepared_draft_sentence(OBSERVED, CARD)
    assert "pas préparé" not in out
    assert "J'ai préparé un brouillon, il n'a pas été envoyé : l'envoi reste ton geste." in out
    assert out.startswith("Voici le brouillon pour Cindy.") and out.endswith("l'ajuster.")


@pytest.mark.parametrize(
    "sentence",
    ["Je n'ai pas préparé de brouillon.", "Je n’ai pas préparé ni envoyé de brouillon !", "Aucun brouillon n'a été préparé ni envoyé."],
)
def test_other_phrasings_of_the_same_contradiction(sentence: str) -> None:
    assert "pas préparé" not in fix_unprepared_draft_sentence(f"Bonjour.\n\n{sentence}\n\nFin.", CARD)
    assert "Aucun brouillon" not in fix_unprepared_draft_sentence(f"Bonjour.\n\n{sentence}\n\nFin.", CARD)


def test_without_a_draft_card_the_sentence_is_true_and_kept() -> None:
    assert fix_unprepared_draft_sentence(OBSERVED, []) == OBSERVED
    failed = [{"tool": "prepare_mail_draft", "status": "error"}]
    assert fix_unprepared_draft_sentence(OBSERVED, failed) == OBSERVED


def test_a_reply_without_the_sentence_is_untouched() -> None:
    text = "J'ai préparé un brouillon, rien n'est envoyé."
    assert fix_unprepared_draft_sentence(text, CARD) == text


# #4060 (recette R37, 16/10) — « Brouillon non enregistré » sous la carte : la phrase vraie était ABSENTE.
# #4060
def test_unsaved_wording_is_replaced_and_true_sentence_present() -> None:
    out = fix_unprepared_draft_sentence("Voici le message.\n\nBrouillon non enregistré.\n\nDis-moi.", CARD)
    assert "non enregistré" not in out
    assert out.count("J'ai préparé un brouillon, il n'a pas été envoyé") == 1


def test_true_sentence_is_appended_when_card_exists_and_reply_never_says_prepared() -> None:
    out = fix_unprepared_draft_sentence("Voici le message pour le DSI.", CARD)
    assert out.endswith("l'envoi reste ton geste.")
    assert fix_unprepared_draft_sentence("Voici le message pour le DSI.", []) == "Voici le message pour le DSI."
