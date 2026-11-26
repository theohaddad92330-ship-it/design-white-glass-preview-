"""Deterministic relation resolver for the Org Graph (Annexe Organigramme p9/p10).

Locks the grounding routing (A→plein, B→pointillé, C→influence, D→rejeté) and the
edge shapes so the graph emitter can trust them against the OrgHierarchyEdge /
OrgInfluenceEdge contract invariants.
"""

from __future__ import annotations

from app.services.org_resolver import (
    EdgeSource,
    best_grounding,
    factors_from_sources,
    grounding_for,
    resolve_edges,
    resolve_hierarchy_edge,
    resolve_influence_edge,
    route_for,
)
from app.services.org_confidence import compute_confidence


def official(id: str = "s1", fresh: bool = True) -> EdgeSource:
    return EdgeSource(id=id, kind="official_site", fresh=fresh)


class TestGrounding:
    def test_source_kind_maps_to_band(self):
        assert grounding_for("official_site") == "A"
        assert grounding_for("org_chart") == "A"
        assert grounding_for("linkedin") == "B"
        assert grounding_for("vendor_profile") == "B"
        assert grounding_for("llm") == "C"
        assert grounding_for("unknown_kind") == "C"  # never assumed verified

    def test_noise_overrides_to_D(self):
        assert grounding_for("official_site", noise=True) == "D"

    def test_best_grounding_picks_strongest(self):
        srcs = [EdgeSource("a", "llm"), EdgeSource("b", "linkedin"), EdgeSource("c", "official_site")]
        assert best_grounding(srcs) == "A"

    def test_a_single_noise_source_taints_the_edge(self):
        srcs = [official("a"), EdgeSource("b", "linkedin", noise=True)]
        assert best_grounding(srcs) == "D"

    def test_best_grounding_none_without_sources(self):
        assert best_grounding([]) is None


class TestFactors:
    def test_two_distinct_sources_counts_as_converging(self):
        f = factors_from_sources([official("a"), EdgeSource("b", "linkedin")])
        assert f.two_converging_sources is True

    def test_same_source_id_twice_is_not_converging(self):
        f = factors_from_sources([official("a"), official("a")])
        assert f.two_converging_sources is False

    def test_llm_only_when_all_sources_are_C(self):
        f = factors_from_sources([EdgeSource("a", "llm"), EdgeSource("b", "other")])
        assert f.llm_only is True

    def test_not_llm_only_when_any_source_is_A_or_B(self):
        f = factors_from_sources([EdgeSource("a", "llm"), EdgeSource("b", "linkedin")])
        assert f.llm_only is False


class TestRouting:
    def test_official_fresh_titled_same_org_is_verified_hierarchy(self):
        # official(30) + title(15) + same_org(15) + fresh(10) = 70 → still not ≥90.
        # Add a second converging official source → +10 → 80. Add linkedin → +20 → 100.
        edge = resolve_hierarchy_edge(
            from_id="p1",
            to_id="p2",
            relation="reports_to",
            sources=[official("s1"), EdgeSource("s2", "linkedin", fresh=True)],
            explicit_title=True,
            same_org_id=True,
        )
        assert edge is not None
        assert edge["verified"] is True
        assert edge["confidence"] >= 90
        assert edge["type"] == "reports_to"
        assert edge["sourceIds"] == ["s1", "s2"]

    def test_linkedin_only_is_dotted_unverified(self):
        # linkedin(20) + title(15) + same_org(15) + fresh(10) = 60 → dotted (50-69).
        edge = resolve_hierarchy_edge(
            from_id="p1",
            to_id="p2",
            relation="reports_to",
            sources=[EdgeSource("s1", "linkedin", fresh=True)],
            explicit_title=True,
            same_org_id=True,
        )
        assert edge is not None
        assert edge["verified"] is False
        assert 50 <= edge["confidence"] <= 89

    def test_hypothesis_C_routes_to_none_hierarchy(self):
        # An llm-only candidate never becomes a hierarchy edge.
        edge = resolve_hierarchy_edge(
            from_id="p1",
            to_id="p2",
            relation="reports_to",
            sources=[EdgeSource("s1", "llm")],
            explicit_title=True,
        )
        assert edge is None

    def test_noise_source_routes_to_rejected(self):
        srcs = [EdgeSource("s1", "official_site", noise=True)]
        assert route_for(srcs, compute_confidence(factors_from_sources(srcs))) == "rejected"

    def test_weak_but_grounded_below_50_is_a_zone(self):
        # Single linkedin source, no title/same-org/fresh → 20 → below 50 → zone.
        srcs = [EdgeSource("s1", "linkedin")]
        assert route_for(srcs, compute_confidence(factors_from_sources(srcs))) == "zone"

    def test_non_hierarchy_relation_is_not_a_hierarchy_edge(self):
        edge = resolve_hierarchy_edge(
            from_id="p1", to_id="d1", relation="influences", sources=[official("s1")], explicit_title=True
        )
        assert edge is None


