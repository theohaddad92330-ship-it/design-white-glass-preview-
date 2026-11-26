"""#4057 — « donne-moi les interlocuteurs cyber de Renault » : quand le portefeuille n'a
pas la personne, la réponse est LA CARTE `propose_people_search` (expertise
pré-remplie, coût affiché, rien débité sans clic) — jamais un texte « aucun
interlocuteur cyber », jamais une question TJM / volume / horizon.

Le routage vit là où le modèle rédige : dans le RÉSULTAT vide de la lecture, pas
seulement dans le prompt (même patron que `second_pass_directive`, #3343)."""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"


async def _run(payload: dict) -> dict:
    return await chat_tools.execute_chat_tool("search_workspace_contacts", payload, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_an_empty_people_search_hands_over_to_the_people_search_card(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(user_id: str, **kwargs: object) -> dict:
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"company": "Renault", "query": "cyber"})
    directive = result["people_search_directive"]
    assert "propose_people_search" in directive
    assert "expertise" in directive
    assert "TJM" in directive  # …et on n'en pose AUCUNE question
    assert "aucun interlocuteur" in directive  # le texte seul est nommé comme l'échec


@pytest.mark.asyncio
async def test_a_search_that_finds_people_carries_no_hand_over(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(user_id: str, **kwargs: object) -> dict:
        return {
            "total": 1,
            "truncated": False,
            "contacts": [
                {
                    "id": "c1",
                    "full_name": "Claire Dubois",
                    "title": "RSSI",
                    "account_id": "a1",
                    "company_name": "Renault",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"company": "Renault", "query": "RSSI"})
    assert "people_search_directive" not in result


def test_the_read_tools_name_the_card_for_an_empty_answer() -> None:
    description = next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "search_workspace_contacts")["description"]
    assert "people_search_directive" in description
