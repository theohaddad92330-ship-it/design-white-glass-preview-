"""Anthropic / Claude — upstream contract.

THIS IS THE TEST THAT WOULD HAVE CAUGHT THE ``temperature`` OUTAGE.

The rule that makes it work: **we do not build a request here.** We call the
production entry point ``claude_service.call_claude`` — the same function the
analysis pipeline calls — and record the bytes that actually go on the wire.
So every parameter production sends (``model``, ``temperature``, ``max_tokens``,
the ``cache_control`` system block, instructor's ``tools`` + ``tool_choice``
with ``disable_parallel_tool_use``) is exercised by construction.

A hand-written "ideal" request would have kept passing right through the
outage, because the pipeline's request and the test's request would have
drifted apart. That drift is the failure mode, so the test refuses to have its
own copy of the parameters.
"""

from __future__ import annotations

import json
from typing import Any

import anthropic
import httpx
import pytest
from pydantic import BaseModel

from app.services import claude_service
from tests.contracts import harness

PROVIDER = "anthropic"

# Deliberately trivial: we are testing the API contract, not the model. Keeps
# the call at a few hundred input tokens and a handful of output tokens.
_SYSTEM = "You are a contract test. Answer with the single word requested."
_USER = "Reply with exactly: ok"


class _Ack(BaseModel):
    """Smallest possible structured-output schema — one required string."""

    answer: str


@pytest.fixture
def wire() -> dict[str, Any]:
    """Records the exact JSON body production sends to /v1/messages."""
    return {}


@pytest.fixture
def recording_anthropic(monkeypatch: pytest.MonkeyPatch, wire: dict[str, Any]) -> None:
    """Make production's own SDK client record its outgoing request body.

    We patch the SDK constructor rather than the request builder: production
    keeps constructing its client exactly as it does in prod, and we only
    inject an httpx client with an event hook. The call is fully real.
    """

    async def _capture(request: httpx.Request) -> None:
        if request.url.path.endswith("/v1/messages"):
            try:
                wire["body"] = json.loads(request.content)
            except ValueError:  # pragma: no cover — body is always JSON
                wire["body"] = {}
            wire["url"] = str(request.url)

    class _Recording(anthropic.AsyncAnthropic):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            timeout = kwargs.get("timeout", 60.0)
            kwargs["http_client"] = httpx.AsyncClient(
                timeout=timeout, event_hooks={"request": [_capture]}
            )
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(claude_service.anthropic, "AsyncAnthropic", _Recording)


def _unwrap(exc: BaseException) -> BaseException:
    """Dig the real provider error out of the wrapper stack.

    This matters more than it looks. In the outage, instructor wrapped
    Anthropic's 400 in ``InstructorRetryException``, tenacity re-wrapped that in
    ``RetryError``, and the pipeline surfaced a generic "research failed" — the
    provider's own one-line explanation ("`temperature` is deprecated for this
    model") never reached a human. Walking ``__cause__``/``__context__`` puts
    that sentence back in the failure message.
    """
    seen: set[int] = set()
    node: BaseException | None = exc
    while node is not None and id(node) not in seen:
        seen.add(id(node))
        if isinstance(node, (anthropic.APIStatusError, anthropic.APIConnectionError)):
            return node
        # tenacity.RetryError carries the failed attempt on .last_attempt
        last_attempt = getattr(node, "last_attempt", None)
        if last_attempt is not None and getattr(last_attempt, "failed", False):
            inner = last_attempt.exception()
            if inner is not None and id(inner) not in seen:
                node = inner
                continue
        node = node.__cause__ or node.__context__
    return exc


async def _call(kind: str, wire: dict[str, Any], **kwargs: Any) -> Any:
    """Run a production Claude call, mapping SDK errors onto the four verdicts."""
    import asyncio

    endpoint = f"POST /v1/messages ({kind})"
    harness.require_env(PROVIDER, endpoint, "ANTHROPIC_API_KEY")

    last: str = ""
    for attempt in range(1, harness._MAX_ATTEMPTS + 1):
        try:
            result, usage = await claude_service.call_claude(
                _SYSTEM, _USER, prompt_name="upstream_contract", **kwargs
            )
            return result, usage, endpoint
        except Exception as raw_exc:  # noqa: BLE001 — classified below
            exc = _unwrap(raw_exc)
            body = wire.get("body") or {}

            if isinstance(exc, anthropic.APIConnectionError):
                last = f"{type(exc).__name__}: {exc}"
            elif isinstance(exc, anthropic.APIStatusError):
                status = getattr(exc, "status_code", 0)
                if status in harness._CREDENTIAL_STATUSES:
                    harness.credentials_rejected(PROVIDER, endpoint, status, str(exc))
                if status == 400:
                    # THE `temperature` SIGNATURE. A 400 on a request built from
                    # production parameters means Anthropic stopped accepting
                    # something the pipeline sends. Name the offending parameter.
                    harness.contract_broken(
                        PROVIDER,
                        endpoint,
                        what=_blame(str(exc), body),
                        expected="Anthropic accepts the parameters the pipeline sends",
                        got="HTTP 400 invalid_request_error",
                        raw=str(exc),
                        request_detail=_describe(body),
                    )
                if status == 404:
                    harness.contract_broken(
                        PROVIDER,
                        endpoint,
                        what=f"model `{claude_service.CLAUDE_MODEL}` no longer exists",
                        expected=f"`{claude_service.CLAUDE_MODEL}` is a served model id",
                        got="HTTP 404 not_found_error",
                        raw=str(exc),
                        request_detail=_describe(body),
                    )
                if status in harness._TRANSIENT_STATUSES:
                    last = f"HTTP {status}: {exc}"
                else:
                    harness.contract_broken(
                        PROVIDER,
                        endpoint,
                        what=f"unexpected HTTP {status} from Anthropic",
                        expected="2xx",
                        got=f"HTTP {status}",
                        raw=str(exc),
                        request_detail=_describe(body),
                    )
            else:
                # Not a provider error at all — a genuine bug on our side.
                raise

        if attempt < harness._MAX_ATTEMPTS:
            await asyncio.sleep(harness._BACKOFF_S[attempt - 1])
    harness.upstream_outage(PROVIDER, endpoint, last)


