"""#3181.1/.5/.6, #3182.1 — recette écran 29/09 : après un verdict RÉSERVE / WATCH /
NO_GO_NOW obtenu par `get_account_suitability_verdict` (le verdict que Laura lit
réellement pour « Doctolib »), la relance « Alors, on fait quoi ? » donnait UN
plan, 0 alternative : ni le prompt ni l'outil de verdict ne nommaient
`suggest_account_alternatives`, et celui-ci refusait un compte dont seul
l'autre vocabulaire de verdict existait.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.chat_tools import execute_chat_tool

USER = "44444444-4444-4444-8444-444444444444"


def _stub_account(monkeypatch: pytest.MonkeyPatch, account: dict[str, Any]) -> None:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(return_value=account))


def _stub_verdict(monkeypatch: pytest.MonkeyPatch, verdict: str) -> None:
    monkeypatch.setattr(
        "app.services.chat_tools.compute_account_suitability",
        lambda *_a, **_k: {"verdict": verdict, "unknowns": []},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("verdict", ["WATCH", "GO_AFTER_PROOF", "NO_GO_NOW"])
async def test_a_non_go_suitability_verdict_orders_the_alternatives_call(
    monkeypatch: pytest.MonkeyPatch, verdict: str
) -> None:
    _stub_account(monkeypatch, {"id": "acc-1", "company_name": "Doctolib", "raw_analysis": {}})
    _stub_verdict(monkeypatch, verdict)
    result = await execute_chat_tool(
        "get_account_suitability_verdict", {"account_id": "acc-1"}, user_id=USER, profile_data=None
    )
    # #3181.1 — le verdict ne se rend jamais seul : il désigne l'outil suivant.
    step = result["next_step"]
    assert step["tool"] == "suggest_account_alternatives"
    assert step["account_id"] == "acc-1"
    assert "sectors" in step["instruction"]


@pytest.mark.asyncio
@pytest.mark.parametrize("verdict", ["GO_NOW", "NOT_EVALUABLE"])
async def test_no_alternatives_order_when_there_is_nothing_to_replace(
    monkeypatch: pytest.MonkeyPatch, verdict: str
) -> None:
    _stub_account(monkeypatch, {"id": "acc-1", "company_name": "Doctolib", "raw_analysis": {}})
    _stub_verdict(monkeypatch, verdict)
    result = await execute_chat_tool(
        "get_account_suitability_verdict", {"account_id": "acc-1"}, user_id=USER, profile_data=None
    )
    assert "next_step" not in result


@pytest.mark.asyncio
async def test_alternatives_tool_accepts_an_account_known_only_by_its_suitability_verdict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Pas de `plan.evaluation.verdict` : avant le correctif, « pas de verdict ».
    _stub_account(monkeypatch, {"id": "acc-1", "company_name": "Doctolib", "siren": "1", "raw_analysis": {}})
    _stub_verdict(monkeypatch, "WATCH")

    async def _search(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"items": []}

    monkeypatch.setattr("app.services.chat_tools._run_account_search", _search)
    result = await execute_chat_tool(
        "suggest_account_alternatives",
        {"account_id": "acc-1", "sectors": ["it"]},
        user_id=USER,
        profile_data=None,
    )
    assert "error" not in result
    # Aucune alternative : l'absence se NOMME avec sa raison (#3181.6).
    assert result["no_alternative_note"]


def test_prompt_names_the_suitability_verdict_as_a_trigger() -> None:
    from app.prompts.bellum_advisor import build_system_prompt

    prompt = build_system_prompt({}, {}, "", "")
    assert "get_account_suitability_verdict" in prompt.split("UN VERDICT QUI N'EST PAS AGIR MAINTENANT")[1][:900]


def test_portfolio_prioritisation_prompt_routes_to_the_four_category_tool() -> None:
    # #3209 (recette 29/09) — le bloc « TROIS COMPTES AU PLUS » captait
    # « priorise mon portefeuille » et ne nommait jamais l'outil de répartition.
    from app.prompts.bellum_advisor import build_system_prompt

    prompt = build_system_prompt({}, {}, "", "")
    block = prompt.split("EXCEPTION — LA RÉPARTITION DES COMPTES SUIVIS")[1][:1500]
    assert "get_portfolio_priorities" in block
    for category in ("MAINTENANT", "À VÉRIFIER", "À SURVEILLER", "À NE PAS TRAVAILLER"):
        assert category in block
    assert "condition d'arrêt" in block
    assert "se NOMME vide" in block


def test_3466_a_pure_verdict_request_gets_one_sentence_not_an_unrequested_block() -> None:
    """#3466 — « verdict sur Société Générale » recevait un bloc d'alternatives hors sujet."""
    from app.prompts.bellum_advisor import build_system_prompt

    rule = build_system_prompt({}, {}, "", "").split("UN VERDICT QUI N'EST PAS AGIR MAINTENANT")[1][:1800]
    assert "que le verdict" in rule.lower()
    assert "première tranche" in rule


@pytest.mark.asyncio
async def test_3466_the_next_step_instruction_is_conditioned_on_the_question(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_account(monkeypatch, {"id": "acc-1", "company_name": "Doctolib", "raw_analysis": {}})
    _stub_verdict(monkeypatch, "WATCH")
    result = await execute_chat_tool(
        "get_account_suitability_verdict", {"account_id": "acc-1"}, user_id=USER, profile_data=None
    )
    instruction = result["next_step"]["instruction"]
    assert "QUE le verdict" in instruction
    assert not instruction.startswith("Appelle suggest_account_alternatives")
