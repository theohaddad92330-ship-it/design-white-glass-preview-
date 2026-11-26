"""#2392 (LAU-FINAL-106) — l'outil `compile_day_closure` : la clôture de fin de
journée, COMPILÉE par l'API sur des données réelles, rendue comme une CARTE.

Ce que ces tests tiennent :
- l'outil est au catalogue, en fin de liste, sans connecteur exigé (les tâches
  vivent dans Bellum) ;
- il rend une PROPOSITION (`pending_confirmation`) : la carte porte les
  décisions tâche par tâche, et rien n'est écrit avant le clic ;
- la clôture est relayée TELLE QUE le pont l'a compilée — le modèle ne
  recompose aucune section, ne compte rien ;
- un pont muet ou éteint se DIT : jamais une clôture vide qui se lirait
  « journée bouclée ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import (
    CHAT_TOOLS,
    TOOL_REQUIRED_FAMILIES,
    WRITE_TOOL_NAMES,
    execute_chat_tool,
)

USER = "44444444-4444-4444-8444-444444444444"

CLOSURE = {
    "date": "2026-09-23",
    "timeZone": "Europe/Paris",
    "tasksState": "ready",
    "tasksReason": None,
    "results": [
        {
            "id": "t1",
            "title": "Envoyer le compte rendu",
            "dueOn": "2026-09-23",
            "priority": "normal",
            "ownerId": None,
            "ownerName": None,
            "accountName": "Thales",
            "contactName": None,
            "resultNote": "Transmis",
        }
    ],
    "commitments": [],
    "waitingOn": {"state": "not_connected", "reason": "mailbox_not_connected", "threads": []},
    "blocked": [],
    "toDecide": [],
    "toValidate": {"state": "ready", "reason": None, "cards": []},
    "firstTomorrow": None,
}


def test_the_tool_is_registered_and_needs_no_connector() -> None:
    # Pas "le dernier" : #2338.8 (23/09/2026) a posé `get_mission_start_readiness`
    # APRÈS lui, EN FIN de liste comme tous les précédents — seule sa PRÉSENCE
    # est garantie, jamais sa place en queue.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "compile_day_closure" in names
    assert "compile_day_closure" not in TOOL_REQUIRED_FAMILIES
    # Sa carte ÉCRIT au clic (report, délégation, abandon) : jamais parallélisé.
    assert "compile_day_closure" in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_relays_the_compiled_closure_as_a_card_to_validate(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple] = []

    async def _day_closure(user_id: str, *, time_zone: str | None = None) -> dict:
        calls.append((user_id, time_zone))
        return CLOSURE

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "day_closure", _day_closure)

    result = await execute_chat_tool(
        "compile_day_closure", {}, user_id=USER, profile_data=None, person_timezone="Europe/Paris"
    )

    assert result["status"] == "pending_confirmation"
    assert result["proposal"] == {"action": "day_closure", "cost_credits": 0, "closure": CLOSURE}
    assert calls == [(USER, "Europe/Paris")]


@pytest.mark.asyncio
async def test_a_silent_bridge_is_said_never_an_empty_closure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _day_closure(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "day_closure", _day_closure)

    result = await execute_chat_tool("compile_day_closure", {}, user_id=USER, profile_data=None)

    assert "error" in result
    assert "proposal" not in result


@pytest.mark.asyncio
async def test_an_unconfigured_bridge_is_said(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)

    result = await execute_chat_tool("compile_day_closure", {}, user_id=USER, profile_data=None)

    assert "error" in result
