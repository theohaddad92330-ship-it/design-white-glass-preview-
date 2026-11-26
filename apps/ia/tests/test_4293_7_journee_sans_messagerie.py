"""#4293.7 (suite de #2770.2) — « Organise-moi ma journée » SANS messagerie branchée.

Une journée proposée qui a l'air complète alors que la boîte n'a pas été lue ment par omission : le plan NOMME
ce qu'il n'a pas pu placer (un bloc « Non placé » avec sa raison). Aucune messagerie n'est branchée ici, aucun
rendez-vous inventé, aucun corps de message lu. Famille inconnue (`None`) = comportement d'avant : on ne
prétend pas qu'une messagerie manque quand on ne sait pas.
(Homonyme sans rapport : `discover_hiring_scope` parle d'un POSTE non placé — autre sujet.)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.services import bellum_api
from app.services.chat_requested_mode import connected_families_scope
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
DAY = "2026-10-01"
_MAILBOX = {"type": "follow_ups", "title": "Traiter la messagerie", "reason": "outil_non_branche"}


@pytest.fixture(autouse=True)
def _agenda(monkeypatch: pytest.MonkeyPatch) -> None:
    async def free(*_a: object, **_k: object) -> list[dict]:
        start = datetime.fromisoformat(f"{DAY}T09:00:00").replace(tzinfo=UTC)
        return [{"start": start.isoformat(), "end": (start + timedelta(minutes=400)).isoformat(), "minutes": 400}]

    monkeypatch.setattr(bellum_api, "find_free_slots", free)


def _block(**overrides: object) -> dict:
    base = {"type": "call_session", "title": "Appels", "duration_minutes": 30, "priority_reason": "Comptes chauds"}
    base.update(overrides)
    return base


async def _plan(blocks: list[dict]) -> dict:
    result = await execute_chat_tool(
        "propose_focus_plan", {"date": DAY, "blocks": blocks}, user_id=USER, profile_data=None
    )
    return result["proposal"]["plan"]


@pytest.mark.asyncio
async def test_without_mailbox_the_day_names_what_it_could_not_place() -> None:
    with connected_families_scope(["calendar"]):
        plan = await _plan([_block()])
    assert [b["title"] for b in plan["blocks"]] == ["Appels"]  # le reste du plan est intact
    assert plan["deferred_blocks"] == [_MAILBOX]


@pytest.mark.asyncio
async def test_with_a_mailbox_nothing_is_added() -> None:
    with connected_families_scope(["calendar", "email"]):
        plan = await _plan([_block()])
    assert plan["deferred_blocks"] == []


@pytest.mark.asyncio
async def test_unknown_families_claim_nothing() -> None:
    plan = await _plan([_block()])
    assert plan["deferred_blocks"] == []


@pytest.mark.asyncio
async def test_a_mail_block_already_deferred_by_laura_is_not_doubled() -> None:
    with connected_families_scope(["calendar"]):
        plan = await _plan([_block(type="follow_ups", title="Relances par mail", requires_tool="email")])
    assert plan["deferred_blocks"] == [
        {"type": "follow_ups", "title": "Relances par mail", "reason": "outil_non_branche"}
    ]


@pytest.mark.asyncio
async def test_an_empty_day_without_mailbox_still_names_it() -> None:
    with connected_families_scope(["calendar"]):
        plan = await _plan([_block(requires_tool="crm")])
    assert plan["blocks"] == []
    assert _MAILBOX in plan["deferred_blocks"]


# #4293.7 — SANS agenda ni messagerie : la journée rend ses gestes « Non placé » au lieu d'une erreur.
@pytest.fixture
def _no_agenda(monkeypatch: pytest.MonkeyPatch) -> None:
    async def none(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "find_free_slots", none)


@pytest.mark.asyncio
async def test_without_agenda_the_gestures_are_all_not_placed_with_their_reason(_no_agenda: None) -> None:
    with connected_families_scope(["crm"]):
        result = await execute_chat_tool(
            "propose_focus_plan",
            {"date": DAY, "blocks": [_block(), _block(type="account_research", title="Recherche")]},
            user_id=USER,
            profile_data=None,
        )
    plan = result["proposal"]["plan"]
    assert plan["blocks"] == []
    assert [b["title"] for b in plan["deferred_blocks"]][:2] == ["Appels", "Recherche"]
    assert {b["reason"] for b in plan["deferred_blocks"]} == {"outil_non_branche"}
    assert plan["connected_tools"] == ["crm"]  # ce que l'espace a branché, nommé
    assert "error" not in result
    assert "sans demander de brancher" in result["note_pour_laura"]  # Laura agit, elle ne demande pas
    assert plan["margin_minutes"] == 0 and plan["blocks"] == []  # jamais affiché : la carte masque la marge à 0 bloc


@pytest.mark.asyncio
async def test_without_agenda_a_blank_day_has_no_filler_block(_no_agenda: None) -> None:
    with connected_families_scope(["email"]):
        result = await execute_chat_tool(
            "propose_focus_plan", {"date": DAY, "blocks": [_block()]}, user_id=USER, profile_data=None
        )
    assert [b["title"] for b in result["proposal"]["plan"]["deferred_blocks"]] == ["Appels"]  # pas de ligne de remplissage


@pytest.mark.asyncio
async def test_a_silent_agenda_bridge_with_calendar_connected_stays_an_error(_no_agenda: None) -> None:
    with connected_families_scope(["calendar"]):
        result = await execute_chat_tool(
            "propose_focus_plan", {"date": DAY, "blocks": [_block()]}, user_id=USER, profile_data=None
        )
    assert "error" in result  # un timeout n'est pas « non branché »


@pytest.mark.asyncio
async def test_unknown_families_without_agenda_keep_the_error(_no_agenda: None) -> None:
    result = await execute_chat_tool(
        "propose_focus_plan", {"date": DAY, "blocks": [_block()]}, user_id=USER, profile_data=None
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_with_agenda_nothing_is_not_placed_for_lack_of_agenda() -> None:
    with connected_families_scope(["calendar", "email"]):
        plan = await _plan([_block()])
    assert [b["title"] for b in plan["blocks"]] == ["Appels"]
    assert plan["deferred_blocks"] == []
