"""#2887.2 / B2-RESTES (recette prod 11/10 nuit, 12/10) — « qu'est-ce que je dois faire cette semaine ? » : Laura rendait
un plan d'actions sans rien de la combinaison rôle × stade (décisions, indicateurs) que /briefing lit déjà.
Le rôle change l'ORDRE, jamais le CONTENU (doctrine c76) ; colonne entièrement vide = pas de colonne."""

from __future__ import annotations

import pytest

from app.prompts.laura_operating_context import weekly_actions_turn_block
from app.services.action_plan import compose_action_plan
from app.services.esn_stage import classify_esn_stage
from app.services.role_playbook import ROLE_STAGE_TABLE, role_stage_cell

PROFILE = {"sellerRole": "Business Manager", "size": "30-80"}


@pytest.mark.parametrize(
    "message",
    [
        "qu'est-ce que je dois faire cette semaine ?",
        "Que dois-je faire cette semaine ?",
        "Par quoi je commence ?",
        "What should I do this week?",
    ],
)
def test_the_week_question_carries_the_role_stage_decisions_and_indicators(message: str) -> None:
    block = weekly_actions_turn_block(PROFILE, message)
    cell = role_stage_cell("business_manager", classify_esn_stage("30-80"))
    assert cell is not None
    assert cell["dims"]["decisions"] in block
    assert cell["dims"]["indicateurs"] in block
    assert "ORDRE" in block and "CONTENU" in block  # le rôle ordonne, il ne filtre pas (c76)


def test_other_questions_and_unreadable_profiles_get_nothing() -> None:
    assert weekly_actions_turn_block(PROFILE, "Quel est le SIREN de Thales ?") == ""
    assert weekly_actions_turn_block({"size": "30-80"}, "Que dois-je faire cette semaine ?") == ""  # rôle absent
    assert weekly_actions_turn_block({"sellerRole": "Business Manager"}, "Que dois-je faire cette semaine ?") == ""  # stade non déclaré
    assert ROLE_STAGE_TABLE["cells"]  # la matrice lue est bien la source unique


def test_a_column_that_is_empty_on_every_row_is_not_shown() -> None:
    near = {"bellum": [{"accountId": "a", "companyName": "SNCF", "stage": "proposition"}], "crm": []}
    plan = compose_action_plan(report={"accounts": [], "since": "2026-07-01"}, near_signing=near)
    table = plan["exportTable"]
    assert table["rows"], "le test doit porter au moins une ligne"
    assert "Sens" not in table["columns"]
    assert all(len(row["cells"]) == len(table["columns"]) for row in table["rows"])
