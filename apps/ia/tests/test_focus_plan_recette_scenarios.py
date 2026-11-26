"""#2770.69-.78 (#2391.57-.66) — la gate de recette du plan de journée.

Les neuf scénarios nommés par l'épopée, REJOUÉS comme tours d'outil
(`execute_chat_tool("propose_focus_plan", …)`, entrée → plan rendu) : journée
vide, journée pleine, heure libre, temps partiel, fuseau, tâche longue, lecture
seule — plus le NO-GO « jamais un planning irréaliste intenable » (#2770.78).
Les scénarios « manager » et « mobile » sont de la présentation : ils restent
portés par `FocusPlanCard.test.tsx`, pas par cet outil.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


def _slots(*minutes: int):
    async def _fake(*_a: object, **_k: object) -> list[dict]:
        out = []
        for index, length in enumerate(minutes):
            hour = 8 + index * 4
            out.append(
                {
                    "start": f"2026-10-01T{hour:02d}:00:00+00:00",
                    "end": f"2026-10-01T{hour + length // 60:02d}:{length % 60:02d}:00+00:00",
                    "minutes": length,
                }
            )
        return out

    return _fake


def _block(**overrides: object) -> dict:
    base = {
        "type": "call_session",
        "title": "Appels prospection",
        "duration_minutes": 30,
        "priority_reason": "Trois comptes chauds à relancer avant vendredi",
    }
    base.update(overrides)
    return base


async def _plan(monkeypatch: pytest.MonkeyPatch, free: tuple[int, ...], blocks: list[dict], **extra: object) -> dict:
    monkeypatch.setattr(bellum_api, "find_free_slots", _slots(*free))
    result = await execute_chat_tool(
        "propose_focus_plan", {"blocks": blocks, **extra}, user_id=USER, profile_data=None
    )
    assert result["status"] == "pending_confirmation"
    return result["proposal"]["plan"]


@pytest.mark.asyncio
async def test_empty_day_places_the_blocks_in_chronological_order_and_keeps_a_margin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # #2770.69 — journée VIDE (agenda connecté, aucun rendez-vous) : neuf heures libres d'un seul tenant.
    # Tout ce qui est demandé est placé, dans l'ordre du jour, sans collision ; une marge reste TOUJOURS
    # (jamais 100 % de la capacité) et rien n'est reporté.
    blocks = [_block(title="Appels", duration_minutes=60), _block(title="Relances", duration_minutes=45)]
    plan = await _plan(monkeypatch, (540,), blocks)
    assert sorted(b["title"] for b in plan["blocks"]) == ["Appels", "Relances"]
    assert plan["deferred_blocks"] == []
    starts = [b["start_iso"] for b in plan["blocks"]]
    assert starts == sorted(starts)
    first, second = plan["blocks"]
    assert first["end_iso"] <= second["start_iso"]
    assert plan["margin_minutes"] > 0


@pytest.mark.asyncio
async def test_full_day_places_nothing_and_defers_everything(monkeypatch: pytest.MonkeyPatch) -> None:
    # Journée pleine : un trou de 15 minutes — le budget (70 %) ne tient pas 30 min. #2770 : seul sur une
    # journée vide, ce bloc de 30 min ne tiendrait pas davantage (budget ~10 min) : `bloc_trop_long`,
    # `capacite_atteinte` étant réservé à un bloc qu'un AUTRE a privé de sa place.
    plan = await _plan(monkeypatch, (15,), [_block(duration_minutes=30)])
    assert plan["blocks"] == []
    assert [d["reason"] for d in plan["deferred_blocks"]] == ["bloc_trop_long"]


@pytest.mark.asyncio
async def test_one_free_hour_places_only_what_fits_the_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    # Une heure libre : 70 % = 42 min. Un bloc de 30 passe, le second est reporté.
    plan = await _plan(monkeypatch, (60,), [_block(title="A"), _block(title="B")])
    assert [b["title"] for b in plan["blocks"]] == ["A"]
    assert [d["title"] for d in plan["deferred_blocks"]] == ["B"]


@pytest.mark.asyncio
async def test_part_time_scales_the_plan_down_with_the_free_time(monkeypatch: pytest.MonkeyPatch) -> None:
    blocks = [_block(title=f"Bloc {i}", duration_minutes=45) for i in range(4)]
    full = await _plan(monkeypatch, (300,), blocks)
    part = await _plan(monkeypatch, (100,), blocks)
    assert len(part["blocks"]) < len(full["blocks"])


@pytest.mark.asyncio
async def test_a_long_task_never_overflows_the_free_slot(monkeypatch: pytest.MonkeyPatch) -> None:
    # Une tâche de 240 min dans un créneau de 200 : jamais posée en collision.
    plan = await _plan(monkeypatch, (200,), [_block(title="Chantier", duration_minutes=240)])
    assert plan["blocks"] == []
    assert [d["title"] for d in plan["deferred_blocks"]] == ["Chantier"]


@pytest.mark.asyncio
async def test_the_plan_is_dated_in_the_users_time_zone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "find_free_slots", _slots(200))
    result = await execute_chat_tool(
        "propose_focus_plan",
        {"blocks": [_block()]},
        user_id=USER,
        profile_data=None,
        person_timezone="Pacific/Auckland",
    )
    assert result["proposal"]["plan"]["time_zone"] == "Pacific/Auckland"


@pytest.mark.asyncio
async def test_read_only_the_tool_proposes_and_never_creates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "find_free_slots", _slots(200))
    result = await execute_chat_tool(
        "propose_focus_plan", {"blocks": [_block()]}, user_id=USER, profile_data=None
    )
    assert result["status"] == "pending_confirmation"
    assert "PAS exécutée" in result["message"]


@pytest.mark.asyncio
@pytest.mark.parametrize("free", [(30,), (120,), (200, 90), (480,)])
async def test_no_go_never_an_untenable_plan(monkeypatch: pytest.MonkeyPatch, free: tuple[int, ...]) -> None:
    blocks = [_block(title=f"B{i}", duration_minutes=40) for i in range(12)]
    plan = await _plan(monkeypatch, free, blocks)
    used = sum(b["duration_minutes"] for b in plan["blocks"])
    assert used <= int(sum(free) * 0.95)
    if sum(free) > 0:
        assert plan["margin_minutes"] > 0
