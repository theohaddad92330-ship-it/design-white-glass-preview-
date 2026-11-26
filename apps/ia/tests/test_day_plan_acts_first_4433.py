"""#4433.9 (recette 23/10) — « Organise ma journée » : Laura AGIT.

Constat : une question parasite se posait AU-DESSUS du plan. Le plan se rend d'abord (`propose_focus_plan`, dans CE
tour, sans cadrage) ; une question n'existe qu'en dessous, et seulement si elle est utile.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_DAY_PLAN, build_system_prompt


def test_the_day_plan_rule_acts_first_and_questions_only_below() -> None:
    assert "propose_focus_plan" in _BLOCK_DAY_PLAN
    assert "dans CE tour" in _BLOCK_DAY_PLAN
    assert "jamais au-dessus du plan" in _BLOCK_DAY_PLAN
    assert "en dessous" in _BLOCK_DAY_PLAN


def test_the_rule_reaches_the_assembled_system_prompt() -> None:
    prompt = build_system_prompt({}, {}, "", "")
    assert _BLOCK_DAY_PLAN in prompt
