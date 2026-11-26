"""#2770.55-.62 (lot X14) — le PLAN HEBDOMADAIRE, construit sur le plan de journée.

`propose_weekly_plan` répartit les blocs candidats sur les jours de la semaine,
chaque jour étant calculé par le MÊME moteur que `propose_focus_plan`
(`_build_focus_plan`) sur les créneaux RÉELLEMENT libres de ce jour :

1. au moins un bloc, mêmes règles de validation que le plan de journée ;
2. un jour sans créneau libre ne fait AUCUNE ligne (une absence n'est pas une
   ligne vide) ; aucun jour libre du tout → une erreur claire ;
3. la priorité haute passe d'abord (lundi), l'excédent part en `deferred_blocks`
   plutôt que de saturer la semaine (capacité, #2770.60) ;
4. un bloc n'est JAMAIS placé après son échéance (#2770.56/.57) ;
5. rien n'est déplacé ni écrit : seuls les créneaux libres servent, la sortie
   est une PROPOSITION (`pending_confirmation`) (#2770.61/.62) ;
6. agenda muet → une erreur, jamais une semaine « libre ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
# Lundi 5 octobre 2026.
MONDAY = "2026-10-05"


@pytest.fixture(autouse=True)
def _frozen_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Horloge de l'outil figée au dimanche 4 octobre 2026, midi à Paris : MONDAY et les
    échéances en dur restent planifiables quelle que soit la date réelle (bombe du 06/10)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from app.services import chat_tools

    fixed = datetime(2026, 10, 4, 12, 0, tzinfo=ZoneInfo("Europe/Paris"))
    monkeypatch.setattr(chat_tools, "now_in_reference_timezone", lambda *_a, **_k: fixed)


def _slot(day: str, start_h: int, minutes: int) -> dict:
    from datetime import datetime, timedelta, timezone

    start = datetime.fromisoformat(f"{day}T{start_h:02d}:00:00").replace(tzinfo=timezone.utc)
    return {"start": start.isoformat(), "end": (start + timedelta(minutes=minutes)).isoformat(), "minutes": minutes}


def _agenda(monkeypatch: pytest.MonkeyPatch, per_day: dict[str, list[dict]] | None) -> list[str]:
    asked: list[str] = []

    async def fake(_user: str, *, from_iso: str, **_kw: object) -> list[dict] | None:
        asked.append(from_iso[:10])
        if per_day is None:
            return None
        return per_day.get(from_iso[:10], [])

    monkeypatch.setattr(bellum_api, "find_free_slots", fake)
    return asked


def _block(**overrides: object) -> dict:
    base = {
        "type": "call_session",
        "title": "Appels prospection",
        "duration_minutes": 60,
        "priority_reason": "Trois comptes chauds à relancer",
    }
    base.update(overrides)
    return base


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("propose_weekly_plan", tool_input, user_id=USER, profile_data=None)


def test_tool_is_registered_before_push_profile_and_is_a_write_tool() -> None:
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "propose_weekly_plan" in names
    assert names[-1] == "push_profile"
    assert "propose_weekly_plan" in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_requires_a_block(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, {})
    result = await _run({"week_start": MONDAY, "blocks": []})
    assert "bloc" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_silent_agenda_is_an_error_never_a_free_week(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, None)
    result = await _run({"week_start": MONDAY, "blocks": [_block()]})
    assert "agenda" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_week_without_any_free_time_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, {})
    result = await _run({"week_start": MONDAY, "blocks": [_block()]})
    assert "error" in result and "créneau" in result["error"].lower()


@pytest.mark.asyncio
async def test_high_priority_goes_first_and_days_without_free_time_make_no_line(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asked = _agenda(
        monkeypatch,
        {"2026-10-05": [_slot("2026-10-05", 9, 240)], "2026-10-07": [_slot("2026-10-07", 9, 240)]},
    )
    result = await _run(
        {
            "week_start": MONDAY,
            "blocks": [
                _block(title="Revue pipe", type="pipeline_review", priority="low", duration_minutes=120),
                _block(title="Relances urgentes", type="follow_ups", priority="high", duration_minutes=120),
            ],
        }
    )
    assert result["status"] == "pending_confirmation"
    plan = result["proposal"]["plan"]
    assert result["proposal"]["action"] == "propose_weekly_plan"
    assert plan["week_start"] == MONDAY
    # Sept jours lus, seuls les deux jours libres sont rendus.
    assert len(asked) == 7
    assert [d["date"] for d in plan["days"]] == ["2026-10-05", "2026-10-07"]
    assert plan["days"][0]["blocks"][0]["title"] == "Relances urgentes"


@pytest.mark.asyncio
async def test_a_block_is_never_placed_after_its_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(
        monkeypatch,
        {"2026-10-06": [_slot("2026-10-06", 9, 240)], "2026-10-08": [_slot("2026-10-08", 9, 240)]},
    )
    result = await _run(
        {"week_start": MONDAY, "blocks": [_block(title="Offre à rendre", deadline="2026-10-06", priority="low")]}
    )
    days = result["proposal"]["plan"]["days"]
    placed = [(d["date"], b["title"]) for d in days for b in d["blocks"]]
    assert placed == [("2026-10-06", "Offre à rendre")]


@pytest.mark.asyncio
async def test_a_block_whose_deadline_has_no_free_day_is_deferred_not_placed_late(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _agenda(monkeypatch, {"2026-10-08": [_slot("2026-10-08", 9, 240)]})
    result = await _run({"week_start": MONDAY, "blocks": [_block(title="Trop tard", deadline="2026-10-06")]})
    # Aucun jour libre avant l'échéance : le jour libre existe mais le bloc n'y va pas.
    plan = result["proposal"]["plan"]
    assert all(not d["blocks"] for d in plan["days"]) or plan["days"] == []
    # #2770 (recette prod 02/10) : ce n'est PAS un manque de capacité — 4 h restent libres,
    # mais après l'échéance. Dire « capacité atteinte » à côté de « 4 h libres » se contredit.
    assert plan["deferred_blocks"] == [{"type": "call_session", "title": "Trop tard", "reason": "echeance_depassee"}]
    assert plan["margin_minutes"] == 240


@pytest.mark.asyncio
async def test_capacity_and_deadline_reasons_are_told_apart(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, {"2026-10-05": [_slot("2026-10-05", 9, 60)], "2026-10-08": [_slot("2026-10-08", 9, 240)]})
    blocks = [
        _block(title="Trop tard", deadline="2026-10-04"),
        _block(title="Trop long", duration_minutes=180, deadline="2026-10-05"),
    ]
    result = await _run({"week_start": MONDAY, "blocks": blocks})
    reasons = {d["title"]: d["reason"] for d in result["proposal"]["plan"]["deferred_blocks"]}
    assert reasons["Trop tard"] == "echeance_depassee"
    # #2770 (Y18 02/10) : 180 min ne tiennent dans aucun des jours permis — ce n'est pas « la capacité atteinte ».
    assert reasons["Trop long"] == "bloc_trop_long"


@pytest.mark.asyncio
async def test_excess_is_deferred_never_saturating_the_week(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, {"2026-10-05": [_slot("2026-10-05", 9, 120)]})
    blocks = [_block(title=f"Bloc {i}", duration_minutes=90) for i in range(4)]
    result = await _run({"week_start": MONDAY, "blocks": blocks})
    plan = result["proposal"]["plan"]
    placed = sum(len(d["blocks"]) for d in plan["days"])
    assert placed + len(plan["deferred_blocks"]) == 4
    assert len(plan["deferred_blocks"]) >= 3
    total_placed_minutes = sum(b["duration_minutes"] for d in plan["days"] for b in d["blocks"])
    assert total_placed_minutes < 120  # une marge reste toujours
    assert plan["margin_minutes"] == 120 - total_placed_minutes


@pytest.mark.asyncio
async def test_every_block_is_placed_exactly_once(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(
        monkeypatch,
        {f"2026-10-0{d}": [_slot(f"2026-10-0{d}", 9, 300)] for d in (5, 6, 7)},
    )
    blocks = [_block(title=f"Bloc {i}", duration_minutes=120) for i in range(5)]
    result = await _run({"week_start": MONDAY, "blocks": blocks})
    plan = result["proposal"]["plan"]
    titles = [b["title"] for d in plan["days"] for b in d["blocks"]] + [d["title"] for d in plan["deferred_blocks"]]
    assert sorted(titles) == sorted(b["title"] for b in blocks)


@pytest.mark.asyncio
async def test_a_midweek_date_is_read_as_its_monday(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, {"2026-10-05": [_slot("2026-10-05", 9, 240)]})
    result = await _run({"week_start": "2026-10-07", "blocks": [_block()]})
    assert result["proposal"]["plan"]["week_start"] == MONDAY


@pytest.mark.asyncio
async def test_a_bad_date_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, {})
    result = await _run({"week_start": "lundi", "blocks": [_block()]})
    assert "AAAA-MM-JJ" in result["error"]


@pytest.mark.asyncio
async def test_invalid_candidate_is_refused_like_the_day_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, {})
    result = await _run({"week_start": MONDAY, "blocks": [_block(duration_minutes=2)]})
    assert "Durée hors bornes" in result["error"]


@pytest.mark.asyncio
async def test_a_day_never_lists_what_a_later_day_will_take(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(
        monkeypatch,
        {"2026-10-05": [_slot("2026-10-05", 9, 240)], "2026-10-06": [_slot("2026-10-06", 9, 240)]},
    )
    blocks = [_block(title=f"Bloc {i}", duration_minutes=120) for i in range(2)]
    result = await _run({"week_start": MONDAY, "blocks": blocks})
    plan = result["proposal"]["plan"]
    assert [len(d["blocks"]) for d in plan["days"]] == [1, 1]
    assert all(d["deferred_blocks"] == [] for d in plan["days"])
    assert plan["deferred_blocks"] == []


@pytest.mark.asyncio
async def test_zero_placed_with_a_free_week_never_says_capacity_reached(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2770 (recette prod 02/10, Y18) : « 0 bloc placé » + « capacité de la journée atteinte » + « 20 h 50
    laissées libres ». Les blocs de 4 h ne tiennent dans aucune journée de 4 h 10 libres (budget = 70 %) :
    la cause se NOMME (bloc trop long), la capacité n'est dite que si d'autres blocs ont pris la place."""
    days = ("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09")
    _agenda(monkeypatch, {day: [_slot(day, 9, 250)] for day in days})
    blocks = [_block(title=f"Relance {i}", duration_minutes=240) for i in range(2)]
    plan = (await _run({"week_start": MONDAY, "blocks": blocks}))["proposal"]["plan"]
    assert plan["days"] == []
    assert {d["reason"] for d in plan["deferred_blocks"]} == {"bloc_trop_long"}
    assert plan["margin_minutes"] == 5 * 250


