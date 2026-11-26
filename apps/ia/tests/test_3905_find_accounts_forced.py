"""#3905.5/.6 — « trouve-moi des comptes dans l'industrie » : `find_accounts` est FORCÉ au premier round."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.compilers.intent_router import asks_to_find_accounts_in_a_sector

TOOL = "find_accounts"


@pytest.mark.parametrize(
    "message",
    [
        "Trouve-moi des comptes dans l'industrie",
        "trouve moi des entreprises dans la banque",
        "Cherche des comptes dans le secteur de l'énergie",
        "Find me accounts in the manufacturing industry",
    ],
)
def test_3905_5_detects_the_sector_search(message):
    assert asks_to_find_accounts_in_a_sector(message)


@pytest.mark.parametrize(
    "message",
    ["Bonjour", "Trouve-moi des comptes", "Trouve le contact chez Renault", "Que faire cette semaine ?", ""],
)
def test_3905_5_says_no_elsewhere(message):
    assert not asks_to_find_accounts_in_a_sector(message)


def test_3905_6_forces_find_accounts_at_round_zero_only():
    # 18/10 — sans l'outil « comptes de l'espace » exposé, la marche suivante (`find_accounts`) reste forcée.
    tools = [{"name": TOOL}, {"name": "web_search"}]
    ask = "Trouve-moi des comptes dans l'industrie"
    assert chat_orchestrator._forced_find_accounts_kwargs(0, ask, tools) == {"force_tool": TOOL}
    assert chat_orchestrator._forced_find_accounts_kwargs(1, ask, tools) == {}
    assert chat_orchestrator._forced_find_accounts_kwargs(0, "Bonjour", tools) == {}
    assert chat_orchestrator._forced_find_accounts_kwargs(0, ask, [{"name": "web_search"}]) == {}
