"""#3859 (recette prod 10/10, conv 4f1264f3) — « trouve-moi 5 décideurs IT chez
Lactalis » : Laura dit « aucune fiche Lactalis… vérification interne, l'analyse
reste à lancer » puis s'arrête.

Cause : trois lots n'ont touché que des CONSIGNES (prompt, description d'outil).
Le résultat `search_workspace_accounts` — liste vide — est ce que le modèle lit au
moment de répondre, et il ne portait AUCUN geste suivant (contrairement au refus
« introuvable » des outils de compte, #3195). La liste vide d'une recherche PAR NOM
porte désormais `next_step` : lancer l'analyse (c84), dire la vraie raison si elle
échoue. Une liste NON vide ou une recherche par secteur seul n'en portent pas.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def _bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s3cret")


def _patch_accounts(monkeypatch: pytest.MonkeyPatch, accounts: list[dict[str, Any]]) -> None:
    async def fake(*_a: object, **_kw: object) -> dict[str, Any]:
        return {"accounts": accounts, "total": len(accounts), "truncated": False}

    monkeypatch.setattr(bellum_api, "workspace_accounts", fake)


async def _search(**tool_input: object) -> dict[str, Any]:
    return await execute_chat_tool(
        "search_workspace_accounts", dict(tool_input), user_id=USER, profile_data={}
    )


@pytest.mark.asyncio
async def test_empty_name_search_carries_the_next_step(_bridge: None, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_accounts(monkeypatch, [])
    result = await _search(query="Lactalis")
    step = str(result.get("next_step") or "")
    assert "plan_account_analysis" in step
    assert "start_account_analysis" in step
    # La vraie raison si ça échoue : jamais une impasse.
    assert "raison" in step.lower()


@pytest.mark.asyncio
async def test_found_account_has_no_next_step(_bridge: None, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_accounts(monkeypatch, [{"account_id": "a1", "name": "Lactalis"}])
    result = await _search(query="Lactalis")
    assert "next_step" not in result


@pytest.mark.asyncio
async def test_sector_only_empty_search_has_no_next_step(_bridge: None, monkeypatch: pytest.MonkeyPatch) -> None:
    # « aucune SSII en portefeuille » n'est pas « ce compte n'existe pas » : on ne
    # pousse pas une analyse sur un secteur.
    _patch_accounts(monkeypatch, [])
    result = await _search(sector="SSII")
    assert "next_step" not in result
