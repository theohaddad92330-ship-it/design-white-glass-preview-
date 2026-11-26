"""Deterministic P1/P2/P3 priority tiers on the entity cartography."""

from __future__ import annotations

from app.services.prioritization import (
    ZONE_ENGAGEMENT,
    accessibility_band,
    assign_priority_tiers,
    engagement_for_zone,
    tier_counts,
    zone_matrix,
)

# SG-shaped org map (the deck's "14 entités").
SG_ENTITIES = [
    {"name": "Innovation, Technologies & IT (ITIM)", "type": "hub it", "estimatedHeadcount": "~5 000"},
    {"name": "GBSU / GBIS", "type": "filiale", "estimatedHeadcount": "~3 000"},
    {"name": "SGSS", "type": "filiale", "estimatedHeadcount": "~2 000"},
    {"name": "BoursoBank", "type": "filiale", "estimatedHeadcount": "~1 500"},
    {"name": "BDDF", "type": "direction", "estimatedHeadcount": "~1 000"},
    {"name": "RISQ", "type": "direction"},
    {"name": "DFIN", "type": "direction"},
    {"name": "RESG / Achats", "type": "direction"},
    {"name": "HRCO", "type": "direction"},
    {"name": "ITIM / CSR", "type": "sous-dsi"},
    {"name": "ITIM / DSR", "type": "sous-dsi"},
    {"name": "CPLE", "type": "département"},
]


def test_assigns_p1_p2_p3_buckets():
    tiered = assign_priority_tiers(SG_ENTITIES)
    counts = tier_counts(tiered)
    assert counts["P1"] == 4
    assert counts["P2"] == 6
    assert counts["P3"] == 2  # the rest
    assert sum(counts.values()) == len(SG_ENTITIES)


def test_it_hub_and_big_units_land_in_p1():
    tiered = {e["name"]: e for e in assign_priority_tiers(SG_ENTITIES)}
    assert tiered["Innovation, Technologies & IT (ITIM)"]["priorityTier"] == "P1"
    assert tiered["GBSU / GBIS"]["priorityTier"] == "P1"
    # Pure compliance / sub-DSI long-tail land in P3.
    assert tiered["CPLE"]["priorityTier"] == "P3"


def test_each_entity_gets_a_rank():
    tiered = assign_priority_tiers(SG_ENTITIES)
    ranks = sorted(e["priorityRank"] for e in tiered)
    assert ranks == list(range(1, len(SG_ENTITIES) + 1))


def test_small_company_caps_tiers_to_size():
    small = [{"name": "Doctolib France", "type": "bu"}, {"name": "Doctolib Allemagne", "type": "bu"}]
    tiered = assign_priority_tiers(small)
    counts = tier_counts(tiered)
    assert counts["P1"] == 2
    assert counts["P2"] == 0 and counts["P3"] == 0


def test_empty_is_empty():
    assert assign_priority_tiers([]) == []
    assert assign_priority_tiers(None) == []


def test_it_entity_forced_to_p1_over_bigger_non_it():
    # The IT arm lands in P1 even with zero headcount, ahead of much larger
    # non-IT entities — that's the ESN's prime hunting zone.
    entities = [
        {"name": "Big Retail Bank", "type": "filiale", "estimatedHeadcount": "20000"},
        {"name": "Big Insurance", "type": "filiale", "estimatedHeadcount": "15000"},
        {"name": "Big Markets", "type": "filiale", "estimatedHeadcount": "12000"},
        {"name": "Big Asset Mgmt", "type": "filiale", "estimatedHeadcount": "10000"},
        {"name": "Euro-Information", "type": "GIE", "estimatedHeadcount": "0"},
    ]
    tiered = {e["name"]: e for e in assign_priority_tiers(entities)}
    assert tiered["Euro-Information"]["priorityTier"] == "P1"
    assert tiered["Euro-Information"]["priorityRank"] == 1
    assert tiered["Euro-Information"]["isItEntity"] is True


def test_isitentity_flag_set_for_non_it():
    tiered = assign_priority_tiers([{"name": "BoursoBank", "type": "filiale"}])
    assert tiered[0]["isItEntity"] is False


# ── Accessibility axis + influence × accessibility matrix (deck's 4 zones) ─────


def test_accessibility_band_from_it_autonomy():
    # itAutonomy is the strongest deterministic accessibility signal.
    assert accessibility_band({"name": "X", "itAutonomy": "autonome"}) == "high"
    assert accessibility_band({"name": "X", "itAutonomy": "partage"}) == "medium"
    assert accessibility_band({"name": "X", "itAutonomy": "centralise"}) == "low"
    # snake_case key from the model is honoured too.
    assert accessibility_band({"name": "X", "it_autonomy": "autonome"}) == "high"


def test_accessibility_band_it_arm_is_high():
    # The group's IT arm is the ESN's natural entry point → always accessible.
    assert accessibility_band({"name": "Euro-Information", "isItEntity": True}) == "high"


def test_accessibility_band_deep_subdsi_is_low():
    assert accessibility_band({"name": "ITIM / CSR", "type": "sous-dsi"}) == "low"
    assert accessibility_band({"name": "CPLE", "type": "département"}) == "low"


