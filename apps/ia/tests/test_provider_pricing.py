"""Cost per analysis must cover every provider, not just Claude.

The billing dashboard showed ~$1.11/analysis — Claude tokens only. Apollo
credits, Firecrawl page credits, Pappers lookups and the paid search providers
were invisible, so the true cost was understated and nobody could see which
provider was actually expensive.
"""

from __future__ import annotations

import pytest

from app.services import provider_pricing as pricing


def test_known_paid_providers_have_a_price() -> None:
    for provider in ("apollo", "firecrawl", "pappers", "brave"):
        assert pricing.unit_cost_usd(provider) > 0, provider


def test_free_sources_cost_nothing() -> None:
    """Free in money — never in latency, which run_metrics reports separately."""
    for provider in ("bodacc", "boamp", "decp", "france_travail", "insee", "inpi", "github"):
        assert pricing.unit_cost_usd(provider) == 0.0, provider


def test_unknown_provider_is_free_rather_than_guessed() -> None:
    """A guessed price billed onward is worse than a visible zero."""
    assert pricing.unit_cost_usd("some_new_api") == 0.0


def test_token_priced_providers_are_not_charged_per_call() -> None:
    for provider in ("claude", "claude:bellum_facts", "openai", "anthropic"):
        assert pricing.unit_cost_usd(provider) == 0.0, provider


def test_price_is_env_overridable() -> None:
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("COST_PER_CALL_USD_APOLLO", "0.5")
        assert pricing.unit_cost_usd("apollo") == 0.5


def test_invalid_env_price_falls_back_to_default() -> None:
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("COST_PER_CALL_USD_APOLLO", "not-a-number")
        assert pricing.unit_cost_usd("apollo") == pricing._DEFAULT_UNIT_COST_USD["apollo"]


def test_cost_scales_with_call_count() -> None:
    one = pricing.cost_for_calls("firecrawl", 1)
    assert pricing.cost_for_calls("firecrawl", 7) == pytest.approx(one * 7)
    assert pricing.cost_for_calls("firecrawl", 0) == 0.0


def test_price_run_charges_only_successful_calls() -> None:
    """A provider that errored consumed no credit."""
    priced = pricing.price_run(
        {"apollo": {"calls": 5, "errors": 2, "duration_ms": 10, "wait_ms": 0, "cost_usd": 0.0}}
    )
    assert priced["apollo"]["cost_usd"] == pytest.approx(pricing.unit_cost_usd("apollo") * 3)


def test_price_run_does_not_double_count_llm_token_cost() -> None:
    priced = pricing.price_run(
        {"claude:bellum_facts": {"calls": 3, "errors": 0, "duration_ms": 10, "wait_ms": 0, "cost_usd": 0.42}}
    )
    assert priced["claude:bellum_facts"]["cost_usd"] == pytest.approx(0.42)


def test_price_run_does_not_mutate_its_input() -> None:
    original = {"apollo": {"calls": 2, "errors": 0, "duration_ms": 1, "wait_ms": 0, "cost_usd": 0.0}}
    pricing.price_run(original)
    assert original["apollo"]["cost_usd"] == 0.0


def test_price_run_exposes_the_unit_price_it_applied() -> None:
    """The dashboard must be able to show WHY a provider cost what it did."""
    priced = pricing.price_run({"apollo": {"calls": 1, "errors": 0, "duration_ms": 1, "wait_ms": 0, "cost_usd": 0.0}})
    assert priced["apollo"]["unit_cost_usd"] == pricing.unit_cost_usd("apollo")


def test_total_sums_llm_tokens_and_paid_calls() -> None:
    total = pricing.total_cost_usd(
        {
            "claude:bellum_facts": {"calls": 1, "errors": 0, "duration_ms": 1, "wait_ms": 0, "cost_usd": 1.00},
            "apollo": {"calls": 10, "errors": 0, "duration_ms": 1, "wait_ms": 0, "cost_usd": 0.0},
            "bodacc": {"calls": 4, "errors": 0, "duration_ms": 1, "wait_ms": 0, "cost_usd": 0.0},
        }
    )
    assert total == pytest.approx(1.00 + pricing.unit_cost_usd("apollo") * 10)


def test_empty_run_costs_nothing() -> None:
    assert pricing.total_cost_usd({}) == 0.0
