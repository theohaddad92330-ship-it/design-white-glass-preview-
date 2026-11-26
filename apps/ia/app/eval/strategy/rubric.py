"""Explicit quality grid for the BELLUM-STRATEGY output (#274) — barème /100.

#274 wants to cut strategy output tokens "sans perte de qualité commerciale".
That sentence is only enforceable if "qualité commerciale" has a **number**, so
this module grades the strategy block deterministically, with a published barème.

Deterministic on purpose: an A/B over 15 accounts × 2 configs must be
reproducible and free to re-score. An LLM judge (``evals/judge.py``) can be
layered on top for semantic plausibility, but it must never be the thing that
decides "quality >= baseline" — it is not reproducible.

Barème (total 100), derived from the canonical in-repo method — NOT invented
here (see ``agent_docs/kb/methode-plan-de-compte-esn.md``, the Drive
"METHODE-PLAN-DE-COMPTE-ESN" distillation) and from the schema BELLUM-STRATEGY
is contractually asked to fill (``app/prompts/bellum_strategy.py``):

==================  ====  ==========================================================
Band                Pts   Canonical rule it enforces
==================  ====  ==========================================================
``angles``          35    "Un ANGLE = un PLAY" — formule PROMESSE + PREUVE + ACTION,
                          EXACTEMENT 3 plays prioritaires, 6 champs renseignés,
                          offre chiffrée et périmètrée.
``rdv_script``      25    Actionnabilité du script : 5 sections, opening sans
                          formule creuse, 5 questions d'exploration, closing avec
                          prochaine étape concrète, ponts + story frames.
``pains``           15    ≥4 défis + ≥4 pains, chacun qualifié (sévérité/urgence,
                          impact business, offre ESN en face).
``power_questions`` 10    ≥4 questions OUVERTES qui font verbaliser + justification.
``objections``      10    ≥3 objections avec vrai enjeu, réponse VALIDER→REBONDIR
                          →preuve, et question miroir.
``selection``        5    La LOGIQUE DE SÉLECTION : axesEcartes (angle+raison+
                          commentReactiver) + commentOuvrirCompte.
==================  ====  ==========================================================

Every band is a share of its points, so the total is a ``0..100`` float. The
harness compares ``total`` between two variants; a variant is only allowed to
ship when its total is **>= baseline** (within tolerance) on the golden set.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.services.angle_proof_gate import (
    PROOF_ABSENT,
    PROOF_MOBILISABLE,
    PROOF_UNVERIFIABLE,
)

# ── band weights (points out of 100) ──────────────────────────────────────────

BAND_POINTS: dict[str, float] = {
    "angles": 35.0,
    "rdv_script": 25.0,
    "pains": 15.0,
    "power_questions": 10.0,
    "objections": 10.0,
    "selection": 5.0,
}
MAX_SCORE = sum(BAND_POINTS.values())  # 100.0

# The product retains EXACTLY 3 plays (prompt: "les 3 plays PRIORITAIRES, jamais plus").
EXPECTED_ANGLES = 3
# Schema minimums the prompt states explicitly.
MIN_CHALLENGES = 4
MIN_PAINS = 4
MIN_POWER_QUESTIONS = 4
MIN_OBJECTIONS = 3
MIN_EXPLORATION_QUESTIONS = 5
MIN_AXES_ECARTES = 2

# How the 27 non-count points of the ``angles`` band split. ``proof`` is the
# PREUVE third of "PROMESSE + PREUVE + ACTION", which the band claimed to
# enforce and never measured; it is carved out of the two largest sub-axes
# (fields 12→10, action 8→6) plus a point each from scope and size, so the band
# total stays 35 and the published barème keeps summing to 100.
_ANGLE_SUB_WEIGHTS: dict[str, float] = {
    "fields": 10.0,
    "action": 6.0,
    "scope": 3.0,
    "size": 2.0,
    "proof": 6.0,
}

# What each verdict of ``angle_proof_gate`` is worth, per play.
#
# An empty proof keeps HALF: the model obeyed, and a blank costs a sentence.
# A proof naming a client the ESN never declared scores ZERO — it reads better
# than a blank and is the one a salesperson repeats in a meeting.
_PROOF_CREDIT: dict[str, float] = {
    PROOF_MOBILISABLE: 1.0,
    PROOF_ABSENT: 0.5,
    PROOF_UNVERIFIABLE: 0.0,
}

# The 6 contractual fields of a play (prompt schema for ``angles[]``).
ANGLE_FIELDS = (
    "title",
    "strategy",
    "entryContactPersona",
    "specificOffer",
    "estimatedDealSize",
    "prerequisites",
)
_ANGLE_ALIASES = {
    "entryContactPersona": ("entry_contact_persona",),
    "specificOffer": ("specific_offer",),
    "estimatedDealSize": ("estimated_deal_size",),
    # The gate stamps snake_case (wire contract); a model echo could be camel.
    "proofStatus": ("proof_status",),
}

# ACTION half of the PROMESSE+PREUVE+ACTION formula: a play must propose a
# concrete first step, not a capability list (kb: "Proposer du staffing data
# engineers n'est pas un play").
_ACTION_MARKERS = (
    "atelier", "audit", "poc", "pilote", "squad", "workshop", "cadrage",
    "diagnostic", "push", "immersion", "assessment", "quick win", "sprint",
)

# Banned filler the prompt explicitly forbids in the opening.
_BANNED_OPENING = ("je me permets", "nos expertises reconnues", "notre methodologie eprouvee")

# A concrete next step in the closing.
_CLOSING_MARKERS = (
    "semaine", "jours", "lundi", "mardi", "mercredi", "jeudi", "vendredi",
    "rdv", "call", "creneau", "agenda", "date", "prochaine etape", "30 min",
    "45 min", "1h", "visio",
)

_DIGIT_RE = re.compile(r"\d")
# A scoped offer names a duration / headcount / deliverable count.
_SCOPE_RE = re.compile(
    r"\d+\s*(semaine|mois|jour|consultant|profil|personne|etp|j/h|jh|an|ans)", re.IGNORECASE
)

_PLACEHOLDERS = frozenset(
    {"", "n/a", "na", "none", "null", "-", "—", "tbd", "a definir", "à définir",
     "a preciser", "à préciser", "non detecte", "non détecté", "inconnu"}
)


# ── helpers ───────────────────────────────────────────────────────────────────


def _strip_accents(text: str) -> str:
    table = str.maketrans("àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ", "aaaeeeeiioouuucAAAEEEEIIOOUUUC")
    return text.translate(table)


def _norm(value: Any) -> str:
    return _strip_accents(str(value or "").strip().lower())


def _filled(value: Any) -> bool:
    """True when a field carries real content (not empty / not a placeholder)."""
    if isinstance(value, (list, tuple)):
        return any(_filled(v) for v in value)
    return _norm(value) not in _PLACEHOLDERS


def _items(value: Any) -> list[Any]:
    """Schema-annotation-tolerant list reader.

    The prompt's JSON schema puts a leading *instruction string* inside each
    array (``"(MIN 4, viser 5) Pour chaque pain :"``). Models occasionally echo
    it. Only mappings are graded for object arrays, so those strings are ignored
    rather than counted as content.
    """
    if isinstance(value, (Mapping, str)):
        return []
    if isinstance(value, Sequence):
        return list(value)
    return []


def _mappings(value: Any) -> list[Mapping[str, Any]]:
    return [v for v in _items(value) if isinstance(v, Mapping)]


def _strings(value: Any) -> list[str]:
    return [v for v in _items(value) if isinstance(v, str) and _filled(v)]


def _get(obj: Mapping[str, Any], key: str) -> Any:
    if key in obj:
        return obj[key]
    for alias in _ANGLE_ALIASES.get(key, ()):
        if alias in obj:
            return obj[alias]
    return None


def _ratio(ok: int, total: int) -> float:
    return (ok / total) if total else 0.0


def _ratio_f(earned: float, total: int) -> float:
    """Same, for a sub-axis whose per-item credit is fractional."""
    return (earned / total) if total else 0.0


def _has_any(text: str, markers: Sequence[str]) -> bool:
    low = _norm(text)
    return any(m in low for m in markers)


@dataclass(frozen=True)
class BandScore:
    """One band's verdict: points earned out of ``max_points`` + why."""

    name: str
    points: float
    max_points: float
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    @property
    def ratio(self) -> float:
        return round(self.points / self.max_points, 4) if self.max_points else 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "points": round(self.points, 2),
            "max_points": self.max_points,
            "ratio": self.ratio,
            "detail": self.detail,
            "data": self.data,
        }


