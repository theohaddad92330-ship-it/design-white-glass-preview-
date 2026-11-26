"""#3769 (recette prod 13/10) — « priorise mes comptes » puis « seulement en Occitanie » créait une NOUVELLE
carte. Attendu : l'affinage ACTUALISE la même carte — même identifiant (`card_id`), « Zone : Occitanie »
dans son en-tête. L'écran remplace la version précédente par un renvoi (voir ReplyCardSuperseded)."""

from __future__ import annotations

from app.services.known_shape_gate import shape_read_from_tool


def _output(**extra: object) -> dict:
    return {
        "now": [{"id": "a1", "companyName": "Alpha", "bucket": "now", "reason": "Signal daté.", "headquarters": None}],
        "toVerify": [],
        "toWatch": [],
        "notNow": [],
        "counts": {"now": 1, "toVerify": 0, "toWatch": 0, "notNow": 0, "total": 1, "outsideNow": 0},
        **extra,
    }


def _card(output: dict) -> dict:
    return shape_read_from_tool("get_portfolio_priorities", output)["blocks"]["account_ranking"]


def test_3769_the_unfiltered_and_the_zoned_card_share_one_card_id():
    plain = _card(_output())
    zoned = _card(_output(geoFilter={"label": "Occitanie", "kept": 1, "outside": 3, "unlocated": []}))
    assert plain["card_id"] == zoned["card_id"] == "portfolio_priorities"


def test_3769_the_zone_is_named_in_the_card_header_not_only_in_the_axes():
    plain = _card(_output())
    zoned = _card(_output(geoFilter={"label": "Occitanie", "kept": 1, "outside": 3, "unlocated": []}))
    assert "Zone : Occitanie" in zoned["title"]
    assert "Zone" not in plain["title"]


def test_3769_another_ranking_never_borrows_the_priorities_card_id():
    output = {"accounts": []}
    read = shape_read_from_tool("run_account_search", output)
    blocks = (read or {}).get("blocks") or {}
    assert all("card_id" not in block for block in blocks.values())
