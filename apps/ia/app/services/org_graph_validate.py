"""OrgGraph invariant validation — Python mirror of the zod contract's runtime
checks (@bellum/contracts `org-graph.ts`, invariants p10/p14/p27/p30).

The contract is the source of truth (zod). When the IA pipeline ASSEMBLES an
OrgGraph (Phase 2 emission), it must not ship a graph that violates the spec's
invariants — a verified line without proof, an influence without reasoning, a
rejected person resurfacing in the recommended path, a dangling id. This module
is the emit-side guard: it re-checks those invariants in Python so a malformed
graph is caught before it crosses the wire (where the zod contract would reject
it anyway — fail early, with a precise reason).

Pure, no I/O. `validate_org_graph(graph)` returns the list of violation strings
(empty ⇒ valid). It mirrors, rule for rule, the `superRefine` blocks of
`orgHierarchyEdgeSchema` and `orgGraphSchema`.
"""

from __future__ import annotations

from typing import Any

from app.services.entity_resolution import ENTITY_KINDS, ORG_ENTITY_TYPE_TO_KIND

VERIFIED_MIN = 90  # a verified hierarchy edge requires confidence ≥ 90 (p14)
INFERRED_MAX = 89  # an inferred (unverified) edge stays ≤ 89 (≥ 90 means verified)


