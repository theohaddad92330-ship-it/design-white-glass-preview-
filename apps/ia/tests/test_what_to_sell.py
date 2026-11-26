"""What-to-sell per entity (#275) — the prompt asks for it, the model carries it,
the deterministic enrichment preserves it end-to-end.

Semantic quality (is GBIS → Java/quant correct?) is validated by the golden-set
eval (``evals/`` + ``--judge``) against a live run, not here."""

from __future__ import annotations

from app.models.outputs.research import EntityExhaustive, ResearchFacts
from app.prompts.bellum_facts import build_user_prompt
from app.services.prioritization import assign_priority_tiers


def test_prompt_requests_what_to_sell_and_stack():
    prompt = build_user_prompt("Société Générale", "", "", "")
    assert "whatToSell" in prompt
    assert '"stack"' in prompt
    # The truncation guard must survive edits — it's why this is scoped to major entities.
    assert "longue traine" in prompt.lower() or "longue traîne" in prompt.lower()


def test_entity_model_round_trips_what_to_sell():
    # Alias (LLM shape) in → snake attribute → alias out.
    e = EntityExhaustive.model_validate(
        {"name": "GBIS", "whatToSell": ["dev quant", "cloud"], "stack": ["java", "c++"]},
    )
    assert e.what_to_sell == ["dev quant", "cloud"]
    assert e.stack == ["java", "c++"]
    assert e.model_dump(by_alias=True)["whatToSell"] == ["dev quant", "cloud"]


def test_entity_defaults_empty_when_absent():
    e = EntityExhaustive.model_validate({"name": "SCI du Coin"})
    assert e.what_to_sell == []
    assert e.stack == []


def test_facts_output_preserves_what_to_sell_through_alias():
    facts = ResearchFacts.model_validate(
        {"entitiesExhaustive": [{"name": "BoursoBank", "whatToSell": ["mobile", "anti-fraude"], "stack": ["kotlin"]}]},
    )
    dumped = facts.model_dump(by_alias=True)
    assert dumped["entitiesExhaustive"][0]["whatToSell"] == ["mobile", "anti-fraude"]
    assert dumped["entitiesExhaustive"][0]["stack"] == ["kotlin"]


def test_prioritization_preserves_what_to_sell():
    # assign_priority_tiers copies each entity — the LLM's what-to-sell must ride
    # through untouched next to the computed tier/zone.
    tiered = assign_priority_tiers(
        [{"name": "GBIS", "type": "filiale", "whatToSell": ["dev quant"], "stack": ["java", "quant"]}],
    )
    assert tiered[0]["whatToSell"] == ["dev quant"]
    assert tiered[0]["stack"] == ["java", "quant"]
    assert tiered[0]["priorityTier"] == "P1"  # computed field added alongside
