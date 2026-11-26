"""#4287.1 / #4289.2 (recette prod 23/10) — une comparaison de comptes répond aux SIX questions d'une
recommandation, ÉTIQUETÉES par compte, et la dimension « relation » y est explicite (jamais implicite)."""

from __future__ import annotations

from app.prompts.bellum_compare import SIX_QUESTION_KEYS, build_system_prompt, build_user_prompt
from app.services.chat_tools import COMPARE_ACCOUNTS_TOOL


def _user_prompt() -> str:
    return build_user_prompt([{"company_name": "Alpha"}, {"company_name": "Beta"}], {"offers": ["data"]})


def test_4287_1_the_six_questions_are_labelled_in_the_expected_output():
    prompt = _user_prompt()
    assert len(SIX_QUESTION_KEYS) == 6
    for key in SIX_QUESTION_KEYS:
        assert f'"{key}"' in prompt


def test_4289_2_relation_is_an_explicit_dimension_never_guessed():
    prompt = _user_prompt()
    assert '"relation"' in prompt
    system = build_system_prompt({})
    assert "relation" in system.lower()
    assert "jamais inventée" in system


def test_4287_1_the_tool_asks_the_card_to_carry_the_labelled_questions():
    desc = COMPARE_ACCOUNTS_TOOL["description"]
    assert "six questions" in desc
    assert "relation" in desc
