"""Fabriques de fichiers FICTIFS pour les tests OCR-PARTOUT (#3935, 12/10).

Tout est généré ici : aucun fichier réel, aucune donnée de personne.
"""

from __future__ import annotations

import io
import struct

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 64

CLEAN = (
    "Jean DUPONT. Ingénieur cybersécurité à Paris. "
    "Compétences : Python, Docker, Kubernetes, Terraform, Ansible, Vault. "
    "Huit ans de missions chez des clients du secteur bancaire, dont trois à la "
    "tête d'une équipe de six personnes. Diplôme d'ingénieur en informatique, "
    "spécialité sécurité des systèmes d'information."
)


def blank_pdf(pages: int = 1) -> bytes:
    """Un PDF sans calque texte : ce que donne un scan."""
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def text_pdf(text: str, pages: int = 1) -> bytes:
    """Un PDF avec un vrai calque texte (police standard Helvetica)."""
    writer = PdfWriter()
    for _ in range(pages):
        page = writer.add_blank_page(width=600, height=800)
        escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 9 Tf 10 780 Td ({escaped}) Tj ET".encode("latin-1", errors="replace"))
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


# ── Word 97 (.doc) : un conteneur OLE minimal, écrit à la main ───────────────

_SECTOR = 512
_ENDOFCHAIN = 0xFFFFFFFE
_FATSECT = 0xFFFFFFFD
_FREE = 0xFFFFFFFF


def _entry(name: str, kind: int, start: int, size: int, left: int = _FREE, right: int = _FREE, child: int = _FREE) -> bytes:
    encoded = name.encode("utf-16-le") + b"\x00\x00" if name else b""
    raw = encoded.ljust(64, b"\x00")
    return (
        raw
        + struct.pack("<H", len(encoded))
        + bytes([kind, 1])
        + struct.pack("<III", left, right, child)
        + b"\x00" * 16  # CLSID
        + b"\x00" * 4  # state bits
        + b"\x00" * 16  # timestamps
        + struct.pack("<I", start)
        + struct.pack("<Q", size)
    )


def ole_file(streams: dict[str, bytes]) -> bytes:
    """Un fichier OLE (CFB v3) contenant ``streams`` — assez grand (≥ 4096) pour
    éviter le mini-flux. Lisible par `olefile`, donc par le vrai code testé."""
    names = list(streams)
    padded = {n: streams[n].ljust(max(4096, -(-len(streams[n]) // _SECTOR) * _SECTOR), b"\x00") for n in names}
    # Secteurs : 0 = FAT, 1 = répertoire, puis les flux.
    starts: dict[str, int] = {}
    cursor = 2
    for n in names:
        starts[n] = cursor
        cursor += len(padded[n]) // _SECTOR
    total_sectors = cursor
    fat = [_FREE] * (_SECTOR // 4)
    fat[0] = _FATSECT
    fat[1] = _ENDOFCHAIN
    for n in names:
        count = len(padded[n]) // _SECTOR
        for i in range(count):
            fat[starts[n] + i] = starts[n] + i + 1 if i < count - 1 else _ENDOFCHAIN
    assert total_sectors <= len(fat), "fixture trop grosse"

    # Répertoire : racine + flux, frères chaînés par l'arbre (tous à droite).
    entries = [_entry("Root Entry", 5, _ENDOFCHAIN, 0, child=1 if names else _FREE)]
    for i, n in enumerate(names):
        right = i + 2 if i + 1 < len(names) else _FREE
        entries.append(_entry(n, 2, starts[n], len(padded[n]), right=right))
    directory = b"".join(entries).ljust(_SECTOR, b"\x00")
    assert len(entries) <= 4

    header = (
        b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
        + b"\x00" * 16
        + struct.pack("<HHHHH", 0x003E, 0x0003, 0xFFFE, 9, 6)
        + b"\x00" * 6
        + struct.pack("<IIIIIIIII", 0, 1, 1, 0, 4096, _ENDOFCHAIN, 0, _ENDOFCHAIN, 0)
        + struct.pack("<I", 0)  # DIFAT[0] = secteur 0 (la FAT)
        + struct.pack("<I", _FREE) * 108
    )
    header = header.ljust(_SECTOR, b"\x00")
    body = struct.pack("<" + "I" * len(fat), *fat) + directory + b"".join(padded[n] for n in names)
    return header + body


def word97_doc(text: str, *, compressed: bool = True) -> bytes:
    """Un .doc Word 97 minimal : FIB + table de pièces (Clx) + texte."""
    payload = text.encode("cp1252") if compressed else text.encode("utf-16-le")
    ccp = len(text)
    text_offset = 0x0800  # le texte vit après le FIB
    fc = (text_offset * 2) | 0x40000000 if compressed else text_offset
    plc = struct.pack("<II", 0, ccp) + struct.pack("<HIH", 0, fc, 0)
    clx = b"\x02" + struct.pack("<I", len(plc)) + plc
    fib = bytearray(0x400)
    struct.pack_into("<H", fib, 0, 0xA5EC)  # wIdent
    struct.pack_into("<H", fib, 0x0A, 0x0200)  # fWhichTblStm → 1Table
    struct.pack_into("<I", fib, 0x4C, ccp)  # ccpText
    struct.pack_into("<II", fib, 0x1A2, 0, len(clx))  # fcClx = 0, lcbClx
    word_stream = bytes(fib).ljust(text_offset, b"\x00") + payload
    return ole_file({"WordDocument": word_stream, "1Table": clx})