def test_accessibility_band_plain_filiale_is_medium():
    assert accessibility_band({"name": "BoursoBank", "type": "filiale"}) == "medium"


def test_entities_get_bands_and_zone():
    tiered = assign_priority_tiers(SG_ENTITIES)
    zones = {"attaque_immediate", "influence_a_activer", "quick_win", "longue_traine"}
    for e in tiered:
        assert e["accessibilityBand"] in {"high", "medium", "low"}
        assert e["influenceBand"] in {"high", "medium", "low"}
        assert e["zone"] in zones
    # influenceBand mirrors the tier (P1 high / P2 medium / P3 low).
    by_name = {e["name"]: e for e in tiered}
    assert by_name["Innovation, Technologies & IT (ITIM)"]["influenceBand"] == "high"


def test_it_arm_is_attaque_immediate():
    # High influence (forced P1) + high accessibility (IT arm) → top-right quadrant.
    entities = [
        {"name": "Big Retail Bank", "type": "filiale", "estimatedHeadcount": "20000"},
        {"name": "Euro-Information", "type": "GIE", "estimatedHeadcount": "0"},
    ]
    by_name = {e["name"]: e for e in assign_priority_tiers(entities)}
    assert by_name["Euro-Information"]["zone"] == "attaque_immediate"


def test_centralised_high_influence_is_a_activer():
    # Big non-IT entity → P1 (high influence) but IT centralised → low accessibility.
    tiered = assign_priority_tiers(
        [{"name": "Big Bank", "type": "filiale", "estimatedHeadcount": "20000", "itAutonomy": "centralise"}],
    )
    assert tiered[0]["priorityTier"] == "P1"
    assert tiered[0]["accessibilityBand"] == "low"
    assert tiered[0]["zone"] == "influence_a_activer"


def test_small_autonomous_unit_is_quick_win():
    # Below P1 (low/medium influence) but IT-autonomous → easy entry → quick win.
    entities = [
        {"name": "A", "type": "filiale", "estimatedHeadcount": "20000"},
        {"name": "B", "type": "filiale", "estimatedHeadcount": "18000"},
        {"name": "C", "type": "filiale", "estimatedHeadcount": "16000"},
        {"name": "D", "type": "filiale", "estimatedHeadcount": "14000"},
        {"name": "E small", "type": "filiale", "estimatedHeadcount": "200", "itAutonomy": "autonome"},
    ]
    by_name = {e["name"]: e for e in assign_priority_tiers(entities)}
    assert by_name["E small"]["priorityTier"] != "P1"
    assert by_name["E small"]["zone"] == "quick_win"


def test_zone_matrix_counts_sum_to_total():
    tiered = assign_priority_tiers(SG_ENTITIES)
    matrix = zone_matrix(tiered)
    assert set(matrix) == {"attaque_immediate", "influence_a_activer", "quick_win", "longue_traine"}
    assert sum(matrix.values()) == len(SG_ENTITIES)


def test_zone_matrix_empty():
    assert sum(zone_matrix([]).values()) == 0


# ── Engagement playbook (zone → Power/Interest quadrant + cadence + tier) ──────


def test_every_zone_has_a_full_engagement_entry():
    zones = {"attaque_immediate", "influence_a_activer", "quick_win", "longue_traine"}
    assert set(ZONE_ENGAGEMENT) == zones
    for eng in ZONE_ENGAGEMENT.values():
        assert set(eng) == {"quadrant", "cadence", "contactTier", "action"}
        assert eng["contactTier"] in {"A", "B", "C"}


def test_champions_zone_is_weekly_tier_a():
    eng = engagement_for_zone("attaque_immediate")
    assert eng["quadrant"] == "CHAMPIONS"
    assert eng["cadence"] == "hebdomadaire"
    assert eng["contactTier"] == "A"


def test_longue_traine_is_quarterly_monitor_tier_c():
    eng = engagement_for_zone("longue_traine")
    assert eng["quadrant"] == "MONITOR"
    assert eng["cadence"] == "trimestrielle"
    assert eng["contactTier"] == "C"


def test_unknown_zone_returns_empty_engagement():
    assert engagement_for_zone("") == {}
    assert engagement_for_zone("nope") == {}


def test_entities_carry_their_zone_engagement():
    tiered = assign_priority_tiers(SG_ENTITIES)
    for e in tiered:
        assert e["engagement"] == engagement_for_zone(e["zone"])
        assert e["engagement"]["cadence"]  # non-empty for every real zone


def test_tiers_work_on_subsidiary_shape_fallback():
    # When entitiesExhaustive is empty the router tiers meaningfulSubsidiaries
    # (name + siren only, no type/headcount) — must still bucket, not return [].
    subs = [
        {"siren": "1", "name": "Euro-Information", "isItEntity": True},
        {"siren": "2", "name": "BOURSORAMA"},
        {"siren": "3", "name": "SOGECAP"},
    ]
    tiered = assign_priority_tiers(subs)
    counts = tier_counts(tiered)
    assert sum(counts.values()) == 3
    by_name = {e["name"]: e for e in tiered}
    assert by_name["Euro-Information"]["priorityTier"] == "P1"
