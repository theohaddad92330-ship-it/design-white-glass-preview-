"""#3704 (recette prod 09/10, e6e420695b) — « donne-moi aussi des besoins » sur le MÊME
fil : les entreprises restent (SG, MACIF), mais « Classé selon » perd la ligne « Région :
Île-de-France » qu'il portait au 1er tour (« Secteur : finance · Effectif : 1000+ ·
Établissement actif au registre » seulement). Le brief F03 tranche : les critères du 1er
tour, géographie comprise, se conservent d'un tour à l'autre tant que l'utilisateur ne les
change pas.

Cause : le modèle écrit SA PROPRE carte ``account_ranking`` (la porte de forme ne la double
jamais, même mécanisme que #3704.1 / #3704.A) — sa liste ``axes`` est du texte libre, et peut
omettre une ligne même quand la recherche RÉELLEMENT exécutée ce tour (``run_account_search``,
``_search_axes``) la portait. Même famille que ``_with_membership_enriched`` : on ne refait
jamais le calcul, on RESTAURE depuis ce que l'outil a déjà rendu pour CE tour.

Volontairement étroit : seules les lignes de GÉOGRAPHIE (``Département :`` / ``Région :``)
sont restaurées — un axe métier (secteur, effectif, mots-clés) que le modèle aurait reformulé
ou omis à dessein n'est pas visé ici.
"""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks


def _tool_output(axes: list[str]) -> dict:
    return {
        "axes": axes,
        "items": [
            {"name": "SOCIETE GENERALE", "already_in_workspace": False, "why": ["Finance, IDF"]},
            {"name": "MACIF", "already_in_workspace": False, "why": ["Finance, IDF"]},
        ],
    }


def _model_written_reply(axes: list[str]) -> str:
    block = {
        "type": "account_ranking",
        "title": "Entreprises finance",
        "axes": axes,
        "items": [
            {"name": "SOCIETE GENERALE", "why": ["Nouvelle cible"]},
            {"name": "MACIF", "why": ["Nouvelle cible"]},
        ],
    }
    return "Voici les entreprises.\n\n```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"


def _ranking_block(out: str) -> dict:
    blocks = [seg.block for seg in split_reply_blocks(out) if seg.kind == "block" and seg.block]
    assert len(blocks) == 1
    return blocks[0]


def test_a_geography_axis_dropped_by_the_model_is_restored_from_the_real_search() -> None:
    real_axes = [
        "Secteur d'activité visé : finance",
        "Région : Île-de-France",
        "Effectif : 1000+",
        "Établissement actif au registre",
    ]
    read = shape_read_from_tool("run_account_search", _tool_output(real_axes), language="fr")
    model_axes = ["Secteur d'activité visé : finance", "Effectif : 1000+", "Établissement actif au registre"]
    out = route_known_shapes(
        _model_written_reply(model_axes),
        [{"shape_read": read}],
        user_message="donne-moi aussi des besoins",
        language="fr",
    )
    assert "Région : Île-de-France" in _ranking_block(out)["axes"]


def test_a_department_axis_dropped_by_the_model_is_restored_too() -> None:
    real_axes = ["Secteur d'activité visé : finance", "Département : Paris (75)", "Établissement actif au registre"]
    read = shape_read_from_tool("run_account_search", _tool_output(real_axes), language="fr")
    model_axes = ["Secteur d'activité visé : finance", "Établissement actif au registre"]
    out = route_known_shapes(
        _model_written_reply(model_axes),
        [{"shape_read": read}],
        user_message="donne-moi aussi des besoins",
        language="fr",
    )
    assert "Département : Paris (75)" in _ranking_block(out)["axes"]


def test_a_geography_axis_already_present_is_left_byte_identical() -> None:
    real_axes = ["Secteur d'activité visé : finance", "Région : Île-de-France", "Établissement actif au registre"]
    read = shape_read_from_tool("run_account_search", _tool_output(real_axes), language="fr")
    model_axes = ["Secteur d'activité visé : finance", "Région : Île-de-France", "Établissement actif au registre"]
    out = route_known_shapes(
        _model_written_reply(model_axes),
        [{"shape_read": read}],
        user_message="donne-moi aussi des besoins",
        language="fr",
    )
    assert _ranking_block(out)["axes"] == model_axes


def test_no_geography_in_the_real_search_never_invents_one() -> None:
    # La recherche réelle n'a elle-même AUCUNE géographie : rien à restaurer, jamais un
    # département ou une région devinée.
    real_axes = ["Secteur d'activité visé : finance", "Établissement actif au registre"]
    read = shape_read_from_tool("run_account_search", _tool_output(real_axes), language="fr")
    model_axes = ["Secteur d'activité visé : finance", "Établissement actif au registre"]
    reply = _model_written_reply(model_axes)
    out = route_known_shapes(
        reply, [{"shape_read": read}], user_message="donne-moi aussi des besoins", language="fr"
    )
    assert _ranking_block(out)["axes"] == model_axes


# ── #3704 (re-lotée G03, recette prod 09/10 aef69661e9 — défaut INCHANGÉ) ────
#
# « donne-moi aussi des besoins » répondu SANS rappeler `run_account_search` (le
# modèle enrichit sa propre carte de mémoire, sans tour d'outil) : AUCUNE lecture
# de ce tour pour restaurer depuis — seul le fil (`ThreadState.searches`, tenu
# par `ThreadStateCollector` d'un tour à l'autre) sait encore la géographie.


def test_no_tool_call_this_turn_restores_geography_from_the_remembered_search() -> None:
    model_axes = ["Secteur d'activité visé : finance", "Établissement actif au registre"]
    out = route_known_shapes(
        _model_written_reply(model_axes),
        [],  # aucune lecture d'outil ce tour
        user_message="donne-moi aussi des besoins",
        language="fr",
        remembered_run_account_search={"sectors": ["finance"], "region": ["11"]},
    )
    assert "Région : Île-de-France" in _ranking_block(out)["axes"]


def test_no_tool_call_this_turn_restores_a_remembered_department_too() -> None:
    model_axes = ["Secteur d'activité visé : finance", "Établissement actif au registre"]
    out = route_known_shapes(
        _model_written_reply(model_axes),
        [],
        user_message="donne-moi aussi des besoins",
        language="fr",
        remembered_run_account_search={"department": "75"},
    )
    assert "Département : Paris (75)" in _ranking_block(out)["axes"]


def test_no_tool_call_and_no_remembered_search_changes_nothing() -> None:
    # Ni lecture ce tour, ni recherche connue du fil : rien à restaurer, la
    # réponse ressort à l'octet — jamais une géographie devinée.
    model_axes = ["Secteur d'activité visé : finance", "Établissement actif au registre"]
    reply = _model_written_reply(model_axes)
    out = route_known_shapes(
        reply, [], user_message="donne-moi aussi des besoins", language="fr", remembered_run_account_search=None
    )
    assert out == reply


def test_no_tool_call_this_turn_without_an_account_ranking_card_changes_nothing() -> None:
    # Pas de carte account_ranking dans la réponse : rien à toucher, quel que
    # soit ce que le fil se souvient.
    reply = "Je n'ai rien de nouveau à te montrer sur ces comptes."
    out = route_known_shapes(
        reply,
        [],
        user_message="donne-moi aussi des besoins",
        language="fr",
        remembered_run_account_search={"region": ["11"]},
    )
    assert out == reply
