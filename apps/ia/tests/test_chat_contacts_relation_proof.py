"""#3231 (#219.8, X50) — Laura lit la relation personne↔entreprise DÉCLARÉE.

Avant : la colonne pilotait le message « Contacter » mais aucun outil de lecture
ne la relayait — Laura proposait un ancien salarié comme point d'entrée actuel.
Rejeu : pont (simulé) → outil → ligne relayée au modèle.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"


async def _run(tool: str, payload: dict) -> dict:
    return await chat_tools.execute_chat_tool(tool, payload, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_la_recherche_de_contacts_relaie_la_relation_et_la_preuve_exigee(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {
            "total": 2,
            "truncated": False,
            "contacts": [
                {"contact_id": "c-1", "full_name": "Camille", "declared_person_company_relation": "employee_former"},
                {"contact_id": "c-2", "full_name": "Dominique"},
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run("search_workspace_contacts", {"query": "DSI"})
    former, other = result["contacts"]
    assert former["person_company_relation"] == "employee_former"
    assert "confirmation" in former["relation_proof"]
    assert "declared_person_company_relation" not in former
    assert "person_company_relation" not in other and "relation_proof" not in other


@pytest.mark.asyncio
async def test_les_contacts_d_un_compte_relaient_la_meme_consigne(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def contacts(*_a: object, **_k: object) -> dict:
        return {
            "total": 1,
            "truncated": False,
            "account_sector": None,
            "contacts": [
                {
                    "contact_id": "c-1",
                    "full_name": "Camille",
                    "declared_person_company_relation": "consultant_presented",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "account_contacts", contacts)
    result = await _run("get_account_contacts", {"account_id": "a-1"})
    row = result["contacts"][0]
    assert row["person_company_relation"] == "consultant_presented"
    assert "preuve de mission" in row["relation_proof"]
