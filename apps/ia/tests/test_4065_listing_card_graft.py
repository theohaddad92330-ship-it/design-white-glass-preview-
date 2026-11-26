"""#4065 (recette R20 15/10) — « 131 lignes retournées » mais UNE seule ligne rendue : le modèle recopiait
la carte du listing en l'abrégeant. La carte validée de l'outil remplace toute copie plus courte."""

from __future__ import annotations

import json

from app.services.record_listing import _remember_listing_card, begin_turn_listing, graft_listing_cards
from app.services.reply_blocks import split_reply_blocks

COLUMNS = ["Date", "Personne"]


def _card(count: int) -> dict:
    return {
        "type": "file_export",
        "title": "Agenda",
        "filename": "agenda.csv",
        "columns": COLUMNS,
        "rows": [{"cells": [f"2026-10-{i % 28 + 1:02d}", f"Personne {i}"]} for i in range(count)],
    }


def _fenced(card: dict) -> str:
    return f"```bellum-block\n{json.dumps(card)}\n```"


def _rows_of(reply: str) -> list[int]:
    return [len(s.block["rows"]) for s in split_reply_blocks(reply) if s.kind == "block"]


def test_truncated_copy_is_replaced_by_the_full_card() -> None:
    begin_turn_listing()
    _remember_listing_card(_card(131))
    reply = f"Voici ton agenda.\n\n{_fenced(_card(1))}"
    grafted = graft_listing_cards(reply)
    assert _rows_of(grafted) == [131]
    assert "Voici ton agenda." in grafted


def test_missing_card_is_added() -> None:
    begin_turn_listing()
    _remember_listing_card(_card(131))
    assert _rows_of(graft_listing_cards("Voici ton agenda.")) == [131]


def test_complete_copy_and_turns_without_listing_are_untouched() -> None:
    begin_turn_listing()
    _remember_listing_card(_card(5))
    reply = f"ok\n\n{_fenced(_card(5))}"
    assert _rows_of(graft_listing_cards(reply)) == [5]
    begin_turn_listing()
    assert graft_listing_cards("Bonjour") == "Bonjour"


# ---- #4288.5 — un tableau ÉCRIT en texte ne double jamais la carte du listing ----

TABLE = "| Date | Personne |\n| --- | --- |\n| 2026-10-01 | Personne 1 |\n| 2026-10-02 | Personne 2 |"


def test_a_text_table_next_to_the_card_is_dropped() -> None:
    begin_turn_listing()
    _remember_listing_card(_card(2))
    grafted = graft_listing_cards(f"Voici tes missions.\n\n{TABLE}\n\n{_fenced(_card(2))}")
    assert "| --- |" not in grafted
    assert "Voici tes missions." in grafted
    assert _rows_of(grafted) == [2]


def test_a_text_table_without_any_card_is_kept() -> None:
    begin_turn_listing()
    reply = f"Voici.\n\n{TABLE}"
    assert graft_listing_cards(reply) == reply
