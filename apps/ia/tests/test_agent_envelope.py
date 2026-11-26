"""Pydantic side of the agent envelope contract.

Loads ``agent_docs/agent-contract.fixtures.json`` and asserts that every
``valid`` payload parses without error and every ``invalid`` payload raises
``ValidationError``. The TS test ``packages/contracts/src/schemas/agent-envelope.test.ts``
reads the same file and runs the same assertions on the Zod side — parity comes
from a shared fixture, not from duplicated test cases.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.agent_envelope import (
    AgentEnvelope,
    AgentError,
    AgentMeta,
    AgentStatus,
    AgentWarning,
    ErrorService,
    ErrorSeverity,
    TokenUsage,
)


FIXTURES_PATH = (
    Path(__file__).resolve().parents[3]
    / "agent_docs"
    / "agent-contract.fixtures.json"
)


@pytest.fixture(scope="module")
def fixtures() -> dict:
    return json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))


# ── Round-trip parity against the shared fixture ────────────────────────────


class TestFixtureParityValid:
    """Each ``valid`` fixture must parse cleanly via Pydantic."""

    @pytest.mark.parametrize(
        "fixture_key",
        [
            "success",
            "partial_success",
            "recoverable_failure",
            "terminal_failure",
            "cancelled",
        ],
    )
    def test_valid_fixture_parses(self, fixtures: dict, fixture_key: str) -> None:
        payload = fixtures["valid"][fixture_key]
        envelope = AgentEnvelope.model_validate(payload)
        assert envelope.status.value == fixture_key

    def test_roundtrip_is_lossless(self, fixtures: dict) -> None:
        """Serializing then re-parsing yields an equivalent object."""
        payload = fixtures["valid"]["success"]
        envelope = AgentEnvelope.model_validate(payload)
        roundtrip = AgentEnvelope.model_validate(
            json.loads(envelope.model_dump_json())
        )
        assert roundtrip.meta.agent_name == envelope.meta.agent_name
        assert roundtrip.status == envelope.status


class TestFixtureParityInvalid:
    """Each ``invalid`` fixture must be rejected by Pydantic."""

    @pytest.mark.parametrize(
        "fixture_key",
        [
            "success_without_data",
            "failure_with_data",
            "retryable_mismatches_severity",
            "partial_success_without_warnings",
            "cancelled_with_error",
            "agent_name_bad_case",
            "version_not_semver",
        ],
    )
    def test_invalid_fixture_is_rejected(
        self, fixtures: dict, fixture_key: str
    ) -> None:
        payload = fixtures["invalid"][fixture_key]["envelope"]
        with pytest.raises(ValidationError):
            AgentEnvelope.model_validate(payload)


# ── Direct invariant tests (independent from the fixture) ───────────────────


def _base_meta(**overrides) -> dict:
    meta = {
        "agent_name": "researcher",
        "agent_version": "1.0.0",
        "correlation_id": "test",
        "started_at": "2026-05-26T10:00:00.000Z",
        "finished_at": "2026-05-26T10:00:01.000Z",
        "duration_ms": 1000,
    }
    meta.update(overrides)
    return meta


def _base_error() -> dict:
    return {
        "code": "CLAUDE_UNKNOWN",
        "service": "claude",
        "severity": "terminal",
        "retryable": False,
        "user_message": "Erreur Claude inattendue.",
        "debug_message": "boom",
    }


class TestStatusDataErrorInvariant:
    def test_success_requires_data(self) -> None:
        with pytest.raises(ValidationError):
            AgentEnvelope.model_validate(
                {
                    "status": "success",
                    "data": None,
                    "error": None,
                    "meta": _base_meta(),
                }
            )

    def test_success_forbids_error(self) -> None:
        with pytest.raises(ValidationError):
            AgentEnvelope.model_validate(
                {
                    "status": "success",
                    "data": {"ok": True},
                    "error": _base_error(),
                    "meta": _base_meta(),
                }
            )

    def test_terminal_failure_forbids_data(self) -> None:
        with pytest.raises(ValidationError):
            AgentEnvelope.model_validate(
                {
                    "status": "terminal_failure",
                    "data": {"ok": True},
                    "error": _base_error(),
                    "meta": _base_meta(),
                }
            )

    def test_cancelled_forbids_data_and_error(self) -> None:
        with pytest.raises(ValidationError):
            AgentEnvelope.model_validate(
                {
                    "status": "cancelled",
                    "data": None,
                    "error": _base_error(),
                    "meta": _base_meta(),
                }
            )

    def test_partial_success_requires_warnings(self) -> None:
        with pytest.raises(ValidationError):
            AgentEnvelope.model_validate(
                {
                    "status": "partial_success",
                    "data": {"ok": True},
                    "error": None,
                    "meta": _base_meta(),
                }
            )


class TestRetryableSeverityCoherence:
    def test_terminal_with_retryable_true_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            AgentError.model_validate(
                {
                    "code": "CLAUDE_UNKNOWN",
                    "service": "claude",
                    "severity": "terminal",
                    "retryable": True,
                    "user_message": "x",
                    "debug_message": "y",
                }
            )

    def test_recoverable_with_retryable_false_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            AgentError.model_validate(
                {
                    "code": "CLAUDE_RATE_LIMITED",
                    "service": "claude",
                    "severity": "recoverable",
                    "retryable": False,
                    "user_message": "x",
                    "debug_message": "y",
                }
            )


class TestMetaConstraints:
    def test_agent_name_must_be_snake_case(self) -> None:
        with pytest.raises(ValidationError):
            AgentMeta.model_validate(
                _base_meta(agent_name="Researcher")
            )

    def test_agent_version_must_be_semver(self) -> None:
        with pytest.raises(ValidationError):
            AgentMeta.model_validate(_base_meta(agent_version="1.0"))


class TestErrorCauseChain:
    def test_cause_is_nestable(self) -> None:
        err = AgentError.model_validate(
            {
                "code": "AGENT_INTERNAL",
                "service": "internal",
                "severity": "terminal",
                "retryable": False,
                "user_message": "Erreur interne.",
                "debug_message": "wrapper",
                "cause": {
                    "code": "CLAUDE_UNKNOWN",
                    "service": "claude",
                    "severity": "terminal",
                    "retryable": False,
                    "user_message": "Erreur Claude inattendue.",
                    "debug_message": "inner",
                },
            }
        )
        assert err.cause is not None
        assert err.cause.code == "CLAUDE_UNKNOWN"


# ── Smoke test on the enums to catch silent renames ─────────────────────────


def test_enum_values_match_contract() -> None:
    assert {s.value for s in AgentStatus} == {
        "success",
        "partial_success",
        "recoverable_failure",
        "terminal_failure",
        "cancelled",
    }
    assert {s.value for s in ErrorService} == {
        "claude",
        "firecrawl",
        "brave",
        "apollo",
        "pappers",
        "supabase",
        "internal",
        "precondition",
    }
    assert {s.value for s in ErrorSeverity} == {"recoverable", "terminal"}
