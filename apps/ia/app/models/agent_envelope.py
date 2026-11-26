"""Agent orchestration envelope — see ``agent_docs/agent-contract.md``.

Canonical wire format for every agent's output. Mirrored 1:1 by the Zod schema in
``packages/contracts/src/schemas/agent-envelope.ts``. A parity fixture lives at
``agent_docs/agent-contract.fixtures.json`` and is parsed by both sides in CI.
"""

from __future__ import annotations

from enum import Enum
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field, model_validator

T = TypeVar("T")


class AgentStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    RECOVERABLE_FAILURE = "recoverable_failure"
    TERMINAL_FAILURE = "terminal_failure"
    CANCELLED = "cancelled"


class ErrorService(str, Enum):
    CLAUDE = "claude"
    FIRECRAWL = "firecrawl"
    BRAVE = "brave"
    APOLLO = "apollo"
    PAPPERS = "pappers"
    SUPABASE = "supabase"
    INTERNAL = "internal"
    PRECONDITION = "precondition"


class ErrorSeverity(str, Enum):
    RECOVERABLE = "recoverable"
    TERMINAL = "terminal"


class SourceHealth(str, Enum):
    OK = "ok"
    DEGRADED = "degraded"
    DOWN = "down"
    SKIPPED = "skipped"


class TokenUsage(BaseModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    cost_usd: float = Field(ge=0)
    # C3 prompt-cache: tokens served from / written to the ephemeral cache.
    cache_read_input_tokens: int = Field(default=0, ge=0)
    cache_creation_input_tokens: int = Field(default=0, ge=0)


class AgentWarning(BaseModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]+$")
    message: str = Field(min_length=1)
    context: Optional[dict] = None


class AgentMeta(BaseModel):
    # Identification
    agent_name: str = Field(pattern=r"^[a-z][a-z0-9_]+$")
    agent_version: str = Field(pattern=r"^\d+\.\d+\.\d+$")

    # Traceability
    correlation_id: str = ""
    started_at: str
    finished_at: str
    duration_ms: int = Field(ge=0)

    # LLM (optional)
    prompt_name: Optional[str] = None
    # Reproducibility (Théo p.15): the versioned content hash of the prompt this
    # agent ran, from the prompt registry — so an agent's output is auditable /
    # replayable the same way an analysis run stamps its prompt_versions.
    prompt_version: Optional[str] = None
    model: Optional[str] = None
    token_usage: Optional[TokenUsage] = None

    # External sources (optional)
    source_health: Optional[dict[str, SourceHealth]] = None

    # Retry (optional, only if the agent does its own retry — distinct from BullMQ)
    retry_count: Optional[int] = Field(default=None, ge=0)

    # Warnings (only when status == partial_success)
    warnings: Optional[list[AgentWarning]] = None


class AgentError(BaseModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]+$")
    service: ErrorService
    severity: ErrorSeverity
    retryable: bool
    user_message: str = Field(min_length=1)
    debug_message: str = Field(min_length=1)
    cause: Optional["AgentError"] = None
    context: Optional[dict] = None

    @model_validator(mode="after")
    def _retryable_matches_severity(self) -> "AgentError":
        expected = self.severity == ErrorSeverity.RECOVERABLE
        if self.retryable != expected:
            raise ValueError(
                f"retryable={self.retryable} contradicts severity={self.severity.value}; "
                "they MUST match per contract (see agent_docs/agent-contract.md §4)."
            )
        return self


class AgentEnvelope(BaseModel, Generic[T]):
    """Canonical output of any BellumAI agent.

    Invariants enforced by ``_check_status_data_error_invariant``:

    * ``success`` / ``partial_success`` → ``data`` set, ``error`` null
    * ``recoverable_failure`` / ``terminal_failure`` → ``data`` null, ``error`` set
    * ``cancelled`` → both ``data`` and ``error`` null
    """

    status: AgentStatus
    data: Optional[T] = None
    error: Optional[AgentError] = None
    meta: AgentMeta

    @model_validator(mode="after")
    def _check_status_data_error_invariant(self) -> "AgentEnvelope[T]":
        s = self.status
        has_data = self.data is not None
        has_error = self.error is not None

        success_like = s in (AgentStatus.SUCCESS, AgentStatus.PARTIAL_SUCCESS)
        failure_like = s in (
            AgentStatus.RECOVERABLE_FAILURE,
            AgentStatus.TERMINAL_FAILURE,
        )

        if success_like and (not has_data or has_error):
            raise ValueError(
                f"status={s.value}: data MUST be set and error MUST be null"
            )
        if failure_like and (has_data or not has_error):
            raise ValueError(
                f"status={s.value}: data MUST be null and error MUST be set"
            )
        if s == AgentStatus.CANCELLED and (has_data or has_error):
            raise ValueError("status=cancelled: both data and error MUST be null")

        # When status == partial_success, warnings MUST be present and non-empty.
        if s == AgentStatus.PARTIAL_SUCCESS:
            warnings = self.meta.warnings or []
            if not warnings:
                raise ValueError(
                    "status=partial_success requires meta.warnings to be non-empty"
                )

        return self


AgentError.model_rebuild()
