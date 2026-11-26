"""7-level source-reliability taxonomy (#2289.8) + the corroboration rule
(#2289.9: une affirmation importante ne repose pas exclusivement sur une
source faible lorsqu'une source primaire est attendue).

Composition, not rewrite: this classifies the same providers ``source_judge``
already judges for freshness/quality — it names WHICH of the 7 tiers a
provider sits at, ``source_judge.SourceVerdict`` then carries the result.
"""

from __future__ import annotations

from app.config.knowledge_config import clear_overrides, set_overrides
from app.services.source_reliability import (
    RELIABILITY_TIERS,
    TIER_AGGREGATEUR,
    TIER_NON_VERIFIABLE,
    TIER_OFFICIEL,
    TIER_PRIMAIRE,
    TIER_PUBLIC_FIABLE,
    classify_source_reliability,
    has_sufficient_grounding,
)


def teardown_function(_fn):
    clear_overrides()


def test_seven_named_tiers_in_order():
    assert RELIABILITY_TIERS == (
        "officiel",
        "primaire",
        "public fiable",
        "presse reconnue",
        "source secondaire",
        "agrégateur",
        "non vérifiable",
    )


def test_official_registries_are_officiel():
    for provider in ("pappers", "boamp", "decp", "bodacc", "inpi", "france_travail"):
        assert classify_source_reliability(provider) == TIER_OFFICIEL


def test_firecrawl_is_primaire():
    # Le site propre de l'entreprise, scrapé — source primaire.
    assert classify_source_reliability("firecrawl") == TIER_PRIMAIRE


def test_brave_is_public_fiable():
    assert classify_source_reliability("brave") == TIER_PUBLIC_FIABLE


def test_reconstruction_marker_is_non_verifiable():
    assert classify_source_reliability("ia_reconstruction") == TIER_NON_VERIFIABLE


def test_weak_source_from_config_is_non_verifiable():
    set_overrides({"sources": {"weak_sources": ["scrap_douteux"]}})
    assert classify_source_reliability("scrap_douteux") == TIER_NON_VERIFIABLE


def test_unknown_provider_is_agregateur_not_guessed_officiel():
    # On ne devine jamais une fiabilité qu'on n'a pas — un fournisseur inconnu
    # (enrichissement type Apollo) descend en agrégateur, jamais en officiel.
    assert classify_source_reliability("apollo") == TIER_AGGREGATEUR


def test_none_or_empty_provider_is_non_verifiable():
    assert classify_source_reliability(None) == TIER_NON_VERIFIABLE
    assert classify_source_reliability("") == TIER_NON_VERIFIABLE


def test_case_and_whitespace_insensitive():
    assert classify_source_reliability("  PAPPERS ") == TIER_OFFICIEL


# ── Rule #2289.9 ────────────────────────────────────────────────────────────


def test_primary_expected_with_only_weak_tiers_is_insufficient():
    tiers = ["source secondaire", "agrégateur", "non vérifiable"]
    assert has_sufficient_grounding(tiers, primary_expected=True) is False


def test_primary_expected_with_one_strong_tier_is_sufficient():
    tiers = ["agrégateur", "officiel"]
    assert has_sufficient_grounding(tiers, primary_expected=True) is True


def test_primary_not_expected_weak_tiers_are_sufficient():
    tiers = ["non vérifiable"]
    assert has_sufficient_grounding(tiers, primary_expected=False) is True


def test_no_sources_is_never_sufficient_when_primary_expected():
    assert has_sufficient_grounding([], primary_expected=True) is False
