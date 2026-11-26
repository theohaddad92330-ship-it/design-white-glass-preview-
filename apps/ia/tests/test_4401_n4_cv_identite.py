"""#4401 (recette 21/10, N4) — un CV simple donne son identité : nom, e-mail, téléphone.

Cause : les coordonnées vivent dans un EN-TÊTE / un PIED DE PAGE que ``read_document`` ne gardait pas
(DOCX : seul ``word/document.xml`` était lu), et ``_validate_fields`` jetait en silence le bloc ``identity``
dont la citation était introuvable. L'identité se complète maintenant de ce que le document ÉCRIT (e-mail,
téléphone, LinkedIn : la valeur lue est sa propre citation) ; le nom vient de la première ligne « Prénom NOM »
ou reste vide et se DIT ; un bloc jeté est journalisé avec son MOTIF, jamais sa valeur.
"""

from __future__ import annotations

import io
import logging
import zipfile
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.main import app
from app.routers.cv import _validate_fields
from app.services import cv_identity, document_reader, ocr
from app.services.document_text import extract_document_text

client = TestClient(app)

_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def _paragraph(text: str) -> str:
    return f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"


def _docx(*, body: list[str], header: list[str] | None = None, footer: list[str] | None = None) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr(
            "word/document.xml",
            f"<w:document {_W}><w:body>{''.join(_paragraph(t) for t in body)}</w:body></w:document>",
        )
        if header:
            archive.writestr("word/header1.xml", f"<w:hdr {_W}>{''.join(_paragraph(t) for t in header)}</w:hdr>")
        if footer:
            archive.writestr("word/footer1.xml", f"<w:ftr {_W}>{''.join(_paragraph(t) for t in footer)}</w:ftr>")
    return buffer.getvalue()


def _text_pdf(lines: list[str]) -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    ops = ["BT /F1 11 Tf 14 TL 40 760 Td"]
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        ops.append(f"({escaped}) Tj T*")
    ops.append("ET")
    stream = DecodedStreamObject()
    stream.set_data("\n".join(ops).encode("latin-1", errors="replace"))
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
    )
    page[NameObject("/Contents")] = writer._add_object(stream)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


_BODY = [
    "Marie DUPONT",
    "Ingénieur cybersécurité",
    "Compétences : Python, Docker, Kubernetes, Terraform, Ansible, Vault.",
    "Huit ans de missions chez des clients du secteur bancaire.",
]


# ── (a) l'en-tête et le pied de page d'un DOCX sont lus ─────────────────────────────────────────────


def test_un_docx_garde_son_en_tete_et_son_pied_de_page() -> None:
    data = _docx(
        body=["Ingénieur cybersécurité", "Huit ans de missions."],
        header=["Marie DUPONT", "marie.dupont@example.com | 06 12 34 56 78"],
        footer=["linkedin.com/in/marie-dupont"],
    )
    text = extract_document_text(data, "cv.docx").text
    assert "marie.dupont@example.com" in text and "06 12 34 56 78" in text
    assert "linkedin.com/in/marie-dupont" in text
    # l'en-tête précède le corps, le pied de page le suit
    assert text.index("Marie DUPONT") < text.index("Ingénieur cybersécurité") < text.index("linkedin.com")


def test_non_un_docx_sans_en_tete_est_lu_comme_avant() -> None:
    text = extract_document_text(_docx(body=["Une ligne.", "Une autre."]), "cv.docx").text
    assert text == "Une ligne.\nUne autre."


def test_un_en_tete_repete_n_est_lu_qu_une_fois() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", f"<w:document {_W}><w:body>{_paragraph('Corps')}</w:body></w:document>")
        for name in ("header1.xml", "header2.xml"):
            archive.writestr(f"word/{name}", f"<w:hdr {_W}>{_paragraph('a@b.fr')}</w:hdr>")
    assert extract_document_text(buffer.getvalue(), "cv.docx").text.count("a@b.fr") == 1


# ── (b)(c) l'extracteur déterministe ────────────────────────────────────────────────────────────────


def test_extracteur_lit_email_telephone_linkedin_dans_le_texte() -> None:
    text = "Marie DUPONT\nmarie.dupont@example.com · +33 6 12 34 56 78\nhttps://www.linkedin.com/in/marie-dupont/\n"
    facts = cv_identity.read_contact_facts(text)
    assert facts["email"] == "marie.dupont@example.com"
    assert facts["phone"] == "+33 6 12 34 56 78"
    assert facts["linkedin"] == "https://www.linkedin.com/in/marie-dupont/"