def _is_int_0_100(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 100


def validate_org_graph(graph: dict[str, Any]) -> list[str]:
    """Return every invariant violation in `graph` (empty list ⇒ valid).

    Mirrors the zod contract's cross-array referential integrity + edge rules.
    Never raises — a malformed input (missing arrays, wrong types) is reported as
    a violation, not an exception, so the caller can log and degrade."""
    errors: list[str] = []

    entities = graph.get("entities") or []
    people = graph.get("people") or []
    hierarchy_edges = graph.get("hierarchyEdges") or []
    influence_edges = graph.get("influenceEdges") or []
    committee = graph.get("buyingCommittee") or []
    recommended_path = graph.get("recommendedPath") or []
    rejected_items = graph.get("rejectedItems") or []

    entity_ids = {e.get("id") for e in entities if isinstance(e, dict)}
    people_ids = {p.get("id") for p in people if isinstance(p, dict)}
    node_ids = entity_ids | people_ids
    rejected_ids = {r.get("sourceId") for r in rejected_items if isinstance(r, dict)}

    # ── entities: parent resolves, no self-parent, confidence in range ──────────
    for i, entity in enumerate(entities):
        if not isinstance(entity, dict):
            errors.append(f"entities[{i}] is not an object")
            continue
        parent = entity.get("parentId")
        if parent is not None:
            if parent == entity.get("id"):
                errors.append(f"entities[{i}].parentId: an entity cannot be its own parent")
            elif parent not in entity_ids:
                errors.append(f'entities[{i}].parentId: "{parent}" is not in entities[]')
        if not _is_int_0_100(entity.get("confidence")):
            errors.append(f"entities[{i}].confidence must be an integer in [0, 100]")
        # #2284.5 — miroir zod : un kind de la taxonomie, jamais la répétition du type (GA-26).
        kind = entity.get("entityKind")
        if kind is not None:
            if kind not in ENTITY_KINDS:
                errors.append(f'entities[{i}].entityKind: "{kind}" is not an entity kind')
            elif kind == ORG_ENTITY_TYPE_TO_KIND.get(str(entity.get("type"))):
                errors.append(f"entities[{i}].entityKind: entity_kind_repeats_type")

    # ── people: entity resolves, confidence in range ────────────────────────────
    for i, person in enumerate(people):
        if not isinstance(person, dict):
            errors.append(f"people[{i}] is not an object")
            continue
        ent = person.get("entityId")
        if ent is not None and ent not in entity_ids:
            errors.append(f'people[{i}].entityId: "{ent}" is not in entities[]')
        if not _is_int_0_100(person.get("confidence")):
            errors.append(f"people[{i}].confidence must be an integer in [0, 100]")

    # ── hierarchy edges: nodes resolve; verified ⇒ sourced + ≥90 ; else ≤89 ─────
    for i, edge in enumerate(hierarchy_edges):
        if not isinstance(edge, dict):
            errors.append(f"hierarchyEdges[{i}] is not an object")
            continue
        if edge.get("fromId") not in node_ids:
            errors.append(f'hierarchyEdges[{i}].fromId: "{edge.get("fromId")}" is not a known node')
        if edge.get("toId") not in node_ids:
            errors.append(f'hierarchyEdges[{i}].toId: "{edge.get("toId")}" is not a known node')
        confidence = edge.get("confidence")
        if not _is_int_0_100(confidence):
            errors.append(f"hierarchyEdges[{i}].confidence must be an integer in [0, 100]")
            continue
        if edge.get("verified") is True:
            if not (edge.get("sourceIds") or []):
                errors.append(
                    f"hierarchyEdges[{i}]: a verified edge requires at least one sourceId "
                    "(no hierarchy line without proof)"
                )
            if confidence < VERIFIED_MIN:
                errors.append(f"hierarchyEdges[{i}]: a verified edge requires confidence ≥ {VERIFIED_MIN}")
        elif confidence > INFERRED_MAX:
            errors.append(
                f"hierarchyEdges[{i}]: an unverified edge must have confidence ≤ {INFERRED_MAX} (≥ 90 means verified)"
            )

    # ── influence edges: nodes resolve; reasoning REQUIRED ──────────────────────
    for i, edge in enumerate(influence_edges):
        if not isinstance(edge, dict):
            errors.append(f"influenceEdges[{i}] is not an object")
            continue
        if edge.get("fromId") not in node_ids:
            errors.append(f'influenceEdges[{i}].fromId: "{edge.get("fromId")}" is not a known node')
        if edge.get("toId") not in node_ids:
            errors.append(f'influenceEdges[{i}].toId: "{edge.get("toId")}" is not a known node')
        if not str(edge.get("reasoning") or "").strip():
            errors.append(f"influenceEdges[{i}]: an influence edge must carry a non-empty reasoning")
        if not _is_int_0_100(edge.get("confidence")):
            errors.append(f"influenceEdges[{i}].confidence must be an integer in [0, 100]")

    # ── committee: personId resolves ────────────────────────────────────────────
    for i, member in enumerate(committee):
        if not isinstance(member, dict) or member.get("personId") not in people_ids:
            pid = member.get("personId") if isinstance(member, dict) else None
            errors.append(f'buyingCommittee[{i}].personId: "{pid}" is not in people[]')

    # ── recommended path: personId resolves AND is not rejected ─────────────────
    for i, step in enumerate(recommended_path):
        if not isinstance(step, dict):
            errors.append(f"recommendedPath[{i}] is not an object")
            continue
        pid = step.get("personId")
        if pid not in people_ids:
            errors.append(f'recommendedPath[{i}].personId: "{pid}" is not in people[]')
        if pid in rejected_ids:
            errors.append(f'recommendedPath[{i}]: rejected person "{pid}" cannot appear in recommendedPath')

    # ── rejected items: never still active as a node ────────────────────────────
    for i, item in enumerate(rejected_items):
        if isinstance(item, dict) and item.get("sourceId") in node_ids:
            errors.append(
                f'rejectedItems[{i}]: rejected "{item.get("sourceId")}" still appears as an active entity/person'
            )

    # ── coverage: un sous-ensemble ne dépasse pas son ensemble ──────────────────
    # Miroir de `orgCoverageSchema.superRefine`. Sans cette porte côté Python, la
    # règle n'existerait que dans un seul des deux langages : le graphe partirait
    # sur le fil et zod le refuserait à l'arrivée — le compte perdrait son
    # organigramme entier pour un compteur pris à la mauvaise source.
    coverage = graph.get("coverage")
    if coverage is not None:
        if not isinstance(coverage, dict):
            errors.append("coverage is not an object")
        else:
            discovered = coverage.get("discovered")
            if not isinstance(discovered, int) or isinstance(discovered, bool) or discovered < 0:
                errors.append("coverage.discovered must be a non-negative integer")
            else:
                for field in ("attachedToEntity", "deterministicClassified", "llmEnriched"):
                    value = coverage.get(field)
                    if value is None:
                        continue
                    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                        errors.append(f"coverage.{field} must be a non-negative integer")
                    elif value > discovered:
                        errors.append(f"coverage.{field} ({value}) cannot exceed coverage.discovered ({discovered})")

    return errors


def is_valid_org_graph(graph: dict[str, Any]) -> bool:
    """True iff the graph satisfies every contract invariant."""
    return len(validate_org_graph(graph)) == 0
