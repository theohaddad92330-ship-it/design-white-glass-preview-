"""L'extraction du texte d'un CV déposé (PDF 3 §3.2).

Ce que ces tests protègent : un fichier illisible doit produire une ERREUR
NOMMÉE, jamais une fiche vide. Le §3.2 l'exige — « si l'extraction échoue, on le
dit et on propose la saisie » — et c'est la différence entre un utilisateur qui
saisit son CV à la main et un utilisateur qui redépose dix fois le même scan.
"""

from __future__ import annotations

import base64
import io

from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from app.main import app
from tests.test_document_text import _make_pdf

client = TestClient(app)


def test_extracts_plain_text() -> None:
    payload = base64.b64encode("YANIS BERTHIER — Ingénieur plateforme".encode()).decode()
    response = client.post("/cv/extract", json={"file_b64": payload, "filename": "cv.txt"})
    assert response.status_code == 200
    body = response.json()
    assert "YANIS BERTHIER" in body["data"]["text"]
    assert body["data"]["chars"] > 0
    # #2542.3 — un CV dont TOUTES les pages se lisent n'est jamais « partiel » :
    # la réponse le nomme explicitement, comme /rag/ingest le fait déjà
    # (#1954.16/.30) — pas d'absence de clé que l'appelant devrait deviner.
    assert body["data"]["partial"] is False


def test_flags_a_partially_readable_cv_instead_of_hiding_it_as_a_full_success() -> None:
    # #2542.3 — mesuré en suivant la chaîne du #2542 : `extract_document_text`
    # calcule déjà `partial` (une page sans calque texte au milieu d'un dossier
    # de compétences autrement numérique, #1954.16/.30) mais `/cv/extract`
    # jetait le signal — seul `.text` était lu. Un CV à moitié lu ne doit
    # jamais se présenter comme un succès plein : « non mesuré » n'est jamais
    # « 0 » (GA-18/GA-19), et la seule matière disponible pour le dire ici est
    # ce booléen.
    readable = PdfReader(io.BytesIO(_make_pdf("Hello CV")))
    writer = PdfWriter()
    writer.add_page(readable.pages[0])
    writer.add_blank_page(width=300, height=200)  # page sans calque texte
    buf = io.BytesIO()
    writer.write(buf)

    response = client.post(
        "/cv/extract",
        json={"file_b64": base64.b64encode(buf.getvalue()).decode(), "filename": "dossier-partiel.pdf"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "Hello CV" in body["data"]["text"]
    assert body["data"]["partial"] is True


def test_rejects_invalid_base64() -> None:
    response = client.post("/cv/extract", json={"file_b64": "pas du base64 !!", "filename": "cv.pdf"})
    assert response.status_code == 400


def test_names_the_reason_when_a_file_yields_nothing() -> None:
    # Un PDF sans texte extractible est le cas courant du CV scanné. Le motif
    # doit VOYAGER jusqu'à l'écran : « aucun texte » sans raison enverrait
    # l'utilisateur redéposer le même fichier.
    empty_pdf = base64.b64encode(b"%PDF-1.4\n%%EOF\n").decode()
    response = client.post("/cv/extract", json={"file_b64": empty_pdf, "filename": "scan.pdf"})
    assert response.status_code == 422
    assert response.json()["detail"]


def test_refuses_an_empty_file_rather_than_creating_a_blank_record() -> None:
    response = client.post("/cv/extract", json={"file_b64": base64.b64encode(b"   ").decode()})
    assert response.status_code == 422


# Repli de lecture quand le calque texte est du bruit et qu'aucune clé OCR n'est
# posée (cas Ludovic) : le PDF part en bloc `document` à Claude, sinon erreur claire.
GARBAGE_PDF = _make_pdf("@#$%^&*~|<>=+?[]{}" * 6)


def _post_garbage():
    return client.post(
        "/cv/extract",
        json={"file_b64": base64.b64encode(GARBAGE_PDF).decode(), "filename": "dossier.pdf"},
    )


def test_garbled_pdf_without_ocr_key_is_read_by_claude(monkeypatch) -> None:
    from app.services import ocr

    monkeypatch.delenv("OCR_API_KEY", raising=False)
    seen: dict = {}

    async def fake_document(data: bytes, **kwargs):
        seen["bytes"] = data
        return "YANIS BERTHIER Ingénieur plateforme Kubernetes", None

    monkeypatch.setattr(ocr, "call_claude_document_text", fake_document)
    response = _post_garbage()
    assert response.status_code == 200, response.text
    assert "Kubernetes" in response.json()["data"]["text"]
    assert seen["bytes"] == GARBAGE_PDF


def test_ocr_key_wins_over_the_claude_fallback(monkeypatch) -> None:
    from app.services import ocr

    monkeypatch.setenv("OCR_API_KEY", "k")

    async def fake_ocr(data, filename=None):
        return "texte OCR du dossier de compétences"

    async def boom(*args, **kwargs):
        raise AssertionError("Claude ne doit pas être appelé quand l'OCR répond")

    monkeypatch.setattr(ocr, "_provider_extract_text", fake_ocr)
    monkeypatch.setattr(ocr, "call_claude_document_text", boom)
    response = _post_garbage()
    assert response.status_code == 200, response.text
    assert "OCR" in response.json()["data"]["text"]


def test_garbled_pdf_when_claude_fails_gives_a_named_error(monkeypatch) -> None:
    from app.services import ocr

    monkeypatch.delenv("OCR_API_KEY", raising=False)

    async def fail(*args, **kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(ocr, "call_claude_document_text", fail)
    response = _post_garbage()
    assert response.status_code == 422
    assert "illisible" in response.json()["detail"]


def test_claude_saying_no_text_is_an_error_not_a_blank_record(monkeypatch) -> None:
    from app.services import ocr
    from app.services.claude_service import IMAGE_NO_TEXT_SENTINEL

    monkeypatch.delenv("OCR_API_KEY", raising=False)

    async def none(*args, **kwargs):
        return IMAGE_NO_TEXT_SENTINEL, None

    monkeypatch.setattr(ocr, "call_claude_document_text", none)
    assert _post_garbage().status_code == 422
