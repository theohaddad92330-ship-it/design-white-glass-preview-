"""Tests for AgentError adapters.

One test (or parameter) per code listed in the registry §5 of
``agent_docs/agent-contract.md`` to make sure no code is silently dropped on a
future refactor.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import anthropic
import httpx
import pytest

from app.models.agent_envelope import AgentError, ErrorService, ErrorSeverity
from app.models.agent_error_adapters import (
    agent_error_from_anthropic_exception,
    agent_error_invalid_json,
)
from app.services.claude_service import ClaudeError, ClaudeIncompleteOutputError
from app.services.firecrawl import (
    ERROR_CODE_AUTH_FAILED,
    ERROR_CODE_FIRECRAWL_INTERNAL,
    ERROR_CODE_FIRECRAWL_UNKNOWN,
    ERROR_CODE_INSUFFICIENT_CREDITS,
    ERROR_CODE_RATE_LIMITED,
    ERROR_CODE_WEBSITE_BLOCKED,
    FirecrawlScrapeError,
)


# ── from_claude_error ───────────────────────────────────────────────────────


class TestFromClaudeError:
    def test_truncated_output(self) -> None:
        exc = ClaudeIncompleteOutputError(
            prompt_name="bellum_research",
            model="claude-sonnet-4-20250514",
            max_tokens=16000,
        )
        err = AgentError.from_claude_error(exc)
        assert err.code == "CLAUDE_OUTPUT_TRUNCATED"
        assert err.service == ErrorService.CLAUDE
        assert err.severity == ErrorSeverity.TERMINAL
        assert err.retryable is False
        assert "tronquée" in err.user_message
        # Subclass attributes lifted into context for downstream alerting.
        assert err.context == {
            "prompt_name": "bellum_research",
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 16000,
        }

    def test_base_claude_error_maps_to_unknown(self) -> None:
        exc = ClaudeError("boom")
        err = AgentError.from_claude_error(exc)
        assert err.code == "CLAUDE_UNKNOWN"
        assert err.severity == ErrorSeverity.TERMINAL
        assert err.retryable is False

    def test_extra_context_is_merged(self) -> None:
        exc = ClaudeIncompleteOutputError(
            prompt_name="p", model="m", max_tokens=1
        )
        err = AgentError.from_claude_error(exc, context={"correlation_id": "abc"})
        assert err.context is not None
        assert err.context["correlation_id"] == "abc"
        assert err.context["prompt_name"] == "p"


# ── from_firecrawl_error ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw_code", "expected_code", "expected_severity", "expected_retryable"),
    [
        (
            ERROR_CODE_INSUFFICIENT_CREDITS,
            "FIRECRAWL_INSUFFICIENT_CREDITS",
            ErrorSeverity.TERMINAL,
            False,
        ),
        (
            ERROR_CODE_AUTH_FAILED,
            "FIRECRAWL_AUTH_FAILED",
            ErrorSeverity.TERMINAL,
            False,
        ),
        (
            ERROR_CODE_RATE_LIMITED,
            "FIRECRAWL_RATE_LIMITED",
            ErrorSeverity.RECOVERABLE,
            True,
        ),
        (
            ERROR_CODE_WEBSITE_BLOCKED,
            "FIRECRAWL_WEBSITE_BLOCKED",
            ErrorSeverity.RECOVERABLE,
            True,
        ),
        (
            ERROR_CODE_FIRECRAWL_INTERNAL,
            "FIRECRAWL_INTERNAL",
            ErrorSeverity.RECOVERABLE,
            True,
        ),
        (
            ERROR_CODE_FIRECRAWL_UNKNOWN,
            "FIRECRAWL_UNKNOWN",
            ErrorSeverity.TERMINAL,
            False,
        ),
    ],
)
def test_from_firecrawl_error_maps_each_code(
    raw_code: str,
    expected_code: str,
    expected_severity: ErrorSeverity,
    expected_retryable: bool,
) -> None:
    exc = FirecrawlScrapeError(raw_code, url="https://example.com", details="api 402")
    err = AgentError.from_firecrawl_error(exc)
    assert err.code == expected_code
    assert err.service == ErrorService.FIRECRAWL
    assert err.severity == expected_severity
    assert err.retryable is expected_retryable
    assert err.context is not None
    assert err.context["url"] == "https://example.com"
    assert err.context["details"] == "api 402"


def test_unknown_raw_firecrawl_code_falls_back_to_unknown() -> None:
    exc = FirecrawlScrapeError("SOMETHING_ELSE", url="", details="")
    err = AgentError.from_firecrawl_error(exc)
    assert err.code == "FIRECRAWL_UNKNOWN"
    assert err.severity == ErrorSeverity.TERMINAL


# ── from_unexpected ─────────────────────────────────────────────────────────


def test_from_unexpected_maps_to_internal() -> None:
    err = AgentError.from_unexpected(
        ValueError("bad input"), agent_name="researcher"
    )
    assert err.code == "AGENT_INTERNAL"
    assert err.service == ErrorService.INTERNAL
    assert err.severity == ErrorSeverity.TERMINAL
    assert err.retryable is False
    assert "ValueError" in err.debug_message
    assert err.context is not None
    assert err.context["agent_name"] == "researcher"
    assert err.context["exception_type"] == "ValueError"


# ── anthropic adapter (covers CLAUDE_RATE_LIMITED, CLAUDE_API_ERROR) ────────


def _fake_anthropic_response(status_code: int) -> httpx.Response:
    """anthropic exceptions need a real httpx.Response for construction."""
    return httpx.Response(
        status_code=status_code,
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"),
    )


def test_anthropic_rate_limit() -> None:
    exc = anthropic.RateLimitError(
        message="429",
        response=_fake_anthropic_response(429),
        body=None,
    )
    err = agent_error_from_anthropic_exception(
        exc, prompt_name="bellum_research", model="claude-sonnet-4"
    )
    assert err.code == "CLAUDE_RATE_LIMITED"
    assert err.severity == ErrorSeverity.RECOVERABLE
    assert err.retryable is True


def test_anthropic_5xx_maps_to_api_error() -> None:
    exc = anthropic.InternalServerError(
        message="boom",
        response=_fake_anthropic_response(500),
        body=None,
    )
    err = agent_error_from_anthropic_exception(exc)
    assert err.code == "CLAUDE_API_ERROR"
    assert err.severity == ErrorSeverity.RECOVERABLE
    assert err.retryable is True


def test_anthropic_4xx_other_than_429_terminal() -> None:
    exc = anthropic.BadRequestError(
        message="bad",
        response=_fake_anthropic_response(400),
        body=None,
    )
    err = agent_error_from_anthropic_exception(exc)
    assert err.code == "CLAUDE_UNKNOWN"
    assert err.severity == ErrorSeverity.TERMINAL
    assert err.retryable is False


def test_anthropic_connection_error_is_recoverable() -> None:
    exc = anthropic.APIConnectionError(
        message="conn refused",
        request=httpx.Request(
            "POST", "https://api.anthropic.com/v1/messages"
        ),
    )
    err = agent_error_from_anthropic_exception(exc)
    assert err.code == "CLAUDE_API_ERROR"
    assert err.severity == ErrorSeverity.RECOVERABLE


# ── invalid_json helper (covers CLAUDE_INVALID_JSON) ────────────────────────


def test_invalid_json_helper() -> None:
    err = agent_error_invalid_json(
        prompt_name="bellum_research",
        model="claude-sonnet-4",
        details="trailing comma at offset 1234",
    )
    assert err.code == "CLAUDE_INVALID_JSON"
    assert err.severity == ErrorSeverity.TERMINAL
    assert err.retryable is False
    assert "invalide" in err.user_message


# ── Cause chain ─────────────────────────────────────────────────────────────


class TestCauseChain:
    def test_cause_is_lifted_when_present(self) -> None:
        inner = ValueError("inner boom")
        outer = ClaudeIncompleteOutputError(
            prompt_name="p", model="m", max_tokens=1
        )
        outer.__cause__ = inner
        err = AgentError.from_claude_error(outer)
        assert err.cause is not None
        assert err.cause.code == "AGENT_INTERNAL"
        assert "ValueError" in err.cause.debug_message

    def test_cause_chain_recurses_on_claude_error(self) -> None:
        inner = ClaudeError("upstream")
        outer = ClaudeIncompleteOutputError(prompt_name="p", model="m", max_tokens=1)
        outer.__cause__ = inner
        err = AgentError.from_claude_error(outer)
        assert err.cause is not None
        assert err.cause.code == "CLAUDE_UNKNOWN"

    def test_cause_chain_is_bounded_to_3_levels(self) -> None:
        """A chain longer than 3 levels truncates without infinite recursion."""
        chain: list[BaseException] = []
        for i in range(5):
            chain.append(ValueError(f"level {i}"))
        for i in range(1, len(chain)):
            chain[i - 1].__cause__ = chain[i]
        # Wrapping the outermost should not raise (no infinite recursion).
        err = AgentError.from_unexpected(chain[0], agent_name="x")
        # And the cause chain has at most depth 3.
        depth = 0
        current: AgentError | None = err.cause
        while current is not None:
            depth += 1
            assert depth <= 3
            current = current.cause


# ── Invariant: every adapter output satisfies retryable ↔ severity ──────────


def test_retryable_matches_severity_invariant_holds_for_every_adapter() -> None:
    """If any adapter ever lies, AgentError's validator will raise — this test
    is the contract enforcement net.
    """
    # ClaudeError
    AgentError.from_claude_error(
        ClaudeIncompleteOutputError(prompt_name="p", model="m", max_tokens=1)
    )
    # Firecrawl
    AgentError.from_firecrawl_error(
        FirecrawlScrapeError(ERROR_CODE_INSUFFICIENT_CREDITS)
    )
    AgentError.from_firecrawl_error(
        FirecrawlScrapeError(ERROR_CODE_RATE_LIMITED)
    )
    # Unexpected
    AgentError.from_unexpected(RuntimeError("x"), agent_name="t")
    # Anthropic
    agent_error_from_anthropic_exception(
        anthropic.RateLimitError(
            message="x", response=_fake_anthropic_response(429), body=None
        )
    )
    # Invalid JSON
    agent_error_invalid_json()
