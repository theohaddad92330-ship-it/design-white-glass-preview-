"""Deterministic GO / PRUDENT / STOP / EXPLORER verdict from a /25 account score.

The score answers "est-ce que ce compte vaut le coup ?" and must NOT be "un joli
chiffre Claude" — it explains WHY, per axis, and the verdict is a RULE, not the
model's mood. So the LLM scores each axis on its max (explainable breakdown); this
module sums the axes to /25 and maps the band to the verdict deterministically.

The 5 axes + bands are the CANONICAL rule from the Annexe Méthodologie Sales ESN
(Théo 2026-07-21, p25 « Scoring compte — priorité commerciale »), which the
operator ruled AUTHORITATIVE over the older Drive 03_BUSINESS_RULES §1 grid. The
axes are Fit / Timing / Accessibilité / Concurrence / Capacité; the verdicts are
GO 20-25 (+confiance) / PRUDENT 14-19 / STOP <14 / EXPLORER (potentiel mais
données manquantes → collecter l'info).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

# The 5 canonical axes × 5 points = 25 (Annexe méthodo p25). Equal weight; the LLM
# scores each on its max, this module sums + bands deterministically.
SCORE_AXES: tuple[tuple[str, str, int], ...] = (
    ("fit_offre", "Fit — problèmes et offres compatibles", 5),
    ("timing", "Timing — signaux / besoins / budget maintenant", 5),
    ("accessibilite", "Accessibilité — relation, BU, panel, géo, taille", 5),
    ("concurrence", "Concurrence — incumbents, interne, alternatives", 5),
    ("capacite", "Capacité — delivery, références, marge, délai", 5),
)

SCORE_MAX = sum(m for _, _, m in SCORE_AXES)  # 25

# Canonical bands (Annexe méthodo p25): 20-25 GO, 14-19 PRUDENT, <14 STOP. EXPLORER
# is not a band but an OVERLAY: real potential the confidence can't yet confirm.
_GO_MIN = 20
_PRUDENT_MIN = 14
# Floor of "potentiel worth collecting info on": below it, a data-poor dossier is
# a plain STOP, not an EXPLORER.
_EXPLORER_MIN = 10

_AXIS_MAX = {k: m for k, _, m in SCORE_AXES}


def verdict_for_score(score: int, *, data_complete: bool = True) -> str:
    """GO (20-25) / PRUDENT (14-19) / STOP (<14) — Annexe méthodo p25.

    When the dossier has real potential but key data is missing
    (``data_complete=False``), a scorable account (≥ ``_EXPLORER_MIN``) is
    **EXPLORER** ("collecter l'info") rather than a confident verdict — GO in
    particular requires sufficient confidence (p25 "GO 20-25 + confiance
    suffisante"). ``data_complete=True`` (default) keeps the plain-band behaviour
    for callers that carry no confidence signal."""
    if not data_complete and score >= _EXPLORER_MIN:
        return "EXPLORER"
    if score >= _GO_MIN:
        return "GO"
    if score >= _PRUDENT_MIN:
        return "PRUDENT"
    return "STOP"


# Canonical /10 band cutoffs — the SAME split as the /25 bands, and the split
# every downstream bucket/colour must use: ``priority_score >= 7`` = GO/chaud,
# ``5-6`` = PRUDENT/moyen, ``< 5`` = STOP/froid. ``legacy_global_score`` projects
# /25 → /10 so these cutoffs land on the right band (no more "PRUDENT shown as
# chaud"). Keep this in sync with the TS mirror in packages/contracts.
GLOBAL_GO_MIN = 7
GLOBAL_PRUDENT_MIN = 5
# /10 floor for EXPLORER — the band-faithful image of `_EXPLORER_MIN`/25.
GLOBAL_EXPLORER_MIN = 4


def verdict_from_global_score(global_score: float, *, data_complete: bool = True) -> str:
    """GO / PRUDENT / STOP / EXPLORER from a /10 global score, via the canonical
    /10 cutoffs.

    Single source of truth for the account verdict: the on-demand scorer used to
    emit a divergent GO/PRUDENT/NO-GO from the model's mood. Using the /10 cutoffs
    directly (not a re-projection to /25) keeps the verdict, the ``priority_score``
    bucket and ``legacy_global_score`` mutually consistent — a /10 of 7 is GO AND
    "chaud", never one without the other. EXPLORER overrides when there is
    potential (≥ ``GLOBAL_EXPLORER_MIN``) but the data is incomplete.
    """
    try:
        g = float(global_score)
    except (TypeError, ValueError):
        return "STOP"
    if not data_complete and g >= GLOBAL_EXPLORER_MIN:
        return "EXPLORER"
    if g >= GLOBAL_GO_MIN:
        return "GO"
    if g >= GLOBAL_PRUDENT_MIN:
        return "PRUDENT"
    return "STOP"


# #2304.12-.16 (épopée #2932, LAU-FINAL-045) — les cinq catégories MÉTIER du
# verdict, pour un lecteur qui n'a jamais vu GO/PRUDENT/STOP/EXPLORER.
NAMED_VERDICTS: tuple[str, ...] = (
    "AGIR MAINTENANT",
    "QUALIFIER",
    "RÉSERVE",
    "METTRE EN VEILLE",
    "ÉCARTER POUR CET OBJECTIF",
)


# #3818 — sans objectif renseigné dans l'espace, un STOP ne peut légitimement
# dire « ÉCARTER POUR CET OBJECTIF » : il n'y a pas de "cet objectif" contre
# lequel juger. Trois libellés distincts, jamais fondus en un seul : une
# source en panne n'est pas un zéro mesuré, et aucun des deux n'est une
# incompatibilité ÉTABLIE (la seule qui autorise un écartement réel malgré
# l'absence d'objectif).
VERDICT_SOURCE_DOWN = "ÉVALUATION PERSONNALISÉE INDISPONIBLE — SOURCE EN PANNE"
VERDICT_ZERO_MEASURED = "ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ"
VERDICT_INCOMPATIBILITY_ESTABLISHED = "INCOMPATIBILITÉ ÉTABLIE"


def named_verdict(
    verdict: str,
    *,
    has_no_go_trigger: bool = False,
    has_objective: bool = True,
    data_complete: bool = True,
) -> str:
    """#2304.12-.16 — projection DÉTERMINISTE de GO/PRUDENT/STOP/EXPLORER vers
    les cinq catégories métier — jamais un second jugement du modèle, même
    principe que `verdict_for_score` lui-même.

    GO → AGIR MAINTENANT. EXPLORER → QUALIFIER (l'action est déjà de collecter
    l'info, pas de conclure). PRUDENT → RÉSERVE (potentiel réel, freins
    réels). STOP se sépare en deux sur le seul fait qui les distingue déjà
    ailleurs dans le dépôt (`dossier_read.no_go`, doctrine « un no-go est
    toujours temporaire ») : un déclencheur plausible identifié (`no_go.trigger`)
    → METTRE EN VEILLE, le compte rouvrira sur ce fait ; aucun déclencheur →
    ÉCARTER POUR CET OBJECTIF — le qualificatif « pour CET objectif » porte
    déjà la réversibilité (doctrine « on archive, on ne supprime pas »).

    #3818 — ``has_objective=False`` (l'espace n'a renseigné aucun objectif
    commercial, p. ex. aucun domaine d'offre configuré) retire la seule
    branche qui PRÉSUPPOSE un objectif à juger (``ÉCARTER POUR CET OBJECTIF``)
    et la remplace par trois issues distinctes, jamais confondues :
      - un déclencheur de no-go existe toujours → l'écartement reste légitime,
        il ne dépend pas d'un objectif : ``INCOMPATIBILITÉ ÉTABLIE`` (c'est la
        SEULE façon d'obtenir un écartement réel sans objectif renseigné) ;
      - sans déclencheur, et des données incomplètes (``data_complete=False``,
        même signal que :func:`verdict_from_global_score`) → une source n'a
        pas répondu, on ne sait pas conclure : ``VERDICT_SOURCE_DOWN`` ;
      - sans déclencheur, données complètes → mesuré, réellement bas, mais
        sans objectif pour en juger la portée : ``VERDICT_ZERO_MEASURED``.
    ``has_objective=True`` (défaut) garde le comportement d'avant à l'octet
    près — les verdicts déjà stockés et déjà lus avec ce défaut ne changent
    pas : cette fonction ne fait QUE projeter à la lecture, elle n'écrit rien.

    Un verdict hors vocabulaire (donnée corrompue, ancien format) se range
    prudemment en QUALIFIER plutôt qu'en AGIR MAINTENANT : on ne pousse jamais
    à agir sur un verdict qu'on ne sait pas lire."""
    if verdict == "GO":
        return "AGIR MAINTENANT"
    if verdict == "PRUDENT":
        return "RÉSERVE"
    if verdict == "STOP":
        if has_no_go_trigger:
            return VERDICT_INCOMPATIBILITY_ESTABLISHED if not has_objective else "METTRE EN VEILLE"
        if not has_objective:
            return VERDICT_SOURCE_DOWN if not data_complete else VERDICT_ZERO_MEASURED
        return "ÉCARTER POUR CET OBJECTIF"
    return "QUALIFIER"


def clamp_axis(key: str, points: object) -> int:
    """Clamp a per-axis score to [0, axis max]. Non-numeric → 0 (the model left it
    blank), so the axis just doesn't contribute rather than crashing the plan."""
    cap = _AXIS_MAX.get(key, 0)
    try:
        p = int(round(float(points)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    return max(0, min(cap, p))


def score_from_breakdown(breakdown: Iterable[Mapping[str, object]]) -> int:
    """Sum a scoreBreakdown (list of {axis, points}) into a clamped /25 total.

    Trusting the model's own total risks it inventing a number that doesn't match
    its axes; recomputing from the clamped per-axis points keeps score == Σ(axes)."""
    total = 0
    for item in breakdown or []:
        if not isinstance(item, Mapping):
            continue
        key = str(item.get("axis") or item.get("key") or "")
        total += clamp_axis(key, item.get("points"))
    return min(SCORE_MAX, total)


# Legacy back-compat: the old model exposed goNoGo (GO|NO-GO|CONDITIONNEL) + a
# /10 globalScore. Keep them derived so old data + not-yet-migrated consumers
# don't break.
_LEGACY_VERDICT = {"GO": "GO", "PRUDENT": "CONDITIONNEL", "STOP": "NO-GO", "EXPLORER": "CONDITIONNEL"}


def legacy_go_no_go(verdict: str) -> str:
    return _LEGACY_VERDICT.get(verdict, "CONDITIONNEL")


# Quality-gate caps (Théo restitution §6/§7 : "Score doit être recalculé après
# gates qualité"; gate G6 : "Blocage ou dégradation si incohérence, obsolescence
# ou faible confiance"). A dossier the Quality Judge marks unusable must NOT ship
# a confident verdict — the /25 is capped so the band, the derived /10, the colour
# and every downstream bucket degrade together:
#   trop_faible   → données manquantes : cap 13 ET le call site passe
#                   data_complete=False → EXPLORER si potentiel (≥10), sinon STOP
#   hallucination → ≤ PRUDENT (un fait affiché sans source) → jamais GO  → cap 19
# ``a_corriger`` / ``ok`` leave the score untouched (corrigeable, pas un bris de
# confiance). The cap only ever LOWERS a score, never raises it.
_QUALITY_SCORE_CAP: dict[str, int] = {
    "trop_faible": _PRUDENT_MIN - 1,  # 13 → STOP/EXPLORER
    "hallucination": _GO_MIN - 1,  # 19 → au plus PRUDENT
}


def cap_score_for_quality(score_25: int, quality_verdict: str | None) -> int:
    """Degrade a /25 account score to at most the band a Quality-Judge verdict
    allows. ``ok`` / ``a_corriger`` / unknown → unchanged. Never raises the score."""
    cap = _QUALITY_SCORE_CAP.get((quality_verdict or "").strip().lower())
    if cap is None:
        return int(score_25)
    return min(int(score_25), cap)


def score25_from_global_score(global_score: float) -> int:
    """Band-faithful INVERSE of :func:`legacy_global_score`: /10 → /25 landing in
    the SAME band (>=7 GO → 20-25, 5-6 PRUDENT → 14-19, <5 STOP → 0-13). Used only
    for the legacy fallback when a plan emitted a /10 ``globalScore`` but no
    ``scoreBreakdown`` — a plain linear rescale would mis-band it (7/10 → 18/25 =
    PRUDENT, contradicting verdict_from_global_score(7) = GO)."""
    g = max(0.0, min(10.0, float(global_score)))
    if g >= GLOBAL_GO_MIN:  # GO → 20-25
        return _GO_MIN + round((g - GLOBAL_GO_MIN) / (10 - GLOBAL_GO_MIN) * (SCORE_MAX - _GO_MIN))
    if g >= GLOBAL_PRUDENT_MIN:  # PRUDENT → 14-19
        return _PRUDENT_MIN + round((g - GLOBAL_PRUDENT_MIN) / (GLOBAL_GO_MIN - GLOBAL_PRUDENT_MIN) * (_GO_MIN - 1 - _PRUDENT_MIN))
    return round(g / GLOBAL_PRUDENT_MIN * (_PRUDENT_MIN - 1))  # STOP → 0-14


def legacy_global_score(score_25: int) -> int:
    """Map /25 → /10 BAND-FAITHFULLY, so the /10 cutoffs (>=7 GO, 5-6 PRUDENT,
    <5 STOP) fall on the same band as the /25 score. A plain linear rescale would
    put PRUDENT (19/25 → 7.6 → 8) in GO/chaud territory — the exact "PRUDENT shown
    as chaud" bug. Instead we project each band onto its /10 slice:
      GO 20-25 → 7-10 · PRUDENT 14-19 → 5-6 · STOP 0-13 → 1-4.
    """
    s = max(0, min(SCORE_MAX, int(score_25)))
    if s >= _GO_MIN:  # GO → 7-10
        return 7 + round((s - _GO_MIN) / (SCORE_MAX - _GO_MIN) * 3)
    if s >= _PRUDENT_MIN:  # PRUDENT → 5-6
        return 5 + round((s - _PRUDENT_MIN) / (_GO_MIN - 1 - _PRUDENT_MIN) * 1)
    return max(1, round(s / (_PRUDENT_MIN - 1) * 4))  # STOP → 1-4
