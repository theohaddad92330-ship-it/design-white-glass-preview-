"""Deterministic confidence engine for the Org Graph (Annexe Organigramme p14).

Locks the p14 table (weights + thresholds + LLM cap) verbatim so Phase 2's
resolver can trust a stable, explicable score.
"""

from __future__ import annotations

from app.services.org_confidence import (
    HYPOTHESIS_MIN,
    LLM_ONLY_CEILING,
    PROBABLE_MIN,
    VERIFIED_MIN,
    ConfidenceFactors,
    compute_confidence,
    confidence_band,
    creates_edge,
    is_verified,
)


class TestComputeConfidence:
    def test_fully_corroborated_edge_tops_out_at_100(self):
        # 30 + 20 + 15 + 15 + 10 + 10 = 100 (the « vérifié » ceiling).
        factors = ConfidenceFactors(
            official_source=True,
            linkedin_or_provider=True,
            explicit_title=True,
            same_org_id=True,
            two_converging_sources=True,
            fresh_date=True,
        )
        assert compute_confidence(factors) == 100

    def test_official_source_plus_explicit_title(self):
        assert compute_confidence(ConfidenceFactors(official_source=True, explicit_title=True)) == 45

    def test_no_evidence_is_zero(self):
        assert compute_confidence(ConfidenceFactors()) == 0

    def test_contradiction_subtracts_and_clamps_at_zero(self):
        # +15 title, -30 contradiction → -15 → clamped to 0.
        assert compute_confidence(ConfidenceFactors(explicit_title=True, contradiction=True)) == 0

    def test_contradiction_pulls_a_strong_edge_down(self):
        # 30 + 20 + 15 - 30 = 35.
        factors = ConfidenceFactors(
            official_source=True, linkedin_or_provider=True, explicit_title=True, contradiction=True
        )
        assert compute_confidence(factors) == 35

    def test_llm_only_is_capped_at_49_even_with_other_factors(self):
        # Even if other flags push the raw sum above 49, an LLM-only edge is capped.
        factors = ConfidenceFactors(
            official_source=True, linkedin_or_provider=True, explicit_title=True, llm_only=True
        )
        assert compute_confidence(factors) == LLM_ONLY_CEILING

    def test_llm_only_below_cap_is_unchanged(self):
        assert compute_confidence(ConfidenceFactors(explicit_title=True, llm_only=True)) == 15

    def test_score_never_exceeds_100(self):
        # Force a hypothetical over-sum via every positive flag; still clamps to 100.
        factors = ConfidenceFactors(
            official_source=True,
            linkedin_or_provider=True,
            explicit_title=True,
            same_org_id=True,
            two_converging_sources=True,
            fresh_date=True,
        )
        assert compute_confidence(factors) <= 100


class TestBands:
    def test_thresholds_match_p14(self):
        assert (VERIFIED_MIN, PROBABLE_MIN, HYPOTHESIS_MIN) == (90, 70, 50)

    def test_verified_band(self):
        assert confidence_band(90) == "verified"
        assert confidence_band(100) == "verified"

    def test_probable_band(self):
        assert confidence_band(70) == "probable"
        assert confidence_band(89) == "probable"

    def test_hypothesis_band(self):
        assert confidence_band(50) == "hypothesis"
        assert confidence_band(69) == "hypothesis"

    def test_none_band_below_50(self):
        assert confidence_band(49) == "none"
        assert confidence_band(0) == "none"

    def test_is_verified_only_at_90_plus(self):
        assert is_verified(90) is True
        assert is_verified(89) is False

    def test_creates_edge_at_50_plus(self):
        assert creates_edge(50) is True
        assert creates_edge(49) is False

    def test_llm_only_edge_can_never_be_verified(self):
        # The strongest LLM-only score (49) is still below the edge threshold entirely.
        factors = ConfidenceFactors(official_source=True, llm_only=True)
        score = compute_confidence(factors)
        assert is_verified(score) is False
        assert creates_edge(score) is False
        assert confidence_band(score) == "none"
