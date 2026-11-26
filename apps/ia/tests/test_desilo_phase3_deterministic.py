"""Dé-siloter du IT — phase 3 (deterministic services), Drive #9.

Phase 3 makes the *deterministic* cartography/scoring services profile-aware so a
genuinely non-IT ESN stops being reasoned about through an assumed-IT lens. The
change is HIGH RISK — it feeds every account, including the current IT-ESN
customer — so the guiding principle is **IT-preserving generalisation**:

- IT-services ESN profile  → historical behaviour, byte-identical;
- no profile at all        → historical behaviour, byte-identical;
- genuinely non-IT ESN     → the IT-specific thumb-on-the-scale is dropped.

Two services are generalised here (both fed the ESN profile that phase-1 already
has in hand): ``prioritization`` (the "IT arm = auto-P1" boost) and ``entities``
(the "filiale_strategique" badge). This suite locks the byte-identity for the
IT / no-profile path AND proves a non-IT ESN shifts at least one signal. It also
pins the byte-identity of the services deliberately LEFT for a later increment
(``is_it_entity``, ``classify_decision_role``, ``classify_entity_relevance``).

No env flag: the deterministic dé-silo is profile-driven and always-on; its
safety is the default (IT / absent profile → unchanged), not a flag.
"""

from __future__ import annotations

from app.services.decision_role import classify_decision_role
from app.services.domain_focus import looks_like_it_esn
from app.services.entities import (
    annotate_entity_relevance,
    classify_entity_relevance,
    classify_entity_type,
    partition_subsidiaries,
)
from app.services.it_entity import is_it_entity
from app.services.prioritization import assign_priority_tiers, tier_counts

# The current customer (IT-services ESN) and a genuinely non-IT ESN.
_IT_ESN = {"companyName": "DataForge", "offers": ["Data & IA", "Cloud AWS", "Cybersécurité"]}
_NON_IT_ESN = {"companyName": "MecaConseil", "offers": ["Ingénierie mécanique", "Calcul de structures"]}

# A group org-map where the IT arm has zero headcount but four much larger non-IT
# entities — so the ONLY thing that can float it to the top is the IT boost.
_ENTITIES = [
    {"name": "Big Retail Bank", "type": "filiale", "estimatedHeadcount": "20000"},
    {"name": "Big Insurance", "type": "filiale", "estimatedHeadcount": "15000"},
    {"name": "Big Markets", "type": "filiale", "estimatedHeadcount": "12000"},
    {"name": "Big Asset Mgmt", "type": "filiale", "estimatedHeadcount": "10000"},
    {"name": "Euro-Information", "type": "GIE", "estimatedHeadcount": "0"},
]


# ── looks_like_it_esn — the single profile→domain gate the services consult ────


def test_looks_like_it_esn_defaults_to_it_when_absent_or_empty():
    assert looks_like_it_esn(None) is True
    assert looks_like_it_esn({}) is True
    assert looks_like_it_esn({"offers": []}) is True  # no declared offers → safe IT default


def test_looks_like_it_esn_true_for_an_it_esn():
    assert looks_like_it_esn(_IT_ESN) is True


def test_looks_like_it_esn_false_for_a_non_it_esn():
    assert looks_like_it_esn(_NON_IT_ESN) is False


# ── prioritization — IT-arm auto-P1 boost is IT-preserving ────────────────────


def test_prioritization_it_arm_forced_p1_with_no_profile():
    """Historical behaviour: the IT arm floats to P1/rank-1 over bigger non-IT."""
    by_name = {e["name"]: e for e in assign_priority_tiers(_ENTITIES)}
    assert by_name["Euro-Information"]["priorityTier"] == "P1"
    assert by_name["Euro-Information"]["priorityRank"] == 1
    assert by_name["Euro-Information"]["isItEntity"] is True


def test_prioritization_byte_identical_for_it_esn_and_no_profile():
    """The IT-ESN customer (and a profile-less run) get the exact same tiering."""
    baseline = assign_priority_tiers(_ENTITIES)
    assert assign_priority_tiers(_ENTITIES, profile=None) == baseline
    assert assign_priority_tiers(_ENTITIES, profile=_IT_ESN) == baseline


