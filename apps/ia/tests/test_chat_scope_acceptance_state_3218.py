"""#3218 (recette NB 10/10) — « lance-la » après la question de périmètre la REPOSAIT.

Le prompt le disait déjà ; le modèle rappelait `plan_account_analysis` sur le groupe et
l'outil rendait de nouveau `scope_required`. L'état du fil est donc lu par l'outil :
une question de périmètre déjà posée + un acquiescement court = consigne de lancer sur le
PREMIER périmètre proposé, jamais une seconde question.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-1111-1111-111111111111"
_GUARDRAIL = {"suggestedScopeMode": "business_unit", "reason": "grande entreprise"}
_ASKED = [
    {"role": "user", "content": "Lance maintenant l'analyse approfondie de BNP Paribas"},
    {"role": "assistant", "content": "BNP Paribas est un groupe trop large. Quel périmètre : direction, entité française ou programme ?"},
]


async def _plan(monkeypatch, message: str, history: list[dict]) -> dict:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_plan(user_id, *, company, locale="fr"):
        return {"account": None, "costCredits": 8, "creditsLeft": 40, "planToken": "t", "scopeGuardrail": _GUARDRAIL}

    monkeypatch.setattr(bellum_api, "plan_account_analysis", fake_plan)
    set_turn_thread(message, history)
    try:
        return await execute_chat_tool("plan_account_analysis", {"company": "BNP Paribas"}, user_id=USER, profile_data=None)
    finally:
        set_turn_thread("", [])


@pytest.mark.asyncio
@pytest.mark.parametrize("message", ["lance-la", "Vas-y", "oui", "ok, fais-le"])
async def test_short_acceptance_after_scope_question_does_not_reask(monkeypatch, message):
    result = await _plan(monkeypatch, message, _ASKED)
    assert "scope_required" not in result
    assert result["status"] == "scope_accepted_default"
    assert "premier périmètre" in result["instruction"]
    # RAN #3218 — le jeton et le coût RESTENT : l'outil rend de quoi lancer tout de suite
    # (un second appel de préparation, c'était l'étape où le modèle s'arrêtait).
    assert result["plan_token"] == "t"
    assert "cost_credits" not in result  # #4464
    assert "start_account_analysis" in result["instruction"]
    assert "ne rappelle pas" in result["instruction"].lower()


@pytest.mark.asyncio
async def test_first_ask_still_asks(monkeypatch):
    result = await _plan(monkeypatch, "Lance l'analyse de BNP Paribas", [])
    assert result["scope_required"] is True


@pytest.mark.asyncio
async def test_acceptance_without_prior_question_still_asks(monkeypatch):
    result = await _plan(monkeypatch, "lance-la", [{"role": "assistant", "content": "Bonjour, que puis-je faire ?"}])
    assert result["scope_required"] is True


@pytest.mark.asyncio
async def test_long_message_is_not_an_acceptance(monkeypatch):
    result = await _plan(monkeypatch, "oui mais finalement je préfère parler du groupe Axa et de ses filiales", _ASKED)
    assert result["scope_required"] is True
