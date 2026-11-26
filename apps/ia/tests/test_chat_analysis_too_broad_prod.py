"""#3434 — « Analyse Michelin. » en PROD : un grand groupe non analysé ne part pas.

Recette prod 02/10 (Y18 5c0f2c64e) : Laura répondait « l'analyse de Michelin est
préparée… 8 crédits… première tranche », sans dire que le groupe est trop large ni
demander entité / programme / direction. Le prompt portait déjà la règle
(`_BLOCK_ANALYSIS_SCOPE`) mais le modèle l'ignorait : la règle vit donc dans la FORME
du chemin — la préparation d'un groupe trop large ne rend NI jeton NI coût à annoncer,
seulement la question de périmètre.

Le tour rejoué : entrée « Analyse Michelin. » → outil `plan_account_analysis` → réponse
de l'outil que le modèle lit.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-1111-1111-111111111111"

_GUARDRAIL = {"suggestedScopeMode": "business_unit", "reason": "grande entreprise"}


async def _plan(monkeypatch, plan: dict, company: str = "Michelin") -> dict:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_plan(user_id, *, company, locale="fr"):
        return plan

    monkeypatch.setattr(bellum_api, "plan_account_analysis", fake_plan)
    return await execute_chat_tool("plan_account_analysis", {"company": company}, user_id=USER, profile_data=None)


def _plan_of(**overrides) -> dict:
    plan = {
        "account": None,
        "costCredits": 8,
        "creditsLeft": 40,
        "preset": "free",
        "questions": [],
        "planToken": "tok",
    }
    plan.update(overrides)
    return plan


@pytest.mark.asyncio
async def test_a_too_broad_group_returns_the_scope_question_not_a_plan(monkeypatch):
    result = await _plan(monkeypatch, _plan_of(scopeGuardrail=_GUARDRAIL))
    assert result["scope_required"] is True
    assert result["status"] == "scope_required"
    instruction = result["instruction"].lower()
    for word in ("trop large", "entité", "programme", "direction"):
        assert word in instruction


@pytest.mark.asyncio
async def test_a_too_broad_group_has_no_token_and_no_cost_to_announce(monkeypatch):
    result = await _plan(monkeypatch, _plan_of(scopeGuardrail=_GUARDRAIL))
    assert "plan_token" not in result
    assert "cost_credits" not in result
    assert "credits_left_after" not in result


@pytest.mark.asyncio
async def test_a_narrowed_company_still_gets_its_plan(monkeypatch):
    """Le périmètre nommé relance la préparation : sans garde-fou, jeton et coût reviennent."""
    result = await _plan(monkeypatch, _plan_of(), company="Michelin — direction Data/IA France")
    assert result["plan_token"] == "tok"
    assert "cost_credits" not in result  # #4464 — jamais de coût vers Laura
    assert "scope_required" not in result


@pytest.mark.asyncio
async def test_an_already_analysed_group_without_scope_also_asks_the_scope_question(monkeypatch):
    """#3434.3 — le pont n'émet le garde-fou sur un dossier EXISTANT que s'il est sans
    périmètre (run au groupe entier / aucun run lisible) : la question passe avant
    toute nouvelle analyse payante, et le dossier existant reste DIT (date)."""
    account = {"id": "a1", "companyName": "Michelin", "analysedAt": "2026-09-29T10:00:00Z"}
    result = await _plan(monkeypatch, _plan_of(account=account, scopeGuardrail=_GUARDRAIL))
    assert result["scope_required"] is True
    assert result["status"] == "scope_required"
    assert "plan_token" not in result and "cost_credits" not in result
    assert result["analysed_at"] == "2026-09-29T10:00:00Z"
    assert "déjà" in result["instruction"].lower()


@pytest.mark.asyncio
async def test_an_already_analysed_and_scoped_group_keeps_its_plan(monkeypatch):
    """Sans garde-fou du pont (dossier déjà cadré), jeton et coût reviennent."""
    account = {"id": "a1", "companyName": "Michelin", "analysedAt": "2026-09-29T10:00:00Z"}
    result = await _plan(monkeypatch, _plan_of(account=account))
    assert result["plan_token"] == "tok"
    assert "scope_required" not in result


# ── Rejeu de bout en bout : « Analyse Michelin. » avec la réponse API des DEUX cas ──
#
# Les deux causes que la recette prod n'a pas départagées (a : le candidat jugé
# n'était pas l'entité GE / tranche ouverte ; b : un dossier existant désactivait
# la question). Dans les deux, l'API (désormais corrigée) rend un `scopeGuardrail` ;
# le résultat d'outil remis au modèle doit porter `scope_required`, et la consigne
# du prompt doit lui imposer la question AVANT toute offre de crédits.

_API_CASES = {
    "a_tranche_ouverte_aucun_dossier": _plan_of(scopeGuardrail=_GUARDRAIL),
    "b_dossier_existant_sans_perimetre": _plan_of(
        account={"id": "a1", "companyName": "Michelin", "analysedAt": "2026-03-02T10:00:00Z", "status": "completed"},
        scopeGuardrail=_GUARDRAIL,
    ),
}


@pytest.mark.asyncio
@pytest.mark.parametrize("case", sorted(_API_CASES))
async def test_replay_analyse_michelin_hands_scope_required_to_the_model(monkeypatch, case):
    result = await _plan(monkeypatch, _API_CASES[case], company="Michelin")
    assert result["scope_required"] is True
    assert result["status"] == "scope_required"
    assert result["scope_guardrail"]["suggested_scope_mode"] == "business_unit"
    for key in ("plan_token", "cost_credits", "credits_left", "credits_left_after"):
        assert key not in result
    assert "n'annonce aucun coût" in result["instruction"]


def test_the_prompt_forces_the_scope_question_before_any_credit_offer():
    from app.prompts.bellum_advisor import _BLOCK_ANALYSIS_SCOPE, build_system_prompt

    block = _BLOCK_ANALYSIS_SCOPE
    assert "scope_required" in block
    rule = block[block.index("scope_required") :]
    assert "AVANT" in rule
    assert "tu n'offres aucune analyse" in rule
    # La règle est bien embarquée dans le prompt réel remis au modèle.
    assert block in build_system_prompt({}, {}, "", "")


# ── Recette prod 03/10 (Y23) « Analyse Michelin. » — la redite texte / puces ──────────────────────
# Le texte de Laura citait « Data/IA France… » ET les boutons (`offer_reply_options`) le
# répétaient : deux fois la même liste. L'instruction de l'outil énumérait elle-même les
# périmètres entre parenthèses, et l'EXEMPLE du prompt les écrivait dans la phrase — le
# modèle recopie. Les périmètres ne voyagent plus QUE par les boutons.


@pytest.mark.asyncio
async def test_the_scope_instruction_sends_the_choices_through_buttons_and_never_lists_them_in_the_text(monkeypatch):
    result = await _plan(monkeypatch, _plan_of(scopeGuardrail=_GUARDRAIL))
    instruction = result["instruction"]
    assert "offer_reply_options" in instruction
    assert "ne les énumère pas" in instruction
    # Plus d'énumération prête à recopier avant l'exemple de `company`.
    assert "Data/IA, entités en France" not in instruction


def test_the_prompt_example_asks_the_scope_question_without_listing_the_choices():
    from app.prompts.bellum_advisor import _BLOCK_ANALYSIS_SCOPE

    example = next(line for line in _BLOCK_ANALYSIS_SCOPE.splitlines() if line.startswith("EXEMPLE ATTENDU"))
    assert "Data/IA France, une filiale précise" not in example
    assert "Quelle entité ou direction t'intéresse ?" in example
    assert "offer_reply_options" in _BLOCK_ANALYSIS_SCOPE
