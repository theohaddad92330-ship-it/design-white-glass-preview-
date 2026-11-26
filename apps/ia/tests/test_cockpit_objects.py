"""Objets typés cockpit / play — la fondation du futur chatbot + mémoire continue
V2 (Théo #7 : préparer les objets)."""

from __future__ import annotations

from app.models.outputs.plan import Cockpit, Play
from app.routers.phase4_plan import _plays


def test_play_model_round_trips_a_real_plays_output():
    account = {"priorityPerimeters": [{"name": "VINCI Energies", "tier": "P1", "whatToSell": ["DevOps"]}]}
    contacts = [{"fullName": "Sophie", "entity": "VINCI Energies", "role": "economic", "priority": 1, "source": "apollo"}]
    play = _plays({}, account, contacts, [{"contactName": "Sophie", "linkedinMessage": "Bonjour"}])[0]
    p = Play.model_validate(play)
    assert p.perimeter == "VINCI Energies"
    assert p.target_contact == "Sophie"
    assert p.ready_message == "Bonjour"
    assert p.ready_message_channel == "linkedin"
    assert p.model_dump(by_alias=True)["targetContact"] == "Sophie"


def test_plays_output_conforms_to_the_play_contract():
    # _plays enforces Play → every play carries the full aliased contract shape.
    play = _plays({}, {"priorityPerimeters": [{"name": "BU X", "tier": "P1"}]}, [])[0]
    keys = set(play.keys())
    assert {
        "perimeter",
        "tier",
        "painSignal",
        "esnOffer",
        "targetContact",
        "targetContactRole",
        "angle",
        "firstAction",
        "evidenceLevel",
        "risk",
        "readyMessage",
        "readyMessageChannel",
    } <= keys


def test_cockpit_aggregates_the_decision_surfaces():
    cockpit = Cockpit.model_validate(
        {
            "executiveSummary": ["ligne 1"],
            "nextBestAction": {"action": "LinkedIn"},
            "plays": [{"perimeter": "BU X", "painSignal": "pain", "readyMessage": None}],
            "groupRelationship": {"isInsider": True},
        },
    )
    assert cockpit.executive_summary == ["ligne 1"]
    assert cockpit.plays[0].perimeter == "BU X"
    assert cockpit.group_relationship == {"isInsider": True}
    dumped = cockpit.model_dump(by_alias=True)
    assert dumped["executiveSummary"] == ["ligne 1"]
    assert dumped["plays"][0]["perimeter"] == "BU X"


def test_cockpit_tolerates_extra_surfaces():
    # extra=allow → a surface added later doesn't break the chatbot contract.
    c = Cockpit.model_validate({"executiveSummary": [], "axesEcartes": [{"angle": "SAP"}]})
    assert c.model_dump(by_alias=True)["axesEcartes"] == [{"angle": "SAP"}]
