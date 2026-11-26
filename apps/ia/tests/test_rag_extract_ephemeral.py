"""#2148.16 — `/rag/extract` : le texte d'une pièce jointe de CONVERSATION
(cas a), jamais une ligne de `rag_documents`.

Même extraction que `/rag/ingest` (`_extract_uploaded_text`, testé côté
`test_rag_ingest_file.py`) — ce fichier vérifie la SEULE différence : rien
n'est écrit.
"""

from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from tests.test_document_text import _make_pdf


def test_extract_never_calls_ingest(client: TestClient, monkeypatch):
    """La preuve qu'aucun objet durable n'est créé : `rag_ingest` (le SEUL
    appelant qui écrit dans `rag_documents`, voir `handle_ingest`) n'est même
    pas appelé pour `/rag/extract`."""
    called = False

    async def _fake_ingest(*args, **kwargs):
        nonlocal called
        called = True
        return {"id": "should-never-exist"}

    monkeypatch.setattr("app.routers.rag.rag_ingest", _fake_ingest)

    pdf_b64 = base64.b64encode(_make_pdf("Jean Dupont, développeur.")).decode()
    resp = client.post("/rag/extract", json={"file_b64": pdf_b64, "filename": "cv.pdf"})

    assert resp.status_code == 200, resp.text
    assert "Jean Dupont" in resp.json()["data"]["text"]
    assert resp.json()["data"]["partial"] is False
    assert called is False


def test_extract_plain_text_roundtrips(client: TestClient):
    text_b64 = base64.b64encode(b"Compte rendu de rendez-vous.").decode()
    resp = client.post("/rag/extract", json={"file_b64": text_b64, "filename": "notes.txt"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["text"] == "Compte rendu de rendez-vous."


def test_extract_refuses_empty_content_with_422(client: TestClient):
    empty_b64 = base64.b64encode(b"   ").decode()
    resp = client.post("/rag/extract", json={"file_b64": empty_b64, "filename": "vide.txt"})
    assert resp.status_code == 422


def test_extract_refuses_invalid_base64_with_400(client: TestClient):
    resp = client.post("/rag/extract", json={"file_b64": "pas-du-base64!!", "filename": "x.txt"})
    assert resp.status_code == 400