def _blame(message: str, body: dict[str, Any]) -> str:
    """Point at the request parameter the provider is rejecting."""
    lowered = message.lower()
    for param in ("temperature", "top_p", "top_k", "thinking", "max_tokens", "tool_choice", "system"):
        if param in lowered and param in body:
            return (
                f"Anthropic rejected the `{param}` parameter that the pipeline "
                f"sends (sent {param}={body[param]!r})"
            )
    return "Anthropic rejected the request the pipeline builds"


def _describe(body: dict[str, Any]) -> str:
    if not body:
        return "(request body not captured)"
    keys = {k: body[k] for k in ("model", "temperature", "max_tokens") if k in body}
    extra = [k for k in ("system", "tools", "tool_choice", "thinking") if k in body]
    return f"{keys} + blocks {extra}"


async def test_structured_output_contract(recording_anthropic, wire):
    """The Phase-1 research path: instructor structured output over tool use.

    Exercises model id, temperature, max_tokens, the cached system block, and
    the forced single-tool_use that instructor negotiates.
    """
    result, usage, endpoint = await _call(
        "structured", wire, response_model=_Ack, max_tokens=64
    )

    body = wire.get("body") or {}
    if not body:
        pytest.fail("wire capture failed — the harness could not observe the request")

    # Guard the request surface itself: if production stops sending a parameter
    # this test is claiming to cover, we must notice.
    assert body.get("model") == claude_service.CLAUDE_MODEL
    assert "max_tokens" in body

    if not isinstance(result, _Ack) or not result.answer:
        harness.contract_broken(
            PROVIDER,
            endpoint,
            what="structured output no longer round-trips",
            expected="a validated _Ack with a non-empty `answer`",
            got=repr(result),
            request_detail=_describe(body),
        )
    if usage.input_tokens <= 0:
        harness.contract_broken(
            PROVIDER,
            endpoint,
            what="usage accounting changed",
            expected="usage.input_tokens > 0 (drives run cost metrics)",
            got=f"input_tokens={usage.input_tokens}",
            request_detail=_describe(body),
        )
    harness.ok(
        PROVIDER,
        endpoint,
        f"model={body.get('model')} temperature={body.get('temperature')!r}",
    )


async def test_plain_text_contract(recording_anthropic, wire):
    """The chat / raw path — no instructor, but the same sampling parameters."""
    result, usage, endpoint = await _call("text", wire, max_tokens=32)

    body = wire.get("body") or {}
    if not isinstance(result, str) or not result.strip():
        harness.contract_broken(
            PROVIDER,
            endpoint,
            what="text completion returned no text block",
            expected="a non-empty str assembled from type=='text' blocks",
            got=repr(result),
            request_detail=_describe(body),
        )
    harness.ok(PROVIDER, endpoint, f"{usage.input_tokens} in / {usage.output_tokens} out")


async def test_model_is_served(wire):
    """`CLAUDE_MODEL` still exists on /v1/models — cheapest possible canary."""
    endpoint = "GET /v1/models/{id}"
    (key,) = harness.require_env(PROVIDER, endpoint, "ANTHROPIC_API_KEY")

    p = await harness.probe(
        provider=PROVIDER,
        endpoint=endpoint,
        url=f"https://api.anthropic.com/v1/models/{claude_service.CLAUDE_MODEL}",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
        request_detail=f"model={claude_service.CLAUDE_MODEL} (claude_service.CLAUDE_MODEL)",
    )
    harness.expect_field(p, "id", str, why="claude_service.CLAUDE_MODEL must stay served")
    harness.ok(PROVIDER, endpoint, str(harness.dig(p.payload, "id")))
