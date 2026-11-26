"""Deterministic contact bucketing (app/models/outputs/contacts.py)."""

from __future__ import annotations

import pytest

from app.models.outputs.contacts import EnrichedContact, compute_contact_bucket


@pytest.mark.parametrize(
    "title,role,inf,expected",
    [
        ("", "sponsor", "decision-maker", "bruit"),  # no title → noise, whatever the role
        ("DSI", "", "", "a_verifier"),  # name+title, no signal → to verify
        ("DSI", "sponsor", "", "decideur"),  # final decision-maker
        ("CTO", "technical", "", "decideur"),  # technical decision-maker (DSI/CTO)
        ("CFO", "economic", "", "decideur"),  # economic buyer
        ("End user", "user", "", "operationnel"),
        ("Architect", "", "decision-maker", "decideur"),
        ("Head of IT", "champion", "", "sponsor"),  # internal promoter
        ("Analyst", "operational", "", "operationnel"),
        ("Buyer", "purchasing", "", "operationnel"),
        ("Consultant", "", "executor", "operationnel"),
        ("Advisor", "influencer", "", "influenceur"),
        ("Advisor", "", "influencer", "influenceur"),
        ("Legal", "blocker", "", "a_verifier"),  # classified but ambiguous
    ],
)
def test_compute_contact_bucket(title, role, inf, expected):
    assert compute_contact_bucket(title=title, role=role, influence_level=inf) == expected


@pytest.mark.parametrize(
    "title",
    [
        "Stagiaire",
        "Stagiaire DSI",  # decider keyword must NOT rescue an intern
        "Alternant Data",
        "Apprenti Développeur",
        "IT Intern",
        "Work-study Analyst",
        "Trainee",
    ],
)
def test_interns_are_flagged_as_bruit(title):
    # Even with a decision-maker role/influence, a trainee lands in noise.
    assert compute_contact_bucket(title=title, role="technical", influence_level="decision-maker") == "bruit"


def test_non_trainee_lookalikes_are_not_flagged():
    # "interne" (=internal) and "international" must not read as intern.
    assert compute_contact_bucket(title="Auditeur interne", role="economic", influence_level="") == "decideur"
    assert compute_contact_bucket(title="Directeur International", role="", influence_level="") == "a_verifier"


def test_bucket_is_serialized_and_guaranteed():
    c = EnrichedContact(fullName="Jane Doe", title="DSI", role="sponsor")
    dumped = c.model_dump(by_alias=True)
    assert dumped["bucket"] == "decideur"
    # Even an empty contact yields a bucket (never missing on the front).
    empty = EnrichedContact()
    assert empty.model_dump(by_alias=True)["bucket"] == "bruit"
