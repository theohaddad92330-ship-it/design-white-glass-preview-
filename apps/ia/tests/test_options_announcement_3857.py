"""#3857 — Laura n'annonce pas des options « juste dessous » quand aucune n'est transmise.

Recette prod : deux fiches « Société Générale », la réponse disait « les options sont
juste dessous » et AUCUN bouton n'était rendu — le modèle n'avait pas appelé
`offer_reply_options` (ou ses options ont été refusées par `_reply_options`). L'écran
ne rend un bouton que depuis `context.reply_options` / `context.clarification.options`
(« on n'affiche pas ce qu'on n'a pas ») ; la prose ne peut donc pas en promettre.
Sortie modèle fixe, aucun appel réseau.
"""

from __future__ import annotations

from app.services.options_announcement import has_clickable_options, strip_unbacked_options_announcement

ASK = "Il existe deux fiches Société Générale : laquelle veux-tu ouvrir ?"
PROMISE = "Les options sont juste dessous."


def test_the_promise_goes_when_no_option_is_transmitted() -> None:
    out = strip_unbacked_options_announcement(f"{ASK} {PROMISE}", has_options=False)
    assert out == ASK


def test_a_promise_in_its_own_paragraph_goes_too() -> None:
    out = strip_unbacked_options_announcement(f"{ASK}\n\nChoisis l'une des options ci-dessous.", has_options=False)
    assert out == ASK


def test_an_english_promise_goes_too() -> None:
    out = strip_unbacked_options_announcement("Two profiles match. The options are just below.", has_options=False)
    assert out == "Two profiles match."


def test_kept_when_options_are_transmitted() -> None:
    reply = f"{ASK} {PROMISE}"
    assert strip_unbacked_options_announcement(reply, has_options=True) == reply


def test_a_question_sentence_is_never_removed() -> None:
    reply = "Lesquelles des options ci-dessous veux-tu ?"
    assert strip_unbacked_options_announcement(reply, has_options=False) == reply


def test_a_reply_that_is_only_the_promise_is_left_alone() -> None:
    assert strip_unbacked_options_announcement(PROMISE, has_options=False) == PROMISE


def test_a_table_announcement_is_not_an_options_promise() -> None:
    reply = "Le détail des comptes est dans le tableau ci-dessous."
    assert strip_unbacked_options_announcement(reply, has_options=False) == reply


def test_has_clickable_options_reads_both_carriers() -> None:
    assert has_clickable_options({"reply_options": [{"question": "q", "options": ["a", "b"]}]})
    assert has_clickable_options({"clarification": {"question": "q", "options": ["a", "b"]}})
    assert not has_clickable_options({})
    assert not has_clickable_options({"reply_options": [{"question": "q", "options": []}]})
    assert not has_clickable_options({"clarification": {"question": "q", "options": []}})
