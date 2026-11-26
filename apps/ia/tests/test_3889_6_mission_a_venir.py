"""#3889.6 (R37, Louis 16-17/10) — une mission dont le démarrage est FUTUR est « à venir », jamais « en cours ».

Le défaut de statut vivait à la source du statut de Laura (`build_account_projects_overview`) : « en cours » =
« fin absente ou à venir », donc une mission qui démarre le 30/12/2026 était rangée avec celles qui tournent.
"""

from __future__ import annotations

from datetime import date

from app.services.account_projects_overview import build_account_projects_overview

TODAY = date(2026, 10, 17)


def _overview(*missions: dict) -> dict:
    return build_account_projects_overview([], {"consultants": list(missions)}, today=TODAY)


def test_a_mission_starting_in_the_future_is_upcoming_not_in_progress() -> None:
    out = _overview(
        {"mission_label": "Run SI", "starts_on": "2026-12-30", "ends_on": "2027-06-30"},
        {"mission_label": "TMA", "starts_on": "2026-01-05", "ends_on": "2027-01-05"},
    )
    assert [m["mission_label"] for m in out["missions_upcoming"]["items"]] == ["Run SI"]
    assert [m["mission_label"] for m in out["missions_in_progress"]["items"]] == ["TMA"]
    assert out["missions_upcoming"] == {"read": True, "count": 1, "items": out["missions_upcoming"]["items"]}


def test_a_mission_starting_today_or_without_a_start_date_is_in_progress() -> None:
    # Démarrage aujourd'hui = en cours ; démarrage inconnu : jamais « à venir » par défaut (rien n'est deviné).
    out = _overview(
        {"mission_label": "Aujourd'hui", "starts_on": "2026-10-17", "ends_on": None},
        {"mission_label": "Sans début", "starts_on": None, "ends_on": None},
    )
    assert out["missions_upcoming"]["count"] == 0
    assert out["missions_in_progress"]["count"] == 2


def test_an_ended_mission_stays_ended_and_an_unread_staffing_stays_unread() -> None:
    out = _overview({"mission_label": "Finie", "starts_on": "2025-01-01", "ends_on": "2025-12-31"})
    assert out["missions_ended"]["count"] == 1 and out["missions_in_progress"]["count"] == 0
    failed = build_account_projects_overview([], {"error": "boom"}, today=TODAY)
    assert failed["missions_upcoming"] == {"read": False}


def test_the_reading_note_tells_laura_not_to_call_an_upcoming_mission_in_progress() -> None:
    note = _overview()["reading_note"]
    assert "à venir" in note
