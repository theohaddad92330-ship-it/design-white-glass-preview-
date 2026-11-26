"""G.1 (recette R3, 19/10) — « crée un événement demain 23 h » : Laura PRÉPARE, l'utilisateur valide.

Avant ce point, le chat répondait « Je ne peux pas créer directement un événement… » alors que la grille de
l'agenda branché disait « Lire, Créer, Planifier » : l'outil n'existait pas. Il rend une PROPOSITION (une carte à
valider, comme le brouillon) ; le clic crée l'événement par l'intent d'agenda existant (`create_calendar_event`).
"""

from __future__ import annotations

import pytest

from app.services import chat_tools


@pytest.mark.asyncio
async def test_prepare_calendar_event_only_proposes() -> None:
    result = await chat_tools.execute_chat_tool(
        "prepare_calendar_event",
        {"title": "Point SNCF", "starts_at": "2026-10-20T23:00:00+02:00", "duration_minutes": 45},
        user_id="u1",
        profile_data=None,
    )
    assert result["status"] == "pending_confirmation"
    proposal = result["proposal"]
    assert proposal["action"] == "prepare_calendar_event"
    assert proposal["cost_credits"] == 0
    assert proposal["title"] == "Point SNCF"
    assert proposal["starts_at"] == "2026-10-20T23:00:00+02:00"
    assert proposal["duration_minutes"] == 45
    # Aucun invité inventé : champ absent, jamais une liste devinée.
    assert "attendees" not in proposal


@pytest.mark.asyncio
async def test_prepare_calendar_event_keeps_only_named_guests() -> None:
    result = await chat_tools.execute_chat_tool(
        "prepare_calendar_event",
        {"title": "Revue", "starts_at": "2026-10-21T10:00:00Z", "attendees": ["claire@acme.example", "pas-un-mail"]},
        user_id="u1",
        profile_data=None,
    )
    assert result["proposal"]["attendees"] == ["claire@acme.example"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"title": "", "starts_at": "2026-10-20T23:00:00+02:00"},
        {"title": "Sans fuseau", "starts_at": "2026-10-20T23:00:00"},
        {"title": "Date illisible", "starts_at": "demain 23 h"},
    ],
)
async def test_prepare_calendar_event_refuses_an_incomplete_event(payload: dict[str, str]) -> None:
    result = await chat_tools.execute_chat_tool("prepare_calendar_event", payload, user_id="u1", profile_data=None)
    assert "error" in result
    assert "proposal" not in result


def test_prepare_calendar_event_is_a_write_tool_gated_on_the_calendar_family() -> None:
    assert "prepare_calendar_event" in chat_tools.WRITE_TOOL_NAMES
    assert chat_tools.TOOL_REQUIRED_FAMILIES["prepare_calendar_event"] == ("calendar",)
    with_calendar = {tool["name"] for tool in chat_tools.tools_for(["calendar"])}
    without = {tool["name"] for tool in chat_tools.tools_for([])}
    assert "prepare_calendar_event" in with_calendar
    # Sait dire NON : sans agenda branché, l'outil n'est pas présenté au modèle.
    assert "prepare_calendar_event" not in without
