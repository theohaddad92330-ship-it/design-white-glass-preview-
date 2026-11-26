"""R10B-FIX / point 2 — une surcharge du fournisseur AVANT tout jeton n'est plus une panne.

Log prod du 14/10 : ``Chat error: APIError: Our servers are currently overloaded`` →
« Une erreur est survenue côté assistant » dès le 1er message. Ces tests savent dire NON :
APRÈS un jeton diffusé, jamais de nouvelle tentative (le texte serait dupliqué).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import openai
import pytest

from app.services import chat_orchestrator as co


def _overloaded() -> openai.APIError:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    return openai.APIError("Our servers are currently overloaded", request=request, body=None)


def _completed(text: str) -> Any:
    message = SimpleNamespace(type="message", content=[SimpleNamespace(type="output_text", text=text)])
    return SimpleNamespace(type="response.completed", response=SimpleNamespace(output=[message], usage=None))


class _Stream:
    def __init__(self, events: list[Any], then_raise: Exception | None = None) -> None:
        self._events, self._raise = events, then_raise

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for event in self._events:
            yield event
        if self._raise:
            raise self._raise


def _turns(monkeypatch, scripted: list[Any]) -> tuple[co._OpenAITurns, list[int]]:
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(co, "_TRANSIENT_RETRY_BACKOFF_S", 0.0)
    turns = co._OpenAITurns(model="gpt-test", system_prompt="s", max_tokens=100)
    turns.begin("bonjour")
    calls: list[int] = []

    async def create(**_kwargs: Any) -> Any:
        calls.append(1)
        item = scripted[len(calls) - 1]
        if isinstance(item, Exception):
            raise item
        return item

    turns._client = SimpleNamespace(responses=SimpleNamespace(create=create))
    return turns, calls


async def _noop(_event: dict) -> None:
    return None


@pytest.mark.asyncio
async def test_overload_before_any_token_is_retried_once(monkeypatch):
    turns, calls = _turns(monkeypatch, [_Stream([], _overloaded()), _Stream([_completed("Salut")])])
    turn = await turns.send(tools=None, timeout=5.0, emit=_noop)
    assert turn.text == "Salut"
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_overload_after_streamed_tokens_is_never_retried(monkeypatch):
    delta = SimpleNamespace(type="response.output_text.delta", delta="Bonjour, voici ")
    turns, calls = _turns(monkeypatch, [_Stream([delta], _overloaded()), _Stream([_completed("X")])])
    with pytest.raises(openai.APIError):
        await turns.send(tools=None, timeout=5.0, emit=_noop)
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_persistent_overload_without_fallback_says_saturated(monkeypatch):
    turns, calls = _turns(monkeypatch, [_Stream([], _overloaded()), _Stream([], _overloaded())])

    async def no_fallback(**_kw: Any) -> Any:
        raise RuntimeError("pas de clé Anthropic")

    monkeypatch.setattr(turns, "_fail_over_to_anthropic", no_fallback)
    with pytest.raises(co.ProviderOverloaded):
        await turns.send(tools=None, timeout=5.0, emit=_noop)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_persistent_overload_uses_the_existing_anthropic_fallback(monkeypatch):
    turns, _calls = _turns(monkeypatch, [_Stream([], _overloaded()), _Stream([], _overloaded())])
    sentinel = co._ModelTurn(text="repli", tool_calls=[], usage=None, raw=None)

    class _Fallback:
        async def send(self, **_kw: Any) -> Any:
            return sentinel

    async def fail_over(**_kw: Any) -> Any:
        return _Fallback()

    monkeypatch.setattr(turns, "_fail_over_to_anthropic", fail_over)
    assert (await turns.send(tools=None, timeout=5.0, emit=_noop)).text == "repli"


@pytest.mark.asyncio
async def test_non_transient_error_is_untouched(monkeypatch):
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    bad = openai.BadRequestError("nope", response=httpx.Response(400, request=request), body=None)
    turns, calls = _turns(monkeypatch, [bad, _Stream([_completed("X")])])
    with pytest.raises(openai.BadRequestError):
        await turns.send(tools=None, timeout=5.0, emit=_noop)
    assert len(calls) == 1


def test_saturated_wording_is_neither_generic_nor_timeout():
    from app.routers import chat as router

    fr = router._OVERLOAD_WORDING["fr"].whole
    en = router._OVERLOAD_WORDING["en"].whole
    assert "momentanément saturée" in fr and "Réessaie dans un instant" in fr
    assert "temporarily" in en
    assert fr != router._GENERIC_FAILURE_REPLY