@dataclass(frozen=True)
class RubricScore:
    """The full /100 grid for one strategy output."""

    bands: list[BandScore]

    @property
    def total(self) -> float:
        return round(sum(b.points for b in self.bands), 2)

    def by_name(self) -> dict[str, BandScore]:
        return {b.name: b for b in self.bands}

    def as_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "max": MAX_SCORE,
            "bands": [b.as_dict() for b in self.bands],
        }


# ── bands ─────────────────────────────────────────────────────────────────────


def score_angles(strategy: Mapping[str, Any]) -> BandScore:
    """35 pts — "un ANGLE = un PLAY" (PROMESSE + PREUVE + ACTION).

    8 pts for producing exactly 3 plays (the product retains 3, never 15), then
    27 pts averaged over the plays: 6 contractual fields (10), a concrete ACTION
    (6), a scoped offer (3), a figured deal size (2), and a **mobilisable
    PREUVE** (6).

    ⚠️ The PREUVE sub-axis is new, and its absence was a hole this docstring
    hid: the band named ``PROMESSE + PREUVE + ACTION`` and measured two of the
    three. ``_ACTION_MARKERS`` graded the ACTION, ``_SCOPE_RE`` the offer, and
    nothing at all looked for the proof — which was, at the time, not even a
    field (it lived buried in the free-text ``strategy``). A grid cannot grade
    what has no name.

    **How the proof is graded, and why ``non_verifiable`` scores below an empty
    field.** ``angle_proof_gate`` stamps every play with a three-state verdict.
    A blank proof is HONEST — the model obeyed the instruction — and keeps half
    the points. A proof that names a client the ESN never declared scores ZERO:
    it reads better than a blank and is the one that costs the account, so a
    grid that rewarded it for "being filled" would push exactly the wrong way.

    **A proof that was never checked is not measured, and does not become a
    zero.** When no play carries a stamp (a legacy capture, or a payload that
    never went through the gate), the sub-axis is NOT MEASURABLE and its 6
    points are redistributed across the ones that are — so an old record scores
    exactly what it scored before, to the thousandth, and the A/B stays
    comparable. Same rule as the bench rubrics: an axis that cannot be measured
    leaves the denominator instead of scoring 0.
    """
    angles = _mappings(_get(strategy, "angles"))
    n = len(angles)
    count_pts = 8.0 if n == EXPECTED_ANGLES else (5.0 if n == 2 else (3.0 if n else 0.0))

    if not angles:
        return BandScore(
            "angles", count_pts, BAND_POINTS["angles"],
            detail="aucun angle produit", data={"count": 0},
        )

    fields_ok = action_ok = scope_ok = size_ok = 0
    proof_points = 0.0
    stamped = 0
    mobilisable = unverifiable = 0
    for a in angles:
        present = sum(1 for f in ANGLE_FIELDS if _filled(_get(a, f)))
        fields_ok += present == len(ANGLE_FIELDS)
        if _has_any(str(_get(a, "strategy") or ""), _ACTION_MARKERS):
            action_ok += 1
        if _SCOPE_RE.search(str(_get(a, "specificOffer") or "")):
            scope_ok += 1
        if _DIGIT_RE.search(str(_get(a, "estimatedDealSize") or "")):
            size_ok += 1

        status = _norm(_get(a, "proofStatus"))
        if status in _PROOF_CREDIT:
            stamped += 1
            proof_points += _PROOF_CREDIT[status]
            mobilisable += status == PROOF_MOBILISABLE
            unverifiable += status == PROOF_UNVERIFIABLE

    # An axis nobody could measure leaves the denominator; the others take its
    # points pro rata so the band still scores out of its published maximum.
    proof_measured = stamped > 0
    weights = dict(_ANGLE_SUB_WEIGHTS)
    if not proof_measured:
        freed = weights.pop("proof")
        total = sum(weights.values())
        weights = {k: v + freed * v / total for k, v in weights.items()}

    pts = (
        count_pts
        + weights["fields"] * _ratio(fields_ok, n)
        + weights["action"] * _ratio(action_ok, n)
        + weights["scope"] * _ratio(scope_ok, n)
        + weights["size"] * _ratio(size_ok, n)
        + (weights["proof"] * _ratio_f(proof_points, stamped) if proof_measured else 0.0)
    )
    proof_detail = (
        f"{mobilisable}/{stamped} preuve(s) mobilisable(s), {unverifiable} non vérifiable(s)"
        if proof_measured
        else "preuve NON MESURÉE (aucun verdict) — axe hors dénominateur"
    )
    return BandScore(
        "angles", round(pts, 2), BAND_POINTS["angles"],
        detail=(
            f"{n} play(s) (attendu {EXPECTED_ANGLES}) · {fields_ok}/{n} complets · "
            f"{action_ok}/{n} avec ACTION · {scope_ok}/{n} offre périmétrée · "
            f"{size_ok}/{n} chiffrés · {proof_detail}"
        ),
        data={"count": n, "complete": fields_ok, "with_action": action_ok,
              "scoped_offer": scope_ok, "figured_size": size_ok,
              "proof_measured": proof_measured, "proof_stamped": stamped,
              "proof_mobilisable": mobilisable, "proof_unverifiable": unverifiable},
    )


