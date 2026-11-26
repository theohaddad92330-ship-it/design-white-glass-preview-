"""30-day roadmap per priority zone (#275) — the deck's «feuille de route 30j».

Each priority sub-account (zone) carries its next 30-day action and one of the
three entry angles (top_down / bottom_up / middle_out). Phase-4 plan output, so
validated here (structure + prompt), not by the phase-1 research golden."""

from __future__ import annotations

from app.models.outputs.plan import ActionPlanOutput, PrioritySubAccount
from app.prompts.bellum_plan import build_user_prompt


def test_plan_prompt_requests_roadmap_fields():
    prompt = build_user_prompt("Société Générale", "", "")
    assert "nextAction" in prompt
    assert "approachAngle" in prompt
    # The three deck angles must be spelled out for the model.
    for angle in ("top_down", "bottom_up", "middle_out"):
        assert angle in prompt


def test_priority_sub_account_round_trips_roadmap():
    z = PrioritySubAccount.model_validate(
        {"name": "ITIM", "nextAction": "contacter le DSI via un client commun", "approachAngle": "middle_out",
         "deadline": "J+15", "entryContact": "Jean Dupont", "suggestedOffer": "renfort MLOps"},
    )
    assert z.next_action == "contacter le DSI via un client commun"
    assert z.approach_angle == "middle_out"
    assert z.deadline == "J+15"
    dumped = z.model_dump(by_alias=True)
    assert dumped["nextAction"] == "contacter le DSI via un client commun"
    assert dumped["approachAngle"] == "middle_out"


def test_roadmap_fields_default_empty():
    z = PrioritySubAccount.model_validate({"name": "SGSS"})
    assert z.next_action == ""
    assert z.approach_angle == ""
    assert z.deadline == ""


def test_plan_output_preserves_roadmap_through_alias():
    plan = ActionPlanOutput.model_validate(
        {"prioritySubAccounts": [{"name": "BoursoBank", "nextAction": "POC anti-fraude", "approachAngle": "bottom_up"}]},
    )
    dumped = plan.model_dump(by_alias=True)
    z = dumped["prioritySubAccounts"][0]
    assert z["nextAction"] == "POC anti-fraude"
    assert z["approachAngle"] == "bottom_up"
