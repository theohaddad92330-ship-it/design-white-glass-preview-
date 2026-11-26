"""#3214 (LAU-FINAL-220) — `compare_scenarios` de bout en bout, via le
dispatcher public (`execute_chat_tool`), même voie que
`test_chat_compare_accounts_tool.py`."""

from __future__ import annotations

import asyncio

from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def _run(tool_input: dict) -> dict:
    return asyncio.run(
        execute_chat_tool(
            "compare_scenarios",
            tool_input,
            user_id="11111111-1111-4111-8111-111111111111",
            profile_data=None,
        )
    )


def test_compare_scenarios_instructs_the_comparison_card() -> None:
    assert "carte `comparison`" in _tool("compare_scenarios")["description"]


def test_compare_scenarios_is_declared_before_push_profile() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert names.index("compare_scenarios") < names.index("push_profile")


def test_end_to_end_two_scenarios_render_a_bounded_comparison() -> None:
    result = _run(
        {
            "scenarios": [
                {
                    "label": "Direct groupe",
                    "hypothesis": "Attaquer le siège directement.",
                    "risks": "Cycle long, preuve bancaire nécessaire.",
                },
                {
                    "label": "Filiale",
                    "hypothesis": "Cibler la filiale plutôt que le siège.",
                    "access_path": "Contacts opérationnels plus accessibles.",
                },
            ],
            "most_informative_scenario": "Filiale",
        }
    )
    assert result["status"] == "scenario_comparison"
    assert [s["label"] for s in result["scenarios"]] == ["Direct groupe", "Filiale"]
    assert result["most_informative_scenario"] == "Filiale"


def test_end_to_end_single_scenario_is_the_no_go_refused() -> None:
    result = _run({"scenarios": [{"label": "Seul", "hypothesis": "Un seul chemin."}]})
    assert "error" in result


def test_compare_scenarios_description_tells_laura_to_state_only_the_delta() -> None:
    """#3232 — Laura lit la consigne « dis le commun UNE fois, détaille ce qui
    diffère » dans la description de l'outil, là où le modèle la lit."""
    description = _tool("compare_scenarios")["description"]
    assert "`delta`" in description and "`shared`" in description and "`differs`" in description


def test_end_to_end_the_turn_returns_a_delta_not_a_full_sheet() -> None:
    """Entrée (deux scénarios, une contrainte commune) → outil appelé via le
    dispatcher public → le résultat nomme le commun une fois et le différent par
    scénario. Recette /chat : « Compare passer en direct et passer par une ESN
    partenaire sur ce compte, puis dis-moi seulement ce qui change »."""
    result = _run(
        {
            "scenarios": [
                {"label": "Direct", "hypothesis": "h1", "unchanged_constraints": "Budget gelé", "risks": "Cycle long"},
                {"label": "Rang 2", "hypothesis": "h2", "unchanged_constraints": "Budget gelé", "risks": "Marge partagée"},
            ],
            "most_informative_scenario": "Direct",
        }
    )
    assert result["delta"]["shared"] == [{"field": "unchanged_constraints", "text": "Budget gelé"}]
    assert [d["field"] for d in result["delta"]["differs"]] == ["risks"]
