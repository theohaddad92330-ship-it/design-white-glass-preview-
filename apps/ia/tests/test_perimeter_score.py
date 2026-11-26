"""Deterministic Perimeter Fit Score /20 (03_BUSINESS_RULES §2)."""

from __future__ import annotations

from app.services.perimeter_score import (
    PERIMETER_MAX,
    perimeter_score,
    perimeter_tier,
    select_priority_perimeters,
)

STRONG = {
    "name": "ITIM", "relevance": "operating", "getsPlay": True, "isItEntity": True,
    "priorityTier": "P1", "accessibilityBand": "high", "whatToSell": ["MLOps", "Data Platform"],
}
WEAK = {
    "name": "SGSS Back-office", "relevance": "operating", "getsPlay": True, "isItEntity": False,
    "priorityTier": "P3", "accessibilityBand": "low", "whatToSell": [],
}
NOISE = {"name": "SG Immobilier SCI", "relevance": "noise", "getsPlay": False}


def test_axes_sum_to_20():
    assert PERIMETER_MAX == 20


def test_strong_it_perimeter_is_p1():
    s = perimeter_score(STRONG)
    # 4 operationnelle + 4 owner(P1) + 4 signal(whatToSell) + 4 fit(IT) + 4 access(high) = 20
    assert s == 20
    assert perimeter_tier(s) == "P1"


def test_weak_perimeter_is_secondaire():
    s = perimeter_score(WEAK)
    # 4 + 1(P3) + 1(no signal) + 2(not IT) + 0(low) = 8
    assert s == 8
    assert perimeter_tier(s) == "secondaire"


def test_tier_bands():
    assert perimeter_tier(14) == "P1"
    assert perimeter_tier(13) == "P2"
    assert perimeter_tier(10) == "P2"
    assert perimeter_tier(9) == "secondaire"


def test_select_ranks_and_excludes_noise():
    out = select_priority_perimeters([WEAK, STRONG, NOISE])
    names = [p["name"] for p in out]
    assert names[0] == "ITIM"  # strongest first
    assert "SG Immobilier SCI" not in names  # gated out (getsPlay=False)
    assert len(out) == 2
    top = out[0]
    assert top["tier"] == "P1" and top["perimeterScore"] == 20
    assert top["whatToSell"] == ["MLOps", "Data Platform"]
    # §2 shape: entryRole (from accessibility) + confidence (from completeness).
    assert "bottom-up" in top["entryRole"]  # STRONG has high accessibility
    assert top["confidence"] == "high"  # IT entity + whatToSell


def test_select_caps_at_four():
    ents = [{**STRONG, "name": f"BU{i}", "getsPlay": True} for i in range(8)]
    assert len(select_priority_perimeters(ents)) == 4
