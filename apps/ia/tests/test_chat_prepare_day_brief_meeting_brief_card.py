"""Épopée #2778 (54 outils de lecture sans carte structurée) — `prepare_day_brief`.

Mesuré le 26/09/2026 : la carte `meeting_brief` existe déjà (`reply-blocks.ts`,
`reply_blocks.py`), son rendu web aussi (`MeetingBriefCard.tsx`) — et la
description de `prepare_day_brief` décrit déjà, mot pour mot, la forme d'un
`meeting_brief` (« qui, sur quoi, l'objectif, les questions à poser, ce qui
reste à vérifier ») sans jamais dire au modèle de la remplir. Même défaut que
celui déjà corrigé pour `compare_accounts`/`get_account_briefing`/etc.

En creusant la forme réelle rendue par l'exécuteur, un second défaut est
apparu : il lisait `event.get("title")`, alors que le pont NestJS
(`CopilotAccountsSearchController` voisin, `dayBrief` dans
`copilot-bridge.controller.ts`) relaie des `AgendaEvent` dont le champ est
`summary` (`packages/contracts/src/schemas/agenda.ts:30`) — jamais `title`.
Personne ne l'avait vu parce que les deux tests existants
(`test_chat_tool_output_bounds_lot18.py`) fabriquent leurs propres évènements
avec la clé `title`, cohérents avec le bug plutôt qu'avec le pont réel : une
carte `meeting_brief` aurait rendu un sujet de réunion vide sur CHAQUE
rendez-vous en production. Corrigé ici, à côté de l'instruction de carte,
parce qu'une carte qui promet « sur quoi » avec un champ toujours vide ne
tiendrait pas sa promesse.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_prepare_day_brief_instructs_the_meeting_brief_card() -> None:
    description = _tool("prepare_day_brief")["description"]
    assert "carte `meeting_brief`" in description
    # Un jour sans rendez-vous ne force jamais une carte vide.
    assert "pas de carte" in description


@pytest.mark.asyncio
async def test_prepare_day_brief_reads_the_real_agenda_field_name(monkeypatch: pytest.MonkeyPatch) -> None:
    """SAIT LIRE — le pont NestJS rend `summary` (AgendaEvent), jamais `title` :
    un champ inventé aurait laissé la carte sans sujet sur chaque rendez-vous."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _day_brief(*_a: object, **_k: object) -> dict:
        return {
            "day": "2026-09-15",
            "events": [
                {
                    "summary": "Point hebdo ACME",
                    "start": "2026-09-15T09:00:00Z",
                    "end": "2026-09-15T09:30:00Z",
                    "attendees": [{"email": "j.morvan@acme.fr", "displayName": "Julie Morvan"}],
                    "location": None,
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "day_brief", _day_brief)
    result = await execute_chat_tool(
        "prepare_day_brief",
        {"day": "2026-09-15"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["events"][0]["title"] == "Point hebdo ACME"


@pytest.mark.asyncio
async def test_prepare_day_brief_output_can_fill_the_meeting_brief_card(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _day_brief(*_a: object, **_k: object) -> dict:
        return {
            "day": "2026-09-15",
            "events": [
                {
                    "summary": "Point hebdo ACME",
                    "start": "2026-09-15T09:00:00Z",
                    "end": "2026-09-15T09:30:00Z",
                    "attendees": [{"email": "j.morvan@acme.fr", "displayName": "Julie Morvan"}],
                    "location": None,
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "day_brief", _day_brief)
    result = await execute_chat_tool(
        "prepare_day_brief",
        {"day": "2026-09-15"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    event = result["events"][0]
    card = {
        "type": "meeting_brief",
        "title": event["title"],
        "when": event["start"],
        "objective": "Faire le point hebdomadaire sur le compte ACME.",
        "talking_points": ["Avancement du point hebdo précédent."],
    }
    assert validate_reply_block(card) is not None


@pytest.mark.asyncio
async def test_a_day_without_meetings_yields_no_card_content(monkeypatch: pytest.MonkeyPatch) -> None:
    """SAIT DIRE NON — `meeting_brief.talking_points` exige au moins un item :
    un jour sans rendez-vous ne peut pas remplir cette carte, c'est exactement
    pourquoi la description dit de ne pas la forcer."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _day_brief(*_a: object, **_k: object) -> dict:
        return {"day": "2026-09-15", "events": []}

    monkeypatch.setattr(bellum_api, "day_brief", _day_brief)
    result = await execute_chat_tool(
        "prepare_day_brief",
        {"day": "2026-09-15"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["events"] == []
    card = {"type": "meeting_brief", "objective": "x", "talking_points": []}
    assert validate_reply_block(card) is None
