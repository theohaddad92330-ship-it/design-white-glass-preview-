"""#4462.2 — « Analyse ces comptes : Airbus, Thales, Safran… » (25 noms) : Laura répondait « Je reprends le fil
avec Thales… Que veux-tu ? » sans appeler l'outil de liste. La demande d'analyser une LISTE nommée force
`analyze_named_companies` au premier round ; au-delà de 20 noms, les suivants sont NOMMÉS."""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_orchestrator, named_companies_batch
from app.services.compilers.intent_router import asks_to_analyze_named_list

TOOL = "analyze_named_companies"
TOOLS = [{"name": TOOL}, {"name": "get_account_briefing"}]
NAMES = [f"Societe{i}" for i in range(25)]


@pytest.mark.parametrize(
    "message",
    [
        "Analyse ces comptes : Airbus, Thales, Safran, Dassault",
        "analyse ces entreprises : Airbus; Thales; Safran",
        "Analyze these accounts: Airbus, Thales, Safran",
        "Lance l'analyse de ces comptes :\nAirbus\nThales\nSafran",
    ],
)
def test_4462_list_request_is_detected(message):
    assert asks_to_analyze_named_list(message)


@pytest.mark.parametrize(
    "message",
    ["Analyse ces comptes", "Analyse Airbus", "lance l'analyse de Sanofi", "Bonjour : un, deux, trois", ""],
)
def test_4462_detector_says_no_elsewhere(message):
    assert not asks_to_analyze_named_list(message)


def test_4462_list_message_forces_the_batch_tool_once():
    f = chat_orchestrator._forced_named_list_kwargs
    msg = "Analyse ces comptes : Airbus, Thales, Safran"
    assert f(0, msg, TOOLS, called=[]) == {"force_tool": TOOL}
    assert f(1, msg, TOOLS, called=[]) == {}
    assert f(0, msg, TOOLS, called=[TOOL]) == {}
    assert f(0, msg, [{"name": "get_account_briefing"}], called=[]) == {}
    assert f(0, "Analyse Airbus", TOOLS, called=[]) == {}


@pytest.mark.asyncio
async def test_4462_names_beyond_the_cap_are_named_for_the_next_message(monkeypatch):
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def none_in_workspace(*_a, **_k):
        return {"accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts", none_in_workspace)
    from app.services.research import homonym

    async def silent_registry(*_a, **_k):
        return None

    monkeypatch.setattr(homonym, "resolve_company_identity", silent_registry)
    out = await named_companies_batch.run_batch(
        "u-1", NAMES, function=None, scope_mode=None, allowed_scope_modes=(), not_launched_because={}
    )
    assert out["beyond_cap"] == NAMES[20:]
    assert "je garde pour le message suivant" in out["model_directive"]
    assert "Societe20, Societe21" in out["model_directive"]
