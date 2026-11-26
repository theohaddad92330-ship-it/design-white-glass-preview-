"""Deterministic confidence score for a research result.

B4: the confidence is **computed** from objective signals — never asked to the
LLM (which is systematically over-confident). It answers "how much can a
salesperson trust this analysis?" from things we can verify:

- source coverage   — how many of Brave / Firecrawl / Pappers actually returned
- legal grounding   — is there a hard legal anchor (Pappers SIREN)
- cited extracts    — how many key facts carry a B3 source citation
- freshness         — how recent the data is (``data_freshness``)
- completeness      — are the key firmographic facts filled in
- corroboration     — cross-source agreement (#21), DIAGNOSTIC: how many
                      independent registries confirm the entity (not yet weighted
                      into the /100, surfaced on the factors for operator trust)

NAMING — two "confidence" grids exist in the product, on purpose. They grade
DIFFERENT objects, so they carry DIFFERENT names and must never be merged or
compared:

- THIS one — « Fiabilité du dossier » / "Dossier reliability".
  Object: the ANALYSIS. Axes: technique / identité / sources / commerciale.
  Written to ``raw_analysis.confidence`` (score + tier + axes + factors).
  Shown on the account Overview + Evaluation tabs (``score.dossierReliability``)
  and, axis by axis, on the dashboard-manager analysis page.

- The OTHER one — « Confiance donnée » / "Data confidence", grille p29 de
  l'annexe TF1. Object: the account's CONTACT rows. Axes: identité / fraîcheur /
  couverture / sources / cohérence. Produced by
  ``apps/api/src/modules/coverage-gaps/coverage.service.ts`` (``computeConfidence``)
  and shown on the "Zones blanches" tab.

Both are /100 on the same account. A dossier can be reliable (collection ran
full, entity resolved, facts cited) while its contact base is untrustworthy
(stale, unreachable, AI-guessed) — that is a real state, not a contradiction.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime

from pydantic import BaseModel, Field

# Map the ``data_freshness`` tristate to a 0..1 weight.
_FRESHNESS_WEIGHT: dict[str, float] = {"recent": 1.0, "old": 0.5, "undated": 0.0}

# Real-date freshness (#17): the age of the FRESHEST dated evidence we collected
# (BODACC / France Travail / news / signals) → a 0..1 weight, in days.
_FRESHNESS_BY_AGE: tuple[tuple[int, float], ...] = (
    (180, 1.0),   # < 6 mois → très frais
    (540, 0.6),   # < 18 mois
    (1095, 0.3),  # < 3 ans
)
_ISO_DATE_RE = re.compile(r"(\d{4})-(\d{2})(?:-(\d{2}))?")

# Key firmographic facts used for the completeness factor.
_KEY_FACTS: tuple[str, ...] = ("sector", "employees", "revenue", "headquarters")

_TIER_HIGH = 70
_TIER_MEDIUM = 40


# Firecrawl pages considered a "full" scrape for the technique axis. Aligned on
# the vannes-ouvertes default (FIRECRAWL_MAX_PAGES=12) × a realistic ~85% ok-rate:
# 10 ok pages out of 12 attempted = collection complete — requiring 12/12 would
# grade down nearly every run for target-site anti-bot/timeouts, which is not a
# pipeline failure. Below this the axis grades down proportionally (Théo:
# "Firecrawl 3 pages" ≠ complet → 3/10 = 0.3 on that component).
_FC_ADEQUATE = 10
# The global can't exceed the identité axis by more than this — a wrong SIREN
# (identité ≈ 15) caps the global near 45 even when the web dossier is rich.
_IDENTITY_SLACK = 30

# Marge du plafond porté par l'axe SOURCES — même mécanisme que l'identité, sur
# l'axe qui répond à « est-ce vrai ? » plutôt qu'à « est-ce la bonne société ? ».
#
# Pourquoi il manquait : le global est la MOYENNE des quatre axes. Trois axes
# hauts (identité 100, commerciale 100, technique 78) noyaient un axe sources à
# 48, et le dossier s'annonçait « confiance 75/100 (élevée) ». Mesuré le
# 03/09/2026 sur le run KNDS de Julien Laszlo, puis retrouvé sur 19 des 20
# derniers runs du monitoring — tous à 5 faits sourcés contre 8 hypothèses, soit
# 38 %, pour une cible à 95 %. C'est ce que « ça semble pas mal mais si on
# creuse c'est creux » désigne, du côté du chiffre.
#
# Pourquoi 20 et non 30 : la marge de l'identité est plus large parce qu'un
# dossier peut être utile sur une société bien identifiée dont la collecte est
# pauvre. L'inverse n'est pas vrai — un dossier dont les faits ne sont pas
# sourcés ne devient pas fiable parce que la société est bien nommée. Avec 20,
# l'axe sources doit atteindre 50 pour qu'une confiance « élevée » (seuil 70)
# reste possible : moins de la moitié des faits sourcés ⇒ jamais « élevée ».
_SOURCES_SLACK = 20


class ConfidenceFactors(BaseModel):
    source_coverage: float = Field(ge=0, le=1)
    legal_grounding: float = Field(ge=0, le=1)
    cited_extracts: float = Field(ge=0, le=1)
    freshness: float = Field(ge=0, le=1)
    completeness: float = Field(ge=0, le=1)
    # #21 cross-source agreement — how many independent registries confirm the
    # entity. Feeds the ``sources`` axis; defaulted so callers/tests predating it work.
    corroboration: float = Field(default=0.0, ge=0, le=1)


class ConfidenceAxes(BaseModel):
    """The 4 confidence sub-scores the front shows separately (retour Thales) —
    each 0-100, so a salesperson reads WHY the dossier is (un)trustworthy:

    - ``technique``   — did the collection pipeline run fully (Brave, Firecrawl
                        pages, registre, INPI, tech-detect) ?
    - ``identite``    — is the resolved legal entity really the target group
                        (← identity_resolution) ? Collapses on a homonym.
    - ``sources``     — are the facts cited, corroborated across registries, fresh ?
    - ``commerciale`` — is the dossier actionable (firmo complete, signals, angles) ?
    """

    technique: int = Field(ge=0, le=100)
    identite: int = Field(ge=0, le=100)
    sources: int = Field(ge=0, le=100)
    commerciale: int = Field(ge=0, le=100)


class ConfidenceScore(BaseModel):
    score: int = Field(ge=0, le=100)  # honest global — capped by the identité axis
    tier: str  # "non_evaluable" | "low" | "medium" | "high"
    factors: ConfidenceFactors
    axes: ConfidenceAxes


def _tier(score: int, *, evaluable: bool = True) -> str:
    """#2307.19 — un score bas et une collecte qui n'a RIEN retourné ne disent
    pas la même chose : l'un juge une matière pauvre, l'autre n'a aucune
    matière à juger. `evaluable=False` (aucune des trois sources externes
    n'a répondu — voir ``compute_confidence``) court-circuite le seuillage
    par score : "non_evaluable" prime toujours, quel que soit le score
    (les quelques facteurs à 0 par défaut, comme ``freshness``, ne doivent
    jamais se lire comme une confiance basse plutôt qu'une absence de
    matière). Défaut `True` : les appels historiques (juste le score) gardent
    le seuillage à trois paliers d'avant ce correctif, à l'octet près."""
    if not evaluable:
        return "non_evaluable"
    if score >= _TIER_HIGH:
        return "high"
    if score >= _TIER_MEDIUM:
        return "medium"
    return "low"


def _parse_iso_date(value: object) -> date | None:
    """Parse the leading ``YYYY-MM[-DD]`` out of a date-ish string (BODACC
    ``dateparution``, France Travail ``dateCreation`` ISO timestamp, a signal's
    ``date``). Day defaults to 1 when only a month is given. ``None`` on no match."""
    m = _ISO_DATE_RE.match(str(value or "").strip())
    if not m:
        return None
    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3) or 1)
    try:
        return date(year, month, max(1, day))
    except ValueError:
        return None


def _real_date_freshness(data: dict, *, today: date | None = None) -> float | None:
    """Objective freshness from the FRESHEST real date across the dated sources
    (#17) — beats the LLM's self-assessed ``data_freshness``. ``None`` when no
    parseable date exists (caller falls back to the LLM tristate)."""
    today = today or datetime.now(UTC).date()
    candidates: list[date] = []
    for list_key, date_key in (
        ("legalSignals", "date"), ("legal_signals", "date"),
        ("itJobSignals", "date"), ("it_job_signals", "date"),
        ("news", "age"), ("news", "page_age"),
        ("recentSignals", "date"), ("recent_signals", "date"),
    ):
        for item in data.get(list_key) or []:
            if isinstance(item, dict):
                d = _parse_iso_date(item.get(date_key))
                if d and d <= today:
                    candidates.append(d)
    if not candidates:
        return None
    age_days = (today - max(candidates)).days
    for max_age, weight in _FRESHNESS_BY_AGE:
        if age_days <= max_age:
            return weight
    return 0.1


def _freshness_score(data: dict) -> float:
    # Prefer objective real-date freshness when we have dated evidence; only
    # fall back to the LLM tristate when nothing is datable (#17).
    real = _real_date_freshness(data)
    if real is not None:
        return real
    raw = data.get("data_freshness") or data.get("dataFreshness") or {}
    if not isinstance(raw, dict):
        return 0.0
    vals = [_FRESHNESS_WEIGHT.get(str(raw.get(k, "undated")), 0.0) for k in ("signals", "financials", "contacts")]
    return sum(vals) / len(vals) if vals else 0.0


def _cited_extracts_score(sources: dict | None, legal_grounding: float) -> float:
    """Fraction of the key firmographic facts that carry a B3 source citation.

    When no ``sources`` block is supplied (caller predates B3, or a unit test),
    fall back to the legal anchor as a proxy — a SIREN-anchored factsheet has
    its key facts grounded by construction.
    """
    if not sources:
        return legal_grounding
    facts = sources.get("facts")
    if not isinstance(facts, dict):
        return legal_grounding
    cited = sum(1 for k in _KEY_FACTS if facts.get(k))
    return cited / len(_KEY_FACTS)


def _corroboration_score(metrics: dict, data: dict) -> float:
    """Cross-source agreement (#21): how many INDEPENDENT official registries
    corroborate this entity, out of those we consult (Pappers SIREN, recherche-
    entreprises annuaire, BODACC, INPI RNE bénéficiaires, INSEE sites). A high
    value means the same entity was resolved by several registries → hard to be
    a wrong / hallucinated target. Diagnostic: surfaced on the factors, NOT (yet)
    folded into the weighted /100 so the calibrated score stays stable."""
    signals = [
        bool(metrics.get("pappers_siren")),
        bool(data.get("registryAnnuaire") or data.get("registry_annuaire")),
        bool(data.get("legalSignals") or data.get("legal_signals")),
        bool(data.get("beneficialOwners") or data.get("beneficial_owners")),
        bool(data.get("sitesFrance") or data.get("sites_france")),
    ]
    return sum(signals) / len(signals)


def _first_nonempty_list(data: dict, *keys: str) -> bool:
    return any(bool(data.get(k)) for k in keys)


def _identity_confidence(data: dict, *, pappers_up: bool) -> tuple[float, bool]:
    """(identity_confidence 0..1, trusted). Reads the Company-Resolver verdict
    (``data['identity']``) when present; without it, a resolved SIREN is treated
    as trusted (verified) and a missing one as a mid web-only confidence — so
    callers that predate the resolver keep their behaviour."""
    ident = data.get("identity")
    if isinstance(ident, dict):
        raw = ident.get("identityConfidence")
        conf = float(raw) if isinstance(raw, (int, float)) else (1.0 if pappers_up else 0.0)
        trusted = bool(ident.get("useRegistryData", pappers_up))
        return max(0.0, min(1.0, conf)), trusted
    # Legacy caller (no resolver verdict): a resolved SIREN is trusted; without one
    # the legal identity is simply unverified.
    return (1.0 if pappers_up else 0.0), pappers_up


def _technique_axis(metrics: dict, data: dict, *, brave_up: bool, pappers_up: bool) -> float:
    """Pipeline completeness — how much of the collection actually ran."""
    fc_ratio = min((metrics.get("firecrawl_pages_scraped") or 0) / _FC_ADEQUATE, 1.0)
    inpi_ran = _first_nonempty_list(data, "beneficialOwners", "beneficial_owners")
    techdetect_ran = _first_nonempty_list(data, "detectedTechStack", "technologyStack")
    parts = [float(brave_up), fc_ratio, float(pappers_up), float(inpi_ran), float(techdetect_ran)]
    return sum(parts) / len(parts)


def _factuality(data: dict) -> float:
    """1.0 when the dossier rests on facts; drops toward 0.5 when it is mostly
    hypotheses vs hard firmo facts (Théo : « beaucoup d'hypothèses » must lower the
    confidence). Neutral (1.0) when there are no hypotheses."""
    hyps = data.get("qualified_hypotheses") or data.get("qualifiedHypotheses") or []
    n_hyp = sum(1 for h in hyps if h)
    if n_hyp == 0:
        return 1.0
    n_facts = sum(1 for k in _KEY_FACTS if str(data.get(k, "")).strip())
    density = n_hyp / (n_hyp + n_facts + 1)  # +1 damps + avoids div-by-zero
    return round(1.0 - min(0.5, density), 3)


def _commerciale_axis(data: dict, *, completeness: float) -> float:
    """Actionability — is there enough to run a play (firmo + signals + angles)?"""
    has_signals = _first_nonempty_list(
        data, "recentSignals", "recent_signals", "itJobSignals", "it_job_signals", "news", "legalSignals"
    )
    has_angles = _first_nonempty_list(data, "angles")
    has_business = bool(str(data.get("businessDescription") or data.get("business_description") or "").strip())
    parts = [completeness, float(has_signals), float(has_angles), float(has_business)]
    return sum(parts) / len(parts)


def compute_confidence(*, metrics: dict, data: dict, sources: dict | None = None) -> ConfidenceScore:
    """Derive the 4-axis confidence + a capped global from objective signals.

    ``metrics`` is the phase-1 ``_api_metrics`` blob; ``data`` is the merged
    research output (camelCase or snake_case both tolerated); ``sources`` is the
    B3 attribution block when available. The 4 axes (technique / identité /
    sources / commerciale) are surfaced separately, and the global is CAPPED by
    the identité axis so a homonym never presents as high confidence (retour
    Thales — the hard rule).
    """
    brave_up = (metrics.get("brave_results_count") or 0) > 0
    firecrawl_up = (metrics.get("firecrawl_pages_scraped") or 0) > 0
    pappers_up = bool(metrics.get("pappers_siren"))

    identity_conf, identity_trusted = _identity_confidence(data, pappers_up=pappers_up)

    source_coverage = sum((brave_up, firecrawl_up, pappers_up)) / 3.0
    # Hard rule: a SIREN we don't trust (homonym / uncertain) is NOT a legal
    # anchor — it must not inflate the score, so legal grounding is revoked.
    legal_grounding = 1.0 if (pappers_up and identity_trusted) else 0.0
    cited_extracts = _cited_extracts_score(sources, legal_grounding)
    freshness = _freshness_score(data)
    present = sum(1 for k in _KEY_FACTS if str(data.get(k, "")).strip())
    completeness = present / len(_KEY_FACTS)
    corroboration = _corroboration_score(metrics, data)

    factors = ConfidenceFactors(
        source_coverage=source_coverage,
        legal_grounding=legal_grounding,
        cited_extracts=cited_extracts,
        freshness=freshness,
        completeness=completeness,
        corroboration=corroboration,
    )

    axes = ConfidenceAxes(
        technique=round(100 * _technique_axis(metrics, data, brave_up=brave_up, pappers_up=pappers_up)),
        identite=round(100 * identity_conf),
        # Citation coverage + corroboration + freshness, damped when the dossier
        # leans on hypotheses rather than facts (Théo : hypothèses + sources faibles).
        sources=round(100 * (cited_extracts + corroboration + freshness) / 3.0 * _factuality(data)),
        commerciale=round(100 * _commerciale_axis(data, completeness=completeness)),
    )

    # Global = mean of the 4 axes, then CAPPED by the identité axis (+ slack) so a
    # collapsed identity drags the headline number down hard, regardless of how
    # rich the rest is — ET par l'axe SOURCES, pour qu'un dossier majoritairement
    # fait d'hypothèses ne s'annonce jamais « fiabilité élevée » (voir
    # ``_SOURCES_SLACK``). Deux plafonds, deux questions distinctes : « est-ce la
    # bonne société ? » et « est-ce vrai ? ».
    mean = (axes.technique + axes.identite + axes.sources + axes.commerciale) / 4.0
    # Both operands are already in [0,100] (axis ints), so no extra clamp needed.
    score = round(min(mean, axes.identite + _IDENTITY_SLACK, axes.sources + _SOURCES_SLACK))
    # #2307.19 — rien à juger tant qu'AUCUNE des trois sources externes n'a
    # répondu (le même triplet que `source_coverage` ci-dessus) : le score
    # calculé sur des facteurs par défaut resterait bas par construction
    # (`freshness`/`completeness`/… à 0 faute de `data`), ce qui se lirait
    # comme une confiance FAIBLE plutôt que comme une collecte qui n'a rien
    # retourné — deux états réels, jamais confondus (doctrine « non mesuré
    # n'est jamais un 0 déguisé »).
    evaluable = brave_up or firecrawl_up or pappers_up
    return ConfidenceScore(score=score, tier=_tier(score, evaluable=evaluable), factors=factors, axes=axes)
