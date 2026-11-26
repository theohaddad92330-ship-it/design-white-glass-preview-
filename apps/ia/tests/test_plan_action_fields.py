"""The 7 mandatory plan-action fields (Annexe méthodo p27): owner, canal, contact,
raison, échéance, résultat attendu, feedback."""

from __future__ import annotations

from app.models.outputs.plan import PlanAction


def test_plan_action_carries_all_seven_p27_fields():
    fields = set(PlanAction.model_fields)
    # canal=channel, échéance=deadline, résultat attendu=expected_outcome
    for f in ("owner", "channel", "contact", "reason", "deadline", "expected_outcome", "feedback"):
        assert f in fields, f


def test_owner_and_reason_round_trip_by_alias():
    a = PlanAction.model_validate(
        {
            "action": "Envoyer un M1 à la DSI",
            "owner": "toi",
            "contact": "Jean Martin",
            "channel": "linkedin",
            "reason": "recrutement Data Engineer détecté cette semaine",
            "deadline": "J+3",
            "expectedOutcome": "réponse / RDV",
            "kpi": "taux de réponse",
        }
    )
    assert a.owner == "toi"
    assert a.reason == "recrutement Data Engineer détecté cette semaine"
    # feedback is post-execution — empty at generation, never fabricated.
    assert a.feedback == ""


def test_feedback_defaults_empty_and_accepts_a_post_hoc_value():
    assert PlanAction().feedback == ""
    a = PlanAction.model_validate({"action": "X", "feedback": "retenu — RDV pris"})
    assert a.feedback == "retenu — RDV pris"
