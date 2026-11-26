"""#3935 (12/10) — `/cv/extract` juge la QUALITÉ du texte, pas seulement sa présence.

Voies : `direct` (texte propre — rien d'autre ne part), `recollé` (espacé
lettre à lettre, réparé sans réseau), `ocr` / `claude_pdf` (encore mauvais après
réparation). Données fictives uniquement.
"""

from __future__ import annotations

import base64
import logging

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import document_reader, ocr
from app.services.document_text import ExtractedDocument

client = TestClient(app)

PDF = base64.b64encode(b"%PDF-1.4 fictif").decode()

CLEAN = (
    "Jean DUPONT\nIngénieur cybersécurité\nParis, France\n"
    "Compétences : Python, Docker, Kubernetes, Terraform, Ansible.\n"
    "Expériences professionnelles : huit ans de missions chez des clients "
    "du secteur bancaire, dont trois à la tête d'une équipe de six personnes.\n"
    "Formation : diplôme d'ingénieur en informatique, spécialité sécurité des systèmes "
    "d'information, suivi d'une certification professionnelle en tests d'intrusion."
)
def _spaced(line: str) -> str:
    """Ce que pypdf rend sur le CV mesuré : lettres séparées par UN espace, mots par trois."""
    return "   ".join(" ".join(word) for word in line.split())


SPACED = "J e a n\nD U P O N T\n" + "\n".join(_spaced(line) for line in CLEAN.split("\n")[1:])
# Propre mais quasi vide pour 5 pages : seul le repli peut mieux faire.
SPARSE = "Jean DUPONT\nIngénieur"


def _patch(monkeypatch: pytest.MonkeyPatch, text: str, pages: int, calls: list[str]) -> None:
    monkeypatch.setattr(document_reader, "extract_document_text", lambda raw, name=None: ExtractedDocument(text=text))
    monkeypatch.setattr(document_reader, "pdf_page_count", lambda raw: pages)

    async def provider(data, filename=None):
        calls.append("provider")
        return None

    async def claude(data, filename=None):
        calls.append("claude")
        return CLEAN

    monkeypatch.setattr(ocr, "_provider_extract_text", provider)
    monkeypatch.setattr(ocr, "_claude_document_text", claude)


def _post() -> dict:
    response = client.post("/cv/extract", json={"file_b64": PDF, "filename": "cv.pdf"})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_clean_text_triggers_nothing(monkeypatch, caplog) -> None:
    calls: list[str] = []
    _patch(monkeypatch, CLEAN, 1, calls)
    with caplog.at_level(logging.INFO):
        data = _post()
    assert data["text"] == CLEAN
    assert calls == []
    assert "voie=direct" in caplog.text


def test_spaced_text_is_glued_without_any_fallback(monkeypatch, caplog) -> None:
    calls: list[str] = []
    _patch(monkeypatch, SPACED, 1, calls)
    with caplog.at_level(logging.INFO):
        data = _post()
    assert "Jean\nDUPONT" in data["text"]
    assert "Ingénieur cybersécurité" in data["text"]
    assert "L a m i s" not in data["text"]
    assert calls == []
    assert "voie=recollé" in caplog.text
    # JAMAIS le contenu dans le journal.
    assert "DUPONT" not in caplog.text


def test_still_bad_after_repair_goes_to_the_fallback_even_if_text_is_not_empty(monkeypatch, caplog) -> None:
    calls: list[str] = []
    # Espacé ET quasi vide pour 3 pages : le recollage ne suffit pas.
    _patch(monkeypatch, "J e a n   D U P O N T   I n g é n i e u r e", 3, calls)
    monkeypatch.delenv("OCR_API_KEY", raising=False)
    with caplog.at_level(logging.INFO):
        data = _post()
    assert data["text"] == CLEAN
    assert calls == ["provider", "claude"]
    assert "voie=claude_pdf" in caplog.text
    assert "DUPONT" not in caplog.text
    assert data["partial"] is False


def test_nearly_empty_multi_page_pdf_triggers_the_fallback(monkeypatch, caplog) -> None:
    calls: list[str] = []
    _patch(monkeypatch, SPARSE, 5, calls)
    with caplog.at_level(logging.INFO):
        data = _post()
    assert data["text"] == CLEAN
    assert "claude" in calls


def test_ocr_key_names_the_ocr_route(monkeypatch, caplog) -> None:
    calls: list[str] = []
    _patch(monkeypatch, SPARSE, 5, calls)

    async def provider(data, filename=None):
        calls.append("provider")
        return CLEAN

    monkeypatch.setattr(ocr, "_provider_extract_text", provider)
    with caplog.at_level(logging.INFO):
        _post()
    assert calls == ["provider"]
    assert "voie=ocr" in caplog.text


def test_fallback_worse_than_direct_keeps_the_direct_text(monkeypatch) -> None:
    calls: list[str] = []
    _patch(monkeypatch, SPARSE, 5, calls)

    async def worse(data, filename=None):
        return "x"

    monkeypatch.setattr(ocr, "_claude_document_text", worse)
    assert _post()["text"] == SPARSE


def test_fallback_failure_keeps_the_direct_text(monkeypatch) -> None:
    calls: list[str] = []
    _patch(monkeypatch, SPARSE, 5, calls)

    async def none(data, filename=None):
        return None

    monkeypatch.setattr(ocr, "_claude_document_text", none)
    assert _post()["text"] == SPARSE
