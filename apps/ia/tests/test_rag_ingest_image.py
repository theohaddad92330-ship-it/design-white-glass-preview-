"""RAG ingest d'une image (#2667.2) — le SEUL chemin qui lit une image ici est
le modèle (`app.services.document_text.extract_images_text`), jamais un binaire OCR.

Aucun appel réseau réel : `extract_images_text` est simulée à la frontière du
routeur, comme `rag_ingest` l'est déjà dans `test_rag_ingest_file.py`.
"""

from __future__ import annotations

import base64

from fastapi.testclient import TestClient


_PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def test_ingest_reads_an_image_via_the_model(client: TestClient, monkeypatch):
    captured: dict = {}

    async def _fake_ingest(title, content, category, user_id, workspace_id=None, origin="distilled", scope="workspace", conversation_id=None, account_id=None, language=None, units=None):
        captured.update(content=content, origin=origin)
        return {"id": "doc-1"}

    async def _fake_extract_images_text(images):
        captured["images"] = images
        from app.services.document_text import ExtractedDocument

        return [ExtractedDocument(text="Jean Dupont — Directeur technique")]

    monkeypatch.setattr("app.routers.rag.rag_ingest", _fake_ingest)
    monkeypatch.setattr("app.services.document_text.extract_images_text", _fake_extract_images_text)

    resp = client.post(
        "/rag/ingest",
        json={
            "title": "Organigramme",
            "file_b64": base64.b64encode(_PNG_BYTES).decode(),
            "filename": "organigramme.png",
            "user_id": "u1",
        },
    )

    assert resp.status_code == 200, resp.text
    assert captured["content"] == "Jean Dupont — Directeur technique"
    assert captured["origin"] == "uploaded"
    # Une image = un lot d'UNE, envoyé au plafond commun (`extract_images_text`).
    assert len(captured["images"]) == 1


def test_ingest_rejects_an_image_the_model_finds_no_text_in(client: TestClient, monkeypatch):
    async def _fake_extract_images_text(images):
        from app.services.document_text import DocumentTextError

        raise DocumentTextError("Aucun texte lisible dans cette image.")

    monkeypatch.setattr("app.services.document_text.extract_images_text", _fake_extract_images_text)

    resp = client.post(
        "/rag/ingest",
        json={
            "title": "Photo",
            "file_b64": base64.b64encode(_PNG_BYTES).decode(),
            "filename": "photo.png",
            "user_id": "u1",
        },
    )

    assert resp.status_code == 422
    assert "Aucun texte lisible" in resp.json()["detail"]


def test_ingest_still_reads_a_pdf_through_the_sync_path_unchanged(client: TestClient, monkeypatch):
    # Non-régression : un PDF (ou tout non-image) ne doit JAMAIS passer par le
    # chemin image — `extract_images_text` n'est pas appelée du tout.
    called = {"images": False}

    async def _boom(images):
        called["images"] = True
        raise AssertionError("extract_images_text ne doit pas être appelée pour un PDF")

    async def _fake_ingest(title, content, category, user_id, workspace_id=None, origin="distilled", scope="workspace", conversation_id=None, account_id=None, language=None, units=None):
        return {"id": "doc-1"}

    monkeypatch.setattr("app.services.document_text.extract_images_text", _boom)
    monkeypatch.setattr("app.routers.rag.rag_ingest", _fake_ingest)

    resp = client.post(
        "/rag/ingest",
        json={"title": "Notes", "content": "Texte brut, pas de fichier", "user_id": "u1"},
    )

    assert resp.status_code == 200, resp.text
    assert called["images"] is False
