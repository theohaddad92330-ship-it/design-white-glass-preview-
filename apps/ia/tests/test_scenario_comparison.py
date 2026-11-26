"""#3214 (LAU-FINAL-220) — le comparateur de scénarios commerciaux.

Rien n'est calculé ici : comme `ask_clarification` / `offer_reply_options`,
les scénarios sont NOMMÉS par le modèle, cette fonction les BORNE et applique
les trois gardes de l'issue :

 1. #220.6 (NO-GO) — un appel à moins de deux scénarios est refusé : une
    réponse à « et si... » qui ne compare rien n'est pas une comparaison.
 2. #220.3 — aucun champ n'accepte un nombre : un ROI ou une probabilité
    inventés n'ont pas de champ où atterrir.
 3. #220.4 — `most_informative_scenario` doit désigner un scénario RÉELLEMENT
    comparé, jamais un choix à côté (le potentiel maximum n'est pas la règle).

#220.5 (reste, épopée #3232) — la comparaison réutilise
`market_memory_reuse_cache` (axe `"scenario"`) : le MÊME jeu de scénarios
redemandé par le MÊME utilisateur en moins de cinq minutes ne recalcule rien,
il revient marqué `reused_from_memory`.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.services import market_memory_reuse_cache
from app.services.scenario_comparison import bound_scenarios, compare_scenarios


def _scenario(**over):
    base = {
        "label": "Direct groupe",
        "hypothesis": "Attaquer le siège du groupe directement.",
        "risks": "Cycle long, preuve bancaire nécessaire.",
        "reversible": True,
    }
    return {**base, **over}


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    market_memory_reuse_cache.clear()


@pytest.fixture(autouse=True)
def _no_redis_by_default():
    """Sans mock explicite, aucun test ne doit taper un vrai Redis."""
    with patch.object(market_memory_reuse_cache, "_redis", AsyncMock(return_value=None)):
        yield


@pytest.mark.asyncio
async def test_a_single_scenario_is_refused_as_a_no_go() -> None:
    result = await compare_scenarios(
        {"scenarios": [_scenario()], "most_informative_scenario": "Direct groupe"}, user_id="u-1"
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_two_named_scenarios_compare_and_carry_their_fields() -> None:
    result = await compare_scenarios(
        {
            "scenarios": [
                _scenario(label="Direct groupe"),
                _scenario(label="Filiale", hypothesis="Cibler la filiale plutôt que le siège."),
            ],
            "most_informative_scenario": "Filiale",
        },
        user_id="u-1",
    )
    assert result["status"] == "scenario_comparison"
    labels = [s["label"] for s in result["scenarios"]]
    assert labels == ["Direct groupe", "Filiale"]
    assert result["most_informative_scenario"] == "Filiale"


@pytest.mark.asyncio
async def test_a_numeric_risk_or_potential_is_never_carried_as_an_invented_roi() -> None:
    # Un champ censé porter du texte qualitatif reçoit un nombre — un ROI ou
    # une probabilité qu'on n'a pas le droit d'afficher (doctrine).
    result = await compare_scenarios(
        {
            "scenarios": [
                _scenario(label="A", potential_value=72),
                _scenario(label="B"),
            ],
            "most_informative_scenario": "B",
        },
        user_id="u-1",
    )
    scenario_a = next(s for s in result["scenarios"] if s["label"] == "A")
    assert "potential_value" not in scenario_a


@pytest.mark.asyncio
async def test_most_informative_scenario_must_reference_a_compared_scenario() -> None:
    result = await compare_scenarios(
        {
            "scenarios": [_scenario(label="A"), _scenario(label="B")],
            "most_informative_scenario": "C — inventé",
        },
        user_id="u-1",
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_a_repeated_comparison_is_reused_rather_than_recomputed() -> None:
    tool_input = {
        "scenarios": [_scenario(label="A"), _scenario(label="B")],
        "most_informative_scenario": "B",
    }
    first = await compare_scenarios(tool_input, user_id="u-1")
    assert "reused_from_memory" not in first

    second = await compare_scenarios(tool_input, user_id="u-1")
    assert second["reused_from_memory"] is True
    assert second["scenarios"] == first["scenarios"]
    assert second["most_informative_scenario"] == "B"


@pytest.mark.asyncio
async def test_reuse_is_scoped_per_user() -> None:
    tool_input = {
        "scenarios": [_scenario(label="A"), _scenario(label="B")],
        "most_informative_scenario": "B",
    }
    await compare_scenarios(tool_input, user_id="u-1")
    other_user = await compare_scenarios(tool_input, user_id="u-2")
    assert "reused_from_memory" not in other_user


@pytest.mark.asyncio
async def test_an_error_is_never_cached() -> None:
    invalid = {"scenarios": [_scenario()], "most_informative_scenario": "Direct groupe"}
    await compare_scenarios(invalid, user_id="u-1")
    # Un NO-GO n'a rien à réutiliser — un second appel identique est rejugé,
    # jamais rendu tel quel depuis un cache qui n'a rien dû y mettre.
    second = await compare_scenarios(invalid, user_id="u-1")
    assert "error" in second
    assert "reused_from_memory" not in second


def test_unmeasured_reversible_is_omitted_rather_than_guessed_false() -> None:
    scenarios = bound_scenarios([{"label": "A", "hypothesis": "Test"}])
    assert "reversible" not in scenarios[0]


def test_a_scenario_without_a_hypothesis_is_dropped_rather_than_half_filled() -> None:
    scenarios = bound_scenarios([{"label": "Sans hypothèse"}, {"label": "A", "hypothesis": "Complet"}])
    assert len(scenarios) == 1
    assert scenarios[0]["label"] == "A"


# #3232 / #220.5 (lot Q03 30/09) — le DELTA : ce qui distingue les scénarios,
# jamais une fiche complète répétée par colonne. Ce qui est identique partout
# se dit UNE fois (`shared`) ; ce qui diffère (ou n'est posé que sur certains
# scénarios — `None` = non évalué, jamais un vide rempli) se dit par scénario.
def _delta_of(scenarios: list[dict]) -> dict:
    return asyncio.run(
        compare_scenarios(
            {"scenarios": scenarios, "most_informative_scenario": scenarios[0]["label"]},
            "22222222-2222-4222-8222-222222222222",
        )
    )["delta"]


def test_delta_states_shared_constraints_once_and_what_differs_per_scenario() -> None:
    delta = _delta_of(
        [
            {"label": "Direct", "hypothesis": "h1", "unchanged_constraints": "Budget gelé", "risks": "Cycle long"},
            {"label": "Filiale", "hypothesis": "h2", "unchanged_constraints": "Budget gelé", "risks": "Accès réduit"},
        ]
    )
    assert delta["shared"] == [{"field": "unchanged_constraints", "text": "Budget gelé"}]
    assert delta["differs"] == [{"field": "risks", "values": {"Direct": "Cycle long", "Filiale": "Accès réduit"}}]


def test_delta_says_not_evaluated_as_none_never_as_an_invented_value() -> None:
    delta = _delta_of(
        [
            {"label": "A", "hypothesis": "h1", "access_path": "Via le DSI"},
            {"label": "B", "hypothesis": "h2"},
        ]
    )
    assert delta["differs"] == [{"field": "access_path", "values": {"A": "Via le DSI", "B": None}}]
    assert delta["shared"] == []


def test_delta_does_not_call_a_single_present_value_shared() -> None:
    """Un champ posé sur UN seul scénario n'est pas « partagé » : il est non
    évalué ailleurs, donc il DIFFÈRE (la garde sait dire NON)."""
    delta = _delta_of(
        [{"label": "A", "hypothesis": "h1", "risks": "r"}, {"label": "B", "hypothesis": "h2", "risks": "r"}]
    )
    assert delta["shared"] == [{"field": "risks", "text": "r"}]
    solo = _delta_of([{"label": "A", "hypothesis": "h1", "risks": "r"}, {"label": "B", "hypothesis": "h2"}])
    assert solo["shared"] == []


def test_delta_reversibility_differs_only_when_measured() -> None:
    delta = _delta_of(
        [
            {"label": "A", "hypothesis": "h1", "reversible": True},
            {"label": "B", "hypothesis": "h2", "reversible": False},
        ]
    )
    assert {"field": "reversible", "values": {"A": True, "B": False}} in delta["differs"]
