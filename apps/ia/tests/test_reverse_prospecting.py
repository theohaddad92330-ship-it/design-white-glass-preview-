"""Prospection inversée (Théo #5) — ex-collaborateurs / consultants sortis de mission."""

from __future__ import annotations

from app.services.reverse_prospecting import find_reverse_prospects, is_reverse_prospect


def _contact(name: str, entity: str, history: list[dict]) -> dict:
    return {"fullName": name, "entity": entity, "apolloDetails": {"employmentHistory": history}}


def test_former_insider_is_a_reverse_prospect():
    # Now at Capgemini, but was at VINCI before (non-current) → relais chaud.
    c = _contact(
        "Marie Ex",
        "Capgemini",
        [{"organization": "Capgemini", "current": True}, {"organization": "VINCI Energies", "current": False}],
    )
    assert is_reverse_prospect(c, "VINCI") is True


def test_current_employee_is_not_a_reverse_prospect():
    c = _contact("Paul Actuel", "VINCI Energies", [{"organization": "VINCI Energies", "current": True}])
    assert is_reverse_prospect(c, "VINCI") is False


def test_no_target_link_is_not_reverse():
    c = _contact("Sans Lien", "Sopra", [{"organization": "Atos", "current": False}])
    assert is_reverse_prospect(c, "VINCI") is False


def test_find_reverse_prospects_tags_and_filters():
    contacts = [
        _contact("Ex", "Capgemini", [{"organization": "VINCI", "current": False}]),
        _contact("Actuel", "VINCI", [{"organization": "VINCI", "current": True}]),
        _contact("Autre", "Atos", []),
    ]
    res = find_reverse_prospects(contacts, "VINCI")
    assert [c["fullName"] for c in res] == ["Ex"]
    assert res[0]["reverseProspect"] is True


def test_empty_and_bad_input():
    assert find_reverse_prospects([], "VINCI") == []
    assert is_reverse_prospect({}, "VINCI") is False
    assert is_reverse_prospect({"apolloDetails": {"employmentHistory": [{}]}}, "") is False
