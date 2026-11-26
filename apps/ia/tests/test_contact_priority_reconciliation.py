"""Live-path reconciliation: the canonical Contact Priority Score /100 drives the
tri, not the model's mood (« capturé ≠ consommé », methodo-sales-esn Phase 1).

``reconcile_contact_priorities`` runs at the end of Phase 3 classification and
replaces each CLASSIFIED contact's LLM ``priority`` 1-5 with the rank derived from
its deterministic /100 (seller boost applied); unclassified rows (0) are left as the
"NULL in DB" sentinel.
"""

from __future__ import annotations

from app.models.outputs.contacts import EnrichedContact
from app.services.classification import reconcile_contact_priorities


def test_reconcile_drives_priority_from_the_100_for_classified_contacts():
    # LLM under-ranked a real technical decider at 4 and over-ranked a gatekeeper at 1.
    strong = EnrichedContact(
        full_name="Alice",
        title="DSI Groupe",
        role="technical",
        priority=4,
        source="apollo",
        email="alice@cible.com",
        email_verified=True,
    )
    weak = EnrichedContact(
        full_name="Bob",
        title="Assistant",
        role="blocker",
        priority=1,
        source="ia_reconstruction",
    )
    reconcile_contact_priorities([strong, weak], {})
    # The /100 promotes the decider to the top and demotes the gatekeeper.
    assert strong.priority == 1
    assert weak.priority == 5


def test_reconcile_leaves_unclassified_rows_untouched():
    unclassified = EnrichedContact(full_name="Carol", title="Dev", role="", priority=0, source="apollo")
    reconcile_contact_priorities([unclassified], {})
    # 0 stays the "not classified → NULL in DB" sentinel — never fabricated into a rank.
    assert unclassified.priority == 0


def test_reconcile_is_seller_aware():
    """With a cyber-focused ESN profile, a technical decider's rank is at least as
    high as with no profile — the dead seller boost is now wired onto the live path."""
    tech = EnrichedContact(
        full_name="Dina",
        title="Responsable Cybersécurité",
        role="technical",
        priority=3,
        source="apollo",
        email="rssi@cible.com",
    )
    neutral = tech.model_copy()
    reconcile_contact_priorities([tech], {"expertise_areas": ["cybersécurité", "SOC"]})
    reconcile_contact_priorities([neutral], {})
    assert tech.priority <= neutral.priority


def test_reconcile_is_deterministic_and_in_place():
    contacts = [
        EnrichedContact(full_name="E", title="Directeur SI", role="economic", priority=5, source="apollo"),
        EnrichedContact(full_name="F", title="Stagiaire", role="user", priority=2, source="pappers"),
    ]
    before = [c.priority for c in contacts]
    reconcile_contact_priorities(contacts, {})
    once = [c.priority for c in contacts]
    reconcile_contact_priorities(contacts, {})
    twice = [c.priority for c in contacts]
    assert once == twice  # idempotent / stable
    assert once != before  # it actually reranked
