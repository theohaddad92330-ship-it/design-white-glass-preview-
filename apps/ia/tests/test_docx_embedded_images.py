"""#3935 — les images embarquées d'un .docx (CV scanné collé dans Word) sont lues.

Fichiers FICTIFS générés ici. `_read_image` (OCR puis Claude) est simulé : aucun réseau.
"""

from __future__ import annotations

import asyncio
import io
import zipfile

import pytest

from app.services import document_reader
from app.services.document_reader import read_document
from app.services.document_text import DocumentTextError, ExtractedDocument, docx_embedded_images

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 30_000
SMALL_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100  # une puce, un filet : jamais lue
BODY = "Jean DUPONT\nIngénieur cybersécurité\n" + "Compétences : Python, Docker, Kubernetes. " * 20


def docx(paragraphs: list[str], media: dict[str, bytes]) -> bytes:
    xml = (
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        + "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
        + "</w:body></w:document>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", xml)
        for name, content in media.items():
            archive.writestr(f"word/media/{name}", content)
    return buffer.getvalue()


@pytest.fixture
def reads(monkeypatch: pytest.MonkeyPatch) -> list[bytes]:
    seen: list[bytes] = []

    async def fake(data, filename=None):  # noqa: ANN001
        seen.append(data)
        return ExtractedDocument(text="Texte lu dans l'image : Mission chez un grand compte bancaire.")

    monkeypatch.setattr(document_reader, "_read_image", fake)
    return seen


def run(coro):  # noqa: ANN001
    return asyncio.run(coro)


def test_selection_ignores_small_images_and_unknown_formats() -> None:
    data = docx(["x"], {"image1.png": PNG, "bullet.png": SMALL_PNG, "logo.emf": b"\x01" * 40_000})
    assert [image[0] for image in docx_embedded_images(data)] == [PNG]


def test_selection_is_capped() -> None:
    data = docx(["x"], {f"image{i}.png": PNG + bytes([i]) for i in range(20)})
    assert len(docx_embedded_images(data)) == 6


def test_a_sparse_docx_gets_its_images_read(reads) -> None:
    data = docx(["Jean DUPONT"], {"image1.png": PNG})
    out = run(read_document(data, "cv.docx", fallback_without_key=True))
    assert "Jean DUPONT" in out.text and "grand compte bancaire" in out.text
    assert reads == [PNG]


def test_a_docx_made_only_of_images_is_read_instead_of_refused(reads) -> None:
    data = docx([], {"image1.png": PNG})
    out = run(read_document(data, "cv.docx", fallback_without_key=True))
    assert "grand compte bancaire" in out.text


def test_a_docx_with_a_full_text_layer_triggers_no_image_read(reads) -> None:
    data = docx([BODY], {"photo.png": PNG})
    out = run(read_document(data, "cv.docx", fallback_without_key=True))
    assert reads == [] and "grand compte" not in out.text


def test_without_the_opt_in_or_an_ocr_key_nothing_is_read(reads, monkeypatch) -> None:
    monkeypatch.delenv("OCR_API_KEY", raising=False)
    data = docx(["Jean DUPONT"], {"image1.png": PNG})
    out = run(read_document(data, "cv.docx"))
    assert reads == [] and out.text == "Jean DUPONT"


def test_images_that_read_nothing_keep_the_original_refusal(monkeypatch) -> None:
    async def silent(data, filename=None):  # noqa: ANN001
        raise DocumentTextError("Aucun texte lisible dans l'image.")

    monkeypatch.setattr(document_reader, "_read_image", silent)
    data = docx([], {"image1.png": PNG})
    with pytest.raises(DocumentTextError, match="uniquement des images"):
        run(read_document(data, "cv.docx", fallback_without_key=True))
