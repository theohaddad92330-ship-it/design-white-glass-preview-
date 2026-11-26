"""Tests for claude_service.call_claude()."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel, Field

from instructor.exceptions import IncompleteOutputException, InstructorRetryException

from app.services.claude_service import (
    CallMetadata,
    ClaudeIncompleteOutputError,
    TokenUsage,
    _compute_cost,
    _log_usage,
    call_claude,
)


class TestComputeCost:
    """Tarif par million de jetons (USD entrée/sortie) : opus 5/25, sonnet 2/10, haiku 1/5.

    ⚠️ Sonnet était facturé 3/15 ici alors que la hausse à $3/$15 prévue au
    01/09/2026 a été ANNULÉE le 10/08/2026 : $2/$10 est devenu le tarif standard
    (source : modèle unit economics du 18/08/2026, feuille « Sources », référence
    « Documentation Anthropic », vérifiée le 18/08). Le poste Anthropic est le
    PREMIER de la facture — le sur-évaluer de 50 % fausse `GET /metrics/cost`,
    le registre `provider_costs`, l'alerte `COST_ALERT_DAILY_USD` et surtout le
    prix plancher d'un crédit, qui est une décision commerciale.
    """

    def test_opus_priced_5_in_25_out(self) -> None:
        assert _compute_cost(1_000_000, 1_000_000, "claude-opus-4-8") == pytest.approx(30.0)

    def test_sonnet_priced_2_in_10_out(self) -> None:
        assert _compute_cost(1_000_000, 1_000_000, "claude-sonnet-4-6") == pytest.approx(12.0)

    def test_haiku_priced_1_in_5_out(self) -> None:
        # Regression: Haiku used to fall into the sonnet default → ×3 overbill.
        assert _compute_cost(1_000_000, 1_000_000, "claude-haiku-4-5") == pytest.approx(6.0)

    def test_unknown_model_falls_back_to_sonnet_tier(self) -> None:
        assert _compute_cost(1_000_000, 1_000_000, "some-future-model") == pytest.approx(12.0)

    def test_cache_read_bills_a_tenth_of_input(self) -> None:
        # 1 M jetons lus en cache = 0,1 × le prix d'entrée.
        assert _compute_cost(0, 0, "claude-sonnet-4-6", cache_read_tokens=1_000_000) == pytest.approx(0.2)

    def test_cache_write_bills_one_and_a_quarter_input(self) -> None:
        assert _compute_cost(0, 0, "claude-sonnet-4-6", cache_creation_tokens=1_000_000) == pytest.approx(2.5)


class TestPricingOverride:
    """Un tarif public change, et il a déjà changé deux fois en un mois.

    Le figer dans le code garantit qu'on le découvrira sur une facture. La
    surcharge par variable d'environnement suit la discipline déjà appliquée à
    `BOONDMANAGER_SEARCH_PARAM` : ce qu'on ne contrôle pas se règle sans
    redéploiement.
    """

    def test_env_overrides_the_tier(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("ANTHROPIC_PRICE_SONNET_IN", "3")
        monkeypatch.setenv("ANTHROPIC_PRICE_SONNET_OUT", "15")
        assert _compute_cost(1_000_000, 1_000_000, "claude-sonnet-4-6") == pytest.approx(18.0)

    def test_partial_override_keeps_the_other_half(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("ANTHROPIC_PRICE_HAIKU_OUT", "4")
        # Entrée inchangée (1,0), sortie surchargée (4,0).
        assert _compute_cost(1_000_000, 1_000_000, "claude-haiku-4-5") == pytest.approx(5.0)

    @pytest.mark.parametrize("bad", ["", "gratuit", "0", "-2", "NaN"])
    def test_unusable_value_falls_back_to_the_default(
        self, bad: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Un réglage cassé ne doit pas faire facturer zéro — un coût à zéro se
        # lit « c'est gratuit » et éteint l'alerte de dépassement en silence.
        monkeypatch.setenv("ANTHROPIC_PRICE_SONNET_IN", bad)
        assert _compute_cost(1_000_000, 0, "claude-sonnet-4-6") == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# Test models
# ---------------------------------------------------------------------------


class SimpleOutput(BaseModel):
    name: str
    score: int = Field(ge=0, le=10)


# ---------------------------------------------------------------------------
# TokenUsage
# ---------------------------------------------------------------------------


def test_token_usage_is_immutable() -> None:
    usage = TokenUsage(input_tokens=100, output_tokens=50, model="claude-sonnet-4-20250514", cost_usd=0.001)
    assert usage.input_tokens == 100
    assert usage.output_tokens == 50
    assert usage.model == "claude-sonnet-4-20250514"


def test_log_usage_sonnet(caplog: pytest.LogCaptureFixture) -> None:
    usage = TokenUsage(input_tokens=10000, output_tokens=5000, model="claude-sonnet-4-20250514", cost_usd=0.105)
    import logging

    with caplog.at_level(logging.INFO, logger="app.services.claude_service"):
        _log_usage(usage, CallMetadata(prompt_name="test_prompt"))

    assert "test_prompt" in caplog.text
    assert "10000 in" in caplog.text
    assert "5000 out" in caplog.text


# ---------------------------------------------------------------------------
# call_claude with response_model (structured)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_call_claude_structured_returns_model() -> None:
    mock_response = SimpleOutput(name="SNCF", score=8)
    mock_completion = MagicMock()
    mock_completion.usage.input_tokens = 500
    mock_completion.usage.output_tokens = 200

    mock_client = MagicMock()
    mock_client.messages.create_with_completion = AsyncMock(
        return_value=(mock_response, mock_completion),
    )

    with patch("app.services.claude_service.instructor.from_anthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            result, usage = await call_claude(
                "system", "user", response_model=SimpleOutput, prompt_name="test",
            )

    assert isinstance(result, SimpleOutput)
    assert result.name == "SNCF"
    assert result.score == 8
    assert usage.input_tokens == 500
    assert usage.output_tokens == 200


@pytest.mark.asyncio
async def test_call_claude_structured_passes_params() -> None:
    mock_response = SimpleOutput(name="AXA", score=7)
    mock_completion = MagicMock()
    mock_completion.usage.input_tokens = 100
    mock_completion.usage.output_tokens = 50

    mock_client = MagicMock()
    mock_client.messages.create_with_completion = AsyncMock(
        return_value=(mock_response, mock_completion),
    )

    with patch("app.services.claude_service.instructor.from_anthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude(
                "sys", "usr", response_model=SimpleOutput,
                max_tokens=2000, max_retries=3, model="claude-opus-4-5",
                prompt_name="test",
            )

    call_kwargs = mock_client.messages.create_with_completion.call_args.kwargs
    assert call_kwargs["model"] == "claude-opus-4-5"
    assert call_kwargs["max_tokens"] == 2000
    assert call_kwargs["max_retries"] == 3
    # C3: the system prompt is sent as a cache_control:ephemeral block so
    # Anthropic prompt-caches it (reused across sections + companies).
    system_block = call_kwargs["system"]
    assert isinstance(system_block, list)
    assert system_block[0]["text"] == "sys"
    assert system_block[0]["cache_control"] == {"type": "ephemeral"}


# ---------------------------------------------------------------------------
# call_claude without response_model (plain text)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_call_claude_text_returns_string() -> None:
    text_block = MagicMock(type="text")
    text_block.text = "Bonjour !"
    mock_response = MagicMock()
    mock_response.content = [text_block]
    mock_response.usage.input_tokens = 100
    mock_response.usage.output_tokens = 20

    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            text, usage = await call_claude("system", "user", prompt_name="chat")

    assert text == "Bonjour !"
    assert usage.input_tokens == 100


@pytest.mark.asyncio
async def test_call_claude_text_skips_thinking_block() -> None:
    # Extended thinking puts a ThinkingBlock (no `.text`) before the TextBlock.
    # The extractor must skip non-text blocks instead of crashing on content[0].
    thinking_block = MagicMock(type="thinking")
    del thinking_block.text  # ThinkingBlock has no `.text` attribute
    text_block = MagicMock(type="text")
    text_block.text = "Réponse finale."
    mock_response = MagicMock()
    mock_response.content = [thinking_block, text_block]
    mock_response.usage.input_tokens = 50
    mock_response.usage.output_tokens = 10

    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=mock_response)

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            text, _usage = await call_claude("system", "user", prompt_name="chat")

    assert text == "Réponse finale."


# ---------------------------------------------------------------------------
# call_claude with response_model=dict (free-form)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_call_claude_dict_returns_dict() -> None:
    class _Envelope(BaseModel):
        data: dict

    mock_response = _Envelope(data={"key": "value", "score": 42})
    mock_completion = MagicMock()
    mock_completion.usage.input_tokens = 300
    mock_completion.usage.output_tokens = 100

    mock_client = MagicMock()
    mock_client.messages.create_with_completion = AsyncMock(
        return_value=(mock_response, mock_completion),
    )

    with patch("app.services.claude_service.instructor.from_anthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            result, usage = await call_claude(
                "system", "user", response_model=dict, prompt_name="test",
            )

    assert isinstance(result, dict)
    assert result["key"] == "value"


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_call_claude_wraps_truncation_in_typed_error() -> None:
    """A bare ``IncompleteOutputException`` from instructor surfaces as
    ``ClaudeIncompleteOutputError`` so the FastAPI handler can map to a
    typed 422 with French ``user_message`` instead of a 502 the worker
    would burn retries on.
    """
    mock_client = MagicMock()
    mock_client.messages.create_with_completion = AsyncMock(
        side_effect=IncompleteOutputException(last_completion=MagicMock()),
    )

    with patch("app.services.claude_service.instructor.from_anthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            with pytest.raises(ClaudeIncompleteOutputError) as excinfo:
                await call_claude(
                    "sys", "usr", response_model=SimpleOutput, prompt_name="bellum_facts",
                )

    assert excinfo.value.code == "CLAUDE_OUTPUT_TRUNCATED"
    assert excinfo.value.prompt_name == "bellum_facts"


@pytest.mark.asyncio
async def test_call_claude_unwraps_truncation_through_retry_exception() -> None:
    """Once tenacity retries are exhausted, instructor re-wraps the inner
    ``IncompleteOutputException`` in ``InstructorRetryException``. We must
    still recognise it as truncation rather than letting the generic
    retry-exhausted error bubble up as a 502.
    """
    inner = IncompleteOutputException(last_completion=MagicMock())
    outer = InstructorRetryException(
        n_attempts=3,
        last_completion=MagicMock(),
        messages=[],
        total_usage=MagicMock(),
    )
    outer.__cause__ = inner

    mock_client = MagicMock()
    mock_client.messages.create_with_completion = AsyncMock(side_effect=outer)

    with patch("app.services.claude_service.instructor.from_anthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            with pytest.raises(ClaudeIncompleteOutputError):
                await call_claude(
                    "sys", "usr", response_model=SimpleOutput, prompt_name="bellum_signals",
                )


@pytest.mark.asyncio
async def test_call_claude_unwraps_truncation_through_multi_level_chain() -> None:
    """Real-world chain from instructor + tenacity is two levels deep:
    ``InstructorRetryException → tenacity.RetryError → IncompleteOutputException``.
    A single ``__cause__`` lookup misses the inner exception, so we must
    walk the full chain.
    """

    class FakeRetryError(Exception):
        pass

    inner = IncompleteOutputException(last_completion=MagicMock())
    middle = FakeRetryError("retry exhausted")
    middle.__cause__ = inner
    outer = InstructorRetryException(
        n_attempts=3,
        last_completion=MagicMock(),
        messages=[],
        total_usage=MagicMock(),
    )
    outer.__cause__ = middle

    mock_client = MagicMock()
    mock_client.messages.create_with_completion = AsyncMock(side_effect=outer)

    with patch("app.services.claude_service.instructor.from_anthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            with pytest.raises(ClaudeIncompleteOutputError):
                await call_claude(
                    "sys", "usr", response_model=SimpleOutput, prompt_name="bellum_plan_action_plan",
                )


@pytest.mark.asyncio
async def test_call_claude_auto_retries_with_doubled_budget_on_truncation() -> None:
    """First attempt truncates; the helper retries once with max_tokens × 2
    and succeeds. The caller never sees the truncation — the analysis is
    saved instead of cancelled.
    """
    truncation = IncompleteOutputException(last_completion=MagicMock())

    success_completion = MagicMock()
    success_completion.usage.input_tokens = 100
    success_completion.usage.output_tokens = 200
    success_response = SimpleOutput(name="ok", score=8)

    mock_client = MagicMock()
    mock_client.messages.create_with_completion = AsyncMock(
        side_effect=[truncation, (success_response, success_completion)],
    )

    with patch("app.services.claude_service.instructor.from_anthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            result, _ = await call_claude(
                "sys", "usr", response_model=SimpleOutput, max_tokens=3000, prompt_name="bellum_plan",
            )

    assert result == success_response
    # First attempt at 3000, second at 6000 (doubled).
    assert mock_client.messages.create_with_completion.call_count == 2
    first_call = mock_client.messages.create_with_completion.call_args_list[0]
    second_call = mock_client.messages.create_with_completion.call_args_list[1]
    assert first_call.kwargs["max_tokens"] == 3000
    assert second_call.kwargs["max_tokens"] == 6000


@pytest.mark.asyncio
async def test_call_claude_stops_retrying_at_the_cap() -> None:
    """When the doubled budget would exceed ``TRUNCATION_RETRY_CAP``, the
    helper stops retrying and raises ``ClaudeIncompleteOutputError`` so the
    caller fails fast instead of escalating cost forever.
    """
    truncation = IncompleteOutputException(last_completion=MagicMock())

    mock_client = MagicMock()
    mock_client.messages.create_with_completion = AsyncMock(side_effect=truncation)

    with patch("app.services.claude_service.instructor.from_anthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            with pytest.raises(ClaudeIncompleteOutputError):
                # Starts already at the cap → no retry possible.
                await call_claude(
                    "sys", "usr", response_model=SimpleOutput, max_tokens=16384, prompt_name="bellum_plan",
                )

    # Only one attempt: the doubling would have crossed the cap.
    assert mock_client.messages.create_with_completion.call_count == 1


@pytest.mark.asyncio
async def test_call_claude_raises_without_api_key() -> None:
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            await call_claude("s", "u", response_model=SimpleOutput)


@pytest.mark.asyncio
async def test_call_claude_text_raises_without_api_key() -> None:
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            await call_claude("s", "u")


class TestSingleToolUseHardening:
    """Regression: instructor's ANTHROPIC_TOOLS reask attaches a ``tool_result``
    for only ONE ``tool_use`` block, so parallel tool_use blocks make the
    follow-up request 400 ("tool_use ids were found without tool_result blocks").
    instructor >= 1.17 pins ``disable_parallel_tool_use`` natively on the forced
    tool_choice ; this guard fails if a bump drops that. No network, no key.
    """

    @pytest.mark.asyncio
    async def test_structured_call_sends_disable_parallel_tool_use(self) -> None:
        import anthropic
        import instructor
        from anthropic.types import Message, ToolUseBlock, Usage

        captured: dict = {}

        async def fake_create(**kwargs):
            captured.update(kwargs)
            return Message(
                id="msg_1",
                type="message",
                role="assistant",
                model="claude-test",
                content=[
                    ToolUseBlock(
                        id="tu_1",
                        type="tool_use",
                        name="SimpleOutput",
                        input={"name": "ok", "score": 5},
                    )
                ],
                stop_reason="tool_use",
                usage=Usage(input_tokens=1, output_tokens=1),
            )

        raw = anthropic.AsyncAnthropic(api_key="test-not-a-key")
        raw.messages.create = fake_create  # type: ignore[method-assign]
        client = instructor.from_anthropic(raw)

        await client.messages.create(
            model="claude-test",
            max_tokens=100,
            messages=[{"role": "user", "content": "hi"}],
            response_model=SimpleOutput,
        )

        tool_choice = captured["tool_choice"]
        assert tool_choice["type"] == "tool"
        assert tool_choice["disable_parallel_tool_use"] is True
