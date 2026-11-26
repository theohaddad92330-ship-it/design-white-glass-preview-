"""Deterministic priority tiers (P1 / P2 / P3) for the entity cartography.

The Skaizen deck ranks a group's entities into "zones de chasse" — ~4 P1
(attack first), ~6 P2 (second wave), the rest P3 (longue traîne). For an ESN
the axis is *IT relevance × size* (where the IT work and the budget are). We
compute it deterministically from signals already on each entity (name, type,
estimated headcount) — never asked to the LLM — so the cartography lands
"branchable" without eval risk.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

from .domain_focus import looks_like_it_esn
from .it_entity import is_it_entity

# An entity identified as the group's IT / digital arm (Euro-Information, GIE
# informatique, "X Technologies", mutualised DSI) is the ESN's prime target —
# it must land in P1 regardless of its estimated headcount. The boost dwarfs the
# size/keyword signals so any IT entity sorts above non-IT ones.
#
# Dé-silo (Drive #9 phase 3): this "IT arm = auto-P1" thumb only makes sense for
# an IT-services ESN. For a genuinely NON-IT ESN (a facility-management, HR or
# mechanical-engineering ESN) the target group's IT subsidiary is NOT the prime
# hunting zone, so the boost is withheld and the IT entity is tiered on its own
# size/keyword merits. IT-ESN and no-profile runs keep the boost → byte-identical
# (see ``looks_like_it_esn`` — it is ``True`` for both). The ``isItEntity`` factual
# tag and the accessibility band are left untouched (only the P1 *boost* is gated).
_IT_ENTITY_BOOST = 100.0

# Words that mark an IT-relevant entity an ESN can sell into.
_IT_KEYWORDS = (
    "it", "dsi", "data", "tech", "digital", "innovation", "cloud", "cyber",
    "markets", "platform", "plateforme", "ml", "devops", "sre", "core",
    "système", "systeme", "informati", "numérique", "numerique", "ia",
)
# Entity-type weights (lowercased substring → weight).
_TYPE_WEIGHTS = (
    ("hub it", 14), ("direction", 8), ("filiale", 6), ("bu", 6),
    ("business unit", 6), ("sous-dsi", -4), ("département", 2),
)

# Tier sizes mirror the deck (4 P1 + 6 P2 + rest P3).
_P1_MAX = 4
_P2_MAX = 6

# ── Second axis: accessibility ────────────────────────────────────────────────
# The tier above ranks *influence* (where the IT work + budget sit). The deck
# plots that against a second axis — *accessibilité* : how easily an ESN can get
# in. We proxy it deterministically from signals already on the entity, strongest
# first: declared IT autonomy > it-arm status > how deep the entity sits.
#
#   - itAutonomy "autonome"   → own IT budget/decisions → easy direct entry.
#     "centralise"            → decided at group level → hard entry.
#   - the group's IT arm      → the natural plug-in point for an ESN.
#   - a sous-DSI / département → buried deep under the group → hard to reach.
#
# Bands map to the influence tier (P1 high / P2 medium / P3 low) to form the
# influence × accessibility matrix, bucketed into the deck's 4 zones.
_INFLUENCE_BAND = {"P1": "high", "P2": "medium", "P3": "low"}

_DEEP_TYPES = ("sous-dsi", "département", "departement")
_OPERATING_TYPES = ("filiale", "bu", "business unit", "jv")

# ── Engagement playbook: zone → Power/Interest quadrant + cadence + tier ──────
# The ``zone`` below is the influence × accessibility bucket. The Skaizen deck /
# METHODE-PLAN-DE-COMPTE-ESN plots the same four quadrants on Power × Interest
# and attaches an engagement rule: which quadrant the account sits in, how often
# to touch it, and the outreach priority tier. Deterministic (pure function of
# the zone) so the deck's "quand + comment recontacter" lands branchable, no LLM.
ZONE_ENGAGEMENT: dict[str, dict[str, str]] = {
    "attaque_immediate": {
        "quadrant": "CHAMPIONS",
        "cadence": "hebdomadaire",
        "contactTier": "A",
        "action": "Allié qui décide ET veut avancer — engager directement, itérer chaque semaine.",
    },
    "influence_a_activer": {
        "quadrant": "À SATISFAIRE",
        "cadence": "mensuelle",
        "contactTier": "B",
        "action": "Pouvoir fort mais distant — informer sur les jalons via un sponsor, ne pas sur-solliciter.",
    },
    "quick_win": {
        "quadrant": "RELAIS TERRAIN",
        "cadence": "bi-mensuelle",
        "contactTier": "A",
        "action": "Accessible, intérêt réel — faire remonter les besoins et influencer les décideurs.",
    },
    "longue_traine": {
        "quadrant": "MONITOR",
        "cadence": "trimestrielle",
        "contactTier": "C",
        "action": "Faible pouvoir + faible intérêt — veille passive, réévaluer sur signal.",
    },
}


def engagement_for_zone(zone: str) -> dict[str, str]:
    """Return the deck engagement playbook (``quadrant`` / ``cadence`` /
    ``contactTier`` / ``action``) for an influence × accessibility zone. Empty
    dict for an unknown/empty zone."""
    return dict(ZONE_ENGAGEMENT.get(zone, {}))


def accessibility_band(entity: Mapping[str, object]) -> str:
    """Return ``"high" | "medium" | "low"`` — how reachable an entity is for an ESN.

    Deterministic, signal-ordered: explicit IT autonomy dominates, then IT-arm
    status, then how deep the entity sits in the group. Defaults to ``"medium"``
    when nothing discriminates (a plain operating filiale/BU)."""
    autonomy = str(entity.get("itAutonomy") or entity.get("it_autonomy") or "").lower()
    if "autonom" in autonomy:
        return "high"
    if "centralis" in autonomy:
        return "low"
    if _is_it_entity(entity):
        return "high"
    if "partage" in autonomy:
        return "medium"
    etype = str(entity.get("type") or "").lower()
    if any(t in etype for t in _DEEP_TYPES):
        return "low"
    if any(t in etype for t in _OPERATING_TYPES):
        return "medium"
    return "medium"


def _zone(tier: str, access_band: str) -> str:
    """Bucket the influence × accessibility matrix into the deck's 4 zones."""
    strong = tier == "P1"
    accessible = access_band == "high"
    if strong and accessible:
        return "attaque_immediate"
    if strong:
        return "influence_a_activer"
    if accessible:
        return "quick_win"
    return "longue_traine"