def score_rdv_script(strategy: Mapping[str, Any]) -> BandScore:
    """25 pts — actionnabilité du script de RDV."""
    script = _get(strategy, "rdvScript") or _get(strategy, "rdv_script") or {}
    if not isinstance(script, Mapping):
        script = {}

    core = ("opening", "positioning", "exploration", "proposal", "closing")
    present = sum(1 for k in core if _filled(script.get(k)))
    pts = 10.0 * _ratio(present, len(core))

    opening = str(script.get("opening") or "")
    clean_opening = _filled(opening) and not _has_any(opening, _BANNED_OPENING)
    pts += 3.0 if clean_opening else 0.0

    exploration = script.get("exploration")
    q_count = (
        len(_strings(exploration))
        if isinstance(exploration, (list, tuple))
        else str(exploration or "").count("?")
    )
    pts += 5.0 * min(1.0, _ratio(q_count, MIN_EXPLORATION_QUESTIONS))

    closing = str(script.get("closing") or "")
    concrete_closing = _filled(closing) and _has_any(closing, _CLOSING_MARKERS)
    pts += 4.0 if concrete_closing else 0.0

    bridges, frames = len(_strings(script.get("bridges"))), len(_strings(script.get("storyFrames")))
    pts += 1.5 * min(1.0, _ratio(bridges, 2)) + 1.5 * min(1.0, _ratio(frames, 2))

    return BandScore(
        "rdv_script", round(pts, 2), BAND_POINTS["rdv_script"],
        detail=(
            f"{present}/{len(core)} sections · opening {'ok' if clean_opening else 'creux/absent'} · "
            f"{q_count} question(s) d'exploration · closing {'concret' if concrete_closing else 'vague'} · "
            f"{bridges} pont(s) / {frames} story frame(s)"
        ),
        data={"sections": present, "clean_opening": clean_opening, "questions": q_count,
              "concrete_closing": concrete_closing, "bridges": bridges, "story_frames": frames},
    )


