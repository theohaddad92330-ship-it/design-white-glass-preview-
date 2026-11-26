"""Deterministic confidence engine for the Org Graph (Annexe Organigramme /
Account Mapping, p14 — « Calcul de confiance »).

The spec is explicit (p14): confidence must be **explicable and recalculable** —
a transparent sum of named factors, not an opaque LLM number. This module is that
engine: it turns the evidence backing a hierarchy edge (or a person→entity
attachment) into a 0-100 score, then maps the score to the grounding band that
decides whether the edge is drawn full (vérifié), dotted (probable/hypothèse) or
not drawn at all (only a coverage zone to verify).

Weights + thresholds are the p14 table verbatim (kept as named constants so they
stay tunable). No LLM, no network — compute-side and unit-tested. This is the core
Phase 2's resolver consumes; it deliberately ships alone, ahead of the resolver,
so the formula is locked and reviewable in isolation.

Ties into the `OrgGraph` contract invariants (@bellum/contracts): a `verified`
hierarchy edge requires confidence ≥ 90, an inferred one stays ≤ 89, and an
LLM-only inference can never be verified (it is capped at 49 here).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# ── p14 weights (« Exemple poids ») ──────────────────────────────────────────
# Additive contributions. Their max without contradiction is exactly 100
# (30+20+15+15+10+10), i.e. a fully-corroborated edge tops out at « vérifié ».
W_OFFICIAL_SOURCE = 30  # Source A officielle (site off / organigramme / registre / bio)
W_LINKEDIN_OR_PROVIDER = 20  # LinkedIn actuel / provider (Apollo…)
W_EXPLICIT_TITLE = 15  # Titre explicite (le lien est nommé, pas déduit)
W_SAME_ORG_ID = 15  # Même organisation ID / domaine (les deux nœuds sur la même entité)
W_TWO_CONVERGING_SOURCES = 10  # Deux sources convergentes (corroboration)
W_FRESH_DATE = 10  # Date < 12 mois (fraîcheur)
W_CONTRADICTION = -30  # Contradiction (une source dit l'inverse)

# Une inférence LLM SEULE (aucune source A/B) ne peut jamais dépasser ce plafond
# → jamais « vérifié », au mieux « hypothèse ».
LLM_ONLY_CEILING = 49

# ── p14 thresholds (« Seuils ») ──────────────────────────────────────────────
VERIFIED_MIN = 90  # 90-100 → vérifié (edge plein)
PROBABLE_MIN = 70  # 70-89  → probable (edge pointillé)
HYPOTHESIS_MIN = 50  # 50-69  → hypothèse (edge pointillé faible)
# < 50 → aucun edge créé, seulement une zone à vérifier.

ConfidenceBand = Literal["verified", "probable", "hypothesis", "none"]


@dataclass(frozen=True)
class ConfidenceFactors:
    """The evidence backing one candidate edge/attachment. Every field defaults to
    the absence of that evidence, so a caller only sets what it actually observed —
    nothing is assumed. `llm_only` marks an edge whose sole basis is an LLM
    inference (no A/B source); it caps the result at :data:`LLM_ONLY_CEILING`."""

    official_source: bool = False
    linkedin_or_provider: bool = False
    explicit_title: bool = False
    same_org_id: bool = False
    two_converging_sources: bool = False
    fresh_date: bool = False
    contradiction: bool = False
    llm_only: bool = False


def compute_confidence(factors: ConfidenceFactors) -> int:
    """Return the 0-100 confidence for one edge from its factors (p14).

    Transparent sum of the named weights, clamped to [0, 100]. An LLM-only edge is
    additionally capped at :data:`LLM_ONLY_CEILING` (49) so it can never present as
    verified — the spec's « le LLM propose des hypothèses, jamais des liens certains
    sans preuve »."""
    score = 0
    if factors.official_source:
        score += W_OFFICIAL_SOURCE
    if factors.linkedin_or_provider:
        score += W_LINKEDIN_OR_PROVIDER
    if factors.explicit_title:
        score += W_EXPLICIT_TITLE
    if factors.same_org_id:
        score += W_SAME_ORG_ID
    if factors.two_converging_sources:
        score += W_TWO_CONVERGING_SOURCES
    if factors.fresh_date:
        score += W_FRESH_DATE
    if factors.contradiction:
        score += W_CONTRADICTION

    # Clamp BEFORE the LLM cap so a negative sum can't slip past `min`.
    score = max(0, min(100, score))
    if factors.llm_only:
        score = min(score, LLM_ONLY_CEILING)
    return score


def confidence_band(score: int) -> ConfidenceBand:
    """Map a score to its p14 grounding band."""
    if score >= VERIFIED_MIN:
        return "verified"
    if score >= PROBABLE_MIN:
        return "probable"
    if score >= HYPOTHESIS_MIN:
        return "hypothesis"
    return "none"


def is_verified(score: int) -> bool:
    """A verified (full-line) hierarchy edge — matches the OrgGraph contract's
    `verified ⇒ confidence ≥ 90` invariant."""
    return score >= VERIFIED_MIN


def creates_edge(score: int) -> bool:
    """Whether the score is high enough to draw ANY edge (≥ 50). Below that the
    resolver must emit a coverage zone to verify instead of a line (p14)."""
    return score >= HYPOTHESIS_MIN
