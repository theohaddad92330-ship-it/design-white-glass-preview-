"""#3769 (reste) — quand le MODÈLE écrit lui-même la carte de priorités (la porte la garde), elle doit porter
le même `card_id` que celle de l'outil : sinon « seulement en Occitanie » pose une NOUVELLE carte à l'écran."""

from __future__ import annotations

import json

from app.services.reply_blocks import split_reply_blocks
from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool

MESSAGE = "priorise mes comptes"


def _output() -> dict:
    return {
        "now": [{"id": "a1", "companyName": "Alpha", "bucket": "now", "reason": "Signal daté.", "headquarters": None}],
        "toVerify": [],
        "toWatch": [],
        "notNow": [],
        "counts": {"now": 1, "toVerify": 0, "toWatch": 0, "notNow": 0, "total": 1, "outsideNow": 0},
    }


def _model_card(title: str = "Priorités") -> str:
    block = {"type": "account_ranking", "title": title, "axes": ["Niveau"], "items": [{"name": "Alpha", "why": ["Signal daté."]}]}
    return "Voici.\n\n```bellum-block\n" + json.dumps(block, ensure_ascii=False) + "\n```"


def _cards(reply: str) -> list[dict]:
    return [s.block for s in split_reply_blocks(reply) if s.kind == "block"]


def test_3769_model_written_priorities_card_gets_the_stable_card_id():
    read = shape_read_from_tool("get_portfolio_priorities", _output())
    routed = route_known_shapes(_model_card(), [{"shape_read": read}], user_message=MESSAGE)
    assert [c.get("card_id") for c in _cards(routed)] == ["portfolio_priorities"]


def test_3769_a_card_with_an_unknown_account_never_borrows_the_id():
    read = shape_read_from_tool("get_portfolio_priorities", _output())
    foreign = _model_card().replace("Alpha", "Zeta")
    routed = route_known_shapes(foreign, [{"shape_read": read}], user_message=MESSAGE)
    assert all("card_id" not in c for c in _cards(routed))