@pytest.mark.asyncio
async def test_capacity_is_said_only_when_other_blocks_took_the_room(monkeypatch: pytest.MonkeyPatch) -> None:
    _agenda(monkeypatch, {"2026-10-05": [_slot("2026-10-05", 9, 120)]})
    blocks = [_block(title=f"Bloc {i}", duration_minutes=60) for i in range(3)]
    plan = (await _run({"week_start": MONDAY, "blocks": blocks}))["proposal"]["plan"]
    placed = sum(len(d["blocks"]) for d in plan["days"])
    assert placed >= 1
    assert plan["deferred_blocks"] and {d["reason"] for d in plan["deferred_blocks"]} == {"capacite_atteinte"}


def _today(monkeypatch: pytest.MonkeyPatch, iso: str) -> None:
    from datetime import datetime, timezone

    from app.services import chat_tools

    fixed = datetime.fromisoformat(f"{iso}T09:00:00").replace(tzinfo=timezone.utc)
    monkeypatch.setattr(chat_tools, "now_in_reference_timezone", lambda *_a, **_k: fixed)


@pytest.mark.asyncio
async def test_a_weekday_deadline_is_resolved_by_the_tool_not_by_the_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2770 (recette prod Y20) — « avant jeudi » dit un samedi 3 octobre visait le lundi 5 : la date
    était calculée par le modèle. Le modèle passe désormais le NOM du jour ; l'outil rend le jeudi 8."""
    _today(monkeypatch, "2026-10-03")
    _agenda(
        monkeypatch,
        {day: [_slot(day, 9, 240)] for day in ("2026-10-08", "2026-10-09")},
    )
    # Le modèle a écrit une date fausse (lundi 5) EN PLUS du jour dit : le jour dit gagne.
    result = await _run(
        {
            "week_start": MONDAY,
            "blocks": [_block(title="Relance avant jeudi", deadline="2026-10-05", deadline_weekday="jeudi")],
        }
    )
    days = result["proposal"]["plan"]["days"]
    placed = [(d["date"], b["title"]) for d in days for b in d["blocks"]]
    # Avec la date fausse (lundi 5, sans créneau libre), le bloc serait reporté : le jeudi 8 le place.
    assert placed == [("2026-10-08", "Relance avant jeudi")]


