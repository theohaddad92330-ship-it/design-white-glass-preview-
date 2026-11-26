"""#5014 — Laura dit qu'elle n'a pas lu le CRM quand l'espace n'a AUCUN import.

Distinct de « Aucun CRM connecté » (`context_transparency`) : ici on parle des DOSSIERS importés
(`importedCount`, compté par l'API). Absent → rien n'est affirmé ; > 0 → pas de note.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "55555555-5555-4555-8555-555555555555"


def _output(**extra: Any) -> dict[str, Any]:
    return {
        "now": [],
        "toVerify": [],
        "toWatch": [],
        "notNow": [],
        "counts": {"now": 0, "toVerify": 0, "toWatch": 0, "notNow": 0, "total": 3, "outsideNow": 3},
        **extra,
    }


async def _run(monkeypatch: pytest.MonkeyPatch, payload: dict[str, Any]) -> dict[str, Any]:
    async def _pp(*_a: object, **_k: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "portfolio_priorities", _pp)
    return await execute_chat_tool("get_portfolio_priorities", {}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_aucun_import_est_dit(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(monkeypatch, _output(importedCount=0))
    note = out["crm_import_note"]
    assert "pas importé" in note
    assert "je n'ai pas lu" in note.lower()


@pytest.mark.asyncio
async def test_un_import_present_ne_dit_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(monkeypatch, _output(importedCount=4))
    assert "crm_import_note" not in out


@pytest.mark.asyncio
async def test_compte_absent_n_affirme_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(monkeypatch, _output())
    assert "crm_import_note" not in out


# #5014.2 — CRM CONNECTÉ (état de connexion réel, résolu côté serveur) + zéro import : Laura le dit
# tel quel, sans jamais nommer le fournisseur. Sans CRM : la phrase historique ci-dessus.
async def _run_connected(monkeypatch: pytest.MonkeyPatch, payload: dict[str, Any]) -> dict[str, Any]:
    async def _pp(*_a: object, **_k: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "portfolio_priorities", _pp)
    return await execute_chat_tool(
        "get_portfolio_priorities",
        {},
        user_id=USER,
        profile_data=None,
        crm_connected=True,
        crm_provider="hubspot",
    )


@pytest.mark.asyncio
async def test_crm_connecte_sans_import_le_dit(monkeypatch: pytest.MonkeyPatch) -> None:
    note = (await _run_connected(monkeypatch, _output(importedCount=0)))["crm_import_note"]
    assert "ton CRM est connecté" in note
    assert "aucune fiche importée encore" in note
    # Ne dit pas « pas de CRM » quand il y en a un, et ne nomme JAMAIS le fournisseur.
    assert "il n'est pas importé" not in note
    assert "hubspot" not in note.lower()


@pytest.mark.asyncio
async def test_aucun_crm_garde_la_phrase_actuelle(monkeypatch: pytest.MonkeyPatch) -> None:
    note = (await _run(monkeypatch, _output(importedCount=0)))["crm_import_note"]
    assert "il n'est pas importé" in note
    assert "ton CRM est connecté" not in note


@pytest.mark.asyncio
async def test_crm_connecte_avec_import_ne_dit_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run_connected(monkeypatch, _output(importedCount=4))
    assert "crm_import_note" not in out
