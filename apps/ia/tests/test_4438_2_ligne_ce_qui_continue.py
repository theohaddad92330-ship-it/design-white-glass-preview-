"""#4438.2 (recette prod 23/10) — une tranche dont la suite part seule DIT ce qui continue, en une ligne posée
par le code ; sans suite réelle, aucune promesse (#4462.6)."""

from __future__ import annotations

from app.prompts.laura_acts import CONTINUES_LINE, ensure_continues_line

TRANCHE = "Voici 8 ESN concurrentes chez Airbus, avec leurs contacts."


def test_the_line_is_added_when_work_really_continues() -> None:
    assert ensure_continues_line(TRANCHE, True) == f"{TRANCHE}\n\n{CONTINUES_LINE}"


def test_nothing_is_promised_when_nothing_continues() -> None:
    assert ensure_continues_line(TRANCHE, False) == TRANCHE


def test_the_model_that_already_says_it_is_not_doubled() -> None:
    reply = f"{TRANCHE}\n\nJe poursuis sur les autres ESN en fond."
    assert ensure_continues_line(reply, True) == reply


def test_a_fenced_card_mentioning_the_word_does_not_count_as_the_line() -> None:
    reply = f'{TRANCHE}\n\n```json\n{{"note": "poursuis"}}\n```'
    assert ensure_continues_line(reply, True).endswith(CONTINUES_LINE)


def test_an_empty_reply_stays_empty() -> None:
    assert ensure_continues_line("  ", True) == "  "
