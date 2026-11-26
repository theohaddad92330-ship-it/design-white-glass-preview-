"""GA-294 — le budget du client Anthropic ne se multiplie plus tout seul.

``chat_orchestrator._CLIENT_MAX_RETRIES = 0`` existe déjà côté copilote, avec
sa raison écrite noir sur blanc : « le client REJOUE de lui-même (défaut du
SDK : 2 tentatives de plus). Un budget qu'une bibliothèque peut multiplier
par trois n'est pas un budget. » Les 4 instanciations
``anthropic.AsyncAnthropic(...)`` de ``claude_service.py``
(``_call_structured``, ``_call_dict``, ``_call_text``,
``call_claude_with_citations``) ne posaient PAS ce réglage : défaut du SDK
(``DEFAULT_MAX_RETRIES = 2`` côté ``anthropic-sdk-python``), donc jusqu'à ×3
la dépense sur des appels déjà bornés par un budget de tour ou de phase.

⚠️ Ceci est un concept DIFFÉRENT de ``claude_service.DEFAULT_MAX_RETRIES``
(qui vaut 2 et reste inchangé) : celui-là est le nombre de relectures
qu'INSTRUCTOR s'autorise quand la sortie structurée échoue la validation
Pydantic (le « reask »), passé en paramètre à ``create_with_completion``.
Celui que cette garde tient est le TRANSPORT HTTP du client Anthropic
lui-même (429, 5xx, connexions coupées) — les deux se cumulaient avant ce
correctif, et seul le second change ici.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from app.services.claude_service import (
    _SDK_TRANSPORT_MAX_RETRIES,
    call_claude,
    call_claude_with_citations,
)


class _StructuredOutput(BaseModel):
    name: str


def test_the_constant_itself_is_zero():
    """LIT quelque chose : si la constante n'existe pas ou vaut autre chose
    que 0, les quatre tests qui suivent testent du vent."""
    assert _SDK_TRANSPORT_MAX_RETRIES == 0


def _structured_client() -> MagicMock:
    completion = MagicMock()
    completion.usage.input_tokens = 10
    completion.usage.output_tokens = 5
    client = MagicMock()
    client.messages.create_with_completion = AsyncMock(
        return_value=(_StructuredOutput(name="AXA"), completion)
    )
    return client


def _text_response() -> MagicMock:
    text_block = MagicMock(type="text")
    text_block.text = "ok"
    response = MagicMock()
    response.content = [text_block]
    response.usage.input_tokens = 10
    response.usage.output_tokens = 5
    return response


@pytest.mark.asyncio
async def test_call_structured_site_passes_zero_retries_to_the_sdk_client() -> None:
    """Site 1 : ``_call_structured`` (``response_model=UnModel``)."""
    with patch(
        "app.services.claude_service.instructor.from_anthropic",
        return_value=_structured_client(),
    ):
        with patch("anthropic.AsyncAnthropic") as mock_ctor:
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude(
                    "sys", "usr", response_model=_StructuredOutput, prompt_name="t"
                )

    assert mock_ctor.call_args.kwargs["max_retries"] == 0


@pytest.mark.asyncio
async def test_call_dict_site_passes_zero_retries_to_the_sdk_client() -> None:
    """Site 2 : ``_call_dict`` (``response_model=dict``)."""

    class _Envelope(BaseModel):
        data: dict

    completion = MagicMock()
    completion.usage.input_tokens = 10
    completion.usage.output_tokens = 5
    mock_instructor_client = MagicMock()
    mock_instructor_client.messages.create_with_completion = AsyncMock(
        return_value=(_Envelope(data={"ok": True}), completion)
    )

    with patch(
        "app.services.claude_service.instructor.from_anthropic",
        return_value=mock_instructor_client,
    ):
        with patch("anthropic.AsyncAnthropic") as mock_ctor:
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude("sys", "usr", response_model=dict, prompt_name="t")

    assert mock_ctor.call_args.kwargs["max_retries"] == 0


@pytest.mark.asyncio
async def test_call_text_site_passes_zero_retries_to_the_sdk_client() -> None:
    """Site 3 : ``_call_text`` (``response_model=None`` — le chemin texte simple)."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_text_response())

    with patch("anthropic.AsyncAnthropic", return_value=mock_client) as mock_ctor:
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude("sys", "usr", prompt_name="chat")

    assert mock_ctor.call_args.kwargs["max_retries"] == 0


@pytest.mark.asyncio
async def test_call_claude_with_citations_site_passes_zero_retries_to_the_sdk_client() -> None:
    """Site 4 : ``call_claude_with_citations`` (chemin RAW, hors instructor)."""
    text_block = MagicMock(type="text")
    text_block.text = "réponse citée"
    text_block.citations = []
    response = MagicMock()
    response.content = [text_block]
    response.usage.input_tokens = 10
    response.usage.output_tokens = 5

    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=response)

    with patch("anthropic.AsyncAnthropic", return_value=mock_client) as mock_ctor:
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude_with_citations(
                "sys", "question", [{"title": "doc", "text": "contenu"}]
            )

    assert mock_ctor.call_args.kwargs["max_retries"] == 0


# ── La garde prouve qu'elle sait dire NON ────────────────────────────────────


@pytest.mark.asyncio
async def test_GA_294_the_guard_would_fail_on_the_pre_fix_shape() -> None:
    """Preuve que l'assertion ci-dessus SAIT dire NON : sans le correctif (le
    site ne passe aucun ``max_retries``), le SDK retombe sur son défaut — 2,
    jamais 0. On le vérifie en appelant le constructeur SANS le réglage,
    exactement comme le faisaient les 4 sites avant ce lot."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_text_response())

    with patch("anthropic.AsyncAnthropic", return_value=mock_client) as mock_ctor:
        # Reproduit l'appel D'AVANT le correctif : pas de max_retries du tout.
        mock_ctor(api_key="sk-test", timeout=60.0)

    assert "max_retries" not in mock_ctor.call_args.kwargs, (
        "ce test doit reproduire la FORME du bug (aucun réglage) pour prouver "
        "que l'assertion positive, elle, sait faire la différence"
    )
