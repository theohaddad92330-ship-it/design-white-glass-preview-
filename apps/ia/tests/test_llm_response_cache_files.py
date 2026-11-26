"""CACHE-LLM (15/10) — la lecture d'un FICHIER neutre (document d'appel d'offres)
se garde par l'empreinte SHA-256 de son CONTENU, commune à tous les espaces.

Seule la voie des appels d'offres le demande (``rfp._resolve_text``) : un CV,
un organigramme, un justificatif ou une mission portent des personnes et ne
passent jamais par ce cache (effacement RGPD, c67).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.routers import rfp
from app.services import document_reader, llm_response_cache, ocr
from app.services.claude_service import TokenUsage

_PDF = b"%PDF-1.4 appel d'offres DSI 2026"


class _MemoryCache:
    def __init__(self) -> None:
        self.store: dict[tuple[str, str], Any] = {}
        self.writes = 0

    async def get_json(self, namespace: str, key: str) -> Any:
        return self.store.get((namespace, key))

    async def set_json(self, namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        self.writes += 1
        self.store[(namespace, key)] = value


@pytest.fixture
def cache(monkeypatch: pytest.MonkeyPatch) -> _MemoryCache:
    memory = _MemoryCache()
    monkeypatch.setattr(llm_response_cache.provider_cache, "get_json", memory.get_json)
    monkeypatch.setattr(llm_response_cache.provider_cache, "set_json", memory.set_json)
    return memory


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """L'OCR du fournisseur : compte les appels réseau."""
    state: dict[str, Any] = {"calls": 0, "text": "Lot 1 — infogérance"}

    async def fake_ocr(data: bytes, filename: str | None = None) -> str | None:
        state["calls"] += 1
        return state["text"]

    monkeypatch.setattr(ocr, "_provider_extract_text", fake_ocr)
    return state


@pytest.mark.asyncio
async def test_the_same_file_is_read_once_whatever_its_name_or_workspace(cache, provider) -> None:
    first = await ocr.extract_text_with_route(_PDF, "AO-espace-A.pdf", response_cache=True)
    second = await ocr.extract_text_with_route(_PDF, "copie-espace-B.pdf", response_cache=True)
    assert first == second == ("Lot 1 — infogérance", "ocr")
    assert provider["calls"] == 1


@pytest.mark.asyncio
async def test_another_content_is_another_key(cache, provider) -> None:
    await ocr.extract_text_with_route(_PDF, "a.pdf", response_cache=True)
    await ocr.extract_text_with_route(_PDF + b" v2", "a.pdf", response_cache=True)
    assert provider["calls"] == 2


@pytest.mark.asyncio
async def test_an_empty_reading_is_never_written(cache, provider, monkeypatch) -> None:
    provider["text"] = None

    async def no_claude(data: bytes, filename: str | None) -> str | None:
        return None

    monkeypatch.setattr(ocr, "_claude_document_text", no_claude)
    assert await ocr.extract_text_with_route(_PDF, "a.pdf", response_cache=True) == (None, None)
    assert cache.writes == 0


@pytest.mark.asyncio
async def test_a_truncated_model_reading_is_never_written(cache, provider, monkeypatch) -> None:
    provider["text"] = None

    async def fake_document(data: bytes, **_: Any) -> tuple[str, TokenUsage]:
        usage = TokenUsage(input_tokens=1, output_tokens=16000, model="m", cost_usd=0.0, stop_reason="max_tokens")
        return "Lot 1 — infogérance (coupé", usage

    monkeypatch.setattr(ocr, "call_claude_document_text", fake_document)
    monkeypatch.setattr(ocr, "PdfReader", lambda _buf: type("R", (), {"pages": [object()]})())
    text, route = await ocr.extract_text_with_route(_PDF, "a.pdf", response_cache=True)
    assert route == "claude_pdf" and text, "la lecture coupée est RENDUE (comportement d'avant)…"
    assert cache.writes == 0, "…mais jamais gardée"


@pytest.mark.asyncio
async def test_without_opt_in_the_file_cache_is_never_touched(cache, provider) -> None:
    await ocr.extract_text_with_route(_PDF, "cv.pdf")
    await ocr.extract_text_with_route(_PDF, "cv.pdf")
    assert provider["calls"] == 2 and cache.writes == 0


@pytest.mark.asyncio
async def test_the_tender_route_asks_for_the_cache(monkeypatch) -> None:
    seen: dict[str, Any] = {}

    async def spy(data: bytes, filename: str | None = None, *, response_cache: bool = False):
        seen["response_cache"] = response_cache
        return document_reader.ExtractedDocument(text="AO")

    monkeypatch.setattr(rfp, "read_document", spy)
    req = rfp.RfpAnalyseRequest(file_base64="JVBERi0xLjQ=", file_name="ao.pdf")
    assert await rfp._resolve_text(req) == "AO"
    assert seen["response_cache"] is True


@pytest.mark.asyncio
async def test_read_document_threads_the_flag_to_the_scanned_pdf_path(monkeypatch) -> None:
    seen: list[bool] = []

    async def spy(data: bytes, filename: str | None = None, *, response_cache: bool = False):
        seen.append(response_cache)
        return "Lot 1", "ocr"

    def unreadable(data: bytes, filename: str | None = None):
        raise document_reader.DocumentTextError("PDF scanné")

    monkeypatch.setattr(document_reader, "extract_document_text", unreadable)
    monkeypatch.setattr(ocr, "is_configured", lambda: True)
    monkeypatch.setattr(ocr, "can_read_size", lambda _d: True)
    monkeypatch.setattr(ocr, "extract_text_with_route", spy)
    await document_reader.read_document(_PDF, "ao.pdf", response_cache=True)
    await document_reader.read_document(_PDF, "cv.pdf")
    assert seen == [True, False]
