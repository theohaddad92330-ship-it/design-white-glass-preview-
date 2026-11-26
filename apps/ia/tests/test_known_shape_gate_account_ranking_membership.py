"""#3704.1 — recette prod 07/10 (8d7c6957f0) : « cinq nouvelles entreprises du luxe en
Île-de-France » rendait bien 5 entreprises, mais AUCUNE ligne ne portait « Nouvelle cible »
ni « Déjà dans ton espace » — seul le badge « Recommandé » (``level``) apparaissait.

Cause : le modèle avait écrit SA PROPRE carte ``account_ranking`` (la porte de forme ne la
double jamais, ``present & satisfied`` dans ``route_known_shapes``), sans le champ
``already_in_workspace`` — que l'outil avait pourtant rendu pour CHAQUE entreprise
(``chat_tools.execute_chat_tool`` → ``_run_account_search``, ligne ~13717). La lecture GATE
de ce même tour (``shape_read_from_tool``) porte ce champ (``known_shape_gate._search_ranking``,
#3704.2 du 06/10) mais n'était jamais recopiée vers la carte du modèle.

Ce test prouve que ``route_known_shapes`` recopie désormais ``already_in_workspace`` depuis
la lecture de l'outil vers la carte DU MODÈLE, par nom (jamais un second calcul, jamais une
valeur devinée pour un nom que l'outil n'a pas rendu).
"""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks


def _tool_output() -> dict:
    return {
        "axes": ["Secteur demandé"],
        "items": [
            {"name": "MAISON DU CUIR", "already_in_workspace": False, "why": ["Luxe, Paris"]},
            {
                "name": "ATELIER BIJOU",
                "already_in_workspace": True,
                "account_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "why": ["Luxe, Paris"],
            },
            # Une troisième entreprise que le modèle ne reprend pas dans sa propre carte :
            # elle ne doit fuiter nulle part (jamais un nom en trop côté écran).
            {"name": "SOIE ET CIE", "already_in_workspace": False, "why": ["Luxe, Lyon"]},
        ],
    }


def _model_written_reply() -> str:
    # Le modèle a écrit SA PROPRE carte account_ranking — sans already_in_workspace, et
    # avec une casse différente (« Maison du Cuir » vs « MAISON DU CUIR ») pour prouver que
    # le rapprochement se fait par nom, insensible à la casse.
    block = {
        "type": "account_ranking",
        "axes": ["Secteur demandé"],
        "items": [
            {"name": "Maison du Cuir", "why": ["Recommandé"], "level": "priority"},
            {"name": "Atelier Bijou", "why": ["Recommandé"], "level": "priority"},
        ],
    }
    return "Voici deux entreprises.\n\n```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"


def test_model_authored_ranking_card_is_enriched_with_membership_from_the_tool_read() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output(), language="fr")
    assert read is not None
    actions = [{"shape_read": read}]

    out = route_known_shapes(
        _model_written_reply(),
        actions,
        user_message="trouve-moi cinq nouvelles entreprises du luxe en ile de france",
        language="fr",
    )

    blocks = [seg.block for seg in split_reply_blocks(out) if seg.kind == "block" and seg.block]
    assert len(blocks) == 1, "la porte ne double jamais la carte écrite par le modèle"
    by_name = {str(item["name"]).casefold(): item for item in blocks[0]["items"]}
    assert by_name["maison du cuir"]["already_in_workspace"] is False
    assert by_name["atelier bijou"]["already_in_workspace"] is True
    # Rien d'inventé pour un nom que le modèle n'a pas repris lui-même.
    assert "soie et cie" not in by_name


def test_a_card_that_already_names_membership_is_left_untouched() -> None:
    block = {
        "type": "account_ranking",
        "axes": ["Secteur demandé"],
        "items": [{"name": "MAISON DU CUIR", "why": ["Luxe"], "already_in_workspace": True}],
    }
    reply = "```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"
    read = shape_read_from_tool("run_account_search", _tool_output(), language="fr")
    out = route_known_shapes(reply, [{"shape_read": read}], user_message="nouvelles entreprises du luxe", language="fr")
    blocks = [seg.block for seg in split_reply_blocks(out) if seg.kind == "block" and seg.block]
    # already_in_workspace=True reste tel quel, jamais écrasé par le rapprochement (False chez l'outil).
    assert blocks[0]["items"][0]["already_in_workspace"] is True


def test_no_membership_known_leaves_the_reply_byte_identical() -> None:
    output = {"axes": ["Secteur"], "items": [{"name": "MAISON DU CUIR", "why": ["Luxe"]}]}
    read = shape_read_from_tool("run_account_search", output, language="fr")
    block = {"type": "account_ranking", "axes": ["Secteur"], "items": [{"name": "Maison du Cuir", "why": ["Recommandé"]}]}
    reply = "```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"
    out = route_known_shapes(reply, [{"shape_read": read}], user_message="nouvelles entreprises du luxe", language="fr")
    assert out == reply
