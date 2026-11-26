"""#4101 (recette prod 13/10) — « Organise-moi ma journée » : « Aucun bloc n'a pu être placé », 4 items NON PLACÉ,
« Non pris en compte : ton rôle » alors que le Rôle métier est réglé (Business Developer).

DEUX CAUSES, sur le chemin RÉEL :
1. L'API (`computeFreeSlots`) DÉCOUPE chaque trou en tranches de la durée demandée. Le plan cherchait à 5 min
   (plancher d'un bloc), limite 50 : une journée VIDE revenait en 50 tranches de 5 min, où aucun bloc ne tient.
   Les tests d'avant fabriquaient des trous entiers qu'aucun appel réel ne rend. Le plan demande désormais
   les trous ENTIERS (`merge_holes`).
2. « ton rôle » était listé non lu sans condition (`FOCUS_PLAN_UNREAD_SOURCES`), jamais lu. Le rôle du profil
   (`sellerRole`) est lu : il départage l'ORDRE à priorité et échéance égales (c76), jamais le contenu."""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


def _real_bridge(calls: list[dict]):
    """Rejoue `computeFreeSlots` : journée vide 09:00–18:00 ; tranches de `duration_minutes` sauf `merge_holes`."""

    async def _fake(
        _user: str, *, from_iso=None, to_iso=None, duration_minutes: int = 60, limit: int = 5, merge_holes: bool = False
    ):
        calls.append({"duration_minutes": duration_minutes, "limit": limit, "merge_holes": merge_holes})
        if merge_holes:
            return [{"start": "2026-10-13T09:00:00+00:00", "end": "2026-10-13T18:00:00+00:00", "minutes": 540}]
        out = []
        for index in range(min(limit, 540 // duration_minutes)):
            start = 9 * 60 + index * duration_minutes
            end = start + duration_minutes
            out.append(
                {
                    "start": f"2026-10-13T{start // 60:02d}:{start % 60:02d}:00+00:00",
                    "end": f"2026-10-13T{end // 60:02d}:{end % 60:02d}:00+00:00",
                    "minutes": duration_minutes,
                }
            )
        return out

    return _fake


def _block(title: str, kind: str = "call_session", minutes: int = 45) -> dict:
    return {"type": kind, "title": title, "duration_minutes": minutes, "priority_reason": "Compte chaud à relancer."}


async def _plan(monkeypatch: pytest.MonkeyPatch, blocks: list[dict], profile_data: dict | None = None) -> dict:
    calls: list[dict] = []
    monkeypatch.setattr(bellum_api, "find_free_slots", _real_bridge(calls))
    result = await execute_chat_tool(
        "propose_focus_plan", {"blocks": blocks, "date": "2026-10-13"}, user_id=USER, profile_data=profile_data
    )
    assert result["status"] == "pending_confirmation", result
    plan = result["proposal"]["plan"]
    plan["_calls"] = calls
    return plan


@pytest.mark.asyncio
async def test_5_an_empty_agenda_is_a_free_day_the_blocks_are_placed(monkeypatch: pytest.MonkeyPatch) -> None:
    blocks = [_block("Appels", minutes=60), _block("Relances", "follow_ups", 45), _block("Recherche", "account_research", 45)]
    plan = await _plan(monkeypatch, blocks)
    assert plan["_calls"] and all(call["merge_holes"] for call in plan["_calls"])
    assert len(plan["blocks"]) == 3
    assert plan["deferred_blocks"] == []


@pytest.mark.asyncio
async def test_5_the_declared_role_is_read_and_no_longer_named_unread(monkeypatch: pytest.MonkeyPatch) -> None:
    plan = await _plan(monkeypatch, [_block("Appels")], profile_data={"sellerRole": "Business Developer"})
    assert "role" not in plan["unread_sources"]


@pytest.mark.asyncio
async def test_5_without_a_declared_role_it_stays_named_unread(monkeypatch: pytest.MonkeyPatch) -> None:
    for profile in (None, {}, {"sellerRole": "  "}):
        plan = await _plan(monkeypatch, [_block("Appels")], profile_data=profile)
        assert "role" in plan["unread_sources"]


@pytest.mark.asyncio
async def test_5_the_role_orders_equal_blocks_but_never_filters_them(monkeypatch: pytest.MonkeyPatch) -> None:
    blocks = [_block("Admin", "admin_tasks", 30), _block("Appels", "call_session", 30)]
    seller = await _plan(monkeypatch, blocks, profile_data={"sellerRole": "Business Developer"})
    neutral = await _plan(monkeypatch, blocks, profile_data=None)
    # Le contenu est identique (c76) ; seul l'ordre de placement change.
    assert sorted(b["title"] for b in seller["blocks"]) == sorted(b["title"] for b in neutral["blocks"])
    assert [b["title"] for b in seller["blocks"]][0] == "Appels"
