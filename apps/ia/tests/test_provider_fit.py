"""#2975 (#2440.74-80) — le routage fournisseur VÉRIFIE avant de router.

Sept vérifications (capacité, outils, multimodal, contexte, coût, conformité,
santé). Chacune rend ``ok``, ``failed`` ou ``not_evaluated`` — une donnée
absente ne passe JAMAIS pour « ok » : elle se nomme ``not_evaluated``.
Seul ``failed`` bloque ; le repli est Anthropic, annoncé, jamais silencieux.
"""

from __future__ import annotations

import logging

import pytest

from app.services import llm_gateway
from app.services.provider_fit import (
    RoutingRequirements,
    check_provider_fit,
)


def _status(verdict, name):
    return next(check.status for check in verdict.checks if check.name == name)


def test_no_requirement_declared_means_every_check_is_ok_or_not_evaluated_never_failed():
    verdict = check_provider_fit("openai", "gpt-4o", RoutingRequirements())
    assert verdict.fit is True
    assert {c.name for c in verdict.checks} == {
        "capability", "tools", "multimodal", "context", "cost", "compliance", "health",
    }
    assert all(c.status in {"ok", "not_evaluated"} for c in verdict.checks)


def test_context_window_too_small_fails_and_names_the_numbers():
    req = RoutingRequirements(estimated_input_tokens=150_000, max_output_tokens=4_000)
    verdict = check_provider_fit("openai", "gpt-4o", req)
    assert verdict.fit is False
    assert verdict.failed == ("context",)
    assert "128000" in next(c.detail for c in verdict.checks if c.name == "context")


def test_context_fits_a_larger_window():
    req = RoutingRequirements(estimated_input_tokens=150_000, max_output_tokens=4_000)
    assert check_provider_fit("openai", "gpt-4.1", req).fit is True


def test_unknown_model_window_is_not_evaluated_not_guessed():
    req = RoutingRequirements(estimated_input_tokens=900_000)
    verdict = check_provider_fit("openai", "gpt-5.6-luna", req)
    assert _status(verdict, "context") == "not_evaluated"
    assert verdict.fit is True


def test_tools_required_but_unknown_provider_profile_is_not_evaluated():
    verdict = check_provider_fit("mistral", "x", RoutingRequirements(needs_tools=True))
    assert _status(verdict, "tools") == "not_evaluated"


def test_tools_and_multimodal_required_and_supported_are_ok():
    verdict = check_provider_fit("openai", "gpt-4o", RoutingRequirements(needs_tools=True, needs_multimodal=True))
    assert _status(verdict, "tools") == "ok"
    assert _status(verdict, "multimodal") == "ok"


def test_cost_cap_fails_above_and_passes_below():
    over = check_provider_fit("openai", "gpt-4o", RoutingRequirements(max_output_usd_per_mtok=5.0), output_usd_per_mtok=10.0)
    assert over.failed == ("cost",)
    under = check_provider_fit("openai", "gpt-4o", RoutingRequirements(max_output_usd_per_mtok=12.0), output_usd_per_mtok=10.0)
    assert _status(under, "cost") == "ok"


def test_cost_cap_with_unpriced_model_is_not_evaluated():
    verdict = check_provider_fit("openai", "gpt-x", RoutingRequirements(max_output_usd_per_mtok=1.0), output_usd_per_mtok=None)
    assert _status(verdict, "cost") == "not_evaluated"
    assert verdict.fit is True


def test_compliance_list_absent_is_not_evaluated_present_is_enforced():
    assert _status(check_provider_fit("openai", "gpt-4o", RoutingRequirements()), "compliance") == "not_evaluated"
    blocked = check_provider_fit("openai", "gpt-4o", RoutingRequirements(cleared_providers=frozenset({"anthropic"})))
    assert blocked.failed == ("compliance",)
    cleared = check_provider_fit("openai", "gpt-4o", RoutingRequirements(cleared_providers=frozenset({"openai"})))
    assert _status(cleared, "compliance") == "ok"


