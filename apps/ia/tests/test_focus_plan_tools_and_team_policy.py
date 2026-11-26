"""#2770.35 / #2770.37 (décision Louis 11/10) — le plan de journée et le plan de semaine
lisent les OUTILS RÉELLEMENT BRANCHÉS et la POLITIQUE D'ÉQUIPE de l'espace.

Avant : la carte finissait par « Non pris en compte : les outils branchés, ton rôle, la
politique d'équipe » — les deux sources n'existaient pas. Ce fichier tient le contrat :

1. outils branchés (#2770.35) — les familles opérationnelles du tour (`connected_families`,
   posées par le routeur de chat) sont lues : la carte les NOMME (`connected_tools`), « outils
   branchés » quitte `unread_sources`, et un bloc qui s'appuie sur un outil non branché
   (`requires_tool`) n'est jamais placé — il part dans `deferred_blocks`, raison
   `outil_non_branche`. Famille inconnue (`None`, ancien appelant) = comportement d'avant ;
2. politique d'équipe (#2770.37) — lue par le pont (`/internal/copilot/workspace/team-policy`) :
   créneaux interdits retirés des créneaux libres, plages de prospection réservées aux blocs
   de prospection, plafond de réunions comparé aux réunions RÉELLES du jour, objectif d'appels
   rappelé à Laura. Rien saisi → plan inchangé + `team_policy: None` (« aucune politique
   d'équipe saisie ») ; pont muet → la source reste NOMMÉE comme non lue, jamais devinée ;
3. le rôle (#2770.36, NO-GO doctrine c76) reste nommé comme non lu.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC

import pytest

from app.services import bellum_api
from app.services.chat_requested_mode import connected_families_scope
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
DAY = "2026-10-01"


def _slot(start_utc_h: int, minutes: int, day: str = DAY) -> dict:
    from datetime import datetime, timedelta

    start = datetime.fromisoformat(f"{day}T{start_utc_h:02d}:00:00").replace(tzinfo=UTC)
    return {"start": start.isoformat(), "end": (start + timedelta(minutes=minutes)).isoformat(), "minutes": minutes}


@pytest.fixture(autouse=True)
def _agenda(monkeypatch: pytest.MonkeyPatch) -> None:
    # 9 h → 15 h 40 UTC, soit 11 h → 17 h 40 à Paris (fuseau produit par défaut).
    async def free(*_a: object, **_k: object) -> list[dict]:
        return [_slot(9, 400)]

    monkeypatch.setattr(bellum_api, "find_free_slots", free)


@pytest.fixture
def families() -> Iterator[None]:
    with connected_families_scope(["calendar", "email"]):
        yield


def _policy(monkeypatch: pytest.MonkeyPatch, policy: dict | None, *, bridge_down: bool = False) -> None:
    async def read(_user: str) -> dict | None:
        return None if bridge_down else {"policy": policy}

    monkeypatch.setattr(bellum_api, "team_policy", read)


def _block(**overrides: object) -> dict:
    base = {
        "type": "admin_tasks",
        "title": "Notes de frais",
        "duration_minutes": 30,
        "priority_reason": "Clôture du mois demain",
    }
    base.update(overrides)
    return base


async def _day(blocks: list[dict]) -> dict:
    result = await execute_chat_tool(
        "propose_focus_plan", {"date": DAY, "blocks": blocks}, user_id=USER, profile_data=None
    )
    # La carte (`plan`) et la consigne à Laura (`note_pour_laura`) — l'enveloppe entière.
    return {**result["proposal"], "note_pour_laura": result.get("note_pour_laura")}


# ── 1. Outils branchés (#2770.35) ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unknown_tools_keep_the_previous_behaviour() -> None:
    plan = (await _day([_block()]))["plan"]
    assert "connected_tools" not in plan
    assert "tools" in plan["unread_sources"]


@pytest.mark.asyncio
async def test_connected_tools_are_named_and_no_longer_unread(families: None) -> None:
    plan = (await _day([_block()]))["plan"]
    assert plan["connected_tools"] == ["calendar", "email"]
    assert "tools" not in plan["unread_sources"]


@pytest.mark.asyncio
async def test_a_block_relying_on_an_unplugged_tool_is_never_placed(families: None) -> None:
    plan = (await _day([_block(title="Nettoyer le CRM", type="data_correction", requires_tool="crm")]))["plan"]
    assert plan["blocks"] == []
    assert plan["deferred_blocks"] == [
        {"type": "data_correction", "title": "Nettoyer le CRM", "reason": "outil_non_branche"}
    ]


@pytest.mark.asyncio
async def test_follow_ups_without_a_mailbox_fall_to_not_placed_even_undeclared() -> None:
    # #4293.7 (#2770.2) — « relances » = des messages à envoyer : sans messagerie branchée, le créneau est
    # « Non placé » même si Laura n'a pas déclaré `requires_tool` ; rien n'est envoyé (l'outil n'écrit rien).
    with connected_families_scope(["calendar"]):
        plan = (await _day([_block(title="Relancer les devis", type="follow_ups")]))["plan"]
    assert plan["blocks"] == []
    assert plan["deferred_blocks"] == [
        {"type": "follow_ups", "title": "Relancer les devis", "reason": "outil_non_branche"}
    ]


@pytest.mark.asyncio
async def test_follow_ups_with_a_mailbox_are_placed(families: None) -> None:
    plan = (await _day([_block(title="Relancer les devis", type="follow_ups")]))["plan"]
    assert [b["type"] for b in plan["blocks"]] == ["follow_ups"]
    assert plan["deferred_blocks"] == []


@pytest.mark.asyncio
async def test_follow_ups_keep_a_declared_tool_over_the_default() -> None:
    with connected_families_scope(["calendar", "crm"]):
        plan = (await _day([_block(title="Relancer via CRM", type="follow_ups", requires_tool="crm")]))["plan"]
    assert [b["type"] for b in plan["blocks"]] == ["follow_ups"]


@pytest.mark.asyncio
async def test_a_block_relying_on_a_plugged_tool_is_placed(families: None) -> None:
    plan = (await _day([_block(title="Traiter la boîte", type="follow_ups", requires_tool="email")]))["plan"]
    assert [b["title"] for b in plan["blocks"]] == ["Traiter la boîte"]


@pytest.mark.asyncio
async def test_requires_tool_is_never_a_filter_when_tools_are_unknown() -> None:
    plan = (await _day([_block(title="Nettoyer le CRM", requires_tool="crm")]))["plan"]
    assert [b["title"] for b in plan["blocks"]] == ["Nettoyer le CRM"]


@pytest.mark.asyncio
async def test_an_unknown_required_tool_is_refused() -> None:
    result = await execute_chat_tool(
        "propose_focus_plan",
        {"date": DAY, "blocks": [_block(requires_tool="fax")]},
        user_id=USER,
        profile_data=None,
    )
    assert "error" in result


# ── 2. Politique d'équipe (#2770.37) ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_bridge_down_names_the_policy_as_unread(monkeypatch: pytest.MonkeyPatch) -> None:
    _policy(monkeypatch, None, bridge_down=True)
    plan = (await _day([_block()]))["plan"]
    assert "team_policy" not in plan
    assert "team_policy" in plan["unread_sources"]


@pytest.mark.asyncio
async def test_no_policy_saved_is_said_and_the_plan_is_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    before = (await _day([_block()]))["plan"]
    _policy(monkeypatch, None)
    plan = (await _day([_block()]))["plan"]
    assert plan["team_policy"] is None
    assert "team_policy" not in plan["unread_sources"]
    assert plan["blocks"] == before["blocks"]
    assert plan["margin_minutes"] == before["margin_minutes"]


@pytest.mark.asyncio
async def test_role_stays_named_as_unread_c76(monkeypatch: pytest.MonkeyPatch, families: None) -> None:
    _policy(monkeypatch, None)
    plan = (await _day([_block()]))["plan"]
    assert plan["unread_sources"] == ["role"]


def _windows(**overrides: object) -> dict:
    base: dict = {"prospectingWindows": [], "forbiddenWindows": [], "maxMeetingsPerDay": None, "dailyCallTarget": None}
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_a_forbidden_window_is_never_planned(monkeypatch: pytest.MonkeyPatch) -> None:
    # Interdit 11 h → 12 h à Paris = 9 h → 10 h UTC, le début du seul créneau libre.
    _policy(monkeypatch, _windows(forbiddenWindows=[{"startMinute": 660, "endMinute": 720}]))
    plan = (await _day([_block()]))["plan"]
    assert plan["blocks"][0]["start_iso"].startswith("2026-10-01T10:00:00")
    assert plan["team_policy"]["forbidden_windows"] == [{"start_minute": 660, "end_minute": 720}]


@pytest.mark.asyncio
async def test_a_prospecting_window_only_hosts_prospecting_blocks(monkeypatch: pytest.MonkeyPatch) -> None:
    _policy(monkeypatch, _windows(prospectingWindows=[{"startMinute": 660, "endMinute": 720}]))
    plan = (
        await _day(
            [
                _block(),
                _block(type="call_session", title="Appels prospection", priority="low"),
            ]
        )
    )["plan"]
    by_title = {b["title"]: b["start_iso"] for b in plan["blocks"]}
    # L'administratif ne prend jamais la plage protégée ; la session d'appels, si.
    assert by_title["Notes de frais"] >= "2026-10-01T10:00:00"
    assert by_title["Appels prospection"].startswith("2026-10-01T09:00:00")


@pytest.mark.asyncio
async def test_meetings_are_counted_against_the_team_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    _policy(monkeypatch, _windows(maxMeetingsPerDay=2))

    async def events(*_a: object, **_k: object) -> list[dict]:
        return [
            {"start": "2026-10-01T07:00:00+00:00", "cancelled": False},
            {"start": "2026-10-01T08:00:00+00:00", "cancelled": False},
            {"start": "2026-10-01T16:00:00+00:00", "cancelled": True},
            {"start": "2026-10-01", "cancelled": False},
        ]

    monkeypatch.setattr(bellum_api, "list_agenda", events)
    proposal = await _day([_block()])
    assert proposal["plan"]["meetings_count"] == 2
    assert "réunion" in proposal["note_pour_laura"]


@pytest.mark.asyncio
async def test_unreadable_meetings_are_never_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    _policy(monkeypatch, _windows(maxMeetingsPerDay=2))

    async def events(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "list_agenda", events)
    plan = (await _day([_block()]))["plan"]
    assert "meetings_count" not in plan


@pytest.mark.asyncio
async def test_a_call_target_without_a_call_session_is_told_to_laura(monkeypatch: pytest.MonkeyPatch) -> None:
    _policy(monkeypatch, _windows(dailyCallTarget=20))
    proposal = await _day([_block()])
    assert proposal["plan"]["team_policy"]["daily_call_target"] == 20
    assert "20 appels" in proposal["note_pour_laura"]


@pytest.mark.asyncio
async def test_weekly_plan_reads_the_same_policy_once(monkeypatch: pytest.MonkeyPatch, families: None) -> None:
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from app.services import chat_tools

    fixed = datetime(2026, 10, 4, 12, 0, tzinfo=ZoneInfo("Europe/Paris"))
    monkeypatch.setattr(chat_tools, "now_in_reference_timezone", lambda *_a, **_k: fixed)

    async def free(_user: str, *, from_iso: str, **_kw: object) -> list[dict]:
        return [_slot(9, 240, from_iso[:10])] if from_iso[:10] == "2026-10-06" else []

    monkeypatch.setattr(bellum_api, "find_free_slots", free)
    _policy(monkeypatch, _windows(forbiddenWindows=[{"startMinute": 660, "endMinute": 720}]))
    result = await execute_chat_tool(
        "propose_weekly_plan",
        {"week_start": "2026-10-05", "blocks": [_block(), _block(title="CRM", requires_tool="crm")]},
        user_id=USER,
        profile_data=None,
    )
    plan = result["proposal"]["plan"]
    assert plan["unread_sources"] == ["role"]
    assert plan["connected_tools"] == ["calendar", "email"]
    assert plan["team_policy"]["forbidden_windows"] == [{"start_minute": 660, "end_minute": 720}]
    assert plan["days"][0]["blocks"][0]["start_iso"].startswith("2026-10-06T10:00:00")
    assert all("team_policy" not in day for day in plan["days"])
    assert plan["deferred_blocks"] == [{"type": "admin_tasks", "title": "CRM", "reason": "outil_non_branche"}]


@pytest.mark.asyncio
async def test_a_forbidden_window_on_another_weekday_is_not_applied(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2770.37 — 2026-10-01 est un jeudi (ISO 4) : une plage « lundi seulement » n'y retire rien.
    _policy(monkeypatch, _windows(forbiddenWindows=[{"startMinute": 660, "endMinute": 720, "weekdays": [1]}]))
    plan = (await _day([_block()]))["plan"]
    assert plan["blocks"][0]["start_iso"].startswith("2026-10-01T09:00:00")
    # La carte du jour ne liste que ce qui s'applique ce jour-là.
    assert plan["team_policy"]["forbidden_windows"] == []


@pytest.mark.asyncio
async def test_a_forbidden_window_on_this_weekday_is_applied(monkeypatch: pytest.MonkeyPatch) -> None:
    _policy(monkeypatch, _windows(forbiddenWindows=[{"startMinute": 660, "endMinute": 720, "weekdays": [4]}]))
    plan = (await _day([_block()]))["plan"]
    assert plan["blocks"][0]["start_iso"].startswith("2026-10-01T10:00:00")
    assert plan["team_policy"]["forbidden_windows"] == [{"start_minute": 660, "end_minute": 720}]


def test_unreadable_weekdays_drop_the_window_never_widen_it() -> None:
    from app.services.chat_tools import _team_policy_windows

    raw = [
        {"startMinute": 60, "endMinute": 120, "weekdays": [9]},
        {"startMinute": 60, "endMinute": 120, "weekdays": [2, 1]},
        {"startMinute": 60, "endMinute": 120},
    ]
    assert _team_policy_windows(raw) == [
        {"start_minute": 60, "end_minute": 120, "weekdays": [1, 2]},
        {"start_minute": 60, "end_minute": 120},
    ]


@pytest.mark.asyncio
async def test_the_demo_monday_lunch_window_is_never_proposed_on_a_monday(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2770.37 — LA politique de la salle (`DEMO_TEAM_POLICY`) : « 12:00–14:00 (lun.) » interdit, pause déjeuner.
    # 2026-10-12 est un lundi : quatre blocs d'une heure partis de 10 h (Paris) NE PEUVENT PAS toucher 12 h – 14 h.
    monday = "2026-10-12"

    async def free(*_a: object, **_k: object) -> list[dict]:
        return [_slot(8, 480, monday)]  # 10 h → 18 h à Paris

    monkeypatch.setattr(bellum_api, "find_free_slots", free)
    _policy(
        monkeypatch,
        _windows(forbiddenWindows=[{"startMinute": 720, "endMinute": 840, "weekdays": [1]}]),
    )
    result = await execute_chat_tool(
        "propose_focus_plan",
        {"date": monday, "blocks": [_block(title=f"Bloc {n}", duration_minutes=60) for n in range(4)]},
        user_id=USER,
        profile_data=None,
    )
    plan = result["proposal"]["plan"]
    assert len(plan["blocks"]) >= 3
    from datetime import datetime
    from zoneinfo import ZoneInfo

    paris = ZoneInfo("Europe/Paris")
    for placed in plan["blocks"]:
        start = datetime.fromisoformat(placed["start_iso"]).astimezone(paris)
        end = datetime.fromisoformat(placed["end_iso"]).astimezone(paris)
        start_min, end_min = start.hour * 60 + start.minute, end.hour * 60 + end.minute
        assert not (start_min < 840 and 720 < end_min), f"{start:%H:%M}-{end:%H:%M} chevauche la plage du lundi"
