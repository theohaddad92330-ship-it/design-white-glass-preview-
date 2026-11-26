"""Épopée #2778 — `search_talents` reste en texte : aucune carte `consultant_shortlist`.

Mesuré le 25/09/2026 : le bloc `consultant_shortlist` existe (`reply_blocks.py`,
`reply-blocks.ts`), son rendu web existe (`ConsultantShortlistCard.tsx`) — mais
rien dans la description de l'outil `search_talents` ne dit au modèle de la
remplir, et sans instruction dans l'outil lui-même le modèle retombe sur une
liste en prose. Même défaut que celui déjà corrigé pour `get_account_briefing`
(`account_card`). Le second test vérifie que la FORME réellement rendue par
l'outil (`full_name`/`title`/`skills`/`availability`, cf. l'exécuteur
`search_talents`) peut effectivement remplir la carte que l'instruction promet
— sans quoi le modèle serait renvoyé vers une carte qu'aucune donnée ne peut
jamais valider.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_search_talents_instructs_the_consultant_shortlist_card() -> None:
    description = _tool("search_talents")["description"]
    assert "carte `consultant_shortlist`" in description


@pytest.mark.asyncio
async def test_search_talents_output_can_fill_the_consultant_shortlist_card(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _search_talents(*_a: object, **_k: object) -> dict:
        return {
            "items": [
                {
                    "id": "t-1",
                    "fullName": "Claire Dubois",
                    "title": "Lead DevOps",
                    "availability": "available",
                    "availableFrom": None,
                    "topSkills": [{"label": "Kubernetes"}, {"label": "Terraform"}],
                }
            ],
            "total": 1,
        }

    monkeypatch.setattr(bellum_api, "search_talents", _search_talents)
    result = await execute_chat_tool("search_talents", {}, user_id=USER, profile_data=None)
    talent = result["talents"][0]
    card = {
        "type": "consultant_shortlist",
        "items": [
            {
                "name": talent["full_name"],
                "headline": talent["title"],
                "fit": talent["skills"],
                "availability": talent["availability"],
            }
        ],
    }
    assert validate_reply_block(card) is not None


# #3222 (épopée « Corpus cinq comptes... ») — le tiroir « Ville et rayon »
# existait déjà côté API/écran (`talentSearchQuerySchema`), jamais exposé à
# Laura : sans lui, « un consultant Java à Lyon » ne pouvait pas se filtrer par
# ville — capacité manquante nommée par le triage de #3222 (reverse market).
def test_search_talents_exposes_zone_and_radius() -> None:
    tool = _tool("search_talents")
    assert "zone" in tool["input_schema"]["properties"]
    assert "radius_km" in tool["input_schema"]["properties"]
    assert "zone" in tool["description"] or "ville" in tool["description"]


@pytest.mark.asyncio
async def test_search_talents_passes_zone_and_radius_to_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    captured: dict[str, object] = {}

    async def _search_talents(*_a: object, **kwargs: object) -> dict:
        captured.update(kwargs)
        return {"items": [], "total": 0}

    monkeypatch.setattr(bellum_api, "search_talents", _search_talents)
    await execute_chat_tool(
        "search_talents",
        {"query": "Java", "zone": "Lyon", "radius_km": 30},
        user_id=USER,
        profile_data=None,
    )
    assert captured["zone"] == "Lyon"
    assert captured["radius_km"] == 30


@pytest.mark.asyncio
async def test_search_talents_relays_the_declared_zones_of_each_talent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _search_talents(*_a: object, **_k: object) -> dict:
        return {
            "items": [
                {
                    "id": "t-1",
                    "fullName": "Claire Dubois",
                    "title": "Lead DevOps",
                    "availability": "available",
                    "availableFrom": None,
                    "topSkills": [{"label": "Java"}],
                    "zones": ["Lyon"],
                }
            ],
            "total": 1,
        }

    monkeypatch.setattr(bellum_api, "search_talents", _search_talents)
    result = await execute_chat_tool(
        "search_talents", {"query": "Java", "zone": "Lyon"}, user_id=USER, profile_data=None
    )
    assert result["talents"][0]["zones"] == ["Lyon"]
