"""#3876.5 (lot Q06, recette prod 10/10) — « ESN à Marseille » : texte seul, aucune carte vers
Découvrir. Quand la demande est « entreprises/ESN dans <ville> », la porte pose une carte
« Action à valider » (Découvrir filtré sur la ville) même si le modèle n'a pas appelé l'outil,
ou si son appel (secteur + effectif) est revenu à zéro. Aucune entreprise n'est nommée."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_orchestrator
from app.services.chat_orchestrator import ensure_city_search_card

USER = "33333333-4333-4333-8333-333333333333"
PROPOSAL = {"status": "pending_confirmation", "proposal": {"action": "find_accounts", "city": "Marseille", "cost_credits": 0}}


def _spy(monkeypatch: pytest.MonkeyPatch, out: dict[str, Any]) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def fake(name: str, tool_input: dict[str, Any], **_kw: Any) -> dict[str, Any]:
        calls.append({"name": name, "input": tool_input})
        return out

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", fake)
    return calls


@pytest.mark.asyncio
async def test_a_city_request_without_card_gets_the_discover_card(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch, PROPOSAL)
    actions: list[dict[str, Any]] = []
    await ensure_city_search_card("ESN à Marseille", actions, user_id=USER, profile_data=None)
    assert calls == [{"name": "find_accounts", "input": {"city": "Marseille"}}]
    assert actions[0]["proposal"]["city"] == "Marseille"
    assert actions[0]["status"] == "pending_confirmation"


@pytest.mark.asyncio
async def test_a_failed_model_call_does_not_block_the_card(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch, PROPOSAL)
    actions: list[dict[str, Any]] = [{"tool": "find_accounts", "input": {"city": "Marseille", "sectors": ["x"]}, "status": "error"}]
    await ensure_city_search_card("ESN à Marseille", actions, user_id=USER, profile_data=None)
    assert len(calls) == 1
    assert actions[-1]["proposal"] is not None


@pytest.mark.asyncio
async def test_no_second_card_when_the_model_already_proposed_one(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch, PROPOSAL)
    actions: list[dict[str, Any]] = [
        {"tool": "find_accounts", "input": {}, "status": "pending_confirmation", "proposal": {"action": "find_accounts"}}
    ]
    await ensure_city_search_card("ESN à Marseille", actions, user_id=USER, profile_data=None)
    assert calls == []
    assert len(actions) == 1


@pytest.mark.asyncio
async def test_a_request_that_is_not_a_city_search_is_left_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch, PROPOSAL)
    actions: list[dict[str, Any]] = []
    await ensure_city_search_card("mes ESN à Marseille", actions, user_id=USER, profile_data=None)
    await ensure_city_search_card("Où en est mon pipe ?", actions, user_id=USER, profile_data=None)
    assert calls == []
    assert actions == []


@pytest.mark.asyncio
async def test_a_refused_search_adds_no_card(monkeypatch: pytest.MonkeyPatch) -> None:
    # sait dire NON : la commune non reconnue ou la source en panne → aucune carte inventée.
    _spy(monkeypatch, {"error": "Aucun critère exploitable."})
    actions: list[dict[str, Any]] = []
    await ensure_city_search_card("ESN à Marseille", actions, user_id=USER, profile_data=None)
    assert actions == []


@pytest.mark.asyncio
async def test_a_startup_city_request_keeps_the_startup_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    # #3941.1 (18/10) — « startups fintech à Paris » : la carte ne portait que la ville, le clic
    # ouvrait Découvrir sans le chip « Startup » alors que Laura annonçait la contrainte.
    calls = _spy(monkeypatch, PROPOSAL)
    await ensure_city_search_card("startups fintech à Paris", [], user_id=USER, profile_data=None)
    assert calls == [{"name": "find_accounts", "input": {"city": "Paris", "company_profile": "startup"}}]


@pytest.mark.asyncio
async def test_a_non_startup_city_request_adds_no_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch, PROPOSAL)
    await ensure_city_search_card("ESN à Marseille", [], user_id=USER, profile_data=None)
    assert "company_profile" not in calls[0]["input"]
