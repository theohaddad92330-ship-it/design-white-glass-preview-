"""IA v2 eval metrics — measure the analysis engine, esp. hallucination.

Eight deterministic metrics over one assembled dossier (the graph's final state
shape: ``{research, contacts|classified_contacts, plan, gate, judge?}``). Each
REUSES the shipped deterministic checks so the eval agrees with production:

  * **faithfulness** — the anti-hallucination KPI. Prefers the live GROUNDING_V2
    ``research.grounding.kpi`` ("<5% facts non-sourced") when present; otherwise
    reuses :func:`app.services.quality_judge.judge_quality`'s ``factsMissingSource``
    (the shipped unsourced-hard-fact detector) and honours per-fact
    ``grounding.sourceRefs``. Gate is the shipped
    :data:`app.services.grounding_citations.KPI_MAX_NON_SOURCED_RATIO`.
  * **coherence** — reuses :func:`app.graph.judge.build_verdict` (grounding +
    scores + coherence + contacts). ``score`` = the judge confidence; ``passed``
    = no critical issue (e.g. a plan targeting a contact absent from the dossier).
  * **completeness** — required firmographic facts + core deliverables present,
    plus any golden-set expectations (exact SIREN, has-subsidiaries, is-public,
    min entities, min plays).
  * **contacts_quality** — ≥1 real decision-maker, reusing the shipped
    :func:`app.services.decision_role.classify_decision_role` / ``is_it_decider``.
  * **plays_grounding** — share of recommendations (plays + structured offers)
    that are ACTIONNABLES per the shipped SalesConnect DoD — reuses
    :func:`app.services.play_completeness.evaluate_play_completeness` and
    :func:`app.services.offer_provenance.evaluate_offer_completeness` (6 champs +
    preuve fondée sur une source réelle, Théo #2 / roadmap §14).
  * **buying_committee** — coverage of the core committee seats, reusing the
    shipped :func:`app.knowledge.buying_committee.assemble_buying_committee`
    (Knowledge Pack v2 taxonomy). Gate: ≥2 of the 5 core seats covered
    (multi-threading), with ≥1 buyer seat (economic/technical).
  * **source_freshness** — age of the freshest DATED evidence, reusing the
    shipped :func:`app.services.confidence._real_date_freshness` scale. The
    as-of date can be pinned by the golden (``expect.freshnessAsOf``) so a
    committed fixture never rots with wall-clock time. No dated evidence →
    informational (completeness owns "signals missing entirely").
  * **no_invented_data** — zero fabricated content: SIREN plausibility (9
    digits + Luhn + not a repeated digit), no fabricated-content markers
    (lorem ipsum, contoso, john doe…), no contact email on an RFC-2606
    reserved domain. NO FAKE is the product's #1 rule.

Deterministic + hermetic: no network, no Claude call, no engine invocation. The
live engine path lives only in :mod:`app.eval.run` behind an opt-in ``--live``.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any

from app.graph.judge import build_verdict
from app.knowledge.buying_committee import CORE_COMMITTEE_ROLES, assemble_buying_committee
from app.services.confidence import _real_date_freshness
from app.services.decision_role import classify_decision_role, is_it_decider
from app.services.grounding_citations import KPI_MAX_NON_SOURCED_RATIO
from app.services.offer_provenance import evaluate_offer_completeness
from app.services.play_completeness import evaluate_play_completeness
from app.services.quality_judge import judge_quality

from .report import EvalReport, MetricResult

# Hard firmographic facts that must be sourced when displayed. Mirrors
# ``judge._SOURCED_FACT_FIELDS`` / ``quality_judge._SOURCED_FACT_FIELDS`` — the
# same set the shipped anti-hallucination checks guard.
HARD_FACT_FIELDS = ("siren", "revenue", "employees", "headquarters", "sector")

# Decision roles that make a contact an actual buyer/decider an ESN sells to.
_DECIDER_ROLES = frozenset({"technical", "economic", "procurement"})

# Placeholder "contact names" that are honest to-be-identified markers, never a
# real, grounded person. Matches ``judge._PLACEHOLDER_CONTACTS`` (accent-stripped
# uppercase).
_PLACEHOLDER_CONTACTS = frozenset({"", "A IDENTIFIER", "A QUALIFIER", "A DEFINIR", "A PRECISER", "N/A", "INCONNU"})

_SUSPECT_NAME_RE = re.compile(r"^[\W_]*$")

# Metric weights in the aggregate (faithfulness + no-invented-data dominate —
# hallucination is the #1 thing the always-on v2 axes must hold down). Sum == 1.0.
WEIGHTS = {
    "faithfulness": 0.25,
    "no_invented_data": 0.15,
    "coherence": 0.15,
    "completeness": 0.12,
    "contacts_quality": 0.12,
    "plays_grounding": 0.11,
    "buying_committee": 0.05,
    "source_freshness": 0.05,
}

# ── no_invented_data vocabulary ───────────────────────────────────────────────
# Fabricated-content markers that must NEVER appear in a shipped dossier. Kept
# tight (only unambiguous placeholder vocabulary) so a real company name can
# never false-positive.
_FABRICATED_MARKERS: tuple[str, ...] = (
    "lorem ipsum",
    "contoso",
    "john doe",
    "jane doe",
    "acme corp",
    "example.com",
    "exemple.com",
    "example.org",
    "test@test",
    "placeholder",
)
# RFC-2606 reserved / documentation email domains — an email here is fabricated.
_RESERVED_EMAIL_DOMAINS: tuple[str, ...] = ("example.com", "example.org", "example.net")
_RESERVED_EMAIL_TLDS: tuple[str, ...] = (".test", ".invalid", ".example", ".localhost")
# La Poste — the one legal SIREN that does not satisfy the Luhn checksum.
_SIREN_LUHN_EXCEPTIONS = frozenset({"356000000"})

# Freshest-dated-evidence weight (confidence._FRESHNESS_BY_AGE scale) required to
# pass the freshness gate: 0.6 = the "< 18 mois" tier.
_FRESHNESS_PASS_WEIGHT = 0.6

# A usable dossier should surface several interlocutors (multi-threading); this
# is the soft floor used to grade — the hard gate is only "≥1 real decider".
_GOOD_NAMED_CONTACTS = 3


def _present(v: Any) -> bool:
    return bool(v) and str(v).strip().lower() not in ("", "non identifié", "non précisé", "n/a", "inconnu")


def _norm(text: Any) -> str:
    decomposed = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).upper().strip()


def _as_mapping(v: Any) -> dict[str, Any]:
    return dict(v) if isinstance(v, Mapping) else {}


def _contacts_of(analysis: Mapping[str, Any]) -> list[Any]:
    """The enriched contact list — classified wins, else the raw contacts."""
    contacts = analysis.get("classified_contacts") or analysis.get("contacts") or []
    return list(contacts) if isinstance(contacts, Sequence) and not isinstance(contacts, (str, bytes)) else []


def _contact_name(c: Any) -> str:
    if not isinstance(c, Mapping):
        return ""
    full = c.get("fullName") or c.get("full_name")
    if _present(full):
        return str(full).strip()
    first = str(c.get("firstName") or c.get("first_name") or "").strip()
    last = str(c.get("lastName") or c.get("last_name") or "").strip()
    return " ".join(p for p in (first, last) if p).strip()


def _is_real_name(name: str) -> bool:
    return bool(name) and _norm(name) not in _PLACEHOLDER_CONTACTS and not _SUSPECT_NAME_RE.match(name)


def _is_decider(c: Any) -> bool:
    """A contact an ESN can actually sell to (deck decision roles).

    Reuses the shipped deterministic title classifier so the eval agrees with the
    "≥1 décideur IT" badge — an explicit ``decisionRole`` / ``is_c_level`` wins,
    otherwise the title is classified.
    """
    if not isinstance(c, Mapping):
        return False
    if c.get("is_c_level") or c.get("isCLevel"):
        return True
    role = str(c.get("decisionRole") or c.get("decision_role") or c.get("role") or "").strip().lower()
    if role in _DECIDER_ROLES:
        return True
    title = c.get("title") or c.get("role")
    if classify_decision_role(title) in _DECIDER_ROLES:
        return True
    return is_it_decider(title)


# ── metrics ───────────────────────────────────────────────────────────────────


def faithfulness(analysis: Mapping[str, Any]) -> MetricResult:
    """Ratio of displayed hard facts that are sourced (anti-hallucination KPI).

    Prefers the live GROUNDING_V2 ``research.grounding.kpi`` when present, else a
    deterministic recomputation from ``sources.tags``/``citations`` (via the
    shipped ``judge_quality``) crediting per-fact ``grounding.sourceRefs``. The
    hard gate is the shipped "<5% facts non-sourced" target.
    """
    research = _as_mapping(analysis.get("research"))
    present = [f for f in HARD_FACT_FIELDS if _present(research.get(f))]

    grounding = _as_mapping(research.get("grounding"))
    kpi = _as_mapping(grounding.get("kpi"))
    if kpi.get("factsConsidered"):
        considered = int(kpi.get("factsConsidered") or 0)
        sourced = int(kpi.get("factsSourced") or 0)
        non_sourced_ratio = float(
            kpi.get("nonSourcedRatio", (considered - sourced) / considered if considered else 0.0)
        )
        source = "grounding_v2_kpi"
    else:
        # Reuse the shipped unsourced-hard-fact detector; additionally credit any
        # per-fact GROUNDING_V2 source_refs (which quality_judge doesn't inspect).
        missing = set(judge_quality(research=research, contacts=[], plan={}).get("factsMissingSource") or [])
        source_refs = _as_mapping(grounding.get("sourceRefs"))
        missing = {f for f in missing if not source_refs.get(f)}
        considered = len(present)
        sourced = considered - len(missing)
        non_sourced_ratio = round(len(missing) / considered, 4) if considered else 0.0
        source = "deterministic"

    score = round(sourced / considered, 4) if considered else 1.0
    # No hard facts to source → not a hallucination signal (completeness owns the
    # "facts missing entirely" penalty); pass, but say so.
    kpi_met = non_sourced_ratio < KPI_MAX_NON_SOURCED_RATIO
    passed = kpi_met if considered else True
    detail = (
        f"{sourced}/{considered} hard facts sourced "
        f"(non-sourced {non_sourced_ratio * 100:.1f}%, target <{KPI_MAX_NON_SOURCED_RATIO * 100:.0f}%) [{source}]"
        if considered
        else "no hard facts present (see completeness)"
    )
    return MetricResult(
        name="faithfulness",
        score=score,
        passed=passed,
        weight=WEIGHTS["faithfulness"],
        detail=detail,
        data={
            "factsConsidered": considered,
            "factsSourced": sourced,
            "nonSourcedRatio": non_sourced_ratio,
            "kpiMet": kpi_met,
            "source": source,
        },
    )


def coherence(analysis: Mapping[str, Any]) -> MetricResult:
    """Internal coherence — reuses the shipped anti-hallucination judge verdict.

    ``build_verdict`` flags unsourced facts, out-of-range/contradictory scores, a
    plan targeting a contact absent from the dossier (critical) and placeholder
    contacts. ``score`` = the judge confidence; ``passed`` = no critical issue.
    """
    state = {
        "research": _as_mapping(analysis.get("research")),
        "classified_contacts": analysis.get("classified_contacts") or [],
        "contacts": analysis.get("contacts") or [],
        "plan": _as_mapping(analysis.get("plan")),
        "gate": _as_mapping(analysis.get("gate")),
    }
    verdict = build_verdict(state)
    issues = verdict.get("issues") or []
    detail = (
        "no coherence issue"
        if not issues
        else "; ".join(f"[{i.get('severity')}] {i.get('detail')}" for i in issues[:4])
    )
    return MetricResult(
        name="coherence",
        score=float(verdict.get("confidence") or 0.0),
        passed=bool(verdict.get("passed")),
        weight=WEIGHTS["coherence"],
        detail=detail,
        data=verdict,
    )


def completeness(analysis: Mapping[str, Any], golden: Mapping[str, Any] | None = None) -> MetricResult:
    """Required firmographic facts + core deliverables (+ golden expectations).

    Each sub-check is a boolean; the score is the fraction satisfied. When a
    golden ``expect`` block is provided, its structural expectations (exact SIREN,
    has-subsidiaries, is-public, min entities, required facts) are added.
    """
    research = _as_mapping(analysis.get("research"))
    plan = _as_mapping(analysis.get("plan"))
    contacts = _contacts_of(analysis)
    expect = _as_mapping(golden).get("expect") if golden else {}
    expect = _as_mapping(expect)

    required_facts = expect.get("requiredFacts") or ["sector", "siren", "businessDescription"]
    checks: dict[str, bool] = {f"fact:{f}": _present(research.get(f)) for f in required_facts}
    checks["deliverable:contacts"] = bool(contacts)
    checks["deliverable:plan"] = bool(plan)

    if expect:
        if "siren" in expect:
            checks["golden:siren"] = _norm(research.get("siren")) == _norm(expect["siren"])
        if expect.get("sirenPresent"):
            checks["golden:sirenPresent"] = _present(research.get("siren"))
        if expect.get("sectorPresent"):
            checks["golden:sectorPresent"] = _present(research.get("sector"))
        if "hasSubsidiaries" in expect:
            subs = research.get("subsidiaries") or research.get("meaningfulSubsidiaries") or []
            checks["golden:hasSubsidiaries"] = bool(subs) is bool(expect["hasSubsidiaries"])
        if "isPublic" in expect:
            checks["golden:isPublic"] = bool(research.get("isPublic")) is bool(expect["isPublic"])
        if "minEntities" in expect:
            ents = research.get("entitiesExhaustive") or research.get("entities_exhaustive") or []
            checks["golden:minEntities"] = isinstance(ents, list) and len(ents) >= int(expect["minEntities"])
        if "minPlays" in expect:
            plays = plan.get("plays") or []
            checks["golden:minPlays"] = isinstance(plays, list) and len(plays) >= int(expect["minPlays"])

    total = len(checks)
    ok = sum(1 for v in checks.values() if v)
    missing = [k for k, v in checks.items() if not v]
    return MetricResult(
        name="completeness",
        score=round(ok / total, 4) if total else 1.0,
        passed=ok == total,
        weight=WEIGHTS["completeness"],
        detail=f"{ok}/{total} checks" + (f" — missing: {', '.join(missing[:6])}" if missing else ""),
        data={"checks": checks},
    )


def contacts_quality(analysis: Mapping[str, Any]) -> MetricResult:
    """≥1 real decision-maker among the enriched contacts (hard gate).

    Reuses the shipped decision-role classifier. Graded: 0 without a real named
    contact, partial with named-but-no-decider, full with ≥1 decider (bonus for
    multi-threading up to ``_GOOD_NAMED_CONTACTS``).
    """
    contacts = _contacts_of(analysis)
    named = [c for c in contacts if _is_real_name(_contact_name(c))]
    deciders = [c for c in named if _is_decider(c)]
    has_decider = bool(deciders)
    passed = bool(named) and has_decider

    if not named:
        score = 0.0
    elif not has_decider:
        score = 0.4
    else:
        # 1 decider already clears the gate; reward breadth up to the soft floor.
        breadth = min(len(named), _GOOD_NAMED_CONTACTS) / _GOOD_NAMED_CONTACTS
        score = round(0.7 + 0.3 * breadth, 4)

    return MetricResult(
        name="contacts_quality",
        score=score,
        passed=passed,
        weight=WEIGHTS["contacts_quality"],
        detail=f"{len(named)} named contact(s), {len(deciders)} decision-maker(s)",
        data={"named": len(named), "deciders": len(deciders)},
    )


def plays_grounding(analysis: Mapping[str, Any]) -> MetricResult:
    """Share of recommendations backed by a FOUNDED proof (SalesConnect DoD).

    Reuses the shipped completeness verdicts: a play is actionnable when its 6
    champs are present AND its ``preuve`` cites a real (non-weak) source
    (:func:`evaluate_play_completeness`); a structured offer likewise via
    :func:`evaluate_offer_completeness`. Score = share of ``complete`` recos;
    gate = ≥1 actionnable reco when any reco exists (a dossier whose every reco
    is ``faible`` is not sellable). No recos at all → informational pass
    (completeness owns the "plays missing entirely" penalty via ``minPlays``).
    """
    plan = _as_mapping(analysis.get("plan"))
    plays = [p for p in (plan.get("plays") or []) if isinstance(p, Mapping)]
    offers = [
        o
        for o in (plan.get("commercialOffers") or plan.get("commercial_offers") or [])
        if isinstance(o, Mapping)
    ]
    verdicts = [evaluate_play_completeness(p) for p in plays]
    verdicts += [evaluate_offer_completeness(o) for o in offers]
    total = len(verdicts)
    complete = sum(1 for v in verdicts if v.get("status") == "complete")
    founded = sum(1 for v in verdicts if v.get("hasFoundedEvidence"))

    if not total:
        return MetricResult(
            name="plays_grounding",
            score=1.0,
            passed=True,
            weight=WEIGHTS["plays_grounding"],
            detail="no recommendations present (see completeness/minPlays)",
            data={"recos": 0, "complete": 0, "founded": 0},
        )
    return MetricResult(
        name="plays_grounding",
        score=round(complete / total, 4),
        passed=complete >= 1,
        weight=WEIGHTS["plays_grounding"],
        detail=f"{complete}/{total} reco(s) actionnable(s), {founded}/{total} avec preuve fondée",
        data={"recos": total, "complete": complete, "founded": founded},
    )


def buying_committee(analysis: Mapping[str, Any]) -> MetricResult:
    """Coverage of the core buying-committee seats (Knowledge Pack v2).

    Reuses the shipped :func:`assemble_buying_committee` over the enriched
    contacts. Score = covered core seats / 5; gate = ≥2 core seats covered AND
    ≥1 buyer seat (economic or technical) — one lone interlocutor is not a
    committee, and a committee without a buyer cannot sign.
    """
    committee = assemble_buying_committee(_contacts_of(analysis))
    coverage = committee.get("roleCoverage") or {}
    covered = [r for r in CORE_COMMITTEE_ROLES if coverage.get(r)]
    has_buyer = bool(coverage.get("economic_buyer") or coverage.get("technical_buyer"))
    score = round(len(covered) / len(CORE_COMMITTEE_ROLES), 4)
    passed = len(covered) >= 2 and has_buyer
    missing = committee.get("missingRoles") or []
    detail = f"{len(covered)}/{len(CORE_COMMITTEE_ROLES)} sièges clés couverts"
    if missing:
        detail += f" — manquent: {', '.join(missing)}"
    return MetricResult(
        name="buying_committee",
        score=score,
        passed=passed,
        weight=WEIGHTS["buying_committee"],
        detail=detail,
        data={
            "roleCoverage": coverage,
            "missingRoles": list(missing),
            "members": len(committee.get("members") or []),
            "hasBuyer": has_buyer,
        },
    )


def source_freshness(analysis: Mapping[str, Any], golden: Mapping[str, Any] | None = None) -> MetricResult:
    """Age of the freshest DATED evidence, on the shipped confidence scale.

    Reuses :func:`app.services.confidence._real_date_freshness` (<6 mois → 1.0,
    <18 mois → 0.6, <3 ans → 0.3, else 0.1) over the dossier's dated sources
    (legalSignals / itJobSignals / news / recentSignals). The as-of date can be
    pinned by the golden (``expect.freshnessAsOf: YYYY-MM-DD``) so a committed
    fixture stays deterministic over wall-clock time. Gate: freshest evidence
    < 18 mois. No parseable date anywhere → informational pass with the
    dossier's own computed ``confidence.factors.freshness`` as the score.
    """
    research = _as_mapping(analysis.get("research"))
    expect = _as_mapping(_as_mapping(golden).get("expect")) if golden else {}
    as_of: date | None = None
    raw_as_of = str(expect.get("freshnessAsOf") or "").strip()
    if raw_as_of:
        try:
            as_of = date.fromisoformat(raw_as_of)
        except ValueError:
            as_of = None

    weight = _real_date_freshness(dict(research), today=as_of)
    if weight is not None:
        return MetricResult(
            name="source_freshness",
            score=float(weight),
            passed=weight >= _FRESHNESS_PASS_WEIGHT,
            weight=WEIGHTS["source_freshness"],
            detail=f"évidence datée la plus fraîche → poids {weight:.1f} (gate ≥ {_FRESHNESS_PASS_WEIGHT})"
            + (f" [as-of {as_of.isoformat()}]" if as_of else ""),
            data={"freshnessWeight": float(weight), "asOf": as_of.isoformat() if as_of else None},
        )

    # No dated evidence → informational: reuse the engine's own computed factor
    # when the dossier carries one (deterministic for a frozen fixture).
    factors = _as_mapping(_as_mapping(research.get("confidence")).get("factors"))
    computed = factors.get("freshness")
    score = float(computed) if isinstance(computed, (int, float)) else 0.0
    return MetricResult(
        name="source_freshness",
        score=score,
        passed=True,
        weight=WEIGHTS["source_freshness"],
        detail="no dated evidence in dossier (informational)",
        data={"freshnessWeight": None, "computedFactor": computed},
    )


def _luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _contact_emails(contacts: Sequence[Any]) -> list[str]:
    out = []
    for c in contacts:
        if isinstance(c, Mapping):
            email = str(c.get("email") or "").strip().lower()
            if email and "@" in email:
                out.append(email)
    return out


def siren_violations(siren: Any) -> list[str]:
    """SIREN plausibility — the shipped detector, callable on its own.

    A displayed SIREN must be 9 digits, pass the Luhn checksum (exception: La
    Poste) and not be a repeated digit (000000000…). A fabricated identifier
    fails at least one. Empty / absent → ``[]`` : *absent* is not *wrong*, and it
    is up to the caller to say whether "absent" is measurable at all.

    Extracted from :func:`no_invented_data` (which still calls it) so the
    per-prompt rubrics of ``app/eval/bench/rubrics/`` grade a SIREN with the SAME
    code that grades an assembled dossier — a derivation lives in one place.
    """
    raw = str(siren or "").replace(" ", "").strip()
    if not raw:
        return []
    if not re.fullmatch(r"\d{9}", raw):
        return [f"siren:malformed ({raw})"]
    if len(set(raw)) == 1:
        return ["siren:repeated-digit"]
    if raw not in _SIREN_LUHN_EXCEPTIONS and not _luhn_valid(raw):
        return ["siren:invalid-checksum"]
    return []


def fabrication_violations(texts: Sequence[Any], emails: Sequence[str] = ()) -> list[str]:
    """Fabricated-content markers + RFC-2606 e-mails over arbitrary surfaces.

    ``texts`` are joined and lowered into one blob (a mapping / list is
    JSON-dumped, so nested content is scanned too); ``emails`` are checked
    against the reserved documentation domains and TLDs.

    Extracted from :func:`no_invented_data` for the same reason as
    :func:`siren_violations`: the per-prompt rubrics scan a *prompt output*
    rather than an assembled dossier, and must not grow a second copy of the
    vocabulary.
    """
    parts = [
        t if isinstance(t, str) else json.dumps(t, ensure_ascii=False, default=str)
        for t in texts
    ]
    blob = " ".join(parts).lower()
    violations = [f"marker:{m}" for m in _FABRICATED_MARKERS if m in blob]
    for email in emails:
        domain = str(email).strip().lower().rsplit("@", 1)[-1]
        if domain in _RESERVED_EMAIL_DOMAINS or any(domain.endswith(t) for t in _RESERVED_EMAIL_TLDS):
            violations.append(f"email:reserved-domain ({email})")
    return violations


def no_invented_data(analysis: Mapping[str, Any]) -> MetricResult:
    """Zero fabricated content — the product's #1 rule (JAMAIS de données fictives).

    Deterministic detectors, no allowlist per dossier:

    1. SIREN plausibility — when displayed, the SIREN must be 9 digits, pass the
       Luhn checksum (exception: La Poste) and not be a repeated digit
       (000000000…). A fabricated identifier fails at least one.
       (:func:`siren_violations`)
    2. Fabricated-content markers — unambiguous placeholder vocabulary
       (lorem ipsum, contoso, john doe…) scanned over the research text fields,
       the contacts and the whole plan. (:func:`fabrication_violations`)
    3. Reserved email domains — a contact email on an RFC-2606 domain
       (example.com, ``.test``…) cannot belong to a real person. (idem)

    Gate: zero violations. Score decreases 0.5 per violation.
    """
    research = _as_mapping(analysis.get("research"))
    contacts = _contacts_of(analysis)

    violations = siren_violations(research.get("siren"))

    # One lowered text blob over the surfaces a fabricated marker could reach:
    # research text fields + contacts + the whole plan.
    text_fields = (
        "companyName", "businessDescription", "sector", "headquarters", "concreteActivity",
    )
    violations += fabrication_violations(
        [str(research.get(f) or "") for f in text_fields]
        + [contacts, _as_mapping(analysis.get("plan"))],
        _contact_emails(contacts),
    )

    score = round(max(0.0, 1.0 - 0.5 * len(violations)), 4)
    return MetricResult(
        name="no_invented_data",
        score=score,
        passed=not violations,
        weight=WEIGHTS["no_invented_data"],
        detail="aucune donnée inventée détectée" if not violations else "; ".join(violations[:6]),
        data={"violations": violations},
    )


def evaluate(analysis: Mapping[str, Any], golden: Mapping[str, Any] | None = None) -> EvalReport:
    """Score one analysis output across all eight metrics into an EvalReport."""
    company = str(
        analysis.get("company")
        or analysis.get("company_name")
        or _as_mapping(analysis.get("research")).get("companyName")
        or (_as_mapping(golden).get("company") if golden else "")
        or "?"
    )
    metrics = [
        faithfulness(analysis),
        coherence(analysis),
        completeness(analysis, golden),
        contacts_quality(analysis),
        plays_grounding(analysis),
        buying_committee(analysis),
        source_freshness(analysis, golden),
        no_invented_data(analysis),
    ]
    return EvalReport(company=company, metrics=metrics)
