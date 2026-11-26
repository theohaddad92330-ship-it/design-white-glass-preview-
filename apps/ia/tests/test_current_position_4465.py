"""# #4465 — la FONCTION d'un contact est son expérience EN COURS chez l'employeur du compte.

Cas bêta (compte CAFPI) : la fonction affichée était l'AVANT-DERNIER poste. Règle : l'expérience sans date de fin,
chez l'employeur, la plus récente par date de début ; jamais une expérience terminée ; jamais une valeur devinée."""

from __future__ import annotations

from app.routers.phase2_contacts import _apollo_hit_to_seed
from app.services.apollo import _employment_history, _employment_entries, _to_enrichment_result, _to_search_hit
from app.services.current_position import pick_current_position


def _hist() -> list[dict]:
    # Ordre volontairement hostile : le poste terminé d'abord, le courant au milieu.
    return [
        {"title": "Directeur de projets", "organization": "Cafpi", "current": False, "start_date": "2019-02-01", "end_date": "2022-12-31"},
        {"title": "Directeur des systèmes d'information", "organization": "Cafpi", "current": True, "start_date": "2023-01-01"},
        {"title": "Consultant", "organization": "Autre ESN", "current": False, "start_date": "2015-01-01", "end_date": "2019-01-31"},
    ]


def test_picks_ongoing_role_not_the_ended_one() -> None:
    picked = pick_current_position(_hist(), "CAFPI")
    assert picked is not None and picked["title"] == "Directeur des systèmes d'information"


def test_most_recent_start_wins_among_ongoing() -> None:
    history = [
        {"title": "Responsable SI", "organization": "Cafpi SA", "current": True, "start_date": "2018-03-01"},
        {"title": "DSI adjoint", "organization": "Cafpi SA", "current": True, "start_date": "2024-06-01"},
    ]
    picked = pick_current_position(history, "Cafpi")
    assert picked is not None and picked["title"] == "DSI adjoint"


def test_missing_start_date_sorts_last_not_first() -> None:
    history = [
        {"title": "Sans date", "organization": "Cafpi", "current": True},
        {"title": "Daté", "organization": "Cafpi", "current": True, "start_date": "2021-01-01"},
    ]
    picked = pick_current_position(history, "Cafpi")
    assert picked is not None and picked["title"] == "Daté"


def test_ended_role_with_current_flag_but_end_date_is_never_picked() -> None:
    history = [{"title": "Ancien poste", "organization": "Cafpi", "current": True, "start_date": "2019-01-01", "end_date": "2023-01-01"}]
    assert pick_current_position(history, "Cafpi") is None


def test_ongoing_role_at_another_employer_is_not_the_accounts_position() -> None:
    history = [
        {"title": "Directeur", "organization": "Banque Y", "current": True, "start_date": "2025-01-01"},
        {"title": "DSI", "organization": "Cafpi", "current": False, "start_date": "2019-01-01", "end_date": "2024-12-31"},
    ]
    assert pick_current_position(history, "Cafpi") is None


def test_unknown_when_no_history_or_no_employer() -> None:
    assert pick_current_position([], "Cafpi") is None
    assert pick_current_position(_hist(), "") is None


def test_rich_entries_shape_is_read_too() -> None:
    entries = _employment_entries(
        [
            {"organization_name": "Cafpi", "title": "Ancien", "current": False, "start_date": "2019-01-01", "end_date": "2022-01-01"},
            {"organization_name": "Cafpi", "title": "Actuel", "current": True, "start_date": "2022-02-01"},
        ]
    )
    picked = pick_current_position([e.model_dump() for e in entries], "Cafpi")
    assert picked is not None and picked["title"] == "Actuel"


def test_light_history_keeps_dates_present_only() -> None:
    light = _employment_history(
        [{"title": "DSI", "organization_name": "Cafpi", "current": True, "start_date": "2023-01-01", "end_date": None}]
    )
    assert light == [{"title": "DSI", "organization": "Cafpi", "current": True, "start_date": "2023-01-01"}]


def _person(title: str) -> dict:
    return {
        "id": "p1",
        "first_name": "Jean",
        "last_name": "Dupont",
        "title": title,
        "organization_name": "Cafpi",
        "employment_history": [
            {"title": "Directeur de projets", "organization_name": "Cafpi", "current": False, "start_date": "2019-02-01", "end_date": "2022-12-31"},
            {"title": "Directeur des systèmes d'information", "organization_name": "Cafpi", "current": True, "start_date": "2023-01-01"},
        ],
    }


def test_seed_title_comes_from_the_ongoing_role_even_when_the_search_title_is_stale() -> None:
    seed = _apollo_hit_to_seed(_to_search_hit(_person("Directeur de projets")))
    assert seed["title"] == "Directeur des systèmes d'information"


def test_seed_keeps_provider_title_when_history_cannot_decide() -> None:
    person = _person("DSI")
    person["employment_history"] = []
    assert _apollo_hit_to_seed(_to_search_hit(person))["title"] == "DSI"


def test_enrichment_title_comes_from_the_ongoing_role() -> None:
    assert _to_enrichment_result(_person("Directeur de projets")).title == "Directeur des systèmes d'information"
