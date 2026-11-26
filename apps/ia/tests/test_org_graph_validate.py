"""OrgGraph invariant validation (Python mirror of the zod contract superRefine).

Locks the emit-side guard: a graph that violates a contract invariant is caught
in Python before it crosses the wire. Mirrors the rules in @bellum/contracts
org-graph.ts (verified⇒sourced+≥90, inferred≤89, influence⇒reasoning, ids
resolve, rejected never active nor in the path).
"""

from __future__ import annotations

from app.services.org_graph_validate import is_valid_org_graph, validate_org_graph


def _entity(id: str, parent: str | None = None) -> dict:
    return {"id": id, "name": id, "type": "filiale", "parentId": parent, "confidence": 80}


def _person(id: str, entity_id: str | None = None) -> dict:
    return {"id": id, "fullName": id, "entityId": entity_id, "identityStatus": "classified", "confidence": 70}


def _valid_graph() -> dict:
    return {
        "graphVersion": 1,
        "entities": [_entity("e1"), _entity("e2", parent="e1")],
        "people": [_person("p1", "e1"), _person("p2", "e2")],
        "hierarchyEdges": [
            {"fromId": "p2", "toId": "p1", "type": "reports_to", "sourceIds": ["s1"], "confidence": 95, "verified": True},
            {"fromId": "p1", "toId": "e1", "type": "member_of", "sourceIds": [], "confidence": 60, "verified": False},
        ],
        "influenceEdges": [
            {"fromId": "p2", "toId": "p1", "topic": "budget", "stance": "supporter", "confidence": 50, "reasoning": "expertise"},
        ],
        "buyingCommittee": [{"personId": "p1", "role": "champion"}],
        "recommendedPath": [{"step": 1, "personId": "p1", "objective": "ouvrir"}],
        "rejectedItems": [{"sourceId": "ghost", "reason": "ex-employé"}],
    }


def test_a_well_formed_graph_has_no_violations():
    assert validate_org_graph(_valid_graph()) == []
    assert is_valid_org_graph(_valid_graph()) is True


def test_verified_edge_without_source_is_rejected():
    g = _valid_graph()
    g["hierarchyEdges"][0]["sourceIds"] = []
    errors = validate_org_graph(g)
    assert any("verified edge requires at least one sourceId" in e for e in errors)


def test_verified_edge_below_90_is_rejected():
    g = _valid_graph()
    g["hierarchyEdges"][0]["confidence"] = 80
    assert any("confidence ≥ 90" in e for e in validate_org_graph(g))


def test_unverified_edge_at_90_plus_is_rejected():
    g = _valid_graph()
    g["hierarchyEdges"][1]["confidence"] = 95  # unverified but ≥90
    assert any("must have confidence ≤ 89" in e for e in validate_org_graph(g))


def test_influence_without_reasoning_is_rejected():
    g = _valid_graph()
    g["influenceEdges"][0]["reasoning"] = "   "
    assert any("non-empty reasoning" in e for e in validate_org_graph(g))


def test_dangling_ids_are_caught():
    g = _valid_graph()
    g["hierarchyEdges"][0]["fromId"] = "nope"
    g["people"][0]["entityId"] = "missing_entity"
    errors = validate_org_graph(g)
    assert any('"nope" is not a known node' in e for e in errors)
    assert any('"missing_entity" is not in entities[]' in e for e in errors)


def test_self_parent_is_caught():
    g = _valid_graph()
    g["entities"][0]["parentId"] = "e1"
    assert any("cannot be its own parent" in e for e in validate_org_graph(g))


def test_rejected_person_in_path_is_caught():
    g = _valid_graph()
    g["rejectedItems"] = [{"sourceId": "p1", "reason": "homonyme"}]
    # p1 is still an active person AND in the path → two violations.
    errors = validate_org_graph(g)
    assert any("cannot appear in recommendedPath" in e for e in errors)
    assert any("still appears as an active entity/person" in e for e in errors)


def test_committee_person_must_exist():
    g = _valid_graph()
    g["buyingCommittee"] = [{"personId": "ghost", "role": "champion"}]
    assert any('"ghost" is not in people[]' in e for e in validate_org_graph(g))


def test_confidence_out_of_range_is_caught():
    g = _valid_graph()
    g["entities"][0]["confidence"] = 150
    assert any("confidence must be an integer in [0, 100]" in e for e in validate_org_graph(g))


def test_never_raises_on_a_shapeless_graph():
    assert isinstance(validate_org_graph({}), list)
    assert isinstance(validate_org_graph({"entities": "not-a-list"}), list)