@pytest.mark.asyncio
async def test_a_weekday_deadline_names_the_next_such_day_never_today(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.chat_tools import _next_weekday_after
    from datetime import date

    assert _next_weekday_after("jeudi", date(2026, 10, 3)) == date(2026, 10, 8)
    assert _next_weekday_after("Thursday", date(2026, 10, 3)) == date(2026, 10, 8)
    # Dit un jeudi, « avant jeudi » vise le jeudi SUIVANT, jamais aujourd'hui.
    assert _next_weekday_after("jeudi", date(2026, 10, 8)) == date(2026, 10, 15)
    assert _next_weekday_after("lundi", date(2026, 10, 3)) == date(2026, 10, 5)
    assert _next_weekday_after("quelque temps", date(2026, 10, 3)) is None


@pytest.mark.asyncio
async def test_zero_placed_tells_laura_not_to_repeat_what_the_card_says(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2770 (recette prod Y20) — message, carte et garantie disaient trois fois la même chose."""
    _agenda(monkeypatch, {"2026-10-06": [_slot("2026-10-06", 9, 30)]})
    result = await _run({"week_start": MONDAY, "blocks": [_block(duration_minutes=240)]})
    assert result["proposal"]["plan"]["days"] == []
    assert "ne le redis pas" in result["note_pour_laura"]


@pytest.mark.asyncio
async def test_a_placed_week_tells_laura_the_card_carries_margin_and_guarantee(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2770 (recette démo 04/10) — marge et « rien n'est ajouté » étaient dits 2× (prose + carte)."""
    _agenda(monkeypatch, {"2026-10-06": [_slot("2026-10-06", 9, 240)]})
    result = await _run({"week_start": MONDAY, "blocks": [_block()]})
    note = result["note_pour_laura"]
    assert "marge" in note and "rien n'est ajouté" in note
    assert "ne le redis pas" not in note  # le constat « aucun bloc placé » ne s'applique pas ici


@pytest.mark.asyncio
async def test_agenda_preferences_weigh_on_each_day_of_the_week(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2770.28 — un seul jour libre (200 min, budget 140) et un bloc de 120 min : placé sans réglage ;
    # réglée à 50 min × 2 créneaux de réserve, la journée ne garde que 100 min — le bloc est reporté.
    _agenda(monkeypatch, {"2026-10-06": [_slot("2026-10-06", 9, 200)]})
    baseline = await _run({"week_start": MONDAY, "blocks": [_block(duration_minutes=120)]})
    assert len(baseline["proposal"]["plan"]["days"]) == 1

    async def _preferences(*_a: object, **_k: object) -> dict:
        return {"dossierDurationMinutes": 50, "reserveSlots": 2}

    monkeypatch.setattr(bellum_api, "agenda_preferences", _preferences)
    tight = await _run({"week_start": MONDAY, "blocks": [_block(duration_minutes=120)]})
    assert tight["proposal"]["plan"]["days"] == []
    assert [b["title"] for b in tight["proposal"]["plan"]["deferred_blocks"]] == ["Appels prospection"]


@pytest.mark.asyncio
async def test_the_week_names_what_it_could_not_read_once(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2770.35/.36/.37 — dit UNE fois, au niveau de la semaine ; jamais répété jour par jour.
    _agenda(monkeypatch, {"2026-10-06": [_slot("2026-10-06", 9, 240)]})
    plan = (await _run({"week_start": MONDAY, "blocks": [_block()]}))["proposal"]["plan"]
    assert plan["unread_sources"] == ["tools", "role", "team_policy"]
    assert all("unread_sources" not in day for day in plan["days"])
