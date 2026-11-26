"""#4438.3 (recette prod 22/10) — la carte liste 10 comptes, l'intro dit « ne permet pas de confirmer 10 comptes ».
La prose ne contredit jamais la carte ; la garde sait dire NON (autres phrases, autres nombres, cartes) et LIT
vraiment le décompte de la carte."""

from __future__ import annotations

import json

from app.services.prose_card_consistency import drop_prose_contradicting_cards
from app.services.reply_blocks import REPLY_BLOCK_FENCE


def _card(n: int) -> str:
    items = [{"name": f"Compte {i}", "why": ["Raison."]} for i in range(n)]
    return (
        f"```{REPLY_BLOCK_FENCE}\n" + json.dumps({"type": "account_ranking", "axes": ["Axe"], "items": items}) + "\n```"
    )


def test_4438_3_the_cannot_confirm_sentence_is_dropped_when_the_card_lists_that_many() -> None:
    reply = f"Le registre ne permet pas de confirmer 10 comptes aéronautique à Toulouse. Voici la liste.\n\n{_card(10)}"
    out = drop_prose_contradicting_cards(reply)
    assert "confirmer" not in out and out.startswith("Voici la liste.")
    assert _card(10) in out


def test_4438_3_a_reduced_count_below_the_card_is_dropped() -> None:
    reply = f"Seulement 6 comptes répondent.\n\n{_card(10)}"
    assert drop_prose_contradicting_cards(reply) == _card(10)


def test_4438_3_the_line_alone_disappears_but_the_other_lines_stay() -> None:
    reply = f"Toulouse, aéronautique.\nJe n'ai pas pu confirmer 10 entreprises.\n\n{_card(10)}"
    assert drop_prose_contradicting_cards(reply).startswith(f"Toulouse, aéronautique.\n\n```{REPLY_BLOCK_FENCE}")


def test_4438_3_a_true_shortfall_is_kept() -> None:
    # La carte liste 4 comptes : « seulement 4 » et « 10 non confirmés » disent vrai.
    reply = f"Seulement 4 comptes répondent. Je n'ai pas pu confirmer 10 comptes.\n\n{_card(4)}"
    assert drop_prose_contradicting_cards(reply) == reply


def test_4438_3_no_card_no_change_and_unrelated_numbers_stay() -> None:
    plain = "Je ne peux pas confirmer 10 comptes."
    assert drop_prose_contradicting_cards(plain) == plain
    reply = f"Il y a 3 sites et seulement 2 contacts par compte.\n\n{_card(10)}"
    assert drop_prose_contradicting_cards(reply) == reply


def test_4438_3_text_inside_a_card_is_never_edited() -> None:
    items = [{"name": "A", "why": ["Seulement 2 comptes"]}] * 3
    card = (
        f"```{REPLY_BLOCK_FENCE}\n" + json.dumps({"type": "account_ranking", "axes": ["x"], "items": items}) + "\n```"
    )
    assert drop_prose_contradicting_cards(card) == card
