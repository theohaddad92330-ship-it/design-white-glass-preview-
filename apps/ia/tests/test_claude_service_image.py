"""#2667.2 — lire le texte d'une image par le modèle (pas d'OCR local, pas de
binaire système : le seul chemin est le client Anthropic déjà câblé).

Aucun appel réseau réel : `anthropic.AsyncAnthropic` est simulé, comme le fait
déjà `test_claude_service.py` pour `call_claude`.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.claude_service import IMAGE_NO_TEXT_SENTINEL, call_claude_image_text


def _mock_response(text: str, *, input_tokens: int = 500, output_tokens: int = 20) -> MagicMock:
    text_block = MagicMock(type="text")
    text_block.text = text
    response = MagicMock()
    response.content = [text_block]
    response.usage.input_tokens = input_tokens
    response.usage.output_tokens = output_tokens
    return response


@pytest.mark.asyncio
async def test_call_claude_image_text_returns_model_text() -> None:
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_mock_response("Jean Dupont — Directeur technique"))

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            text, usage = await call_claude_image_text(b"\x89PNG-fake-bytes", "image/png")

    assert text == "Jean Dupont — Directeur technique"
    assert usage.input_tokens == 500
    assert usage.output_tokens == 20


@pytest.mark.asyncio
async def test_call_claude_image_text_sends_a_base64_image_content_block() -> None:
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_mock_response(IMAGE_NO_TEXT_SENTINEL))

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude_image_text(b"raw-jpeg-bytes", "image/jpeg", prompt_name="test")

    call_kwargs = mock_client.messages.create.call_args.kwargs
    content = call_kwargs["messages"][0]["content"]
    image_block = next(block for block in content if block["type"] == "image")
    assert image_block["source"]["type"] == "base64"
    assert image_block["source"]["media_type"] == "image/jpeg"
    # Les octets bruts voyagent en base64, jamais tels quels.
    assert image_block["source"]["data"] != b"raw-jpeg-bytes"


@pytest.mark.asyncio
async def test_call_claude_image_text_system_prompt_forbids_protected_traits() -> None:
    # Doctrine (CLAUDE.md « Aucun CRITÈRE PROTÉGÉ ») : si l'image montre une
    # personne, le modèle ne doit en tirer ni âge, ni genre, ni origine — le
    # prompt système le dit explicitement plutôt que de l'espérer.
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_mock_response("texte lu"))

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude_image_text(b"raw-bytes", "image/png")

    system = mock_client.messages.create.call_args.kwargs["system"]
    system_text = system[0]["text"] if isinstance(system, list) else system
    assert "âge" in system_text
    assert "genre" in system_text
    assert "origine" in system_text
    # La phrase que le modèle DOIT rendre quand il ne lit aucun texte — jamais
    # une description devinée de l'image.
    assert IMAGE_NO_TEXT_SENTINEL in system_text


@pytest.mark.asyncio
async def test_call_claude_image_text_system_prompt_preserves_table_structure() -> None:
    # #2876 (#2433.5) — un tableau capturé (comptes, planning, facture…) doit
    # garder lignes/colonnes ; une cellule vide reste NOMMÉE comme vide,
    # jamais réécrite en 0 (même doctrine que `reply_formats.py:54`).
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_mock_response("texte lu"))

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude_image_text(b"raw-bytes", "image/png")

    system = mock_client.messages.create.call_args.kwargs["system"]
    system_text = system[0]["text"] if isinstance(system, list) else system
    assert "tableau" in system_text.lower()
    assert "cellule vide" in system_text.lower()
    assert "jamais" in system_text.lower() and "zéro" in system_text.lower()


@pytest.mark.asyncio
async def test_call_claude_image_text_logs_a_known_cost() -> None:
    # Le compteur de coût du process (`GET /metrics/cost`) doit voir CET appel
    # — même goulot que `call_claude`/`call_claude_with_citations`
    # (`_log_usage` → `cost_ledger.record` + `run_metrics.record_cost`).
    from app.services import claude_service

    claude_service.reset_cost_counters()
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(return_value=_mock_response("texte lu", input_tokens=1200, output_tokens=80))

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            _text, usage = await call_claude_image_text(b"raw-bytes", "image/png", prompt_name="image_text_extraction")

    assert usage.cost_known is True
    assert usage.cost_usd > 0
    counters = claude_service.cost_counters()
    assert counters["image_text_extraction"].calls == 1
    assert counters["image_text_extraction"].input_tokens == 1200
