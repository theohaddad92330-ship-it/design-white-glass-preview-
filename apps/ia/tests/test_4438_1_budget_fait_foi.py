"""#4438.1 (recette prod 23/10) — lequel des deux budgets fait foi ? `plan.tool_rounds` (8 en recherche) ;
`_MAX_TOOL_ROUNDS` (2) n'est que le budget d'un tour simple. La boucle ne lit jamais la constante seule."""

from __future__ import annotations

import inspect
import re

from app.services import chat_orchestrator
from app.services.chat_turn_plan import RESEARCH_TOOL_ROUNDS, SIMPLE_TURN_PLAN, plan_turn


def test_the_loop_reads_the_plan_budget_not_the_simple_constant():
    source = inspect.getsource(chat_orchestrator)
    loops = re.findall(r"for _round_index in range\(([^)]+)\)", source)
    assert loops == ["plan.tool_rounds"]


def test_the_simple_constant_is_only_the_simple_plan():
    assert chat_orchestrator._MAX_TOOL_ROUNDS == SIMPLE_TURN_PLAN.tool_rounds


def test_the_copilot_question_of_the_recette_gets_eight_rounds():
    plan = plan_turn("Quels comptes à Toulouse cherchent du React ?", None)
    assert plan.research is True
    assert plan.tool_rounds == RESEARCH_TOOL_ROUNDS == 8