@pytest.mark.parametrize(
    "phone", ["06 12 34 56 78", "06.12.34.56.78", "0612345678", "+33 (0)6 12 34 56 78", "+44 20 7946 0958"]
)
def test_extracteur_lit_les_formats_de_telephone(phone: str) -> None:
    assert cv_identity.read_contact_facts(f"Tél : {phone}\n")["phone"] is not None


def test_non_extracteur_ne_lit_ni_une_date_ni_un_nombre_ni_une_adresse_incomplete() -> None:
    facts = cv_identity.read_contact_facts("Missions 2019-2024, 12 345 678 € de budget, contact@ à compléter\n")
    assert facts == {"email": None, "phone": None, "linkedin": None}


@pytest.mark.parametrize(
    ("text", "name"),
    [
        ("Marie DUPONT\nIngénieur", "Marie DUPONT"),
        ("CURRICULUM VITAE\nJean-Pierre Martin\nDéveloppeur", "Jean-Pierre Martin"),
        ("DUPONT Marie\nconsultante", "DUPONT Marie"),
    ],
)
def test_le_nom_se_prend_dans_la_premiere_ligne_prenom_nom(text: str, name: str) -> None:
    assert cv_identity.guess_name(text) == name


@pytest.mark.parametrize(
    "text",
    ["Ingénieur cybersécurité\nParis", "Compétences : Python\nMarie", "marie.dupont@example.com\n06 12 34 56 78", ""],
)
def test_non_sans_ligne_qui_ressemble_a_un_nom_il_reste_vide(text: str) -> None:
    assert cv_identity.guess_name(text) is None


# ── l'identité complétée sur /cv/parse ──────────────────────────────────────────────────────────────


def _parse(cv_text: str, model_fields: list[dict]) -> dict:
    with patch("app.routers.cv.call_claude", AsyncMock(return_value=({"fields": model_fields}, None))):
        response = client.post("/cv/parse", json={"cv_text": cv_text})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _identity(data: dict) -> dict:
    return next(field for field in data["fields"] if field["detection"] == "identity")


def test_un_docx_dont_les_coordonnees_sont_dans_l_en_tete_remplit_l_identite() -> None:
    docx = _docx(
        body=["Ingénieur cybersécurité", "Huit ans de missions."],
        header=["Marie DUPONT", "marie.dupont@example.com | 06 12 34 56 78"],
    )
    text = extract_document_text(docx, "cv.docx").text
    # le modèle n'a rien rendu pour l'identité
    identity = _identity(_parse(text, []))
    assert identity["value"] is not None
    value = str(identity["value"])
    assert "Marie DUPONT" in value and "marie.dupont@example.com" in value and "06 12 34 56 78" in value
    # la citation EST la valeur lue, retrouvable dans le texte
    assert identity["excerpt_offset"] is not None and identity["excerpt_offset"] >= 0
    assert "marie.dupont@example.com" in identity["source_excerpt"]


def test_un_pdf_texte_simple_donne_nom_email_telephone() -> None:
    pdf = _text_pdf(["Marie DUPONT", "marie.dupont@example.com - 06 12 34 56 78", "Ingenieur cybersecurite"])
    text = extract_document_text(pdf, "cv.pdf").text
    value = str(_identity(_parse(text, []))["value"])
    assert "Marie DUPONT" in value
    assert "marie.dupont@example.com" in value
    assert "06 12 34 56 78" in value


def test_le_modele_qui_a_rendu_le_nom_garde_sa_valeur_et_recoit_les_coordonnees_manquantes() -> None:
    text = "Marie DUPONT\nIngénieur\nmarie.dupont@example.com\n06 12 34 56 78\n"
    identity = _identity(
        _parse(
            text,
            [{"detection": "identity", "value": "Marie DUPONT", "confidence": 0.9, "source_excerpt": "Marie DUPONT"}],
        )
    )
    value = str(identity["value"])
    assert value.startswith("Marie DUPONT")
    assert "marie.dupont@example.com" in value and "06 12 34 56 78" in value


