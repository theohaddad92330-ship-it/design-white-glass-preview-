from __future__ import annotations

import pytest

from app.prompts.bellum_plan import (
    ACTION_PLAN_PHASES,
    build_action_plan_meta_prompt,
    build_action_plan_phase_prompt,
    build_plan_shared_context,
    build_subsection_user_prompt,
)


def test_build_subsection_user_prompt_contains_section_contract() -> None:
    prompt = build_subsection_user_prompt(company_name="SNCF", section="evaluation")
    assert "section 'evaluation'" in prompt
    assert '"evaluation"' in prompt
    # V1-vendable: the model scores per-axis; the /25 + GO/PRUDENT/STOP verdict
    # are recomputed API-side (not emitted by the model).
    assert '"scoreBreakdown"' in prompt
    assert '"fit_offre"' in prompt
    assert "SNCF" in prompt


def test_build_subsection_user_prompt_rejects_unknown_section() -> None:
    with pytest.raises(ValueError, match="Unknown section"):
        build_subsection_user_prompt(company_name="SNCF", section="messages")


def test_build_subsection_user_prompt_never_names_internal_methodology() -> None:
    """#206.7 — Laura ne récite jamais le nom d'une méthodologie commerciale
    interne : aucune section du prompt envoyé au modèle ne doit la citer."""
    for section in ("evaluation", "offers", "action_plan", "quick_wins", "competitive_strategy"):
        prompt = build_subsection_user_prompt(company_name="SNCF", section=section)
        assert "SalesConnect" not in prompt


def test_action_plan_phases_are_the_five_temporal_buckets() -> None:
    assert ACTION_PLAN_PHASES == ("IMMEDIAT", "MOIS 1", "MOIS 2-3", "MOIS 3-6", "MOIS 6-12")


def test_build_action_plan_meta_prompt_asks_only_strategy() -> None:
    prompt = build_action_plan_meta_prompt(company_name="SNCF")
    assert '"strategy"' in prompt
    assert '"justification"' in prompt
    # The meta call must NOT generate phases — that's the whole point of the split.
    assert '"phases"' not in prompt
    assert "SNCF" in prompt


def test_build_action_plan_phase_prompt_targets_one_phase() -> None:
    prompt = build_action_plan_phase_prompt(company_name="SNCF", phase_name="MOIS 2-3")
    assert "MOIS 2-3" in prompt
    assert '"phase"' in prompt
    assert '"actions"' in prompt
    # A single-phase prompt must not re-ask for the full phases array.
    assert '"phases"' not in prompt


def test_build_action_plan_phase_prompt_rejects_unknown_phase() -> None:
    with pytest.raises(ValueError, match="Unknown action-plan phase"):
        build_action_plan_phase_prompt(company_name="SNCF", phase_name="ANNEE 2")


def test_shared_context_includes_relationship_and_adapt_instruction() -> None:
    ctx = build_plan_shared_context(
        "SNCF", "{}", "[]", "Client existant depuis 2022, opportunité ouverte sur la data."
    )
    assert "RELATION ESN" in ctx
    assert "Client existant depuis 2022" in ctx
    assert "ADAPTE" in ctx  # the approach-adaptation instruction
    # No relationship → no relationship block (back-compat with the 3-arg call).
    assert "RELATION ESN" not in build_plan_shared_context("SNCF", "{}", "[]")


def test_shared_context_carries_account_and_contacts() -> None:
    # The big block that moves into the cached system prompt — NOT into each
    # per-section user prompt.
    ctx = build_plan_shared_context("SNCF", '{"sector":"Transport"}', '[{"fullName":"Jean Dupont"}]')
    assert "SNCF" in ctx
    assert "Transport" in ctx
    assert "Jean Dupont" in ctx
    # And the user prompts must no longer carry it.
    assert "Transport" not in build_subsection_user_prompt(company_name="SNCF", section="offers")
