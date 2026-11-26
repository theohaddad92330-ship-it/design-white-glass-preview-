"""#4054.3 (recette N) — « Voici mon CRM, que travailler lundi ? » doit appeler `get_portfolio_priorities`
(la base importée, par ses comptes), pas produire un plan générique de mémoire."""

from __future__ import annotations

from app.prompts import bellum_advisor
from app.services.chat_tools import PORTFOLIO_PRIORITIES_TOOL

_PHRASES = ("que travailler lundi", "voici mon crm")


def test_tool_description_routes_the_monday_question() -> None:
    desc = PORTFOLIO_PRIORITIES_TOOL["description"].lower()
    assert all(p in desc for p in _PHRASES)
    assert "importé" in desc


def test_advisor_prompt_routes_the_monday_question_to_the_tool() -> None:
    src = open(bellum_advisor.__file__, encoding="utf-8").read().lower()
    assert all(p in src for p in _PHRASES)
