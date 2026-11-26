"""Registre des agents nommés (niveau-2, Théo) — les 12 agents pointent vers du
code RÉEL (structuré, pas "prompts flous")."""

from __future__ import annotations

import pytest

from app.agents.registry import AGENTS, agent_map, get_agent, resolve

_EXPECTED = {
    "ProfileInterpreter",
    "EntitySelector",
    "SignalInterpreter",
    "ContactMapper",
    "AccountScorer",
    "PlaySelector",
    "ActionPlanGenerator",
    "MessageGenerator",
    "QualityJudge",
    "SourceJudge",
    "AccountVocabularyBuilder",
    # #2281 / épopée #2969 — plan d'exécution orienté résultat.
    "ToolPlanner",
}


def test_the_12_named_agents_are_registered():
    assert {a.name for a in AGENTS} == _EXPECTED


@pytest.mark.parametrize("agent", AGENTS, ids=lambda a: a.name)
def test_every_agent_resolves_to_real_code(agent):
    # Import the module + get the entrypoint → the registry never points at a
    # stale/renamed symbol (guards "structuré, pas flou").
    fn = resolve(agent)
    assert callable(fn)
    assert agent.kind in {"algo", "prompt"}


def test_agent_map_and_lookup():
    m = agent_map()
    assert set(m) == _EXPECTED
    assert get_agent("AccountVocabularyBuilder").kind == "prompt"
    assert get_agent("AccountScorer").kind == "algo"
    assert get_agent("nope") is None
