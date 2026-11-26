"""Sampling parameters must match what the target model actually accepts.

Two rules, and they pull in opposite directions:

1. On models that still accept sampling params, every LLM call pins
   ``temperature`` — the SDK defaults it to 1.0 when omitted, i.e. max entropy
   on all ~14 prompt families. That is the dominant cause of "two analyses of
   the same company don't agree".

2. On the current frontier models (Sonnet 5, Opus 4.7/4.8, Fable 5) sampling
   parameters were REMOVED: sending a non-default ``temperature`` returns
   ``400 invalid_request_error: 'temperature' is deprecated for this model``.
   That 400 is not degradable — it fails every Claude call, so every analysis
   dies in the research phase within seconds. Sending the param there is an
   outage, not a quality nit.

So the param is model-aware: pinned where it works, omitted where it 400s.
These tests lock both halves in at each dispatch seam.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import BaseModel

from app.services import claude_service


class _Answer(BaseModel):
    value: str = "ok"


def _fake_usage() -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=10,
        output_tokens=5,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    )


class _RecordingMessages:
    """Stands in for ``client.messages`` — records kwargs, returns a canned reply."""

    def __init__(self, calls: list[dict[str, Any]], *, structured: bool) -> None:
        self._calls = calls
        self._structured = structured

    async def create_with_completion(self, **kwargs: Any) -> tuple[Any, Any]:
        self._calls.append(kwargs)
        completion = SimpleNamespace(usage=_fake_usage())
        model = kwargs["response_model"]
        # ``model_construct`` skips validation — the private ``_Envelope`` the dict
        # path builds has a required ``data`` field we don't want to mirror here.
        return model.model_construct(data={}), completion

    async def create(self, **kwargs: Any) -> Any:
        self._calls.append(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="hello", citations=[])],
            usage=_fake_usage(),
        )


def _patch_clients(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")

    def _fake_async_anthropic(**_: Any) -> Any:
        return SimpleNamespace(messages=_RecordingMessages(calls, structured=False))

    def _fake_from_anthropic(_client: Any, **_kw: Any) -> Any:
        return SimpleNamespace(messages=_RecordingMessages(calls, structured=True))

    monkeypatch.setattr(claude_service.anthropic, "AsyncAnthropic", _fake_async_anthropic)
    monkeypatch.setattr(claude_service.anthropic, "Anthropic", _fake_async_anthropic)
    monkeypatch.setattr(claude_service.instructor, "from_anthropic", _fake_from_anthropic)
    return calls


# ── Which models accept sampling params ───────────────────────────────────────


@pytest.mark.parametrize(
    "model",
    [
        "claude-sonnet-5",
        "claude-opus-4-7",
        "claude-opus-4-8",
        "claude-fable-5",
        "claude-mythos-5",
    ],
)
def test_frontier_models_reject_sampling_params(model: str) -> None:
    """These 400 on a non-default ``temperature`` — the param must be omitted."""
    assert claude_service.supports_sampling_params(model) is False
    assert claude_service._sampling_kwargs(model) == {}


@pytest.mark.parametrize(
    "model",
    ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6", "claude-opus-4-5"],
)
def test_legacy_models_accept_sampling_params(model: str) -> None:
    assert claude_service.supports_sampling_params(model) is True
    assert claude_service._sampling_kwargs(model) == {"temperature": 0.0}


def test_unknown_model_omits_sampling_params() -> None:
    """Fail-safe toward availability.

    An unrecognised model is far more likely to be a NEW one (the frontier line
    has removed sampling params and is not bringing them back) than a revived
    legacy one. Guessing "send it" costs a total production outage; guessing
    "omit it" costs determinism on one model. Take the cheaper mistake.
    """
    assert claude_service.supports_sampling_params("claude-something-9") is False
    assert claude_service._sampling_kwargs("claude-something-9") == {}


def test_default_model_is_sampling_free() -> None:
    """Guards the actual production regression: the default model was bumped to
    Sonnet 5 while the pipeline still pinned temperature, 400-ing every run."""
    assert claude_service.supports_sampling_params(claude_service.CLAUDE_MODEL) is False


# ── Each dispatch seam honours the model's contract ───────────────────────────


@pytest.mark.asyncio
async def test_structured_call_omits_temperature_on_default_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _patch_clients(monkeypatch)
    await claude_service.call_claude("sys", "user", response_model=_Answer, prompt_name="t")
    assert calls, "no call recorded"
    assert "temperature" not in calls[0]


@pytest.mark.asyncio
async def test_dict_call_omits_temperature_on_default_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _patch_clients(monkeypatch)
    await claude_service.call_claude("sys", "user", response_model=dict, prompt_name="t")
    assert "temperature" not in calls[0]


@pytest.mark.asyncio
async def test_text_call_omits_temperature_on_default_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _patch_clients(monkeypatch)
    await claude_service.call_claude("sys", "user", response_model=None, prompt_name="t")
    assert "temperature" not in calls[0]


@pytest.mark.asyncio
async def test_citations_call_omits_temperature_on_default_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _patch_clients(monkeypatch)
    await claude_service.call_claude_with_citations(
        "sys", "question", [{"title": "doc", "text": "body"}]
    )
    assert "temperature" not in calls[0]


@pytest.mark.asyncio
async def test_structured_call_pins_temperature_on_a_sampling_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Determinism is still enforced wherever the model allows it — e.g. the
    Haiku profiler path."""
    calls = _patch_clients(monkeypatch)
    await claude_service.call_claude(
        "sys", "user", response_model=_Answer, prompt_name="t", model="claude-haiku-4-5"
    )
    assert calls[0]["temperature"] == 0.0


