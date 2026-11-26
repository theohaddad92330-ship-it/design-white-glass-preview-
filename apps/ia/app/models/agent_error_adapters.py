"""Adapters from existing typed exceptions to :class:`AgentError`.

Lives in ``app/models/`` so the contract layer (``agent_envelope.py``) can stay
free of service-layer imports. Tests in ``tests/test_agent_error_adapters.py``
cover every code listed in ``agent_docs/agent-contract.md`` §5.
"""

from __future__ import annotations

from typing import Any, Optional

from app.models.agent_envelope import AgentError, ErrorService, ErrorSeverity

# Late imports so this module is safe to import from places that don't need
# the full anthropic / firecrawl SDK transitively. The adapters need the types
# at runtime so they're imported eagerly here.
from app.services.claude_service import (
    ClaudeError,
    ClaudeIncompleteOutputError,
)
from app.services.firecrawl import (
    ERROR_CODE_AUTH_FAILED,
    ERROR_CODE_FIRECRAWL_INTERNAL,
    ERROR_CODE_FIRECRAWL_UNKNOWN,
    ERROR_CODE_INSUFFICIENT_CREDITS,
    ERROR_CODE_RATE_LIMITED,
    ERROR_CODE_WEBSITE_BLOCKED,
    FirecrawlScrapeError,
)


# ── Internal helpers ────────────────────────────────────────────────────────


def _severity_to_retryable(severity: ErrorSeverity) -> bool:
    return severity == ErrorSeverity.RECOVERABLE


def _wrap_cause(exc: BaseException, *, depth: int) -> Optional[AgentError]:
    """Wrap exc.__cause__ / exc.__context__ as an AgentError, max ``depth`` levels.

    The chain is bounded (default 3 in callers) to keep payloads from exploding
    when an exception is re-raised many times. Self-referencing chains are
    detected and stopped.
    """
    if depth <= 0:
        return None
    cause = getattr(exc, "__cause__", None) or getattr(exc, "__context__", None)
    if cause is None or cause is exc:
        return None
    if isinstance(cause, ClaudeError):
        return AgentError.from_claude_error(cause, _depth=depth - 1)  # type: ignore[arg-type]
    if isinstance(cause, FirecrawlScrapeError):
        return AgentError.from_firecrawl_error(cause, _depth=depth - 1)  # type: ignore[arg-type]
    # Generic catch-all for everything else in the chain.
    return AgentError(
        code="AGENT_INTERNAL",
        service=ErrorService.INTERNAL,
        severity=ErrorSeverity.TERMINAL,
        retryable=False,
        user_message="Erreur interne sous-jacente.",
        debug_message=f"{type(cause).__name__}: {cause}",
    )


def _claude_subclass_to_code(exc: ClaudeError) -> tuple[str, ErrorSeverity]:
    """Map a ClaudeError subclass to its registry code + severity.

    All known ClaudeError subclasses are ``terminal`` today (truncated output
    and the catch-all ``CLAUDE_UNKNOWN``). The other Claude codes
    (``CLAUDE_RATE_LIMITED``, ``CLAUDE_API_ERROR``, ``CLAUDE_INVALID_JSON``)
    are produced from raw anthropic SDK exceptions via
    :meth:`AgentError.from_anthropic_exception` (added below).
    """
    if isinstance(exc, ClaudeIncompleteOutputError):
        return "CLAUDE_OUTPUT_TRUNCATED", ErrorSeverity.TERMINAL
    return "CLAUDE_UNKNOWN", ErrorSeverity.TERMINAL


# Firecrawl service codes are unprefixed (``RATE_LIMITED`` etc.). The registry
# uses ``FIRECRAWL_`` prefixes. This table is the single bridge.
_FIRECRAWL_CODE_MAP: dict[str, tuple[str, ErrorSeverity]] = {
    ERROR_CODE_INSUFFICIENT_CREDITS: (
        "FIRECRAWL_INSUFFICIENT_CREDITS",
        ErrorSeverity.TERMINAL,
    ),
    ERROR_CODE_AUTH_FAILED: ("FIRECRAWL_AUTH_FAILED", ErrorSeverity.TERMINAL),
    ERROR_CODE_RATE_LIMITED: ("FIRECRAWL_RATE_LIMITED", ErrorSeverity.RECOVERABLE),
    ERROR_CODE_WEBSITE_BLOCKED: (
        "FIRECRAWL_WEBSITE_BLOCKED",
        ErrorSeverity.RECOVERABLE,
    ),
    ERROR_CODE_FIRECRAWL_INTERNAL: ("FIRECRAWL_INTERNAL", ErrorSeverity.RECOVERABLE),
    ERROR_CODE_FIRECRAWL_UNKNOWN: ("FIRECRAWL_UNKNOWN", ErrorSeverity.TERMINAL),
}


# ── Public adapters — bound to AgentError as classmethods ───────────────────


def _from_claude_error(
    cls: type[AgentError],
    exc: ClaudeError,
    *,
    context: Optional[dict] = None,
    _depth: int = 3,
) -> AgentError:
    code, severity = _claude_subclass_to_code(exc)
    ctx: dict[str, Any] = dict(context or {})
    # Lift typed subclass attributes into context so downstream alerting can
    # tag by prompt / model without parsing the debug_message.
    for attr in ("prompt_name", "model", "max_tokens"):
        if hasattr(exc, attr):
            ctx.setdefault(attr, getattr(exc, attr))
    return cls(
        code=code,
        service=ErrorService.CLAUDE,
        severity=severity,
        retryable=_severity_to_retryable(severity),
        user_message=exc.user_message,
        debug_message=str(exc) or f"{type(exc).__name__}",
        cause=_wrap_cause(exc, depth=_depth),
        context=ctx or None,
    )