class TestInfluenceEdge:
    def test_requires_reasoning(self):
        assert (
            resolve_influence_edge(from_id="p1", to_id="d1", topic="budget cloud", reasoning="  ") is None
        )

    def test_capped_at_89_even_when_officially_sourced(self):
        edge = resolve_influence_edge(
            from_id="p1",
            to_id="d1",
            topic="budget cloud",
            reasoning="expertise cloud + ancienneté",
            sources=[official("s1"), EdgeSource("s2", "linkedin", fresh=True)],
            explicit_title=True,
            same_org_id=True,
        )
        assert edge is not None
        assert edge["confidence"] <= 89
        assert edge["reasoning"] == "expertise cloud + ancienneté"

    def test_unknown_stance_defaults(self):
        edge = resolve_influence_edge(from_id="p1", to_id="d1", topic="x", reasoning="y", stance="bogus")
        assert edge is not None and edge["stance"] == "unknown"

    def test_carries_its_source_ids(self):
        """D405 — même motif que `resolve_hierarchy_edge` : la prose de
        `reasoning` seule n'est pas une provenance filtrable/datable."""
        edge = resolve_influence_edge(
            from_id="p1", to_id="d1", topic="budget cloud", reasoning="x", sources=[EdgeSource("s1", "llm")]
        )
        assert edge is not None
        assert edge["sourceIds"] == ["s1"]

    def test_source_ids_default_to_empty_list_without_sources(self):
        edge = resolve_influence_edge(from_id="p1", to_id="d1", topic="x", reasoning="y")
        assert edge is not None
        assert edge["sourceIds"] == []

    def test_never_invents_a_derived_at(self):
        """Une date de dérivation qu'on ne connaît pas n'est jamais inventée —
        elle est simplement absente, jamais un défaut deviné."""
        edge = resolve_influence_edge(from_id="p1", to_id="d1", topic="x", reasoning="y")
        assert edge is not None
        assert "derivedAt" not in edge

    def test_carries_the_run_s_derived_at_when_given(self):
        """`derived_at` — PAS `observed_at` : une influence est une inférence,
        elle n'a jamais été observée. Voir org-graph.ts (D405)."""
        edge = resolve_influence_edge(
            from_id="p1", to_id="d1", topic="x", reasoning="y", derived_at="2026-08-30T09:00:00+00:00"
        )
        assert edge is not None
        assert edge["derivedAt"] == "2026-08-30T09:00:00+00:00"


class TestResolveBatch:
    def test_buckets_candidates_by_route(self):
        candidates = [
            {  # verified hierarchy
                "fromId": "p1",
                "toId": "p2",
                "relation": "reports_to",
                "sources": [official("s1"), EdgeSource("s2", "linkedin", fresh=True)],
                "explicit_title": True,
                "same_org_id": True,
            },
            {  # influence (C only)
                "fromId": "p3",
                "toId": "d1",
                "relation": "influences",
                "sources": [EdgeSource("s3", "llm")],
                "reasoning": "expertise",
            },
            {  # rejected (noise)
                "fromId": "p4",
                "toId": "p5",
                "relation": "reports_to",
                "sources": [EdgeSource("s4", "official_site", noise=True)],
            },
            {  # zone (grounded but weak)
                "fromId": "p6",
                "toId": "p7",
                "relation": "reports_to",
                "sources": [EdgeSource("s5", "linkedin")],
            },
        ]
        out = resolve_edges(candidates)
        assert len(out.hierarchy) == 1 and out.hierarchy[0]["verified"] is True
        assert len(out.influence) == 1 and out.influence[0]["reasoning"] == "expertise"
        assert len(out.rejected) == 1 and out.rejected[0]["sourceId"] == "p4"
        assert len(out.zones) == 1 and out.zones[0]["fromId"] == "p6"

    def test_threads_derived_at_into_every_influence_edge_of_the_batch(self):
        """D405 — un seul `derived_at` par run, posé au batch, retrouvé sur
        CHAQUE influence qu'il produit (une seule date du run, pas une par edge)."""
        candidates = [
            {
                "fromId": "p3",
                "toId": "d1",
                "relation": "influences",
                "sources": [EdgeSource("s3", "llm")],
                "reasoning": "expertise",
            },
            {  # hierarchy-routed by grounding (official source) but `influences`
                # isn't a hierarchy relation → resolve_hierarchy_edge returns
                # None → falls back to the influence bucket.
                "fromId": "p8",
                "toId": "p9",
                "relation": "influences",
                "sources": [official("s6")],
                "reasoning": "sponsor du programme",
                "explicit_title": True,
                "same_org_id": True,
            },
        ]
        out = resolve_edges(candidates, derived_at="2026-08-30T09:00:00+00:00")
        assert len(out.influence) == 2
        for edge in out.influence:
            assert edge["derivedAt"] == "2026-08-30T09:00:00+00:00"
        assert out.influence[0]["sourceIds"] == ["s3"]

    def test_no_derived_at_argument_means_none_invented(self):
        candidates = [
            {
                "fromId": "p3",
                "toId": "d1",
                "relation": "influences",
                "sources": [EdgeSource("s3", "llm")],
                "reasoning": "expertise",
            },
        ]
        out = resolve_edges(candidates)
        assert "derivedAt" not in out.influence[0]
