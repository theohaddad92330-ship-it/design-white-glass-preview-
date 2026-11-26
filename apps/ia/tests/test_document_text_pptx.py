"""Lecture des présentations `.pptx` (#2667.2 — suite de #2667.1/#1954).

Décision de Louis (QCM du 21/09) : « pptx ET OCR des images ». `.pptx` est,
comme `.docx`/`.xlsx`, une archive ZIP dont le texte vit dans du XML —
`ppt/slides/slideN.xml` porte le texte des diapositives, `ppt/notesSlides/`
les notes de l'orateur quand elles existent. Même choix que
`test_document_text_office.py` : bibliothèque standard (ZIP + XML), pas
`python-pptx` — les fichiers `.pptx` de ces tests sont donc construits à la
main, comme les `.docx`/`.xlsx` déjà testés.
"""

from __future__ import annotations

import io
import zipfile

import pytest

from app.services.document_text import DocumentTextError, extract_document_text


def _slide_xml(*paragraphs: str) -> str:
    body = "".join(f"<a:p><a:r><a:t>{text}</a:t></a:r></a:p>" for text in paragraphs)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        f"<p:cSld><p:spTree><p:sp><p:txBody>{body}</p:txBody></p:sp></p:spTree></p:cSld>"
        "</p:sld>"
    )


def _notes_xml(*paragraphs: str) -> str:
    body = "".join(f"<a:p><a:r><a:t>{text}</a:t></a:r></a:p>" for text in paragraphs)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        f"<p:cSld><p:spTree><p:sp><p:txBody>{body}</p:txBody></p:sp></p:spTree></p:cSld>"
        "</p:notes>"
    )


def _zip(entries: dict[str, str]) -> bytes:
    # #2667.2 — COMPRESSÉ (comme un vrai `.pptx` produit par Office), pas
    # stocké tel quel : un zip non compressé porte le texte en clair dans ses
    # octets bruts, ce qui ferait passer le repli générique « décoder en UTF-8 »
    # (`extract_document_text`, en bas de fichier) pour une vraie lecture pptx
    # — un faux vert qui ne prouverait rien.
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def _pptx(slides: dict[int, list[str]], notes: dict[int, list[str]] | None = None) -> bytes:
    entries = {"ppt/presentation.xml": "<p:presentation/>"}
    for index, paragraphs in slides.items():
        entries[f"ppt/slides/slide{index}.xml"] = _slide_xml(*paragraphs)
    for index, paragraphs in (notes or {}).items():
        entries[f"ppt/notesSlides/notesSlide{index}.xml"] = _notes_xml(*paragraphs)
    return _zip(entries)


def test_pptx_text_is_extracted():
    data = _pptx({1: ["Cadrage en six semaines", "Semaine 1 : atelier de 45 minutes"]})
    text = extract_document_text(data, "cadrage.pptx").text
    assert "Cadrage en six semaines" in text
    assert "Semaine 1 : atelier de 45 minutes" in text


def test_pptx_slides_stay_in_order_even_with_ten_or_more():
    # `slide10.xml` < `slide2.xml` en tri ALPHABÉTIQUE — un tri naïf sur le nom
    # d'entrée ZIP mélangerait l'ordre de lecture dès la dixième diapositive.
    data = _pptx({1: ["Première"], 2: ["Deuxième"], 10: ["Dixième"]})
    text = extract_document_text(data, "deck.pptx").text
    assert text.index("Première") < text.index("Deuxième") < text.index("Dixième")


def test_pptx_carries_a_slide_marker():
    # Sans repère, un passage cité par l'extraction d'exigences ne dit pas
    # d'où il vient.
    data = _pptx({1: ["Contenu de la première diapositive"]})
    text = extract_document_text(data, "deck.pptx").text
    assert "1" in text.split("Contenu")[0]


def test_pptx_includes_speaker_notes_when_present():
    data = _pptx({1: ["Titre de la diapositive"]}, notes={1: ["Ne pas oublier de mentionner le prix"]})
    text = extract_document_text(data, "deck.pptx").text
    assert "Titre de la diapositive" in text
    assert "Ne pas oublier de mentionner le prix" in text


def test_pptx_without_notes_does_not_fabricate_a_notes_section():
    data = _pptx({1: ["Titre seul, sans notes"]})
    text = extract_document_text(data, "deck.pptx").text
    assert "Titre seul, sans notes" in text
    assert "Notes" not in text


def test_pptx_is_recognised_without_its_extension():
    data = _pptx({1: ["Reconnu par le contenu de l'archive"]})
    assert "Reconnu par le contenu de l'archive" in extract_document_text(data, None).text


def test_a_corrupted_pptx_archive_says_so_instead_of_returning_garbage():
    # L'ARCHIVE elle-même est illisible (pas un ZIP valide) : refus net, jamais
    # un texte vide qui passerait pour une présentation vide.
    with pytest.raises(DocumentTextError, match="PowerPoint"):
        extract_document_text(b"not a real zip file at all", "cassee.pptx")


def test_a_pptx_with_no_readable_slide_says_so():
    data = _zip({"ppt/presentation.xml": "<p:presentation/>"})
    with pytest.raises(DocumentTextError, match="PowerPoint"):
        extract_document_text(data, "vide.pptx")


def test_one_unreadable_slide_does_not_sink_the_whole_deck():
    # Même degré de tolérance que `_extract_xlsx` pour une feuille cassée : une
    # diapositive isolée illisible ne doit pas faire disparaître les autres.
    data = _pptx({1: ["Diapositive saine"]})
    with zipfile.ZipFile(io.BytesIO(data), "a") as archive:
        archive.writestr("ppt/slides/slide2.xml", "<p:sld not-valid-xml")
    text = extract_document_text(data, "deck.pptx").text
    assert "Diapositive saine" in text
