"""#3343 (LAU-FINAL-253) — recette prod du 30/09 : une recherche à ZÉRO résultat
(« Chief Quantum Computing Officer » à Ouessant) faisait nommer la contrainte à
élargir par Laura, puis écrire « Je peux poursuivre avec une recherche élargie »
et ATTENDRE. La règle « second passage immédiat » vivait dans le bloc de fil
(`thread_state.py`), contredite au moment où le modèle lit le résultat vide :

* le message de `relaxation_suggestion` disait « dis-le-moi si tu valides » ;
* le bloc `CONTRAINTES COMBINÉES` disait « attends l'accord » ;
* un résultat vide de `search_workspace_contacts` / `search_market_memory` ne
  portait AUCUNE consigne de suite (la description de l'outil disait « dis-le »).

Ce fichier garde : sur zéro résultat, la consigne effective lancée au modèle
est de RELANCER lui-même, en nommant ce qu'il élargit — jamais d'attente.
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import constraint_consistency_block
from app.services import bellum_api, chat_tools
from app.services.compilers.intent_router import route_chat_intent
from app.services.constraint_consistency import relaxation_suggestion, second_pass_directive

USER = "11111111-1111-4111-8111-111111111111"

_WAITING = ("attends l'accord", "si tu valides", "sans ton accord", "wait for confirmation", "tell me to confirm")


def _lacks_waiting(text: str) -> None:
    low = text.lower()
    for phrase in _WAITING:
        assert phrase not in low, phrase


@pytest.mark.parametrize("language", ["fr", "en"])
def test_relaxation_suggestion_does_not_wait_for_the_user(language: str) -> None:
    out = relaxation_suggestion({"department": "31", "headcount": "1-9"}, language=language)
    assert out is not None
    _lacks_waiting(out["message"])
    assert out["criterion"] == "headcount"


@pytest.mark.parametrize("language", ["fr", "en"])
def test_constraint_block_relaunches_on_zero_results(language: str) -> None:
    route = route_chat_intent(message="Trouve-moi des comptes intéressants")
    block = constraint_consistency_block(route, language)
    assert block
    _lacks_waiting(block)


@pytest.mark.parametrize("language", ["fr", "en"])
def test_second_pass_directive_orders_the_relaunch_in_the_same_turn(language: str) -> None:
    out = second_pass_directive({"location": "Ouessant", "query": "Chief Quantum Computing Officer"}, language=language)
    assert out["criterion"] == "location"
    assert out["current_value"] == "Ouessant"
    _lacks_waiting(out["message"])
    assert "Ouessant" in out["message"]
    needle = "MÊME tour" if language == "fr" else "SAME turn"
    assert needle in out["message"]


def test_second_pass_directive_single_criterion_still_widens() -> None:
    out = second_pass_directive({"query": "DSI"})
    assert out["criterion"] == "query"
    _lacks_waiting(out["message"])


@pytest.mark.asyncio
async def test_empty_workspace_contacts_carries_the_second_pass_directive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await chat_tools.execute_chat_tool(
        "search_workspace_contacts",
        {"query": "Chief Quantum Computing Officer", "location": "Ouessant"},
        user_id=USER,
        profile_data=None,
    )
    directive = result["second_pass_directive"]
    assert directive["criterion"] == "location"
    assert "MÊME tour" in directive["message"]
    _lacks_waiting(directive["message"])


@pytest.mark.asyncio
async def test_non_empty_workspace_contacts_has_no_directive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {
            "total": 1,
            "truncated": False,
            "contacts": [{"contact_id": "c", "account_id": "a", "company_name": "X", "full_name": "Y"}],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await chat_tools.execute_chat_tool(
        "search_workspace_contacts", {"query": "DSI"}, user_id=USER, profile_data=None
    )
    assert "second_pass_directive" not in result


def test_workspace_contacts_description_no_longer_ends_the_work_on_empty() -> None:
    tool = next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "search_workspace_contacts")
    assert "second passage" in tool["description"]