def test_prioritization_non_it_esn_drops_the_it_boost():
    """A non-IT ESN no longer force-ranks the target's IT subsidiary as #1 — it
    competes on size/keywords, so the four bigger non-IT entities outrank it."""
    by_name = {e["name"]: e for e in assign_priority_tiers(_ENTITIES, profile=_NON_IT_ESN)}
    assert by_name["Euro-Information"]["priorityTier"] != "P1"
    assert by_name["Euro-Information"]["priorityRank"] != 1
    # The factual IT tag is preserved — only the *boost* is withheld.
    assert by_name["Euro-Information"]["isItEntity"] is True
    # The tier bucketing itself is unchanged (still 4×P1 over 5 entities).
    assert tier_counts(assign_priority_tiers(_ENTITIES, profile=_NON_IT_ESN))["P1"] == 4


# ── entities — "filiale_strategique" badge is IT-preserving ────────────────────


def test_entity_type_strategic_badge_default_and_it_esn_identical():
    default = classify_entity_type("Euro-Information", relevance="operating")
    explicit = classify_entity_type("Euro-Information", relevance="operating", it_esn=True)
    assert default == explicit == ("filiale_strategique", True)


def test_entity_type_non_it_esn_keeps_operating_but_not_strategic():
    etype, actionable = classify_entity_type("Euro-Information", relevance="operating", it_esn=False)
    assert etype != "filiale_strategique"
    assert etype == "operational"
    assert actionable is True  # still a sellable operating entity, just not the crowned target


def test_annotate_entity_relevance_byte_identical_for_it_and_no_profile():
    entity = {"name": "Euro-Information", "isItEntity": True}
    baseline = annotate_entity_relevance(entity)
    assert annotate_entity_relevance(entity, it_esn=True) == baseline
    assert baseline["type"] == "filiale_strategique"
    assert baseline["relevance"] == "operating"
    assert baseline["getsPlay"] is True


def test_annotate_entity_relevance_non_it_esn_shifts_only_the_badge():
    entity = {"name": "Euro-Information", "isItEntity": True}
    it = annotate_entity_relevance(entity, it_esn=True)
    non_it = annotate_entity_relevance(entity, it_esn=False)
    # Relevance / play / actionability are UNCHANGED — only the type badge shifts.
    assert non_it["relevance"] == it["relevance"] == "operating"
    assert non_it["getsPlay"] == it["getsPlay"] is True
    assert non_it["actionable"] is True
    assert it["type"] == "filiale_strategique"
    assert non_it["type"] != "filiale_strategique"


def test_partition_subsidiaries_byte_identical_for_it_and_no_profile():
    subs = [{"name": "Euro-Information", "siren": "1"}, {"name": "BoursoBank", "siren": "2"}]
    baseline = partition_subsidiaries(subs)
    assert partition_subsidiaries(subs, it_esn=True) == baseline
    by_name = {e["name"]: e for e in baseline["annotated"]}
    assert by_name["Euro-Information"]["type"] == "filiale_strategique"


def test_partition_subsidiaries_non_it_esn_shifts_the_badge():
    subs = [{"name": "Euro-Information", "siren": "1"}]
    non_it = {e["name"]: e for e in partition_subsidiaries(subs, it_esn=False)["annotated"]}
    ent = non_it["Euro-Information"]
    assert ent["type"] != "filiale_strategique"
    assert ent["relevance"] == "operating"  # still operating — only the badge changed
    assert ent["isItEntity"] is True


# ── Regression locks for the shared factual primitives ────────────────────────
# is_it_entity (shared factual primitive) and classify_decision_role (fed the
# TARGET context, not the ESN profile, at its call site — see phase 4 assessment)
# stay factual/untouched. classify_entity_relevance's IT override IS generalised in
# phase 4, but its DEFAULT (it_esn=True, i.e. IT / no-profile) output is unchanged —
# pin it so a future edit can't drift the IT / no-profile deterministic path.


def test_is_it_entity_unchanged():
    assert is_it_entity("Euro-Information") is True
    assert is_it_entity("BoursoBank") is False


def test_classify_decision_role_unchanged():
    assert classify_decision_role("DSI Groupe") == "technical"
    assert classify_decision_role("Directeur Financier") == "economic"


def test_classify_entity_relevance_default_path_unchanged():
    # The IT-arm relevance override is generalised in phase 4 (gated on it_esn),
    # but the DEFAULT path (it_esn=True) — IT ESN or no profile — is byte-identical.
    assert classify_entity_relevance("Euro-Information") == ("operating", "")
    assert classify_entity_relevance("SCI Saint-Pères")[0] == "noise"