def test_non_un_cv_sans_coordonnees_n_invente_rien_et_le_dit() -> None:
    text = "Ingénieur cybersécurité\nCompétences : Python, Docker.\nHuit ans de missions.\n"
    data = _parse(text, [])
    assert _identity(data)["value"] is None
    assert set(data["identity_gaps"]) == {"name", "email", "phone"}


def test_non_une_valeur_inventee_par_le_modele_n_est_pas_completee_par_le_texte() -> None:
    text = "Ingénieur cybersécurité\nHuit ans de missions.\n"
    data = _parse(text, [{"detection": "identity", "value": "x@y.fr", "confidence": 0.9, "source_excerpt": "x@y.fr"}])
    assert _identity(data)["value"] is None


# ── (d) texte quasi vide d'un PDF → OCR ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_un_pdf_au_texte_quasi_vide_passe_par_l_ocr(monkeypatch: pytest.MonkeyPatch) -> None:
    pdf = _text_pdf(["Marie DUPONT"])
    full = "Marie DUPONT\nmarie.dupont@example.com\n06 12 34 56 78\n" + "Expérience de huit ans en cybersécurité. " * 8

    called: list[str] = []

    async def fake_ocr(data, filename=None, **_kw):
        called.append("ocr")
        return full, "ocr"

    monkeypatch.setattr(ocr, "extract_text_with_route", fake_ocr)
    monkeypatch.setattr(ocr, "is_configured", lambda: True)
    monkeypatch.setattr(ocr, "can_read_size", lambda data: True)
    result = await document_reader.read_document(pdf, "cv.pdf", judge_pages=True, fallback_without_key=True)
    assert called == ["ocr"]
    assert "marie.dupont@example.com" in result.text


@pytest.mark.asyncio
async def test_non_un_pdf_au_texte_suffisant_ne_declenche_pas_l_ocr(monkeypatch: pytest.MonkeyPatch) -> None:
    lines = [
        "Marie DUPONT",
        "marie.dupont@example.com",
        *["Huit ans de missions chez des clients bancaires, en équipe."] * 16,
    ]
    pdf = _text_pdf(lines)

    async def boom(*_a, **_k):
        raise AssertionError("l'OCR ne doit pas partir pour un texte suffisant")

    monkeypatch.setattr(ocr, "extract_text_with_route", boom)
    result = await document_reader.read_document(pdf, "cv.pdf", judge_pages=True, fallback_without_key=True)
    assert "marie.dupont@example.com" in result.text


# ── (e) un bloc jeté est journalisé avec son MOTIF, jamais sa valeur ────────────────────────────────


def test_un_bloc_jete_est_journalise_avec_son_motif_sans_sa_valeur(caplog: pytest.LogCaptureFixture) -> None:
    secret = "Valeur Secrete Unique 424242"
    text = "Marie DUPONT\nIngénieur\n"
    with caplog.at_level(logging.INFO, logger="app.routers.cv"):
        _validate_fields(
            [
                {"detection": "tools", "value": [secret], "confidence": 0.9, "source_excerpt": "citation introuvable"},
                {"detection": "languages", "value": [secret], "confidence": 0.9, "source_excerpt": ""},
                {"detection": "inconnu", "value": [secret], "confidence": 0.9, "source_excerpt": "Marie"},
            ],
            text,
        )
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "quote_not_found" in logged and "no_quote" in logged and "unknown_detection" in logged
    assert "tools" in logged and "languages" in logged
    assert secret not in logged and "424242" not in logged and "citation introuvable" not in logged


def test_une_zone_de_texte_est_lue_une_fois_sans_sa_copie_de_repli() -> None:
    mc = "http://schemas.openxmlformats.org/markup-compatibility/2006"
    box = _paragraph("marie.dupont@example.com")
    body = (
        f'<w:p xmlns:mc="{mc}"><w:r><w:t>Corps</w:t></w:r>'
        f"<mc:AlternateContent><mc:Choice><w:txbxContent>{box}</w:txbxContent></mc:Choice>"
        f"<mc:Fallback><w:txbxContent>{box}</w:txbxContent></mc:Fallback></mc:AlternateContent></w:p>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", f"<w:document {_W}><w:body>{body}</w:body></w:document>")
    text = extract_document_text(buffer.getvalue(), "cv.docx").text
    assert text.count("marie.dupont@example.com") == 1
    assert text.splitlines()[0] == "Corps"
