"""Server-side document → text extraction (RAG PDF ingest, Théo p.21)."""

from __future__ import annotations

import io

import pytest
from pypdf import PdfReader, PdfWriter

from app.services.document_text import DocumentTextError, extract_document_text


def _make_pdf(text: str) -> bytes:
    """A minimal valid one-page PDF carrying a real text layer with a font
    resource, assembled by hand with correct xref offsets so pypdf extracts it."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        None,  # content stream, filled below
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream_body = f"BT /F1 24 Tf 20 100 Td ({text}) Tj ET".encode()
    objects[3] = b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream_body), stream_body)

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (i, body)
    xref_pos = len(out)
    out += b"xref\n0 %d\n" % (len(objects) + 1)
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objects) + 1, xref_pos)
    return bytes(out)


def test_extracts_utf8_text_for_non_pdf():
    result = extract_document_text(b"# Playbook\nBonjour", "notes.md")
    assert result.text == "# Playbook\nBonjour"
    # #1954.30 — un document non-PDF n'a pas de notion de page manquante :
    # il n'est jamais « partiel ».
    assert result.partial is False


def test_detects_pdf_by_magic_bytes_even_with_wrong_extension():
    pdf = _make_pdf("Hello RAG")
    out = extract_document_text(pdf, "mislabelled.txt")  # ext lies, magic bytes win
    assert "Hello RAG" in out.text


def test_extracts_pdf_by_extension():
    pdf = _make_pdf("Dossier commercial")
    result = extract_document_text(pdf, "doc.pdf")
    assert "Dossier commercial" in result.text
    # #1954.16/#1954.30 — un PDF dont TOUTES les pages se lisent n'est jamais
    # rendu « partiel » : ce serait une carte qui doute d'un document intact.
    assert result.partial is False


def test_empty_file_raises():
    with pytest.raises(DocumentTextError):
        extract_document_text(b"", "x.txt")


def test_image_only_pdf_raises_clear_error():
    # A PDF with no text layer → nothing extractable, must fail with guidance.
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    with pytest.raises(DocumentTextError):
        extract_document_text(buf.getvalue(), "scan.pdf")


def test_binary_blob_under_text_extension_raises():
    # A non-PDF binary (e.g. an image renamed .txt) decodes to mostly replacement
    # chars — must be rejected, not ingested as mojibake.
    blob = bytes(range(256)) * 8
    with pytest.raises(DocumentTextError):
        extract_document_text(blob, "photo.txt")


def test_mostly_clean_text_with_a_stray_byte_survives():
    # A legit text file with one odd byte stays under the threshold and ingests.
    text = ("Bonjour, ceci est un vrai document commercial. " * 5).encode() + b"\xff"
    assert "document commercial" in extract_document_text(text, "notes.txt").text


def test_partial_pdf_extraction_is_flagged():
    """#1954.16 / #1954.30 — un PDF dont une page a un texte réel et l'autre
    est une image sans calque texte (un scan intercalé dans un dossier autrement
    numérique) doit dire qu'il est PARTIEL : le texte de la page lisible est
    quand même utile à ingérer, mais jamais présenté comme un succès plein."""
    readable = PdfReader(io.BytesIO(_make_pdf("Hello RAG")))
    writer = PdfWriter()
    writer.add_page(readable.pages[0])
    writer.add_blank_page(width=300, height=200)  # page sans calque texte
    buf = io.BytesIO()
    writer.write(buf)

    result = extract_document_text(buf.getvalue(), "dossier-partiel.pdf")

    assert "Hello RAG" in result.text
    assert result.partial is True


# #2542 — un PDF à encodage difficile rend du texte NON vide mais illisible
# (glyphes sans table Unicode) : il ne doit pas passer pour un CV lu, il doit
# ouvrir le repli OCR de l'appelant, ou finir en erreur nommée.
def test_a_pdf_whose_text_layer_is_garbage_is_refused_by_name() -> None:
    pdf = _make_pdf("@#$%^&*~|<>=+?[]{}" * 6)
    with pytest.raises(DocumentTextError, match="illisible|encodage"):
        extract_document_text(pdf, "dossier.pdf")


def test_a_pdf_with_a_normal_text_layer_is_not_taken_for_garbage() -> None:
    result = extract_document_text(_make_pdf("Ingenieur plateforme Kubernetes Go Prometheus 2023-2026"), "cv.pdf")
    assert "Kubernetes" in result.text
