"""#3383.2 — le champ « durée » du scénario : un BUDGET lu, jamais une mesure inventée."""

from __future__ import annotations

from app.services import chat_orchestrator
from tests.copilote_scenario_metadata import budget_duree_de


def test_tool_scenario_carries_the_orchestrator_per_call_budget() -> None:
    assert budget_duree_de("find_accounts") == chat_orchestrator._PER_CALL_TIMEOUT_S


def test_prompt_rule_has_no_budget() -> None:
    assert budget_duree_de(None) is None


def test_every_corpus_scenario_exposes_budget_duree_in_its_output() -> None:
    """#3383.2 — la sortie du corpus (la vue canonique de chaque scénario) porte
    le champ : un budget pour tout scénario qui exige un outil, ``None`` pour
    une règle du prompt. Jamais une durée mesurée, jamais un champ absent."""
    from tests.test_copilote_scenario_corpus import _corpus

    scenarios = _corpus()
    assert scenarios
    for sc in scenarios:
        assert hasattr(sc, "budget_duree"), sc.identifiant
        if sc.outil is None:
            assert sc.budget_duree is None, sc.identifiant
        else:
            assert sc.budget_duree == chat_orchestrator._PER_CALL_TIMEOUT_S, sc.identifiant
    assert any(sc.budget_duree is not None for sc in scenarios)
