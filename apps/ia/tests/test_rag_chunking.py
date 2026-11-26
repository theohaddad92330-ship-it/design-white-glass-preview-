"""#3750 — le découpage d'un document de connaissance en MORCEAUX citables.

Un classeur « Brand Messaging » de dix onglets ingéré d'un seul tenant n'avait
qu'UN embedding (titre + 2 000 premiers caractères) et qu'UN extrait de
400 caractères au prompt : l'onglet « 07 · Objections » n'atteignait jamais
Laura. Ces tests tiennent le découpage par UNITÉ (onglet, diapositive,
section), la ligne d'en-tête d'un tableur répétée en tête de chaque bloc, le
repli en fenêtre avec chevauchement, et le cas court (un seul morceau,
comportement inchangé).
"""

from __future__ import annotations

import io
import zipfile

from app.services.document_text import extract_document_text, extract_document_units
from app.services.rag_chunking import (
    RAG_CHUNK_OVERLAP_CHARS,
    RAG_CHUNK_TARGET_CHARS,
    RAG_MAX_CHUNKS_PER_DOCUMENT,
    bound_chunks,
    build_chunks,
    units_from_text,
)

# ─── fabriques de fichiers Office (bibliothèque standard, comme les autres tests) ───


def _zip(entries: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


_NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _sheet_xml(rows: list[list[str]]) -> str:
    body = ""
    for row in rows:
        cells = "".join(f'<c t="inlineStr"><is><t>{value}</t></is></c>' for value in row)
        body += f"<row>{cells}</row>"
    return f'<worksheet xmlns="{_NS_MAIN}"><sheetData>{body}</sheetData></worksheet>'


def _xlsx(sheets: list[tuple[str, list[list[str]]]]) -> bytes:
    workbook_sheets = "".join(
        f'<sheet name="{name}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, (name, _rows) in enumerate(sheets)
    )
    rels = "".join(
        f'<Relationship Id="rId{i + 1}" Type="{_NS_REL}/worksheet" Target="worksheets/sheet{i + 1}.xml"/>'
        for i in range(len(sheets))
    )
    entries = {
        "xl/workbook.xml": f'<workbook xmlns="{_NS_MAIN}" xmlns:r="{_NS_REL}"><sheets>{workbook_sheets}</sheets></workbook>',
        "xl/_rels/workbook.xml.rels": (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' f"{rels}</Relationships>"
        ),
    }
    for i, (_name, rows) in enumerate(sheets):
        entries[f"xl/worksheets/sheet{i + 1}.xml"] = _sheet_xml(rows)
    return _zip(entries)


def _slide_xml(*paragraphs: str) -> str:
    body = "".join(f"<a:p><a:r><a:t>{text}</a:t></a:r></a:p>" for text in paragraphs)
    return (
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        f"<p:cSld><p:spTree><p:sp><p:txBody>{body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>"
    )


def _notes_xml(*paragraphs: str) -> str:
    body = "".join(f"<a:p><a:r><a:t>{text}</a:t></a:r></a:p>" for text in paragraphs)
    return (
        '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        f"<p:cSld><p:spTree><p:sp><p:txBody>{body}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>"
    )


def _pptx(slides: dict[int, list[str]], notes: dict[int, list[str]]) -> bytes:
    entries = {"ppt/presentation.xml": "<p:presentation/>"}
    for index, paragraphs in slides.items():
        entries[f"ppt/slides/slide{index}.xml"] = _slide_xml(*paragraphs)
    for index, paragraphs in notes.items():
        entries[f"ppt/notesSlides/notesSlide{index}.xml"] = _notes_xml(*paragraphs)
    return _zip(entries)


_NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _docx(paragraphs: list[tuple[str | None, str]]) -> bytes:
    body = ""
    for style, text in paragraphs:
        ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        body += f"<w:p>{ppr}<w:r><w:t>{text}</w:t></w:r></w:p>"
    return _zip({"word/document.xml": f'<w:document xmlns:w="{_NS_W}"><w:body>{body}</w:body></w:document>'})


# ─── les unités d'un fichier ───


class TestDocumentUnits:
    def test_xlsx_one_unit_per_sheet_named_like_the_tab(self):
        data = _xlsx(
            [
                ("01 · Positionnement", [["Thème", "Message"], ["Cloud", "Souverain"]]),
                ("07 · Objections", [["Objection", "Réponse"], ["Trop cher", "TCO sur 3 ans"]]),
            ]
        )
        units = extract_document_units(data, "brand.xlsx")
        assert [label for label, _ in units] == ["01 · Positionnement", "07 · Objections"]
        assert "Trop cher\tTCO sur 3 ans" in units[1][1]

    def test_xlsx_text_names_each_sheet_in_workbook_order(self):
        # #3751.4 — chaque onglet porte son nom en tête, séparés par une ligne vide.
        data = _xlsx([("Zèbre", [["x", "y"]]), ("Alpha", [["z"]])])
        text = extract_document_text(data, "f.xlsx").text
        assert text == "## Feuille : Zèbre\nx\ty\n\n## Feuille : Alpha\nz"

    def test_pptx_one_unit_per_slide_with_its_notes(self):
        data = _pptx({1: ["Titre"], 13: ["Objections clients"]}, {13: ["Répondre par le TCO"]})
        units = extract_document_units(data, "deck.pptx")
        assert [label for label, _ in units] == ["Slide 1", "Slide 13"]
        assert "Répondre par le TCO" in units[1][1]

    def test_docx_sections_cut_on_headings(self):
        data = _docx(
            [
                (None, "Préambule"),
                ("Heading1", "Offre"),
                (None, "Nous livrons."),
                ("Titre2", "Objections"),
                (None, "Le prix."),
            ]
        )
        units = extract_document_units(data, "guide.docx")
        assert [label for label, _ in units] == ["", "Offre", "Objections"]
        assert "Le prix." in units[2][1]

    def test_markdown_sections_cut_on_headings(self):
        units = extract_document_units(b"# Offre\nNous livrons.\n## Objections\nLe prix.", "guide.md")
        assert [label for label, _ in units] == ["Offre", "Objections"]


# ─── le découpage en morceaux ───


class TestBuildChunks:
    def test_a_short_document_is_one_chunk_unchanged(self):
        text = "Référence bancaire : migration cloud en 6 mois."
        chunks = build_chunks(text)
        assert len(chunks) == 1
        assert chunks[0].content == text
        assert chunks[0].unit_label == ""

    def test_a_short_document_with_units_is_still_one_chunk(self):
        chunks = build_chunks("a\nb", units=[("Feuille 1", "a"), ("Feuille 2", "b")])
        assert len(chunks) == 1

    def test_a_long_document_keeps_one_chunk_per_unit(self):
        units = [("07 · Objections", "o" * 900), ("08 · Preuves", "p" * 900)]
        chunks = build_chunks("o" * 900 + "\n" + "p" * 900, units=units)
        assert [c.unit_label for c in chunks] == ["07 · Objections", "08 · Preuves"]

    def test_a_long_sheet_repeats_its_header_row_in_every_block(self):
        header = "Objection\tRéponse\tPreuve"
        rows = [f"Objection {i}\tRéponse argumentée numéro {i}\tCas client {i}" for i in range(120)]
        sheet = "\n".join([header, *rows])
        chunks = build_chunks(sheet + "\n" + "x" * 10, units=[("07 · Objections", sheet), ("Autre", "x" * 10)])
        sheet_chunks = [c for c in chunks if c.unit_label == "07 · Objections"]
        assert len(sheet_chunks) > 1
        for chunk in sheet_chunks:
            assert chunk.content.startswith(header + "\n")
            assert len(chunk.content) <= RAG_CHUNK_TARGET_CHARS
        # Aucune rangée perdue, aucune dupliquée.
        body_rows = [line for c in sheet_chunks for line in c.content.split("\n")[1:]]
        assert body_rows == rows

    def test_prose_falls_back_to_a_window_with_overlap(self):
        words = " ".join(f"mot{i}" for i in range(1200))
        chunks = build_chunks(words)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk.content) <= RAG_CHUNK_TARGET_CHARS
        # Le chevauchement : la fin d'un morceau se retrouve au début du suivant.
        tail = chunks[0].content[-RAG_CHUNK_OVERLAP_CHARS // 2 :]
        assert tail.split()[-1] in chunks[1].content
        # Rien de perdu : le dernier mot est dans le dernier morceau.
        assert "mot1199" in chunks[-1].content

    def test_without_units_slide_markers_become_units(self):
        text = "[Diapositive 1]\n" + "a" * 900 + "\n\n[Diapositive 13]\n" + "b" * 900
        chunks = build_chunks(text)
        assert [c.unit_label for c in chunks] == ["Slide 1", "Slide 13"]

    def test_units_from_text_without_structure_is_one_unlabelled_unit(self):
        assert units_from_text("simple texte") == [("", "simple texte")]


class TestBound:
    def test_the_chunk_count_is_bounded_and_measured(self):
        chunks = build_chunks("\n\n".join(f"# S{i}\n" + "z" * 1000 for i in range(RAG_MAX_CHUNKS_PER_DOCUMENT + 25)))
        kept, total = bound_chunks(chunks)
        assert total == RAG_MAX_CHUNKS_PER_DOCUMENT + 25
        assert len(kept) == RAG_MAX_CHUNKS_PER_DOCUMENT
