"""Deterministic relation resolver for the Org Graph (Annexe Organigramme,
p9 « Types de relations et preuve » + p10 « Qualité des sources » / GROUNDING).

Phase 2's job (pseudo-code p16, steps 8-9): turn classified people + their
evidence into TYPED, SOURCED, CONFIDENCE-scored edges — a verified reporting line
when the proof is official, a dotted probable line when it's LinkedIn-grade, an
influence-only hint when it's a mere hypothesis, and a rejection when the source
is noise. « La hiérarchie ne peut pas être plus certaine que la donnée qui
l'alimente » (p10).

This module is the deterministic core of that step, built on the confidence
engine (:mod:`app.services.org_confidence`, p14). It ships alone, ahead of the
live wiring, so the routing + grounding rules are locked and reviewable in
isolation — no LLM, no network, fully unit-tested. Its outputs are shaped to the
`OrgHierarchyEdge` / `OrgInfluenceEdge` contract (@bellum/contracts) so the graph
emitter can consume them directly and the contract invariants hold by
construction (verified ⇒ sourced + ≥90 ; inferred ⇒ ≤89).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.org_confidence import (
    ConfidenceFactors,
    compute_confidence,
    confidence_band,
    creates_edge,
    is_verified,
)

Grounding = Literal["A", "B", "C", "D"]

# ── Source kind → grounding (p10) ────────────────────────────────────────────
# A vérifié   : site officiel, organigramme, registre, bio actuelle → edge plein
# B probable  : LinkedIn actuel, communiqué, conférence, profil fournisseur → pointillé
# C hypothèse : titre seul, cooccurrence, LLM → influence seulement (aucun lien fort)
# D bruit      : homonyme, ex-employé, source ancienne, mauvaise entité → rejeté
# (D is NOT a source kind — it's a quality judgement passed via `noise=True`.)
SOURCE_GROUNDING: dict[str, Grounding] = {
    "official_site": "A",
    "org_chart": "A",
    "registry": "A",
    "bio": "A",
    "linkedin": "B",
    "press": "B",  # communiqué
    "conference": "B",
    "vendor_profile": "B",  # profil fournisseur
    "crm": "B",  # relation commerciale — warm path vérifié par historique (p13)
    "llm": "C",
    "other": "C",
}

# Relations that live on a hierarchyEdge (p9). `influences` → influenceEdge ;
# `recommended_next` → recommendedPath (« règle commerciale, pas relation réelle »).
# `works_with` (#2121.34) — Personne <-> Personne, HORS hiérarchie.
HIERARCHY_RELATIONS = frozenset({"reports_to", "member_of", "sponsors", "owns_budget", "procures_for", "works_with"})

EdgeRoute = Literal["hierarchy", "influence", "rejected", "zone"]


@dataclass(frozen=True)
class EdgeSource:
    """One piece of evidence backing a candidate edge. `id` references the
    `OrgSource` record on the graph. `fresh` = the source is dated < 12 months
    (p14 « Date < 12 mois → +10 »). `noise` marks a D-grounded source (homonym,
    ex-employee, stale, wrong entity) regardless of kind."""

    id: str
    kind: str
    fresh: bool = False
    noise: bool = False

    def grounding(self) -> Grounding:
        if self.noise:
            return "D"
        return SOURCE_GROUNDING.get(self.kind, "C")


def grounding_for(kind: str, *, noise: bool = False) -> Grounding:
    """Grounding band of a source kind (p10). Unknown kinds default to C
    (hypothesis) — never assumed verified."""
    if noise:
        return "D"
    return SOURCE_GROUNDING.get(kind, "C")


def best_grounding(sources: list[EdgeSource]) -> Grounding | None:
    """The strongest grounding among the sources (A > B > C), unless ANY source is
    noise (D) — a single poisoned source (wrong entity/ex-employee) taints the edge
    and routes it to rejection. None when there are no sources."""
    if not sources:
        return None
    if any(s.grounding() == "D" for s in sources):
        return "D"
    order: dict[Grounding, int] = {"A": 3, "B": 2, "C": 1, "D": 0}
    return max((s.grounding() for s in sources), key=lambda g: order[g])


def factors_from_sources(
    sources: list[EdgeSource],
    *,
    explicit_title: bool = False,
    same_org_id: bool = False,
    contradiction: bool = False,
) -> ConfidenceFactors:
    """Derive the confidence factors (p14) from an edge's evidence.

    `explicit_title` (the relation is named in a title, e.g. « Directeur ») and
    `same_org_id` (both nodes resolve to the same entity) are structural signals
    the caller knows; the rest is read off the sources. `llm_only` is true when
    NO source reaches grounding A or B (only C/llm/title) — that caps the score
    at 49 so a hypothesis can never present as verified."""
    groundings = [s.grounding() for s in sources]
    return ConfidenceFactors(
        official_source=any(g == "A" for g in groundings),
        linkedin_or_provider=any(s.kind in ("linkedin", "vendor_profile") for s in sources),
        explicit_title=explicit_title,
        same_org_id=same_org_id,
        two_converging_sources=len({s.id for s in sources}) >= 2,
        fresh_date=any(s.fresh for s in sources),
        contradiction=contradiction,
        llm_only=len(sources) > 0 and all(g == "C" for g in groundings),
    )


def route_for(sources: list[EdgeSource], score: int) -> EdgeRoute:
    """Decide what to do with a candidate edge (p10 usage column):

    - a noisy source (D)              → ``rejected`` (memorised, never reappears)
    - grounding C only                → ``influence`` (no strong hierarchy link)
    - score below the edge floor (50) → ``zone`` (a coverage gap to verify)
    - otherwise (A/B, score ≥ 50)     → ``hierarchy`` (full if verified, else dotted)
    """
    grounding = best_grounding(sources)
    if grounding is None or grounding == "D":
        return "rejected"
    if grounding == "C":
        return "influence"
    if not creates_edge(score):
        return "zone"
    return "hierarchy"


def resolve_hierarchy_edge(
    *,
    from_id: str,
    to_id: str,
    relation: str,
    sources: list[EdgeSource],
    explicit_title: bool = False,
    same_org_id: bool = False,
    contradiction: bool = False,
) -> dict[str, Any] | None:
    """Resolve one candidate reporting/structural relation into an
    `OrgHierarchyEdge`-shaped dict, or None when the evidence doesn't support a
    hierarchy line (routed to influence, a coverage zone, or rejection).

    The returned dict satisfies the contract invariants by construction:
    ``verified`` ⟺ score ≥ 90 (which, given the p14 weights, requires an official
    A source), and a verified edge always carries its ``sourceIds``.
    """
    if relation not in HIERARCHY_RELATIONS:
        return None
    factors = factors_from_sources(
        sources, explicit_title=explicit_title, same_org_id=same_org_id, contradiction=contradiction
    )
    score = compute_confidence(factors)
    if route_for(sources, score) != "hierarchy":
        return None
    verified = is_verified(score)
    return {
        "fromId": from_id,
        "toId": to_id,
        "type": relation,
        "sourceIds": [s.id for s in sources],
        "confidence": score,
        "verified": verified,
    }


def resolve_influence_edge(
    *,
    from_id: str,
    to_id: str,
    topic: str,
    reasoning: str,
    sources: list[EdgeSource] | None = None,
    stance: str = "unknown",
    explicit_title: bool = False,
    same_org_id: bool = False,
    derived_at: str | None = None,
) -> dict[str, Any] | None:
    """Build an `OrgInfluenceEdge`-shaped dict. An influence is allowed to be
    hypothetical (p27) but MUST carry its reasoning — an empty reasoning yields
    None. Confidence is scored the same way but never promoted to a hierarchy
    line; it is capped at 89 so it can never read as a verified fact.

    D405 (@bellum/contracts `org-graph.ts`) — the prose of `reasoning` alone is
    not a provenance: it can't be filtered, aged or shown as a source. This
    reuses the SAME mechanism `resolve_hierarchy_edge` already carries (GA-26 —
    a derivation lives at ONE place), on the SAME `sources` this function
    already receives:

    - `sourceIds` — always set (possibly empty), mirroring the hierarchy edge.
    - `derivedAt` — the caller's RUN date, never invented here. This is NOT an
      observation date: an influence is an inference, nobody observed it at a
      given moment. Passing `derived_at=None` (the default) omits the key
      entirely rather than guessing `datetime.now()` — a caller that doesn't
      know the run's date doesn't get to invent one.
    """
    if not reasoning.strip():
        return None
    srcs = sources or []
    factors = factors_from_sources(srcs, explicit_title=explicit_title, same_org_id=same_org_id)
    score = min(compute_confidence(factors), 89)
    edge: dict[str, Any] = {
        "fromId": from_id,
        "toId": to_id,
        "topic": topic,
        "stance": stance if stance in ("supporter", "neutral", "detractor", "unknown") else "unknown",
        "confidence": score,
        "reasoning": reasoning.strip(),
        "sourceIds": [s.id for s in srcs],
    }
    if derived_at:
        edge["derivedAt"] = derived_at
    return edge


def resolve_relational_edge(
    *,
    from_id: str,
    to_id: str,
    edge_type: str,
    author: str,
    scope: str = "workspace",
    sources: list[EdgeSource] | None = None,
) -> dict[str, Any] | None:
    """Build an `OrgRelationalEdge`-shaped dict (épopée #2919, #2310.13/.15/.19/
    .20/.21, .27, .28). A relational edge is neither a reporting line nor an
    influence hint — it names a project, a blockage or an introduction between
    two graph nodes (people or entities, `equipe`/`partenaire` compris). It
    never becomes a hierarchy claim: there is no `verified` flag here, only the
    same confidence scoring `resolve_hierarchy_edge`/`resolve_influence_edge`
    already use (GA-26 — one derivation, reused).

    `author` (#2310.28) is required and never invented: an edge nobody can be
    named as coming from is not emitted."""
    if not author.strip():
        return None
    srcs = sources or []
    factors = factors_from_sources(srcs)
    return {
        "fromId": from_id,
        "toId": to_id,
        "type": edge_type,
        "scope": scope,
        "author": author.strip(),
        "sourceIds": [s.id for s in srcs],
        "confidence": compute_confidence(factors),
    }


@dataclass
class ResolvedEdges:
    """The outcome of resolving a batch of candidate relations."""

    hierarchy: list[dict[str, Any]] = field(default_factory=list)
    influence: list[dict[str, Any]] = field(default_factory=list)
    rejected: list[dict[str, str]] = field(default_factory=list)
    zones: list[dict[str, Any]] = field(default_factory=list)


def resolve_edges(candidates: list[dict[str, Any]], *, derived_at: str | None = None) -> ResolvedEdges:
    """Resolve a batch of candidate relations into the four buckets (hierarchy /
    influence / rejected / zone). Each candidate is a dict with `fromId`, `toId`,
    `relation`, `sources` (list of EdgeSource) and optional `explicit_title`,
    `same_org_id`, `contradiction`, `topic`, `reasoning`, `stance`.

    `derived_at` (D405) — ONE date for the whole batch, threaded into every
    influence edge this call produces (both the direct route and the
    hierarchy→influence fallback below). One run, one derivation date — not a
    date recomputed per edge, which could drift by milliseconds and imply a
    precision nothing observed.

    Deterministic and side-effect free — the graph emitter takes these buckets and
    threads them into hierarchyEdges / influenceEdges / rejectedItems / uncoveredZones.
    """
    out = ResolvedEdges()
    for cand in candidates:
        sources: list[EdgeSource] = cand.get("sources", [])
        relation = cand.get("relation", "")
        factors = factors_from_sources(
            sources,
            explicit_title=cand.get("explicit_title", False),
            same_org_id=cand.get("same_org_id", False),
            contradiction=cand.get("contradiction", False),
        )
        score = compute_confidence(factors)
        route = route_for(sources, score)

        if route == "rejected":
            out.rejected.append(
                {"sourceId": cand.get("fromId", ""), "reason": cand.get("reject_reason", "source bruit (D)")}
            )
        elif route == "zone":
            out.zones.append({"fromId": cand.get("fromId", ""), "toId": cand.get("toId", ""), "confidence": score})
        elif route == "influence":
            edge = resolve_influence_edge(
                from_id=cand.get("fromId", ""),
                to_id=cand.get("toId", ""),
                topic=cand.get("topic", relation or "influence"),
                reasoning=cand.get("reasoning", "hypothèse issue du titre / cooccurrence (grounding C)"),
                sources=sources,
                stance=cand.get("stance", "unknown"),
                explicit_title=cand.get("explicit_title", False),
                same_org_id=cand.get("same_org_id", False),
                derived_at=derived_at,
            )
            if edge is not None:
                out.influence.append(edge)
        elif route == "hierarchy":
            edge = resolve_hierarchy_edge(
                from_id=cand.get("fromId", ""),
                to_id=cand.get("toId", ""),
                relation=relation,
                sources=sources,
                explicit_title=cand.get("explicit_title", False),
                same_org_id=cand.get("same_org_id", False),
                contradiction=cand.get("contradiction", False),
            )
            if edge is not None:
                out.hierarchy.append(edge)
            else:
                # A hierarchy-routed candidate whose relation isn't a hierarchy
                # relation (e.g. `influences`) falls back to an influence hint.
                inf = resolve_influence_edge(
                    from_id=cand.get("fromId", ""),
                    to_id=cand.get("toId", ""),
                    topic=cand.get("topic", relation or "influence"),
                    reasoning=cand.get("reasoning", "relation non hiérarchique"),
                    sources=sources,
                    stance=cand.get("stance", "unknown"),
                    derived_at=derived_at,
                )
                if inf is not None:
                    out.influence.append(inf)
    return out