def _from_firecrawl_error(
    cls: type[AgentError],
    exc: FirecrawlScrapeError,
    *,
    context: Optional[dict] = None,
    _depth: int = 3,
) -> AgentError:
    code, severity = _FIRECRAWL_CODE_MAP.get(
        exc.code, ("FIRECRAWL_UNKNOWN", ErrorSeverity.TERMINAL)
    )
    ctx: dict[str, Any] = dict(context or {})
    if exc.url:
        ctx.setdefault("url", exc.url)
    if exc.details:
        ctx.setdefault("details", exc.details)
    return cls(
        code=code,
        service=ErrorService.FIRECRAWL,
        severity=severity,
        retryable=_severity_to_retryable(severity),
        user_message=exc.user_message,
        debug_message=str(exc),
        cause=_wrap_cause(exc, depth=_depth),
        context=ctx or None,
    )


def _from_unexpected(
    cls: type[AgentError],
    exc: BaseException,
    *,
    agent_name: str,
    _depth: int = 3,
) -> AgentError:
    """Catch-all for un-typed exceptions. Always maps to ``AGENT_INTERNAL``.

    Use at the boundary of an agent's ``run()`` method to make sure no raw
    exception escapes the envelope.
    """
    return cls(
        code="AGENT_INTERNAL",
        service=ErrorService.INTERNAL,
        severity=ErrorSeverity.TERMINAL,
        retryable=False,
        user_message="Erreur interne. L'équipe a été notifiée.",
        debug_message=f"{type(exc).__name__}: {exc}",
        cause=_wrap_cause(exc, depth=_depth),
        context={
            "agent_name": agent_name,
            "exception_type": type(exc).__name__,
        },
    )


# Bind the adapters as classmethods on AgentError so callers can write the
# natural ``AgentError.from_claude_error(exc)`` form. We do this here (in the
# adapters module) so ``agent_envelope.py`` stays decoupled from
# ``claude_service`` / ``firecrawl`` imports.
AgentError.from_claude_error = classmethod(_from_claude_error)  # type: ignore[attr-defined]
AgentError.from_firecrawl_error = classmethod(_from_firecrawl_error)  # type: ignore[attr-defined]
AgentError.from_unexpected = classmethod(_from_unexpected)  # type: ignore[attr-defined]


# ── Anthropic SDK exception adapter ─────────────────────────────────────────
#
# Not part of the DoD's 3 named helpers but completes coverage of the Claude
# codes (CLAUDE_RATE_LIMITED, CLAUDE_API_ERROR, CLAUDE_INVALID_JSON). Exposed
# as a free function rather than a classmethod since the anthropic exception
# types are not imported by agent_envelope.

import anthropic  # noqa: E402  (intentional: kept close to the function that uses it)


# #4068.1 — libellés sans nom de fournisseur (garde : tests/test_user_messages_no_provider_name.py).
def agent_error_from_anthropic_exception(
    exc: anthropic.APIError,
    *,
    prompt_name: str = "",
    model: str = "",
) -> AgentError:
    """Map a raw anthropic SDK exception to an AgentError.

    Used by ``call_claude`` once the migration happens. Until then, the
    service still raises ``ClaudeError`` subclasses which go through
    ``from_claude_error``.
    """
    ctx = {"prompt_name": prompt_name, "model": model} if (prompt_name or model) else None

    if isinstance(exc, anthropic.RateLimitError):
        return AgentError(
            code="CLAUDE_RATE_LIMITED",
            service=ErrorService.CLAUDE,
            severity=ErrorSeverity.RECOVERABLE,
            retryable=True,
            user_message="Surcharge temporaire du modèle d'IA. Nouvelle tentative en cours.",
            debug_message=str(exc),
            context=ctx,
        )
    if isinstance(exc, (anthropic.APIConnectionError, anthropic.APIStatusError)) and getattr(exc, "status_code", 500) >= 500:
        return AgentError(
            code="CLAUDE_API_ERROR",
            service=ErrorService.CLAUDE,
            severity=ErrorSeverity.RECOVERABLE,
            retryable=True,
            user_message="Erreur transitoire du modèle d'IA. Nouvelle tentative en cours.",
            debug_message=str(exc),
            context=ctx,
        )
    # 4xx other than 429 → terminal CLAUDE_UNKNOWN (no specific code in the registry).
    return AgentError(
        code="CLAUDE_UNKNOWN",
        service=ErrorService.CLAUDE,
        severity=ErrorSeverity.TERMINAL,
        retryable=False,
        user_message="Erreur inattendue du modèle d'IA. L'équipe a été notifiée.",
        debug_message=str(exc),
        context=ctx,
    )


def agent_error_invalid_json(
    *, prompt_name: str = "", model: str = "", details: str = ""
) -> AgentError:
    """Constructor for ``CLAUDE_INVALID_JSON`` — Claude returned a 200 but the
    JSON couldn't be parsed even after instructor's retry budget. No native
    exception type covers this case, so the caller builds the AgentError
    directly via this helper to stay in registry.
    """
    return AgentError(
        code="CLAUDE_INVALID_JSON",
        service=ErrorService.CLAUDE,
        severity=ErrorSeverity.TERMINAL,
        retryable=False,
        user_message="Le modèle d'IA a renvoyé une réponse invalide. L'équipe a été notifiée.",
        debug_message=f"Invalid JSON after instructor retries: {details or '<no detail>'}",
        context={"prompt_name": prompt_name, "model": model} if (prompt_name or model) else None,
    )
