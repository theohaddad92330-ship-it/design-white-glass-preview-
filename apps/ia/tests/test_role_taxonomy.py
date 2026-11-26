"""Contact role taxonomy convergence — the LLM prompt (BELLUM-CONTACTS), the
deterministic title override (decision_role) and the bucket mapper all speak one
deck-MEDDIC vocabulary: economic | technical | user | champion | procurement |
influencer | blocker (=gatekeeper). procurement (achats / référencement) is a
first-class role per the Drive (§4, Théo p.9 "Achats"). Legacy values
(sponsor/operational/purchasing) still bucket correctly for historical rows."""

from __future__ import annotations

from app.models.outputs.contacts import CONTACT_BUCKETS, compute_contact_bucket
from app.prompts.bellum_contacts import build_user_prompt
from app.services.decision_role import classify_decision_role

DECK_ROLES = ("economic", "technical", "user", "champion", "procurement", "influencer", "blocker")


def test_prompt_emits_the_converged_deck_vocab():
    prompt = build_user_prompt("Société Générale", "", "", "", "")
    assert '"role": "economic | technical | user | champion | procurement | influencer | blocker"' in prompt
    # The old business-only vocab must be gone from the emitted role enum.
    assert '"role": "sponsor | champion | operational | purchasing' not in prompt


def test_procurement_is_a_first_class_role_across_prompts():
    # Théo p.9: "Achats" is a distinct role (not a blocker). It must appear in the
    # classifier enum AND the strategy/organigramme role vocabulary.
    from app.prompts.bellum_organigramme import build_system_prompt as org_prompt
    from app.prompts.bellum_strategy import build_system_prompt as strat_prompt

    assert 'procurement' in build_user_prompt('X', '', '', '', '')
    assert 'procurement' in org_prompt({})
    assert 'procurement' in strat_prompt({})


def test_title_override_returns_only_deck_core_roles():
    # The deterministic override speaks the SAME language as the prompt.
    for title, role in [
        ("CTO", "technical"),
        ("CFO", "economic"),
        ("Directeur Commercial", "user"),
        ("CEO", "champion"),
    ]:
        assert classify_decision_role(title) == role
        assert role in DECK_ROLES


def test_every_deck_role_maps_to_a_real_bucket():
    for r in DECK_ROLES:
        bucket = compute_contact_bucket(title="Jean Dupont", role=r, influence_level="")
        assert bucket in CONTACT_BUCKETS
    # Spot-check the mapping is meaningful, not all "a_verifier".
    assert compute_contact_bucket(title="x", role="economic", influence_level="") == "decideur"
    assert compute_contact_bucket(title="x", role="technical", influence_level="") == "decideur"
    assert compute_contact_bucket(title="x", role="user", influence_level="") == "operationnel"
    assert compute_contact_bucket(title="x", role="champion", influence_level="") == "sponsor"
    assert compute_contact_bucket(title="x", role="influencer", influence_level="") == "influenceur"


def test_legacy_values_still_bucket_for_historical_rows():
    assert compute_contact_bucket(title="x", role="sponsor", influence_level="") == "decideur"
    assert compute_contact_bucket(title="x", role="operational", influence_level="") == "operationnel"
    assert compute_contact_bucket(title="x", role="purchasing", influence_level="") == "operationnel"
