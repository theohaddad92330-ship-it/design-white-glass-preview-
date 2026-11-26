"""#3866 (recette prod 13/10) — « Offre visée : Data/BI » n'apparaissait que dans l'en-tête
« Classé selon », 0 fois sur les cartes. Attendu : CHAQUE carte de compte porte la ligne quand
une offre est déclarée (tour d'origine comme « affine »), aucune sans offre."""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks

_OFFER_LINE = "Offre visée : Data/BI"


def _tool_output(offer: str | None) -> dict:
    return {
        "axes": ["Secteur d'activité visé : finance", *([_OFFER_LINE] if offer else [])],
        "criteria": {"sectors": ["finance"], **({"offer": offer} if offer else {})},
        "items": [
            {"name": "SOCIETE GENERALE", "siren": "552120222", "why": ["Finance, IDF"]},
            {"name": "MACIF", "siren": "781452511", "why": ["Finance, IDF"]},
        ],
    }


def _model_reply() -> str:
    block = {
        "type": "account_ranking",
        "axes": ["Secteur d'activité visé : finance"],
        "items": [{"name": "SOCIETE GENERALE", "why": ["Nouvelle cible"]}, {"name": "MACIF", "why": ["Nouvelle cible"]}],
    }
    return "Voici.\n\n```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"


def _items(out: str) -> list[dict]:
    blocks = [s.block for s in split_reply_blocks(out) if s.kind == "block" and s.block]
    assert len(blocks) == 1
    return blocks[0]["items"]


def test_tool_built_card_carries_the_offer_on_every_row() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output("Data/BI"), language="fr")
    out = route_known_shapes("Voici.", [{"shape_read": read}], user_message="trouve des comptes", language="fr")
    items = _items(out)
    assert len(items) == 2
    assert all(_OFFER_LINE in item["why"] for item in items)


def test_model_written_card_gets_the_offer_line_restored() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output("Data/BI"), language="fr")
    out = route_known_shapes(_model_reply(), [{"shape_read": read}], user_message="affine", language="fr")
    assert all(_OFFER_LINE in item["why"] for item in _items(out))


def test_refine_without_a_tool_call_reads_the_remembered_offer() -> None:
    out = route_known_shapes(
        _model_reply(),
        [],
        user_message="affine sur 250-999 salariés",
        language="fr",
        remembered_run_account_search={"offer": "Data/BI"},
    )
    assert all(_OFFER_LINE in item["why"] for item in _items(out))


def test_english_label() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output("Data/BI"), language="en")
    out = route_known_shapes("Here.", [{"shape_read": read}], user_message="find accounts", language="en")
    assert all("Target offer: Data/BI" in item["why"] for item in _items(out))


def test_no_offer_no_line() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output(None), language="fr")
    out = route_known_shapes("Voici.", [{"shape_read": read}], user_message="trouve des comptes", language="fr")
    assert not any(w.startswith("Offre visée") for item in _items(out) for w in item["why"])
