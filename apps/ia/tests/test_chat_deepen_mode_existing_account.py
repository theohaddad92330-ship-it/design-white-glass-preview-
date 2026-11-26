"""#3218 — mode « Approfondi » sur un compte DÉJÀ analysé : on lance, on ne redemande pas.

Recette Z7 (05/10) : « Lance maintenant l'analyse approfondie de BNP Paribas » en
mode Approfondi → Laura répondait « déjà analysé le 03/10, trop large, quelle entité ? »
(`scope_required`) et ne lançait rien. Le mode explicite est la décision de la
personne : sur un dossier existant, la préparation garde son jeton et son coût, et la
consigne dit de lancer (ou, si l'ambiguïté d'entité est réelle, d'offrir des choix
cliquables) — jamais une question ouverte. Les autres modes gardent `scope_required`.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_requested_mode import requested_mode_scope
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-1111-1111-111111111111"
_GUARDRAIL = {"suggestedScopeMode": "business_unit", "reason": "grande entreprise"}
_ACCOUNT = {"id": "a1", "companyName": "BNP Paribas", "analysedAt": "2026-10-03T10:00:00Z"}


async def _plan(monkeypatch, plan: dict) -> dict:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_plan(user_id, *, company, locale="fr"):
        return plan

    monkeypatch.setattr(bellum_api, "plan_account_analysis", fake_plan)
    return await execute_chat_tool("plan_account_analysis", {"company": "BNP Paribas"}, user_id=USER, profile_data=None)


def _plan_of(**overrides) -> dict:
    plan = {"account": _ACCOUNT, "costCredits": 8, "creditsLeft": 40, "preset": "free", "planToken": "tok"}
    plan.update(overrides)
    return plan


@pytest.mark.asyncio
async def test_approfondi_on_an_analysed_group_keeps_token_and_launches(monkeypatch):
    with requested_mode_scope("approfondi"):
        result = await _plan(monkeypatch, _plan_of(scopeGuardrail=_GUARDRAIL))
    assert "scope_required" not in result
    assert result["plan_token"] == "tok"
    assert result["analysed_at"] == "2026-10-03T10:00:00Z"
    assert "start_account_analysis" in result["instruction"]
    assert "offer_reply_options" in result["instruction"]


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", [None, "auto", "rapide", "verifie"])
async def test_other_modes_still_ask_the_scope_question(monkeypatch, mode):
    with requested_mode_scope(mode):
        result = await _plan(monkeypatch, _plan_of(scopeGuardrail=_GUARDRAIL))
    assert result["scope_required"] is True
    assert "plan_token" not in result


@pytest.mark.asyncio
async def test_approfondi_on_a_never_analysed_group_still_asks_the_scope(monkeypatch):
    with requested_mode_scope("approfondi"):
        result = await _plan(monkeypatch, _plan_of(account=None, scopeGuardrail=_GUARDRAIL))
    assert result["scope_required"] is True
