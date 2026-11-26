"""#3704.A (recette prod 08/10, W 5b4b10d2f3) — « trouve-moi cinq nouvelles entreprises
du luxe en IDF » : la carte annonce 5 entreprises (le modèle écrit un titre « 5 nouvelles
entreprises » / évoque ce chiffre dans sa prose) mais n'en affiche que 3 lignes.

Cause : le modèle écrit SA PROPRE carte ``account_ranking`` (la porte de forme ne la
double jamais, même mécanisme que #3704.1/``_with_membership_enriched``), et rien ne
vérifiait que son ``title`` (quand il commence par un compte, « N <quelque chose> »)
corresponde au nombre RÉEL de lignes (``len(items)``) — deux nombres qui pouvaient
diverger : celui que la personne a demandé, et celui que la recherche a RÉELLEMENT
rendu (et que la carte affiche).

Le correctif est volontairement ÉTROIT : seul un titre qui COMMENCE par un nombre
(« 5 nouvelles entreprises », « 12 comptes prioritaires ») est corrigé — jamais un
nombre ailleurs dans le texte (un seuil d'effectif, une année), que la garde ne vise
pas. « Le compte annoncé = le compte affiché, toujours (dérivé d'une seule liste) » :
le nombre en tête du titre est désormais DÉRIVÉ de ``len(items)``, jamais un second
chiffre que le modèle aurait pu écrire de mémoire.
"""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks


def _tool_output() -> dict:
    return {
        "axes": ["Secteur demandé"],
        "items": [
            {"name": "HERMES SELLIER", "already_in_workspace": False, "why": ["Luxe, Paris"]},
            {"name": "MESSIKA GROUP", "already_in_workspace": False, "why": ["Luxe, Paris"]},
            {"name": "LONGCHAMP", "already_in_workspace": False, "why": ["Luxe, Paris"]},
        ],
    }


def _model_written_reply(title: str, item_names: list[str]) -> str:
    block = {
        "type": "account_ranking",
        "title": title,
        "axes": ["Secteur demandé"],
        "items": [{"name": name, "why": ["Nouvelle cible"], "level": "priority"} for name in item_names],
    }
    return "Voici les entreprises.\n\n```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"


def _ranking_block(out: str) -> dict:
    blocks = [seg.block for seg in split_reply_blocks(out) if seg.kind == "block" and seg.block]
    assert len(blocks) == 1
    return blocks[0]


def test_a_title_claiming_more_than_the_rendered_items_is_corrected_to_the_real_count() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output(), language="fr")
    out = route_known_shapes(
        _model_written_reply("5 nouvelles entreprises", ["HERMES SELLIER", "MESSIKA GROUP", "LONGCHAMP"]),
        [{"shape_read": read}],
        user_message="trouve-moi cinq nouvelles entreprises du luxe en ile de france",
        language="fr",
    )
    assert _ranking_block(out)["title"] == "3 nouvelles entreprises"


def test_a_title_already_correct_is_left_byte_identical() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output(), language="fr")
    reply = _model_written_reply("3 nouvelles entreprises", ["HERMES SELLIER", "MESSIKA GROUP", "LONGCHAMP"])
    out = route_known_shapes(
        reply, [{"shape_read": read}], user_message="trouve-moi trois entreprises du luxe", language="fr"
    )
    assert _ranking_block(out)["title"] == "3 nouvelles entreprises"


def test_a_number_that_is_not_a_leading_count_is_never_touched() -> None:
    # Pas un compte en tête : un seuil d'effectif, par exemple — la garde ne vise pas ça.
    read = shape_read_from_tool("run_account_search", _tool_output(), language="fr")
    reply = _model_written_reply(
        "Entreprises de plus de 50 salariés", ["HERMES SELLIER", "MESSIKA GROUP", "LONGCHAMP"]
    )
    out = route_known_shapes(reply, [{"shape_read": read}], user_message="entreprises du luxe", language="fr")
    assert _ranking_block(out)["title"] == "Entreprises de plus de 50 salariés"


def test_no_title_at_all_is_never_invented() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output(), language="fr")
    block = {
        "type": "account_ranking",
        "axes": ["Secteur demandé"],
        "items": [{"name": "HERMES SELLIER", "why": ["Nouvelle cible"]}],
    }
    reply = "```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"
    out = route_known_shapes(reply, [{"shape_read": read}], user_message="entreprises du luxe", language="fr")
    assert "title" not in _ranking_block(out)