def score_pains(strategy: Mapping[str, Any]) -> BandScore:
    """15 pts — défis IT + douleurs business, chacun qualifié."""
    challenges = _mappings(_get(strategy, "itChallenges") or _get(strategy, "it_challenges"))
    pains = _mappings(_get(strategy, "pains"))

    pts = 4.0 * min(1.0, _ratio(len(challenges), MIN_CHALLENGES))
    pts += 4.0 * min(1.0, _ratio(len(pains), MIN_PAINS))

    c_ok = sum(
        1 for c in challenges
        if all(_filled(c.get(k)) for k in ("severity", "timeframe"))
        and _filled(c.get("esnOfferMatch") or c.get("esn_offer_match"))
    )
    p_ok = sum(
        1 for p in pains
        if all(_filled(p.get(k)) for k in ("urgency",))
        and _filled(p.get("businessImpact") or p.get("business_impact"))
        and _filled(p.get("esnOffer") or p.get("esn_offer"))
    )
    pts += 3.5 * _ratio(c_ok, len(challenges)) + 3.5 * _ratio(p_ok, len(pains))

    return BandScore(
        "pains", round(pts, 2), BAND_POINTS["pains"],
        detail=(
            f"{len(challenges)} défi(s) (min {MIN_CHALLENGES}), {c_ok} qualifiés · "
            f"{len(pains)} pain(s) (min {MIN_PAINS}), {p_ok} qualifiés"
        ),
        data={"challenges": len(challenges), "challenges_qualified": c_ok,
              "pains": len(pains), "pains_qualified": p_ok},
    )


