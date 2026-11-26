"""RAG ingest of a base64 file — server-side text extraction (Théo p.21)."""

from __future__ import annotations

import base64
import io

from fastapi.testclient import TestClient

from pypdf import PdfReader, PdfWriter

from tests.test_document_text import _make_pdf


def test_ingest_extracts_pdf_text_server_side(client: TestClient, monkeypatch):
    captured: dict = {}

    async def _fake_ingest(
        title,
        content,
        category,
        user_id,
        workspace_id=None,
        origin="distilled",
        scope="workspace",
        conversation_id=None,
        account_id=None,
        language=None,
        units=None,  # #3750 — les unités citables du fichier
    ):
        captured.update(title=title, content=content, category=category, user_id=user_id, origin=origin, scope=scope)
        return {"id": "doc-1"}

    monkeypatch.setattr("app.routers.rag.rag_ingest", _fake_ingest)

    pdf_b64 = base64.b64encode(_make_pdf("Plaquette Bellum")).decode()
    resp = client.post(
        "/rag/ingest",
        json={"title": "Plaquette", "file_b64": pdf_b64, "filename": "plaquette.pdf", "user_id": "u1"},
    )
    assert resp.status_code == 200, resp.text
    # The PDF's text layer, not its raw bytes, reached the store.
    assert "Plaquette Bellum" in captured["content"]
    # M6 — ce qui entre par cette route vient d'un humain. C'est ce qui met le
    # document hors de portée de la purge automatique : personne ne peut le
    # régénérer, contrairement à un document distillé d'une analyse.
    assert captured["origin"] == "uploaded"
    # #1954.16 / #1954.30 — un PDF dont TOUTES les pages se lisent n'est jamais
    # « partiel » : la réponse le nomme explicitement, pas d'absence de clé.
    assert resp.json()["data"]["partial"] is False


def test_ingest_flags_partial_pdf_extraction(client: TestClient, monkeypatch):
    """#1954.16 / #1954.30 — un scan glissé au milieu d'un dossier autrement
    numérique doit être ingéré (la page lisible reste utile) MAIS jamais rendu
    comme un succès plein : la réponse porte `partial: true`."""

    async def _fake_ingest(*args, **kwargs):
        return {"id": "doc-1"}

    monkeypatch.setattr("app.routers.rag.rag_ingest", _fake_ingest)

    readable = PdfReader(io.BytesIO(_make_pdf("Hello RAG")))
    writer = PdfWriter()
    writer.add_page(readable.pages[0])
    writer.add_blank_page(width=300, height=200)  # page sans calque texte
    buf = io.BytesIO()
    writer.write(buf)

    resp = client.post(
        "/rag/ingest",
        json={
            "title": "Dossier partiel",
            "file_b64": base64.b64encode(buf.getvalue()).decode(),
            "filename": "dossier-partiel.pdf",
            "user_id": "u1",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["partial"] is True


def test_ingest_rejects_unreadable_pdf_with_422(client: TestClient, monkeypatch):
    monkeypatch.setattr("app.routers.rag.rag_ingest", lambda *a, **k: {"id": "x"})
    # A scanned/image-only PDF has no text layer → 422 with guidance, not a crash.
    from pypdf import PdfWriter

    import io

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    resp = client.post(
        "/rag/ingest",
        json={
            "title": "Scan",
            "file_b64": base64.b64encode(buf.getvalue()).decode(),
            "filename": "scan.pdf",
            "user_id": "u1",
        },
    )
    assert resp.status_code == 422


def test_ingest_rejects_bad_base64_with_400(client: TestClient):
    resp = client.post(
        "/rag/ingest",
        json={"title": "X", "file_b64": "not-base64!!!", "filename": "x.pdf", "user_id": "u1"},
    )
    assert resp.status_code == 400


# #2438.7 — la garde d'entrée (`attachment_guard`) tombe AVANT toute
# extraction : un macro-doc ou un fichier surdimensionné n'atteint jamais
# `extract_document_text`. Câblage réel, pas seulement le module pur —
# `test_chat_attachment_guard.py` couvre déjà la logique isolée.
def test_ingest_quarantines_a_macro_enabled_docx(client: TestClient, monkeypatch):
    monkeypatch.setattr("app.routers.rag.rag_ingest", lambda *a, **k: {"id": "should-not-be-called"})

    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr(
            "word/document.xml",
            '<?xml version="1.0"?><w:document '
            'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>Cahier des charges</w:t></w:r></w:p></w:body></w:document>",
        )
        archive.writestr("word/vbaProject.bin", b"\x00\x01fake-vba-payload")

    resp = client.post(
        "/rag/ingest",
        json={
            "title": "Cahier",
            "file_b64": base64.b64encode(buf.getvalue()).decode(),
            "filename": "cahier-des-charges.docx",
            "user_id": "u1",
        },
    )
    assert resp.status_code == 422
    assert "macro" in resp.json()["detail"].lower()


def test_ingest_rejects_an_oversized_file_before_extraction(client: TestClient, monkeypatch):
    from app.services.attachment_guard import MAX_ATTACHMENT_BYTES

    called = {"ingest": False}

    def _fake_ingest(*a, **k):
        called["ingest"] = True
        return {"id": "x"}

    monkeypatch.setattr("app.routers.rag.rag_ingest", _fake_ingest)

    oversized = b"a" * (MAX_ATTACHMENT_BYTES + 1)
    resp = client.post(
        "/rag/ingest",
        json={
            "title": "Gros fichier",
            "file_b64": base64.b64encode(oversized).decode(),
            "filename": "gros.txt",
            "user_id": "u1",
        },
    )
    assert resp.status_code == 422
    assert called["ingest"] is False
