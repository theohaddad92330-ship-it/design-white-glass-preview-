"""Two explicit scoring axes — commercial score vs data confidence (Théo P1,
« Score et quick wins »).

Today the dossier blends ONE priority number (/10 ``priorityScore``, /25
``evaluation.score``) with a separately-computed confidence. Théo asks for the
two to be presented as DISTINCT axes, and for every factor of the score to be
tied to a proof:

    « Le score doit afficher score commercial ET confiance donnée. Chaque
      facteur du score doit être relié à une preuve : signal, source, contact,
      profil ou règle métier. »

This module surfaces them explicitly and deterministically (no LLM, fully
explainable) by REUSING what already exists — it invents nothing:

- ``commercial_score`` — the business fit / priority on 0-100, band-faithful
  with the /25 account verdict and the /10 ``priorityScore`` (GO ≥ 70,
  PRUDENT 50-69). Projected via :func:`account_score.legacy_global_score` so the
  axis never drifts from the GO / PRUDENT / STOP verdict.
- ``data_confidence`` — how well-sourced / fresh / verified the underlying data
  is on 0-100. This is the EXISTING :func:`confidence.compute_confidence` score,
  which already degrades when signals are archived (freshness by real date >
  ~24 months), the entity is a homonym / uncertain (identité axis caps the
  global) or the firmo facts are incomplete. Reused verbatim — not recomputed.
- ``score_factors`` — the evidence list: each contributing factor of the
  commercial score carries a ``proof_type`` (signal / source / contact /
  profile / business_rule) and a short label, so no factor is a bare number.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.services.account_score import SCORE_AXES, SCORE_MAX, legacy_global_score

# The proofs Théo enumerated. A factor is always tied to exactly one of these.
PROOF_TYPES: tuple[str, ...] = ("signal", "source", "contact", "profile", "business_rule")

# Each canonical /25 axis (Annexe méthodo p25) is justified by a NATURAL proof
# type, so a factor of the commercial score is always traceable to a concrete
# proof rather than a bare number:
#   fit_offre      ← the seller's own PROFILE (its offer vs the target's problems)
#   timing         ← recent business SIGNALS (news, moves, budget, recruitment)
#   accessibilite  ← reachable decision CONTACTS (relation, BU, multi-threading)
#   concurrence    ← SOURCED incumbents / alternatives (DECP, competitor intel)
#   capacite       ← the seller's own PROFILE (delivery, references, margin, délai)
_AXIS_PROOF_TYPE: dict[str, str] = {
    "fit_offre": "profile",
    "timing": "signal",
    "accessibilite": "contact",
    "concurrence": "source",
    "capacite": "profile",
}

# Canonical axis labels (fallback when the model's breakdown didn't carry one).
_AXIS_LABEL: dict[str, str] = {key: label for key, label, _ in SCORE_AXES}
_AXIS_MAX_POINTS: dict[str, int] = {key: maximum for key, _, maximum in SCORE_AXES}


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def commercial_score_100(evaluation: Mapping[str, Any] | None) -> int:
    """Business fit / priority on 0-100, band-faithful with the account verdict.

    Prefers the already-reconciled /10 ``globalScore`` (× 10); falls back to
    projecting the /25 ``score`` through :func:`legacy_global_score` so the /100
    axis lands in the SAME band as the GO / PRUDENT / STOP verdict (a plain
    ``score/25×100`` would drift — 19/25 PRUDENT → 76, reading as GO)."""
    evaluation = evaluation or {}
    g10 = evaluation.get("globalScore")
    if not _is_number(g10):
        g10 = evaluation.get("global_score")
    if not _is_number(g10):
        score25 = evaluation.get("score")
        g10 = legacy_global_score(int(score25)) if _is_number(score25) else 0
    return int(round(max(0.0, min(10.0, float(g10))) * 10))


def data_confidence_from(confidence: Mapping[str, Any] | None) -> int | None:
    """The 0-100 data confidence — REUSES the deterministic
    :func:`confidence.compute_confidence` score already attached to the research
    (it degrades on archived signals / homonym entity / thin sources). ``None``
    when no confidence was computed (an in-progress or legacy run)."""
    if not isinstance(confidence, Mapping):
        return None
    raw = confidence.get("score")
    if not _is_number(raw):
        return None
    return max(0, min(100, int(round(float(raw)))))


def score_factors(evaluation: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """Evidence list for the commercial score: one factor per scored /25 axis,
    each tied to a ``proof_type`` + short label + its ``weight`` (points), plus a
    ``business_rule`` factor for the deterministic verdict band. Only axes that
    actually contributed (points > 0) are listed — a 0-point axis is not evidence.

    Every factor carries ``kind`` and ``max`` so a reader can reconcile the list:
    ``kind="axis"`` factors ADD UP (each out of ``max`` points) to the single
    ``kind="total"`` factor (out of /25). Without that marker the verdict factor
    was rendered "+N" beside the axes and the column no longer summed to the
    score — the axes total was simply restated and counted twice.

    Accepts the camelCase ``scoreBreakdown`` (phase-4 wire shape) or the
    snake_case ``score_breakdown`` (persisted / normalised)."""
    evaluation = evaluation or {}
    breakdown = evaluation.get("scoreBreakdown")
    if not isinstance(breakdown, list):
        breakdown = evaluation.get("score_breakdown")
    factors: list[dict[str, Any]] = []
    for item in breakdown or []:
        if not isinstance(item, Mapping):
            continue
        axis = str(item.get("axis") or item.get("key") or "").strip()
        points = item.get("points")
        if not _is_number(points) or points <= 0:
            continue
        label = str(item.get("label") or _AXIS_LABEL.get(axis) or axis).strip()
        if not label:
            continue
        axis_max = item.get("max")
        factors.append(
            {
                "label": label,
                "proof_type": _AXIS_PROOF_TYPE.get(axis, "business_rule"),
                "weight": int(points),
                "kind": "axis",
                "max": int(axis_max) if _is_number(axis_max) else _AXIS_MAX_POINTS.get(axis, 5),
            }
        )
    # The verdict itself is a deterministic RULE over the /25 (not the model's
    # mood) — the business_rule proof that ties the factors into a decision. Its
    # weight is the TOTAL of the axes above, NOT an extra contribution: hence
    # ``kind="total"``, which the UI renders as a sum line rather than a "+N".
    verdict = str(evaluation.get("verdict") or "").strip()
    total = evaluation.get("score")
    if verdict and _is_number(total):
        factors.append(
            {
                "label": f"Verdict {verdict} — règle /25 (méthodo sales ESN p25)",
                "proof_type": "business_rule",
                "weight": int(total),
                "kind": "total",
                "max": SCORE_MAX,
            }
        )
    return factors


def build_score_axes(
    *,
    evaluation: Mapping[str, Any] | None,
    confidence: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """Assemble the two explicit axes + the evidence list for the analysis
    output. camelCase keys (phase-4 wire convention); the API persists them under
    ``raw_analysis.plan`` and the front reads ``commercialScore`` /
    ``dataConfidence`` / ``scoreFactors`` beside the existing verdict."""
    return {
        "commercialScore": commercial_score_100(evaluation),
        "dataConfidence": data_confidence_from(confidence),
        "scoreFactors": score_factors(evaluation),
    }
