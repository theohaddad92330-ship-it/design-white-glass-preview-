"""Deterministic BELLUM_PROFILER (profile → structured rules)."""

from __future__ import annotations

from app.services.esn_profiler import derive_esn_rules, esn_archetype, preferred_entry_mode


def test_archetype_by_size():
    """Bornes = celles de la table p3 (5 / 15 / 50 / 200), projetées sur les 5
    libellés du deck. Le module n'a plus ses propres coupures : avant, il coupait
    à 100/500 pendant que le stade coupait à 80/300, et une ESN de 90 tombait
    dans deux bandes contradictoires (voir `test_esn_stage.py`)."""
    assert esn_archetype(3) == "solo_hunter"
    assert esn_archetype(15) == "boutique_expert"
    assert esn_archetype(50) == "mid_market_challenger"
    assert esn_archetype(200) == "scale_up"
    assert esn_archetype(201) == "enterprise_player"
    assert esn_archetype(2000) == "enterprise_player"
    assert esn_archetype(None) == "mid_market"  # unknown → safe middle


def test_entry_mode_calibrated_by_size():
    assert preferred_entry_mode(10) == "bottom-up"
    assert preferred_entry_mode(60) == "middle-out"
    assert preferred_entry_mode(400) == "top-down"


def test_derive_from_range_and_nogo():
    rules = derive_esn_rules(
        {"size": "20-100 consultants", "offers": ["Data", "Cloud"], "noGoSectors": ["BTP", " "]}
    )
    # « 20-100 » se lit à sa borne HAUTE (100 consultants) : ESN établie p3.
    assert rules["esnArchetype"] == "scale_up"
    assert rules["preferredEntryMode"] == "middle-out"
    assert rules["noGoSectors"] == ["BTP"]  # blank dropped
    assert rules["offers"] == ["Data", "Cloud"]


def test_derive_handles_empty_profile():
    rules = derive_esn_rules({})
    assert rules["esnArchetype"] == "mid_market"
    assert rules["noGoSectors"] == []
