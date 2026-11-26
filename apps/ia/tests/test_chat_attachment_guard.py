"""#2438.7 — scanner taille et macros AVANT tout traitement d'une pièce jointe.

Une pièce jointe de chat traverse `/rag/ingest` (dépôt unitaire) ou
`ingest/zip` (dépaqueté côté NestJS puis SOI-MÊME renvoyé vers cette même
route, `RagZipIngestService`) — donc une garde posée ICI couvre les deux
chemins. Avant ce lot : aucune limite de taille SERVEUR (seul `ATTACH_MAX_BYTES`
du navigateur, contournable par un appel direct à l'API) et un `.docx` porteur
de macros VBA était lu comme n'importe quel autre document Office.
"""

from __future__ import annotations

import hashlib
import io
import zipfile

from app.services.attachment_guard import (
    MAX_ATTACHMENT_BYTES,
    attachment_refusal,
    sha256_of,
)

_DOCX_XML = """<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Cahier des charges</w:t></w:r></w:p></w:body>
</w:document>"""


def _docx_bytes(*, with_macro: bool) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", _DOCX_XML)
        if with_macro:
            # Un `.docx` macro-activé porte TOUJOURS cette entrée binaire,
            # quel que soit le nom déclaré par l'appelant — c'est la forme
            # exacte, pas l'extension, qui trahit les macros.
            archive.writestr("word/vbaProject.bin", b"\x00\x01fake-vba-payload")
    return buffer.getvalue()


def test_a_clean_docx_passes() -> None:
    assert attachment_refusal(_docx_bytes(with_macro=False), "cdc.docx") is None


def test_a_macro_enabled_docx_is_refused_even_renamed_to_docx() -> None:
    refusal = attachment_refusal(_docx_bytes(with_macro=True), "cdc.docx")
    assert refusal is not None
    assert refusal.code == "macro_enabled"
    assert "macro" in refusal.message.lower()
    assert "cdc.docx" in refusal.message


def test_an_oversized_file_is_refused_before_any_parsing() -> None:
    oversized = b"a" * (MAX_ATTACHMENT_BYTES + 1)
    refusal = attachment_refusal(oversized, "gros.txt")
    assert refusal is not None
    assert refusal.code == "too_large"


def test_a_file_at_the_limit_passes() -> None:
    at_limit = b"a" * MAX_ATTACHMENT_BYTES
    assert attachment_refusal(at_limit, "pile.txt") is None


def test_user_attachment_over_8mb_stays_refused() -> None:
    """#3586 — le plafond élargi du Drive interne ne touche pas les pièces jointes."""
    refusal = attachment_refusal(b"a" * 8_100_000, "gros.pdf")
    assert refusal is not None
    assert refusal.code == "too_large"
    assert attachment_refusal(b"a" * 8_100_000, "gros.pdf", source="user") is not None


def test_internal_drive_accepts_20mb() -> None:
    assert attachment_refusal(b"a" * 20_000_000, "gros.pdf", source="internal_drive") is None


def test_internal_drive_refuses_30mb() -> None:
    refusal = attachment_refusal(b"a" * 30_000_000, "enorme.pdf", source="internal_drive")
    assert refusal is not None
    assert refusal.code == "too_large"
    assert "25 Mo" in refusal.message


def test_internal_drive_still_refuses_macros() -> None:
    refusal = attachment_refusal(_docx_bytes(with_macro=True), "cdc.docx", source="internal_drive")
    assert refusal is not None
    assert refusal.code == "macro_enabled"


def test_size_is_checked_before_macro_scan() -> None:
    """Le plafond de TAILLE tombe avant même d'ouvrir l'archive — pas de zip
    géant décompressé en mémoire pour chercher une entrée VBA."""
    huge_zip_like = b"PK" + b"a" * MAX_ATTACHMENT_BYTES
    refusal = attachment_refusal(huge_zip_like, "enorme.docx")
    assert refusal is not None
    assert refusal.code == "too_large"


def test_sha256_of_matches_stdlib() -> None:
    data = b"contenu de test"
    assert sha256_of(data) == hashlib.sha256(data).hexdigest()


def test_a_non_zip_file_is_not_scanned_for_macros() -> None:
    """Un PDF/texte ordinaire n'est jamais ouvert comme une archive."""
    assert attachment_refusal(b"%PDF-1.4 rien de zip ici", "plaquette.pdf") is None