def _headcount(value: object) -> int:
    """Best-effort integer headcount from a free-form label (e.g. "~2 000",
    "Plus de 10 000 salariés", "1 500")."""
    digits = re.sub(r"[^\d]", "", str(value or ""))
    return int(digits) if digits else 0


def _is_it_entity(entity: Mapping[str, object]) -> bool:
    """An entity is the IT arm if a prior stage flagged it (``isItEntity``) or
    its name matches the IT/digital detector."""
    flagged = entity.get("isItEntity")
    if isinstance(flagged, bool):
        return flagged
    return is_it_entity(str(entity.get("name") or ""))


def _entity_score(entity: Mapping[str, object], it_esn: bool = True) -> float:
    name = str(entity.get("name") or "").lower()
    etype = str(entity.get("type") or "").lower()

    score = 0.0
    # IT-arm auto-P1 boost — only for an IT-services ESN (or a run with no profile).
    # A non-IT ESN doesn't force the target's IT subsidiary to the top of its list.
    if it_esn and _is_it_entity(entity):
        score += _IT_ENTITY_BOOST
    score += sum(6 for kw in _IT_KEYWORDS if kw in name)
    for needle, weight in _TYPE_WEIGHTS:
        if needle in etype:
            score += weight
    hc = _headcount(entity.get("estimatedHeadcount") or entity.get("estimated_headcount"))
    score += min(20.0, hc / 1000.0)
    return score


def assign_priority_tiers(entities: object, *, profile: Mapping[str, object] | None = None) -> list[dict]:
    """Annotate each entity with ``priorityTier`` (P1/P2/P3) + ``priorityRank``.

    Ranks by IT-relevance × size, then buckets: top 4 → P1, next 6 → P2, rest
    → P3 (capped to the list size). Order is preserved in the returned list;
    ranking only drives the tier.

    ``profile`` is the **ESN's own** profile (offers/positioning). When it reads
    as a non-IT ESN, the "IT arm = auto-P1" boost is withheld (Drive #9 phase 3);
    an IT-services ESN or a ``None`` profile keeps the historical boost, so the
    tiering is byte-identical for the current customer and profile-less callers."""
    items = [dict(e) for e in entities if isinstance(e, Mapping)] if entities else []
    if not items:
        return []

    it_esn = looks_like_it_esn(dict(profile) if profile is not None else None)
    scored = sorted(
        range(len(items)),
        key=lambda i: (_entity_score(items[i], it_esn), -i),
        reverse=True,
    )
    for rank, idx in enumerate(scored):
        tier = "P1" if rank < _P1_MAX else "P2" if rank < _P1_MAX + _P2_MAX else "P3"
        item = items[idx]
        item["priorityTier"] = tier
        item["priorityRank"] = rank + 1
        item["isItEntity"] = _is_it_entity(item)
        access = accessibility_band(item)
        item["accessibilityBand"] = access
        item["influenceBand"] = _INFLUENCE_BAND[tier]
        item["zone"] = _zone(tier, access)
        # Deck engagement rule for the zone (quadrant / cadence / tier / action).
        item["engagement"] = engagement_for_zone(item["zone"])
    return items


def tier_counts(entities: list[Mapping[str, object]]) -> dict[str, int]:
    out = {"P1": 0, "P2": 0, "P3": 0}
    for e in entities:
        tier = str(e.get("priorityTier") or "")
        if tier in out:
            out[tier] += 1
    return out


def zone_matrix(entities: list[Mapping[str, object]]) -> dict[str, int]:
    """Count entities per influence × accessibility zone (the deck's 4 zones)."""
    out = {"attaque_immediate": 0, "influence_a_activer": 0, "quick_win": 0, "longue_traine": 0}
    for e in entities:
        zone = str(e.get("zone") or "")
        if zone in out:
            out[zone] += 1
    return out