def test_health_fails_after_consecutive_runtime_failures():
    assert check_provider_fit("openai", "gpt-4o", RoutingRequirements(), runtime_failure_streak=2).fit is True
    verdict = check_provider_fit("openai", "gpt-4o", RoutingRequirements(), runtime_failure_streak=3)
    assert verdict.failed == ("health",)


# ── Le branchement : resolve_dispatch ──────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    llm_gateway.reset_degraded_route_streak()
    llm_gateway.reset_runtime_failure_streak()
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("LLM_ROUTE_CLASSIFY", "openai:gpt-4o")
    monkeypatch.delenv("LLM_PROVIDER_CLEARED", raising=False)
    monkeypatch.setattr(llm_gateway.OPENAI_PROVIDER, "is_available", lambda: True)
    yield
    llm_gateway.reset_runtime_failure_streak()


def test_dispatch_without_requirements_is_byte_identical():
    provider, model = llm_gateway.resolve_dispatch("classify", "claude-x")
    assert (provider.name, model) == ("openai", "gpt-4o")


def test_dispatch_with_fitting_requirements_keeps_the_route():
    provider, _ = llm_gateway.resolve_dispatch(
        "classify", "claude-x", requirements=RoutingRequirements(estimated_input_tokens=1_000)
    )
    assert provider.name == "openai"


def test_dispatch_falls_back_to_anthropic_and_announces_which_check_failed(caplog):
    caplog.set_level(logging.WARNING)
    provider, model = llm_gateway.resolve_dispatch(
        "classify", "claude-x", requirements=RoutingRequirements(estimated_input_tokens=200_000)
    )
    assert (provider.name, model) == ("anthropic", "claude-x")
    assert "context" in caplog.text


def test_dispatch_compliance_list_from_env_blocks_an_uncleared_provider(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER_CLEARED", "anthropic")
    provider, _ = llm_gateway.resolve_dispatch("classify", "claude-x", requirements=llm_gateway.default_requirements())
    assert provider.name == "anthropic"


def test_runtime_failures_open_health_then_success_closes_it():
    for _ in range(3):
        llm_gateway.record_runtime_failure("openai")
    provider, _ = llm_gateway.resolve_dispatch("classify", "claude-x", requirements=llm_gateway.default_requirements())
    assert provider.name == "anthropic"
    llm_gateway.record_runtime_success("openai")
    provider, _ = llm_gateway.resolve_dispatch("classify", "claude-x", requirements=llm_gateway.default_requirements())
    assert provider.name == "openai"


def test_health_cools_down_so_a_benched_provider_is_retried(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(llm_gateway.time, "monotonic", lambda: clock[0])
    for _ in range(3):
        llm_gateway.record_runtime_failure("openai")
    req = llm_gateway.default_requirements()
    assert llm_gateway.resolve_dispatch("classify", "claude-x", requirements=req)[0].name == "anthropic"
    clock[0] += 61.0
    assert llm_gateway.resolve_dispatch("classify", "claude-x", requirements=req)[0].name == "openai"


def test_chat_orchestrator_declares_tools_as_a_requirement_and_obeys_the_fallback(monkeypatch):
    """#2440.75 — l'APPELANT réel : la boucle du copilote exige des outils, et reçoit le repli annoncé."""
    from app.services import chat_orchestrator

    monkeypatch.setenv("ANTHROPIC_API_KEY", "k")
    seen = {}
    real = llm_gateway.resolve_dispatch

    def spy(task, model, requirements=None):
        seen["needs_tools"] = requirements.needs_tools if requirements else None
        return real(task, model, requirements)

    monkeypatch.setattr(chat_orchestrator.llm_gateway, "resolve_dispatch", spy)
    monkeypatch.setenv("LLM_ROUTE_CHAT", "openai:gpt-4o")
    monkeypatch.setenv("LLM_PROVIDER_CLEARED", "anthropic")
    transport = chat_orchestrator._make_turns(system_prompt="s", max_tokens=100)
    assert seen["needs_tools"] is True
    assert isinstance(transport, chat_orchestrator._AnthropicTurns)
