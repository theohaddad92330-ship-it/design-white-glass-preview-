"""Board / administrateur is never the FIRST approach without a relation.

Definition of Done, annexe organigramme p32 + annexe méthodo p31 : « board /
administrateur jamais recommandé en 1re approche sans relation/sponsor ». Until
now that rule lived in the prompt only — nothing in the code stopped the model
from opening a cold account on its chairman.

The guard is deterministic and explicable: it never invents a contact and never
deletes one, it only refuses to put an L0 governance seat AHEAD of a reachable
operational one on a cold account.
"""

from __future__ import annotations

from typing import Any

from app.services.governance_guard import (
    demote_governance_first_touch,
    has_relation_or_sponsor,
)

_PEOPLE: list[dict[str, Any]] = [
    {"id": "p1", "fullName": "Martine Board", "hierarchyLevel": "L0"},
    {"id": "p2", "fullName": "Karim DSI", "hierarchyLevel": "L2"},
    {"id": "p3", "fullName": "Léa Archi", "hierarchyLevel": "L3"},
]


def _path(*person_ids: str) -> list[dict[str, Any]]:
    return [{"step": i + 1, "personId": pid, "objective": f"ouvrir via {pid}"} for i, pid in enumerate(person_ids)]


def _order(path: list[dict[str, Any]]) -> list[str]:
    return [str(s["personId"]) for s in path]


def test_cold_relationship_has_no_sponsor() -> None:
    assert has_relation_or_sponsor("froid") is False
    # Absent / unknown → treated as cold. The safe default IS the rule.
    assert has_relation_or_sponsor(None) is False
    assert has_relation_or_sponsor("") is False
    assert has_relation_or_sponsor("pas_un_etat") is False


def test_an_existing_relationship_is_a_sponsor() -> None:
    for state in (
        "connu",
        "linkedin",
        "dormant",
        "refere",
        "ancien_client",
        "rang2",
        "client_actif",
        "besoin_ouvert",
    ):
        assert has_relation_or_sponsor(state) is True, state


def test_cold_account_never_opens_on_the_board() -> None:
    path = _path("p1", "p2", "p3")

    guarded = demote_governance_first_touch(path, _PEOPLE, relationship_state="froid")

    assert _order(guarded) == ["p2", "p3", "p1"]
    # Steps stay contiguous 1..n — the contract numbers them.
    assert [s["step"] for s in guarded] == [1, 2, 3]
    # Nothing invented, nothing dropped.
    assert sorted(_order(guarded)) == sorted(_order(path))


def test_the_board_keeps_its_objective_when_demoted() -> None:
    guarded = demote_governance_first_touch(_path("p1", "p2"), _PEOPLE, relationship_state="froid")
    board = next(s for s in guarded if s["personId"] == "p1")
    assert board["objective"] == "ouvrir via p1"


def test_a_warm_account_may_open_on_the_board() -> None:
    """With a relation or a sponsor, the board IS a legitimate first touch."""
    path = _path("p1", "p2")

    assert demote_governance_first_touch(path, _PEOPLE, relationship_state="client_actif") == path
    assert demote_governance_first_touch(path, _PEOPLE, relationship_state="refere") == path


def test_a_path_without_governance_is_untouched() -> None:
    path = _path("p2", "p3")
    assert demote_governance_first_touch(path, _PEOPLE, relationship_state="froid") == path


def test_a_board_only_path_is_left_alone() -> None:
    """No operational seat to promote → the guard has nothing better to offer.

    It must not empty the path (that would hide the only contacts found) nor
    reshuffle it for nothing — the real fix there is a coverage gap, not an order.
    """
    path = _path("p1")
    assert demote_governance_first_touch(path, _PEOPLE, relationship_state="froid") == path


def test_an_unknown_person_is_not_assumed_to_be_governance() -> None:
    """A step whose person is not in ``people`` keeps its place (no invented level)."""
    path = _path("p9", "p1")
    guarded = demote_governance_first_touch(path, _PEOPLE, relationship_state="froid")
    assert _order(guarded) == ["p9", "p1"]


def test_the_guard_does_not_mutate_its_input() -> None:
    path = _path("p1", "p2")
    demote_governance_first_touch(path, _PEOPLE, relationship_state="froid")
    assert _order(path) == ["p1", "p2"]
    assert [s["step"] for s in path] == [1, 2]


# #2312.22/.26 (épopée #2963) — l'anti-séniorité ne couvrait QUE L0
# (gouvernance) : un « VP groupe »/« CTO mondial »/« directeur corporate »
# est classé L1 (c_level) par hierarchy_level.py et n'était JAMAIS démoté
# (constat audit 25/09/2026) — alors que l'issue les nomme explicitement comme
# à ne jamais recommander en 1re approche.
_PEOPLE_WITH_GROUP_SCOPE: list[dict[str, Any]] = [
    *_PEOPLE,
    {"id": "p4", "fullName": "Nadia VP", "hierarchyLevel": "L1", "title": "VP Groupe Digital"},
    {"id": "p5", "fullName": "Omar CTO", "hierarchyLevel": "L1", "title": "CTO Monde"},
    {"id": "p6", "fullName": "Farid CTO France", "hierarchyLevel": "L1", "title": "CTO France"},
]


def test_group_scope_vp_is_demoted_like_governance() -> None:
    path = _path("p4", "p2")
    guarded = demote_governance_first_touch(path, _PEOPLE_WITH_GROUP_SCOPE, relationship_state="froid")
    assert _order(guarded) == ["p2", "p4"]


def test_worldwide_cto_is_demoted_like_governance() -> None:
    path = _path("p5", "p3")
    guarded = demote_governance_first_touch(path, _PEOPLE_WITH_GROUP_SCOPE, relationship_state="froid")
    assert _order(guarded) == ["p3", "p5"]


def test_a_local_cto_is_not_a_governance_seat() -> None:
    # #2312.22 : anti-séniorité NARROW — un CTO local reste une porte valable,
    # jamais démoté par confusion avec le CTO monde.
    path = _path("p6", "p2")
    guarded = demote_governance_first_touch(path, _PEOPLE_WITH_GROUP_SCOPE, relationship_state="froid")
    assert _order(guarded) == ["p6", "p2"]


def test_a_warm_account_may_still_open_on_a_group_scope_executive() -> None:
    path = _path("p4", "p2")
    guarded = demote_governance_first_touch(path, _PEOPLE_WITH_GROUP_SCOPE, relationship_state="refere")
    assert _order(guarded) == ["p4", "p2"]
