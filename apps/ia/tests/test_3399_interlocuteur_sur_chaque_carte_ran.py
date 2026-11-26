"""#3399 (RAN, recette ND 10/10 en prod) — « Quel compte attaquer en premier ? » : 3 cartes,
0 ligne « Interlocuteur : ». Le prompt le demandait (lot H05) mais restait probabiliste.

Désormais la LIGNE vient de l'outil : chaque compte de `get_portfolio_priorities` qui porte la clé
`interlocutor` la dit sur sa carte (nom, rôle ou « rôle non renseigné », périmètre ou « périmètre à
établir » — ou « à identifier » quand `interlocutor` est `null`). Sans lecture de contacts (clé
absente) rien n'est écrit : jamais un « à identifier » affirmé sans avoir regardé. La carte écrite
par le modèle la reçoit aussi, par nom, quand il l'a omise.
"""

from __future__ import annotations

import json

from app.services.known_shape_gate import _with_membership_enriched, shape_read_from_tool


def _output() -> dict:
    def row(i: str, name: str, **extra: object) -> dict:
        return {"id": i, "companyName": name, "bucket": "to_watch", "reason": "r", "headquarters": None, **extra}

    return {
        "now": [],
        "toVerify": [],
        "toWatch": [
            row("a", "QUIETALIS", interlocutor={"name": "Jeanne Roux", "role": "DSI", "scope": "Groupe"}),
            row("b", "SANS ROLE", interlocutor={"name": "Paul Martin", "role": None, "scope": None}),
            row("c", "SANS CONTACT", interlocutor=None),
            row("d", "NON LU"),
        ],
        "notNow": [],
    }


def _items() -> dict[str, list[str]]:
    card = shape_read_from_tool("get_portfolio_priorities", _output())["blocks"]["account_ranking"]
    return {item["name"]: item["why"] for item in card["items"]}


def _line(why: list[str]) -> str | None:
    return next((w for w in why if w.startswith("Interlocuteur :")), None)


def test_each_card_item_says_its_interlocutor() -> None:
    items = _items()
    assert _line(items["QUIETALIS"]) == "Interlocuteur : Jeanne Roux, DSI (Groupe)."
    assert _line(items["SANS ROLE"]) == "Interlocuteur : Paul Martin, rôle non renseigné (périmètre à établir)."
    assert _line(items["SANS CONTACT"]) == "Interlocuteur : à identifier."


def test_an_account_whose_contacts_were_not_read_says_nothing() -> None:
    assert _line(_items()["NON LU"]) is None


def test_the_model_card_receives_the_missing_line_by_name() -> None:
    read = shape_read_from_tool("get_portfolio_priorities", _output())
    card = {
        "type": "account_ranking",
        "title": "Priorités",
        "axes": ["Catégorie"],
        "items": [
            {"name": "QUIETALIS", "level": "to_watch", "why": ["Sans mouvement."]},
            {"name": "SANS CONTACT", "level": "to_watch", "why": ["Sans mouvement."]},
            {"name": "NON LU", "level": "to_watch", "why": ["Sans mouvement."]},
            {"name": "Inconnue SA", "level": "to_watch", "why": ["Sans mouvement."]},
        ],
    }
    reply = "Voici.\n\n```bellum-block\n" + json.dumps(card, ensure_ascii=False) + "\n```"
    out = _with_membership_enriched(reply, [read])
    assert "Interlocuteur : Jeanne Roux, DSI (Groupe)." in out
    assert "Interlocuteur : à identifier." in out
    # NON LU et l'inconnue : aucune ligne devinée.
    assert out.count("Interlocuteur :") == 2


def test_a_line_already_written_by_the_model_is_not_doubled() -> None:
    read = shape_read_from_tool("get_portfolio_priorities", _output())
    card = {
        "type": "account_ranking",
        "title": "Priorités",
        "axes": ["Catégorie"],
        "items": [{"name": "QUIETALIS", "level": "to_watch", "why": ["Interlocuteur : Jeanne Roux, DSI (Groupe)."]}],
    }
    reply = "```bellum-block\n" + json.dumps(card, ensure_ascii=False) + "\n```"
    assert _with_membership_enriched(reply, [read]).count("Interlocuteur :") == 1