def test_sync_call_omits_temperature_on_default_model(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")

    class _SyncMessages:
        def create_with_completion(self, **kwargs: Any) -> tuple[Any, Any]:
            calls.append(kwargs)
            return kwargs["response_model"](), SimpleNamespace(usage=_fake_usage())

    monkeypatch.setattr(
        claude_service.anthropic, "Anthropic", lambda **_: SimpleNamespace(messages=None)
    )
    monkeypatch.setattr(
        claude_service.instructor,
        "from_anthropic",
        lambda *_a, **_k: SimpleNamespace(messages=_SyncMessages()),
    )
    claude_service.call_claude_sync("sys", "user", response_model=_Answer, prompt_name="t")
    assert "temperature" not in calls[0]


def test_sync_call_pins_temperature_on_a_sampling_model(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")

    class _SyncMessages:
        def create_with_completion(self, **kwargs: Any) -> tuple[Any, Any]:
            calls.append(kwargs)
            return kwargs["response_model"](), SimpleNamespace(usage=_fake_usage())

    monkeypatch.setattr(
        claude_service.anthropic, "Anthropic", lambda **_: SimpleNamespace(messages=None)
    )
    monkeypatch.setattr(
        claude_service.instructor,
        "from_anthropic",
        lambda *_a, **_k: SimpleNamespace(messages=_SyncMessages()),
    )
    claude_service.call_claude_sync(
        "sys", "user", response_model=_Answer, prompt_name="t", model="claude-haiku-4-5"
    )
    assert calls[0]["temperature"] == 0.0


# ── The env escape hatch still works where sampling is allowed ────────────────


def test_default_temperature_is_zero() -> None:
    assert claude_service.CLAUDE_TEMPERATURE == 0.0


def test_temperature_is_env_overridable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Escape hatch for the (rare) prompt that genuinely wants variety —
    e.g. regenerating alternative outreach message drafts."""
    monkeypatch.setenv("CLAUDE_TEMPERATURE", "0.7")
    assert claude_service._resolve_temperature() == 0.7


def test_env_override_still_omitted_on_a_model_that_rejects_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The escape hatch must not be able to re-introduce the 400."""
    monkeypatch.setattr(claude_service, "CLAUDE_TEMPERATURE", 0.7)
    assert claude_service._sampling_kwargs("claude-sonnet-5") == {}
