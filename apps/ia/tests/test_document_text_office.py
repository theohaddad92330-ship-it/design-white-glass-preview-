"""Lecture des documents Office (addendum final p66 — intake RFP).

Un appel d'offres est presque toujours un `.docx` (le cahier des charges)
accompagné d'un `.xlsx` (la grille d'exigences ou le bordereau de prix). Ne pas
les lire, c'est laisser la ressaisie — la raison d'être du studio.

Les deux formats sont parsés avec la bibliothèque standard (ZIP + XML) plutôt
qu'avec python-docx/openpyxl : deux dépendances de moins dans l'image, et la
lecture des nœuds de texte tient en quarante lignes. Ces tests construisent donc
de VRAIS fichiers Office minimaux, à la main — c'est la seule façon de vérifier
qu'on lit bien le format et pas une idée du format.
"""

from __future__ import annotations

import io
import zipfile

import pytest

from app.services.document_text import DocumentTextError, extract_document_text

_DOCX_XML = """<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Cahier des charges</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Lot 1 : </w:t></w:r><w:r><w:t>industrialisation MLOps</w:t></w:r></w:p>
    <w:p/>
    <w:p><w:r><w:t>Exigence obligatoire : hébergement en France</w:t></w:r></w:p>
  </w:body>
</w:document>"""

_SHARED_STRINGS = """<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
  <si><t>Exigence</t></si>
  <si><t>Niveau</t></si>
  <si><t>Chiffrement au repos</t></si>
  <si><t>obligatoire</t></si>
</sst>"""

_SHEET_XML = """<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>
    <row r="3"><c r="A3"><v>42</v></c></row>
  </sheetData>
</worksheet>"""


def _zip(entries: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def _docx() -> bytes:
    return _zip({"word/document.xml": _DOCX_XML})


def _xlsx() -> bytes:
    return _zip({"xl/sharedStrings.xml": _SHARED_STRINGS, "xl/worksheets/sheet1.xml": _SHEET_XML})


# ── Word ─────────────────────────────────────────────────────────────────────


def test_docx_text_is_extracted():
    text = extract_document_text(_docx(), "cahier.docx").text
    assert "Cahier des charges" in text
    assert "hébergement en France" in text


def test_docx_keeps_paragraph_breaks():
    # Sans les coupures, un cahier des charges arrive en un seul bloc et
    # l'extraction d'exigences perd la seule structure qu'il portait.
    lines = extract_document_text(_docx(), "cahier.docx").text.splitlines()
    assert lines[0] == "Cahier des charges"
    assert len(lines) == 3, "un paragraphe vide ne produit pas de ligne vide"


def test_docx_joins_runs_inside_one_paragraph():
    # Word découpe une phrase en plusieurs `<w:r>` dès qu'un mot change de style :
    # les joindre est ce qui évite « Lot 1 : » et « industrialisation » sur deux
    # lignes distinctes.
    assert "Lot 1 : industrialisation MLOps" in extract_document_text(_docx(), "cahier.docx").text


def test_docx_is_recognised_without_its_extension():
    # Un fichier renommé, ou transmis par une API sans nom : on regarde ce que
    # l'archive contient réellement.
    assert "Cahier des charges" in extract_document_text(_docx(), None).text


def test_a_corrupted_docx_says_so_instead_of_returning_garbage():
    with pytest.raises(DocumentTextError, match="Word"):
        extract_document_text(_zip({"word/document.xml": "<w:document"}), "cassé.docx")


# ── Excel ────────────────────────────────────────────────────────────────────


def test_xlsx_rows_become_lines_and_cells_become_columns():
    # Une grille d'exigences est un tableau : perdre les lignes fondrait
    # « exigence | obligatoire | sécurité » en une bouillie non rattachable.
    lines = extract_document_text(_xlsx(), "grille.xlsx").text.splitlines()
    # #3751.4 — la ligne de titre d'onglet précède les rangées.
    assert lines[0].startswith("## Feuille : ")
    assert lines[1] == "Exigence\tNiveau"
    assert lines[2] == "Chiffrement au repos\tobligatoire"


def test_xlsx_reads_numeric_cells_without_the_string_table():
    assert "42" in extract_document_text(_xlsx(), "grille.xlsx").text


def test_xlsx_survives_a_reference_outside_the_string_table():
    # Un classeur mal formé doit dégrader, pas échouer : la cellule rend "" et
    # les autres lignes restent lisibles.
    broken_sheet = _SHEET_XML.replace('<c r="A1" t="s"><v>0</v></c>', '<c r="A1" t="s"><v>99</v></c>')
    data = _zip({"xl/sharedStrings.xml": _SHARED_STRINGS, "xl/worksheets/sheet1.xml": broken_sheet})
    assert "Chiffrement au repos" in extract_document_text(data, "grille.xlsx").text


def test_xlsx_is_recognised_without_its_extension():
    assert "Chiffrement au repos" in extract_document_text(_xlsx(), None).text


def test_a_workbook_without_a_sheet_says_so():
    with pytest.raises(DocumentTextError, match="Excel"):
        extract_document_text(_zip({"xl/sharedStrings.xml": _SHARED_STRINGS}), "vide.xlsx")


# ── Non-régression sur l'existant ────────────────────────────────────────────


def test_plain_text_is_untouched():
    assert extract_document_text("exigence libre".encode(), "notes.txt").text == "exigence libre"


def test_an_unknown_binary_is_still_refused():
    # La garde d'origine tient : un binaire sous une extension texte ne doit pas
    # être ingéré en mojibake.
    with pytest.raises(DocumentTextError):
        extract_document_text(bytes(range(256)) * 8, "image.txt")


def test_an_empty_file_is_refused():
    with pytest.raises(DocumentTextError, match="vide"):
        extract_document_text(b"", "vide.docx")