def score_power_questions(strategy: Mapping[str, Any]) -> BandScore:
    """10 pts — questions OUVERTES + justification ``— [pourquoi]``."""
    questions = _strings(_get(strategy, "powerQuestions") or _get(strategy, "power_questions"))
    n = len(questions)
    pts = 5.0 * min(1.0, _ratio(n, MIN_POWER_QUESTIONS))

    interrogative = sum(1 for q in questions if "?" in q)
    justified = sum(1 for q in questions if "—" in q or " - " in q or "(" in q)
    pts += 2.5 * _ratio(interrogative, n) + 2.5 * _ratio(justified, n)

    return BandScore(
        "power_questions", round(pts, 2), BAND_POINTS["power_questions"],
        detail=f"{n} question(s) (min {MIN_POWER_QUESTIONS}) · {interrogative} interrogatives · {justified} justifiées",
        data={"count": n, "interrogative": interrogative, "justified": justified},
    )


def score_objections(strategy: Mapping[str, Any]) -> BandScore:
    """10 pts — objections traitées avec vrai enjeu + réponse + question miroir."""
    objections = _mappings(_get(strategy, "objections"))
    n = len(objections)
    pts = 5.0 * min(1.0, _ratio(n, MIN_OBJECTIONS))

    complete = sum(
        1 for o in objections
        if _filled(o.get("objection"))
        and _filled(o.get("realConcern") or o.get("real_concern"))
        and _filled(o.get("response"))
        and _filled(o.get("mirrorQuestion") or o.get("mirror_question"))
    )
    pts += 5.0 * _ratio(complete, n)

    return BandScore(
        "objections", round(pts, 2), BAND_POINTS["objections"],
        detail=f"{n} objection(s) (min {MIN_OBJECTIONS}) · {complete} complètes",
        data={"count": n, "complete": complete},
    )


def score_selection(strategy: Mapping[str, Any]) -> BandScore:
    """5 pts — la LOGIQUE DE SÉLECTION (axes écartés + comment ouvrir)."""
    axes = _mappings(_get(strategy, "axesEcartes") or _get(strategy, "axes_ecartes"))
    n = len(axes)
    pts = 2.0 * min(1.0, _ratio(n, MIN_AXES_ECARTES))

    complete = sum(
        1 for a in axes
        if _filled(a.get("angle"))
        and _filled(a.get("raison"))
        and _filled(a.get("commentReactiver") or a.get("comment_reactiver"))
    )
    pts += 2.0 * _ratio(complete, n)

    opening = _get(strategy, "commentOuvrirCompte") or _get(strategy, "comment_ouvrir_compte")
    pts += 1.0 if _filled(opening) else 0.0

    return BandScore(
        "selection", round(pts, 2), BAND_POINTS["selection"],
        detail=(
            f"{n} axe(s) écarté(s) (min {MIN_AXES_ECARTES}), {complete} complets · "
            f"commentOuvrirCompte {'présent' if _filled(opening) else 'absent'}"
        ),
        data={"axes": n, "axes_complete": complete, "has_opening": bool(_filled(opening))},
    )


BANDS = (
    score_angles,
    score_rdv_script,
    score_pains,
    score_power_questions,
    score_objections,
    score_selection,
)


def extract_strategy(payload: Mapping[str, Any]) -> Mapping[str, Any]:
    """Find the strategy block in whatever envelope the caller has.

    Accepts the strategy dict itself, a LangGraph final state (``{research:…}``),
    or a stored dossier — the strategy fields are merged into ``research`` by
    ``phase1_research``, so that is the usual home.
    """
    if not isinstance(payload, Mapping):
        return {}
    for key in ("strategy", "research"):
        inner = payload.get(key)
        if isinstance(inner, Mapping) and (
            "angles" in inner or "rdvScript" in inner or "rdv_script" in inner
        ):
            return inner
    return payload


def score_strategy(payload: Mapping[str, Any]) -> RubricScore:
    """Grade a strategy output against the published /100 barème."""
    strategy = extract_strategy(payload)
    return RubricScore(bands=[band(strategy) for band in BANDS])
