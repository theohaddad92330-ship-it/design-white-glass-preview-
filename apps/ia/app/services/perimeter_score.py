"""Deterministic Perimeter Fit Score /20 (03_BUSINESS_RULES §2).

Each entity/périmètre is scored on its own — "le front ne doit pas pousser 'le
groupe' mais les 2-4 périmètres les plus actionnables". 5 criteria × /4, summed +
tiered deterministically (same compute-side pattern as account_score). Uses the
per-entity signals already stamped upstream (relevance/getsPlay from the S2 gate,
priorityTier/isItEntity/accessibilityBand from ``prioritization.assign_priority_tiers``,
whatToSell from the LLM) — no extra LLM call.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

# (axis key, human label, max). 5 × 4 = 20 (§2).
PERIMETER_AXES: tuple[tuple[str, str, int], ...] = (
    ("operationnelle", "Entité opérationnelle identifiable", 4),
    ("owner", "Sponsor / owner probable", 4),
    ("signal", "Signal spécifique", 4),
    ("fit_offre", "Fit offre ESN", 4),
    ("accessibilite", "Accessibilité (14 jours)", 4),
)
PERIMETER_MAX = sum(m for _, _, m in PERIMETER_AXES)  # 20

# Bands → the deck's P1/P2/secondaire tiering of the hunting zones.
_P1_MIN = 14
_P2_MIN = 10

# Keep only the most actionable perimeters (§2: "2-4 périmètres", front schema ≤4 zones).
MAX_PERIMETERS = 4


def _band_points(band: str | None) -> int:
    return {"high": 4, "medium": 2, "low": 0}.get(str(band or "").lower(), 2)


def _tier_points(tier: str | None) -> int:
    return {"P1": 4, "P2": 2, "P3": 1}.get(str(tier or "").upper(), 1)


def perimeter_breakdown(entity: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Per-axis /4 breakdown of the perimeter score, from the entity's signals."""
    relevance = str(entity.get("relevance") or "operating")
    is_it = bool(entity.get("isItEntity"))
    what_to_sell = entity.get("whatToSell") or entity.get("what_to_sell") or []
    points = {
        "operationnelle": 4 if relevance == "operating" else 0,
        "owner": _tier_points(entity.get("priorityTier")),
        "signal": 4 if what_to_sell else (3 if is_it else 1),
        "fit_offre": 4 if is_it else 2,
        "accessibilite": _band_points(entity.get("accessibilityBand")),
    }
    return [{"axis": k, "label": label, "points": points[k], "max": m} for k, label, m in PERIMETER_AXES]


def perimeter_score(entity: Mapping[str, Any]) -> int:
    """Total /20 for one entity."""
    return min(PERIMETER_MAX, sum(a["points"] for a in perimeter_breakdown(entity)))


def perimeter_tier(score: int) -> str:
    """P1 (≥14) / P2 (10-13) / secondaire (<10)."""
    if score >= _P1_MIN:
        return "P1"
    if score >= _P2_MIN:
        return "P2"
    return "secondaire"


def _entry_role(entity: Mapping[str, Any]) -> str:
    """Recommended entry role for the zone, from its accessibility (méthode :
    accessible → bottom-up N-2 ; verrouillé → top-down sponsor)."""
    band = str(entity.get("accessibilityBand") or "").lower()
    if band == "high":
        return "operationnel / prescripteur (bottom-up)"
    if band == "low":
        return "sponsor C-level (top-down)"
    return "décideur N-1 (middle-out)"


def _confidence(entity: Mapping[str, Any]) -> str:
    """How confident this is a real, sellable perimeter — from data completeness."""
    if entity.get("isItEntity") and (entity.get("whatToSell") or entity.get("what_to_sell")):
        return "high"
    if str(entity.get("relevance") or "") == "operating":
        return "medium"
    return "low"


def _why(entity: Mapping[str, Any], score: int) -> str:
    bits = [f"{score}/20"]
    if entity.get("isItEntity"):
        bits.append("entité IT")
    band = str(entity.get("accessibilityBand") or "").lower()
    if band == "high":
        bits.append("accessible")
    if entity.get("whatToSell") or entity.get("what_to_sell"):
        bits.append("angle identifié")
    return " · ".join(bits)


def select_priority_perimeters(entities: object, cap: int = MAX_PERIMETERS) -> list[dict[str, Any]]:
    """The 2-4 most actionable perimeters (§2). Only play-eligible entities are
    ranked; noise / out-of-sector are excluded (they never become a hunting zone).
    Returns the top ``cap`` by /20 score, richest first."""
    scored: list[dict[str, Any]] = []
    for e in entities if isinstance(entities, list) else []:
        if not isinstance(e, Mapping):
            continue
        # Only entities the S2 gate lets through can be a hunting zone.
        if e.get("getsPlay") is False:
            continue
        s = perimeter_score(e)
        scored.append(
            {
                "name": e.get("name"),
                "tier": perimeter_tier(s),
                "perimeterScore": s,
                "scoreBreakdown": perimeter_breakdown(e),
                "whatToSell": e.get("whatToSell") or e.get("what_to_sell") or [],
                "entryRole": _entry_role(e),
                "confidence": _confidence(e),
                "why": _why(e, s),
            }
        )
    # Total order. The score is an int out of 20 built from five coarse axes, so
    # it collapses to ~17 distinct values — with 8+ entities, ties at the last
    # slot are near-certain, and a plain sort resolved them on the LLM's emission
    # order. The -index tiebreak makes the cut reproducible and explainable.
    # Total order. The score is an int out of 20 built from five coarse axes, so
    # it collapses to ~17 distinct values — with 8+ entities, ties at the last
    # slot are near-certain, and a plain sort resolved them on the LLM's emission
    # order. Ranking indices with a -i tiebreak keeps ties in input order while
    # making the cut reproducible (same idiom as prioritization.py).
    order = sorted(range(len(scored)), key=lambda i: (scored[i]["perimeterScore"], -i), reverse=True)
    return [scored[i] for i in order][:cap]
