"""Server-side document → text extraction for RAG ingest (Théo p.21) and RFP
intake (addendum final p66-68).

The web used to read files with ``file.text()`` (UTF-8), so a PDF ingested as
mojibake. We now send the raw bytes (base64) and extract text HERE:
  - PDF   → pypdf, page by page
  - DOCX  → zip + XML (stdlib)
  - XLSX  → zip + XML (stdlib), one line per row
  - PPTX  → zip + XML (stdlib), slide by slide, in order, with speaker notes
  - PNG/JPEG/WEBP → the model reads the visible text (no local OCR binary) —
    ``extract_image_text`` (async, calls out to ``claude_service``)
  - DOC   → olefile + table de pièces (Word 97-2003), RTF → pile de groupes (#3935)
  - else  → UTF-8 decode (txt/md/csv/json)

Word et Excel arrivent avec l'intake RFP : un appel d'offres est presque toujours
un .docx (le cahier des charges) accompagné d'un .xlsx (la grille d'exigences ou
le bordereau de prix). Ne pas les lire, c'est laisser la ressaisie — c'est-à-dire
la raison d'être du studio.

Ils sont parsés avec la BIBLIOTHÈQUE STANDARD, pas avec python-docx/openpyxl :
les deux formats sont des archives ZIP contenant du XML, la lecture des nœuds de
texte tient en quarante lignes, et ça évite deux dépendances de plus dans une
image Railway. Le compromis est assumé : on récupère le TEXTE (et la structure en
lignes pour un tableur), pas la mise en forme — c'est exactement ce dont
l'extraction d'exigences a besoin.

#2667.2 — décision de Louis (QCM du 21/09) : « pptx ET OCR des images ». Un
`.pptx` est la MÊME famille que `.docx`/`.xlsx` (archive ZIP + XML) : même
bibliothèque standard, aucune dépendance de plus. Une image, elle, n'a pas de
calque texte à lire dans du XML — et ce dépôt n'embarque ni tesseract ni
pytesseract (aucun binaire OCR dans l'image Railway, décision assumée). Le seul
chemin qui lit une image ici est donc le MODÈLE, via le client Anthropic déjà
câblé (`claude_service.call_claude_image_text`) — jamais une description
devinée : une LECTURE, pas une interprétation.

Pure-Python, no native deps — safe on Railway.
"""

from __future__ import annotations

import io
import logging
import re
import struct
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass
from xml.etree import ElementTree

from pypdf import PdfReader

from app.services.claude_service import IMAGE_NO_TEXT_SENTINEL, call_claude_image_text
from app.services.image_minimization import minimized

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExtractedDocument:
    """Le texte extrait d'un document, et si l'extraction est COMPLÈTE.

    #1954.16 / #1954.30 (Laura, retours bêta 12/09/2026) — un PDF où une
    page a un vrai calque texte et l'autre est une image (un scan glissé dans
    un dossier autrement numérique) ne doit jamais se présenter comme un
    succès plein : le texte récupéré reste utile à ingérer, mais la carte de
    la pièce doit dire « Partiellement lisible », pas « Prêt ». `partial`
    porte cette distinction jusqu'à l'appelant plutôt que de la faire
    disparaître dans une simple chaîne.

    Seul le PDF connaît aujourd'hui cette notion (une page qui n'a rendu
    aucun texte) : RTF, Office et texte brut restent `partial=False` — ils
    n'ont pas de découpage en pages dont une partie pourrait manquer.
    """

    text: str
    partial: bool = False

_PDF_MAGIC = b"%PDF-"
#: Word 97-2003 (.doc) : archive OLE / Compound File Binary.
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
#: Rich Text Format — très fréquent derrière une extension `.doc`, parce que
#: c'est ce que produisent les exports « Word » de nombreux outils RH.
_RTF_MAGIC = b"{\\rtf"
#: Les deux formats Office sont des archives ZIP — mêmes octets magiques.
_ZIP_MAGIC = b"PK\x03\x04"

#: Espaces de noms OOXML. On matche sur le nom LOCAL des balises plutôt que sur
#: l'URI complète : Word et Excel versionnent leurs namespaces, et un document
#: produit par LibreOffice ou Google Docs n'utilise pas toujours les mêmes.
_OOXML_TEXT_TAGS = {"t"}

#: Bornes dures. Un cahier des charges de 400 pages ou un tableur de 50 000
#: lignes n'a pas à passer entier dans un prompt : on tronque ICI, à la lecture,
#: plutôt que de laisser un appelant découvrir la limite au moment de l'appel.
_MAX_XLSX_ROWS = 5000
_MAX_TEXT_CHARS = 400_000

#: #2667.1 — une archive DÉPOSÉE EN PIÈCE JOINTE (`.zip`, distinct d'un .docx/
#: .xlsx qui sont AUSSI des zips mais reconnus avant celui-ci). Formats lus À
#: L'INTÉRIEUR : les mêmes que `ATTACH_EXTENSIONS` côté web (`Chat.tsx`) — un
#: format non listé ici est SAUTÉ, jamais deviné. Une archive imbriquée
#: (`.zip` dans le `.zip`) n'est PAS dans cette liste : elle n'est jamais lue,
#: donc jamais de récursion, donc jamais de bombe imbriquée.
_ARCHIVE_INNER_EXTENSIONS = (".pdf", ".docx", ".xlsx", ".txt", ".md", ".csv", ".json")
#: Même plafond que `ATTACH_MAX_COUNT` côté web : une archive est UNE pièce
#: jointe (comme un PDF de cinquante pages en est une), pas un moyen de
#: contourner la limite de pièces jointes d'un message avec son contenu.
_MAX_ARCHIVE_ENTRIES = 3
#: Taille décompressée totale tolérée — se protège d'une bombe zip (un flux de
#: quelques Ko qui explose en dizaines de mégaoctets une fois désarchivé) sans
#: jamais rien écrire sur disque : vérifiée sur la taille DÉCLARÉE de chaque
#: entrée (`ZipInfo.file_size`, lue par `infolist()`) avant toute
#: décompression, puis revérifiée pendant la lecture au cas où l'en-tête ment.
_MAX_ARCHIVE_DECOMPRESSED_BYTES = 40_000_000

# Above this share of U+FFFD replacement chars, a "text" decode is really raw
# binary (an image, .docx, .xlsx… uploaded with a text extension) — reject it
# rather than ingest mojibake (CLAUDE.md: never store fabricated/garbage data).
_MAX_REPLACEMENT_RATIO = 0.1


class DocumentTextError(ValueError):
    """Raised when a document can't be turned into usable text."""


def _looks_like_pdf(data: bytes, filename: str | None) -> bool:
    if filename and filename.lower().endswith(".pdf"):
        return True
    # Magic bytes win over the extension — a mislabelled .txt that is really a
    # PDF still gets parsed correctly (and vice-versa).
    return data[:5] == _PDF_MAGIC


_CID_TOKEN = re.compile(r"\(cid:\d+\)")


def _is_garbled(text: str) -> bool:
    """Le texte rendu par un calque PDF est-il du bruit plutôt que des mots ?

    Trois signaux, chacun mesuré sur le texte entier : des `(cid:N)` non
    résolus, des caractères de remplacement, ou une part de lettres/chiffres
    trop basse pour être de la prose. Un texte court n'est jamais jugé.
    """
    compact = "".join(text.split())
    if len(compact) < 40:
        return False
    cid_chars = sum(len(match) for match in _CID_TOKEN.findall(compact))
    if cid_chars / len(compact) > 0.3:
        return True
    if compact.count("�") / len(compact) > _MAX_REPLACEMENT_RATIO:
        return True
    wordish = sum(1 for char in compact if char.isalnum())
    return wordish / len(compact) < 0.4


def _extract_pdf(data: bytes) -> ExtractedDocument:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as exc:  # malformed / encrypted-without-password / not a PDF
        raise DocumentTextError("PDF illisible (corrompu ou protégé par mot de passe).") from exc
    if reader.is_encrypted:
        # pypdf can sometimes open owner-encrypted PDFs with an empty password.
        try:
            reader.decrypt("")
        except Exception:
            raise DocumentTextError("PDF protégé par mot de passe — impossible d'extraire le texte.") from None
    parts: list[str] = []
    # #1954.16 / #1954.30 — une page qui ne rend AUCUN texte (scan, erreur
    # d'extraction) alors que d'autres pages en rendent est le signal qu'un
    # scan s'est glissé dans un dossier autrement numérique : le document
    # reste ingéré (le texte des pages lisibles sert), mais jamais présenté
    # comme un succès plein.
    empty_pages = 0
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception as exc:  # a single bad page shouldn't kill the whole doc
            logger.warning("pypdf page extract failed (skipping page): %s", exc)
            page_text = ""
        if page_text.strip():
            parts.append(page_text)
        else:
            empty_pages += 1
    text = "\n\n".join(p.strip() for p in parts if p.strip())
    partial = bool(parts) and empty_pages > 0
    return ExtractedDocument(text=text, partial=partial)


#: Groupes RTF qui ne portent AUCUN contenu : tables de polices, de couleurs,
#: métadonnées, images. Les garder ferait apparaître « Arial; » au milieu d'un CV.
_RTF_SKIPPED_GROUPS = ("fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "listtable")


def _extract_rtf(data: bytes) -> str:
    """Texte d'un RTF, sans dépendance.

    Beaucoup de fichiers nommés `.doc` sont en réalité du RTF : c'est ce que
    produisent les exports « Word » de nombreux outils RH, et un CV de dix ans a
    de bonnes chances d'en être un. Les refuser en bloc revenait à écarter une
    part réelle des viviers anciens.

    Le parcours se fait à la PILE et non à coups d'expressions régulières : une
    table de polices contient des accolades imbriquées, et une regex laisse
    passer « Arial; » au milieu du texte. On sait où on est, donc on sait quoi
    jeter.

    Ce qu'on ne sait pas décoder est ABANDONNÉ, jamais deviné — un caractère
    inventé au milieu d'un nom de personne est pire qu'un caractère absent.
    """
    raw = data.decode("latin-1", errors="replace")
    out: list[str] = []
    # Profondeur des groupes à ignorer : dès qu'on entre dans un `\fonttbl`, on
    # note la profondeur et on jette tout jusqu'à en ressortir.
    skip_depth: int | None = None
    depth = 0
    i = 0
    length = len(raw)
    while i < length:
        char = raw[i]
        if char == "{":
            depth += 1
            i += 1
            continue
        if char == "}":
            if skip_depth is not None and depth <= skip_depth:
                skip_depth = None
            depth -= 1
            i += 1
            continue
        if char == "\\":
            # #3935 — `\*` ouvre une destination optionnelle (`{\*\generator …}`) :
            # tout le groupe est jeté, sinon « Riched20 » fuit dans le CV.
            if raw.startswith("\\*", i):
                if skip_depth is None:
                    skip_depth = depth
                i += 2
                continue
            match = re.match(r"\\([a-zA-Z]+)(-?\d+)? ?", raw[i:])
            if match:
                word = match.group(1)
                if word in _RTF_SKIPPED_GROUPS and skip_depth is None:
                    skip_depth = depth
                elif word in ("par", "line", "pard", "page") and skip_depth is None:
                    out.append("\n")
                elif word == "tab" and skip_depth is None:
                    out.append("\t")
                elif word == "u" and match.group(2) and skip_depth is None:
                    # `\uN` : caractère Unicode (N signé sur 16 bits) suivi d'UN
                    # caractère de repli ASCII qu'on jette (« \u8211? »).
                    code = int(match.group(2)) % 65536
                    out.append(chr(code))
                    i += match.end()
                    if i < length and raw[i] != "\\":
                        i += 1
                    continue
                i += match.end()
                continue
            hexa = re.match(r"\\'([0-9a-fA-F]{2})", raw[i:])
            if hexa:
                if skip_depth is None:
                    out.append(bytes([int(hexa.group(1), 16)]).decode("cp1252", errors="replace"))
                i += hexa.end()
                continue
            # Caractère échappé littéral (`\{`, `\}`, `\\`).
            if i + 1 < length:
                if skip_depth is None:
                    out.append(raw[i + 1])
                i += 2
                continue
            i += 1
            continue
        if skip_depth is None:
            out.append(char)
        i += 1

    lines = [line.strip() for line in "".join(out).splitlines()]
    return "\n".join(line for line in lines if line)


#: Magie du FIB (File Information Block) d'un Word 97-2003.
_WORD_FIB_MAGIC = 0xA5EC
_FIB_FLAGS_OFFSET = 0x0A
_FIB_CCP_TEXT_OFFSET = 0x4C
_FIB_CLX_OFFSET = 0x1A2


def _u16(buf: bytes, offset: int) -> int:
    return struct.unpack_from("<H", buf, offset)[0]


def _u32(buf: bytes, offset: int) -> int:
    return struct.unpack_from("<I", buf, offset)[0]


def _clean_word_text(raw: str) -> str:
    """Retire les codes de champ et les marques de structure d'un texte Word.

    `\\x13 code \\x14 résultat \\x15` : on garde le RÉSULTAT (ce que Word
    affiche), jamais le code (« HYPERLINK … »)."""
    out: list[str] = []
    in_result: list[bool] = []
    for char in raw:
        if char == "\x13":
            in_result.append(False)
        elif char == "\x14" and in_result:
            in_result[-1] = True
        elif char == "\x15" and in_result:
            in_result.pop()
        elif in_result and not in_result[-1]:
            continue  # code du champ
        elif char in ("\r", "\x0b", "\x0c"):
            out.append("\n")
        elif char == "\x07":
            out.append("\t")
        elif char in ("\n", "\t") or ord(char) >= 32:
            out.append(char)
    lines = [line.strip() for line in "".join(out).splitlines()]
    return "\n".join(line for line in lines if line)


def _extract_word97(data: bytes) -> str:
    """Texte d'un .doc Word 97-2003 (conteneur OLE) — `olefile`, pur Python.

    On suit la table de pièces (Clx) du FIB : chaque pièce dit où vit son texte
    (cp1252 compressé, ou UTF-16). Ce qu'on ne sait pas lire LÈVE — jamais un
    texte approché (un caractère inventé dans un nom propre est pire qu'un
    refus nommé)."""
    import olefile  # import tardif : la dépendance ne coûte rien aux autres formats

    try:
        ole = olefile.OleFileIO(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001
        raise DocumentTextError("Fichier Word 97-2003 (.doc) corrompu.") from exc
    try:
        if not ole.exists("WordDocument"):
            raise DocumentTextError("Fichier OLE sans document Word (.doc illisible).")
        word = ole.openstream("WordDocument").read()
        if len(word) < _FIB_CLX_OFFSET + 8 or _u16(word, 0) != _WORD_FIB_MAGIC:
            raise DocumentTextError("En-tête Word 97-2003 non reconnu.")
        table_name = "1Table" if _u16(word, _FIB_FLAGS_OFFSET) & 0x0200 else "0Table"
        if not ole.exists(table_name):
            raise DocumentTextError("Table de pièces Word introuvable.")
        table = ole.openstream(table_name).read()
    finally:
        ole.close()

    fc_clx, lcb_clx = struct.unpack_from("<II", word, _FIB_CLX_OFFSET)
    clx = table[fc_clx : fc_clx + lcb_clx]
    try:
        cursor = 0
        while cursor < len(clx) and clx[cursor] == 1:  # Prc : propriétés, sautées
            cursor += 3 + _u16(clx, cursor + 1)
        if cursor >= len(clx) or clx[cursor] != 2:
            raise DocumentTextError("Table de pièces Word illisible.")
        size = _u32(clx, cursor + 1)
        plc = clx[cursor + 5 : cursor + 5 + size]
        pieces = (size - 4) // 12
        cps = struct.unpack_from(f"<{pieces + 1}I", plc, 0)
        ccp_text = _u32(word, _FIB_CCP_TEXT_OFFSET)
        limit = ccp_text if 0 < ccp_text <= cps[-1] else cps[-1]
        parts: list[str] = []
        for index in range(pieces):
            count = min(cps[index + 1], limit) - cps[index]
            if count <= 0:
                continue
            fc = _u32(plc, 4 * (pieces + 1) + 8 * index + 2)
            if fc & 0x40000000:
                start = (fc & 0x3FFFFFFF) // 2
                parts.append(word[start : start + count].decode("cp1252", errors="replace"))
            else:
                parts.append(word[fc : fc + 2 * count].decode("utf-16-le", errors="replace"))
    except DocumentTextError:
        raise
    except (struct.error, IndexError) as exc:
        raise DocumentTextError("Table de pièces Word illisible.") from exc
    return _clean_word_text("".join(parts))


def _local_name(tag: str) -> str:
    """Nom local d'une balise XML, namespace retiré."""
    return tag.rsplit("}", 1)[-1]


def _extract_docx(data: bytes) -> str:
    """Texte d'un .docx : les nœuds `<w:t>` de `word/document.xml`.

    Une coupure de paragraphe (`<w:p>`) devient un saut de ligne — sans elle, un
    cahier des charges arrive en un seul bloc et l'extraction d'exigences perd
    la seule structure exploitable qu'il portait.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml = archive.read("word/document.xml")
            # #4401 (N4) — les coordonnées d'un CV vivent souvent dans l'EN-TÊTE ou le PIED DE PAGE.
            names = sorted(archive.namelist())
            headers = [archive.read(n) for n in names if re.fullmatch(r"word/header\d*\.xml", n)]
            footers = [archive.read(n) for n in names if re.fullmatch(r"word/footer\d*\.xml", n)]
    except (KeyError, zipfile.BadZipFile) as exc:
        raise DocumentTextError("Document Word illisible (archive corrompue).") from exc

    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as exc:
        raise DocumentTextError("Document Word illisible (XML invalide).") from exc

    def parts_lines(parts: list[bytes]) -> list[str]:
        out: list[str] = []
        for part in parts:
            try:
                out.extend(_ooxml_lines(ElementTree.fromstring(part)))
            except ElementTree.ParseError:
                continue  # un en-tête illisible ne coûte pas le corps du document
        return out

    # Une ligne identique d'un en-tête à l'autre (première page, pages paires) n'est lue qu'une fois ;
    # le corps, lui, garde ses lignes répétées telles quelles.
    lines = [
        *dict.fromkeys(parts_lines(headers)),
        *_ooxml_lines(root),
        *dict.fromkeys(parts_lines(footers)),
    ]
    return "\n".join(lines)


def _ooxml_lines(root: ElementTree.Element) -> list[str]:
    """Les lignes de texte d'une partie OOXML : un paragraphe = une ligne.

    #4401 (N4) — le texte d'une ZONE DE TEXTE (``txbxContent``) est lu comme ses propres paragraphes et
    n'est plus recollé au paragraphe qui l'ancre ; la branche ``Fallback`` d'une ``AlternateContent``
    (la même zone, dessinée une seconde fois) est ignorée."""
    lines: list[str] = []

    def walk(node: ElementTree.Element) -> None:
        for child in node:
            name = _local_name(child.tag)
            if name == "Fallback":
                continue
            if name == "p":
                own: list[str] = []
                nested: list[str] = []
                collect(child, own, nested)
                line = "".join(own).strip()
                if line:
                    lines.append(line)
                lines.extend(nested)
            else:
                walk(child)

    def collect(node: ElementTree.Element, own: list[str], nested: list[str]) -> None:
        for child in node:
            name = _local_name(child.tag)
            if name == "Fallback":
                continue
            if name == "txbxContent":
                nested.extend(_ooxml_lines(child))
            elif name in _OOXML_TEXT_TAGS:
                if child.text:
                    own.append(child.text)
            else:
                collect(child, own, nested)

    walk(root)
    return lines


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    """Table des chaînes partagées. Absente sur un classeur sans texte — auquel
    cas les cellules portent leurs valeurs en clair et la table est inutile."""
    try:
        xml = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        return []
    strings: list[str] = []
    for item in root:
        pieces = [node.text for node in item.iter() if _local_name(node.tag) in _OOXML_TEXT_TAGS and node.text]
        strings.append("".join(pieces))
    return strings


def _extract_xlsx(data: bytes) -> str:
    """Texte d'un .xlsx, une LIGNE de tableur par ligne de texte.

    Une grille d'exigences est un tableau : perdre les lignes reviendrait à
    fondre « exigence | obligatoire | sécurité » en une bouillie où plus rien
    n'est rattachable. Les colonnes sont séparées par des tabulations.
    """
    # #3751.4 — l'aperçu du chat affiche CE texte : sans le nom des onglets, on
    # ne savait ni où la feuille suivante commence ni comment elle s'appelle.
    # Lecture unique, celle de `_xlsx_units` (noms via workbook.xml, même
    # plafond de rangées). Le découpage RAG (#3750) lit les unités du fichier,
    # pas ce texte ; en rattrapage `units_from_text` relit ces titres Markdown.
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if not any(re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name) for name in archive.namelist()):
                raise DocumentTextError("Classeur Excel sans feuille lisible.")
    except zipfile.BadZipFile as exc:
        raise DocumentTextError("Classeur Excel illisible (archive corrompue).") from exc
    return "\n\n".join(f"## Feuille : {label}\n{body}" for label, body in _xlsx_units(data))


def _xlsx_cell_text(cell: ElementTree.Element, shared: list[str]) -> str:
    """Valeur affichable d'une cellule. Une référence hors table rend "" plutôt
    que de lever : un classeur mal formé doit dégrader, pas échouer."""
    kind = cell.get("t")
    if kind == "s":
        value = next((node.text for node in cell if _local_name(node.tag) == "v"), None)
        try:
            return shared[int(value)] if value is not None else ""
        except (ValueError, IndexError):
            return ""
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.iter() if _local_name(node.tag) in _OOXML_TEXT_TAGS)
    return next((node.text or "" for node in cell if _local_name(node.tag) == "v"), "")


def _pptx_slide_index(name: str) -> int:
    """Numéro de diapositive tiré du nom d'entrée ZIP (`ppt/slides/slide12.xml`
    → 12). Un tri ALPHABÉTIQUE sur le nom mettrait `slide10.xml` avant
    `slide2.xml` — c'est ce plafond de 10 diapositives qui aurait mélangé
    l'ordre de lecture sans lui."""
    match = re.search(r"(\d+)", name)
    return int(match.group(1)) if match else 0


def _pptx_paragraphs_text(xml: bytes) -> list[str]:
    """Une ligne par paragraphe DrawingML (`<a:p>`), runs joints — même lecture
    que `_extract_docx` : Word et PowerPoint nomment tous deux leurs nœuds de
    texte `t` (localement), seul le namespace change."""
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as exc:
        raise DocumentTextError("Diapositive illisible (XML invalide).") from exc
    lines: list[str] = []
    for paragraph in root.iter():
        if _local_name(paragraph.tag) != "p":
            continue
        pieces = [
            node.text
            for node in paragraph.iter()
            if _local_name(node.tag) in _OOXML_TEXT_TAGS and node.text
        ]
        line = "".join(pieces).strip()
        if line:
            lines.append(line)
    return lines


def _extract_pptx(data: bytes) -> str:
    """Texte d'un `.pptx`, DIAPOSITIVE PAR DIAPOSITIVE et DANS L'ORDRE.

    Un `.pptx` est une archive ZIP comme `.docx`/`.xlsx` : `ppt/slides/slideN.xml`
    porte le texte des formes, `ppt/notesSlides/notesSlideN.xml` les notes de
    l'orateur quand elles existent (simplification assumée : la correspondance
    slide↔notes se fait par le MÊME numéro N, pas par les relations OOXML
    `slideN.xml.rels` — vrai pour un deck construit normalement, comme pour un
    classeur `.xlsx` on ne lit ni style ni mise en forme). Chaque bloc porte un
    repère (`[Diapositive N]`) : sans lui, un passage cité par l'extraction
    d'exigences ne dirait pas d'où il vient. Même tolérance qu'`_extract_xlsx`
    pour une feuille cassée : UNE diapositive illisible ne doit pas faire
    disparaître les autres — seule une archive elle-même corrompue, ou un deck
    sans aucune diapositive lisible, est un refus net.
    """
    return "\n\n".join(text for _index, text in _pptx_slide_blocks(data))


def _pptx_slide_blocks(data: bytes) -> list[tuple[int, str]]:
    """Les blocs de `_extract_pptx`, chacun avec son numéro de diapositive —
    #3750 : `extract_document_units` cite « Slide N » sans relire l'archive."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
            slides = sorted(
                (n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
                key=_pptx_slide_index,
            )
            if not slides:
                raise DocumentTextError("Présentation PowerPoint sans diapositive lisible.")
            blocks: list[tuple[int, str]] = []
            for slide_name in slides:
                index = _pptx_slide_index(slide_name)
                try:
                    slide_lines = _pptx_paragraphs_text(archive.read(slide_name))
                except DocumentTextError:
                    logger.warning("pptx slide unreadable (skipping): %s", slide_name)
                    continue
                notes_name = f"ppt/notesSlides/notesSlide{index}.xml"
                notes_lines: list[str] = []
                if notes_name in names:
                    try:
                        notes_lines = _pptx_paragraphs_text(archive.read(notes_name))
                    except DocumentTextError:
                        logger.warning("pptx notes unreadable (skipping): %s", notes_name)
                parts = [f"[Diapositive {index}]", *slide_lines]
                if notes_lines:
                    parts.append("[Notes]")
                    parts.extend(notes_lines)
                blocks.append((index, "\n".join(parts)))
            if not blocks:
                raise DocumentTextError("Présentation PowerPoint sans diapositive lisible.")
            return blocks
    except zipfile.BadZipFile as exc:
        raise DocumentTextError("Présentation PowerPoint illisible (archive corrompue).") from exc


def _office_kind(data: bytes, filename: str | None) -> str | None:
    """`docx`, `xlsx`, `pptx`, ou `None`. L'extension tranche quand elle est
    présente ; sinon on regarde ce que l'archive contient réellement."""
    name = (filename or "").lower()
    if name.endswith(".docx"):
        return "docx"
    if name.endswith(".xlsx"):
        return "xlsx"
    if name.endswith(".pptx"):
        return "pptx"
    if data[:4] != _ZIP_MAGIC:
        return None
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
    except zipfile.BadZipFile:
        return None
    if "word/document.xml" in names:
        return "docx"
    if any(name.startswith("xl/worksheets/") for name in names):
        return "xlsx"
    if any(name.startswith("ppt/slides/") for name in names):
        return "pptx"
    return None


_OFFICE_EXTRACTORS = {"docx": _extract_docx, "xlsx": _extract_xlsx, "pptx": _extract_pptx}

# #3935 — images embarquées d'un .docx (un CV scanné collé page par page dans Word n'a AUCUN texte).
# On ne lit que ce qui peut porter du texte : formats que l'OCR / le modèle reçoivent, hors puces et
# filets (< 20 Ko), au plus six images, le total borné — la lecture est payante.
_DOCX_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
_DOCX_IMAGE_MIN_BYTES = 20_000
_DOCX_IMAGE_MAX = 6
_DOCX_IMAGES_MAX_BYTES = 12 * 1_048_576


def docx_embedded_images(data: bytes) -> list[tuple[bytes, str]]:
    """Les images lisibles de ``word/media/`` d'un .docx, dans l'ordre du dossier — ``[]`` si ce n'est
    pas un .docx ou si rien ne vaut une lecture. Jamais d'exception : l'appelant a déjà le texte XML."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = sorted(
                (
                    info
                    for info in archive.infolist()
                    if info.filename.startswith("word/media/")
                    and info.filename.lower().endswith(_DOCX_IMAGE_EXTENSIONS)
                    and info.file_size >= _DOCX_IMAGE_MIN_BYTES
                ),
                key=lambda info: info.filename,
            )
            out: list[tuple[bytes, str]] = []
            total = 0
            for info in infos[:_DOCX_IMAGE_MAX]:
                total += info.file_size
                if total > _DOCX_IMAGES_MAX_BYTES:
                    break
                out.append((archive.read(info), info.filename.rsplit("/", 1)[-1]))
            return out
    except (zipfile.BadZipFile, KeyError, RuntimeError, OSError):
        return []


# ─────────────────────────────────────────────────────────────────────────────
# #2667.2 — les IMAGES : lues par le modèle, jamais par un binaire OCR local.
# ─────────────────────────────────────────────────────────────────────────────
#
# 5 Mo : la limite documentée de l'API Anthropic pour une image encodée en
# base64 sur `/v1/messages`. Refuser AVANT l'appel évite de payer (et
# d'attendre) un appel que l'API rejetterait de toute façon.
_MAX_IMAGE_BYTES = 5_000_000

# Chaque image est un appel au modèle FACTURÉ — contrairement à un PDF, un
# Office ou un texte, lus sans appel réseau. Un lot sans plafond transformerait
# une pièce jointe en facture ouverte : refus EN BLOC avant le premier appel,
# même geste que `validateRagZipEntries` (`RAG_ZIP_MAX_ENTRIES=20`) pour le
# dépliage d'une archive. Le caller réel d'aujourd'hui (`routers/rag.py`,
# une image = un lot d'UNE) n'atteint jamais ce plafond ; il protège un futur
# appelant qui grouperait plusieurs images (par ex. plusieurs images tirées
# d'une même archive).
_MAX_IMAGES_PER_BATCH = 5

#: Signatures reconnues — le sous-ensemble de ce que l'API Anthropic accepte
#: réellement que la décision du 21/09 retient (elle accepte aussi
#: `image/gif`, volontairement laissé de côté : ni `png`, ni `jpeg`, ni `webp`).
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"
_IMAGE_MAGIC: tuple[tuple[bytes, str], ...] = (
    (_PNG_MAGIC, "image/png"),
    (_JPEG_MAGIC, "image/jpeg"),
)
#: WEBP est un conteneur RIFF : la signature porte sur DEUX segments non
#: contigus (`RIFF` puis `WEBP` quatre octets plus loin, la taille entre deux).
_WEBP_RIFF = b"RIFF"
_WEBP_TAG = b"WEBP"


def _detect_image_media_type(data: bytes, filename: str | None) -> str | None:
    """Type MIME d'image reconnu, ou `None`. Les octets magiques TRANCHENT —
    même doctrine que `_looks_like_pdf` : une extension ment, jamais la
    signature (un `.png` qui est en réalité un `.jpg` est lu comme un `.jpg`)."""
    for magic, media_type in _IMAGE_MAGIC:
        if data[: len(magic)] == magic:
            return media_type
    if data[:4] == _WEBP_RIFF and data[8:12] == _WEBP_TAG:
        return "image/webp"
    return None


def image_media_type(data: bytes, filename: str | None = None) -> str | None:
    """Type MIME d'image reconnu par signature, ou `None` (appelants hors module)."""
    return _detect_image_media_type(data, filename)


def looks_like_image(data: bytes, filename: str | None) -> bool:
    """Ce fichier RESSEMBLE à une image (signature reconnue OU extension
    image) — utilisé par l'appelant (`routers/rag.py`) pour choisir le chemin
    ASYNCHRONE (`extract_images_text`) avant même de décoder quoi que ce soit.
    Une extension qui ment (signature absente) est démasquée plus loin, par
    `_detect_image_media_type`, avec un refus nommé."""
    if _detect_image_media_type(data, filename) is not None:
        return True
    name = (filename or "").lower()
    return name.endswith((".png", ".jpg", ".jpeg", ".webp"))


async def extract_images_text(
    images: Sequence[tuple[bytes, str | None]],
) -> list[ExtractedDocument]:
    """Le PLURIEL : un LOT d'images, plafonné avant le premier appel au modèle.

    Toute entrée invalide (taille, format) refuse le LOT ENTIER avant que la
    première image ne soit envoyée — comme le dépliage du zip refuse une
    archive trop grosse avant de la déplier. Chaque image lue rend son texte
    dans l'ORDRE du lot ; une image sans texte lisible (`IMAGE_NO_TEXT_SENTINEL`)
    fait échouer le lot avec un message clair, plutôt que de faire semblant
    qu'elle a été ingérée.
    """
    if not images:
        raise DocumentTextError("Aucune image à lire.")
    if len(images) > _MAX_IMAGES_PER_BATCH:
        raise DocumentTextError(
            f"Trop d'images pour un seul lot ({len(images)} sur {_MAX_IMAGES_PER_BATCH} au plus)."
        )

    prepared: list[tuple[bytes, str]] = []
    for data, filename in images:
        if not data:
            raise DocumentTextError("Fichier vide.")
        if len(data) > _MAX_IMAGE_BYTES:
            raise DocumentTextError(
                f"Image trop lourde ({len(data) / 1_000_000:.1f} Mo — "
                f"{_MAX_IMAGE_BYTES / 1_000_000:.0f} Mo au plus)."
            )
        media_type = _detect_image_media_type(data, filename)
        if media_type is None:
            raise DocumentTextError("Format d'image non reconnu — seuls PNG, JPEG et WEBP sont lus.")
        # #2433.12 / #2433.9 — remise droite, et sans métadonnée, avant de partir au modèle.
        prepared.append((minimized(data)[0], media_type))

    results: list[ExtractedDocument] = []
    for data, media_type in prepared:
        text, _usage = await call_claude_image_text(data, media_type)
        cleaned = text.strip()
        if not cleaned or cleaned == IMAGE_NO_TEXT_SENTINEL:
            raise DocumentTextError(IMAGE_NO_TEXT_SENTINEL)
        results.append(ExtractedDocument(text=cleaned[:_MAX_TEXT_CHARS]))
    return results


async def extract_image_text(data: bytes, filename: str | None = None) -> ExtractedDocument:
    """Texte visible dans UNE image, par LECTURE du modèle — voir
    :func:`extract_images_text` (le pluriel porte les plafonds)."""
    return (await extract_images_text([(data, filename)]))[0]


def _is_plain_archive(data: bytes, filename: str | None) -> bool:
    """#2667.1 — un `.zip` DÉPOSÉ COMME TEL, pas un `.docx`/`.xlsx` (qui sont
    aussi des zips, mais déjà reconnus par `_office_kind` avant cet appel)."""
    name = (filename or "").lower()
    if name.endswith(".zip"):
        return True
    if data[:4] != _ZIP_MAGIC:
        return False
    return _office_kind(data, filename) is None


def _safe_archive_member_name(name: str) -> bool:
    """#2667.1 — un nom d'entrée qui remonte hors de l'archive (`..`, chemin
    absolu) est refusé. `zipfile.read()` ne touche jamais le disque ici
    (jamais `extractall`/`extract`) : aucune traversée de fichier n'est donc
    réellement exploitable — le refus est une prudence supplémentaire envers
    une archive dont le nom d'entrée est déjà un signal qu'elle est piégée,
    pas le correctif d'une faille qui existerait dans ce chemin de lecture."""
    if name.startswith("/") or name.startswith("\\"):
        return False
    return ".." not in re.split(r"[\\/]", name)


def _extract_archive(data: bytes, filename: str | None) -> ExtractedDocument:
    """Texte d'une archive `.zip` déposée en pièce jointe (#2667.1) : chaque
    entrée lisible est extraite par son propre lecteur (PDF/Office/texte,
    ceux déjà définis plus haut) et les résultats sont concaténés, chacun
    nommé par son chemin dans l'archive pour rester traçable.

    Trois réponses écrites AVANT ce code (voir le module `test_document_text_
    archive.py`) : le contenu ne compte PAS dans `ATTACH_MAX_COUNT` (l'archive
    est UNE pièce jointe, son contenu a sa propre borne) ; un format non
    supporté À L'INTÉRIEUR est sauté, jamais deviné ; une archive piégée est
    refusée sur sa taille décompressée déclarée puis réelle, et sur un nom
    d'entrée qui remonte hors de l'archive.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = [info for info in archive.infolist() if not info.is_dir()]
            # Taille DÉCLARÉE (en-tête local), vérifiée AVANT toute
            # décompression — une bombe zip s'écarte ici, sans jamais lire son
            # contenu.
            declared_total = sum(info.file_size for info in infos)
            if declared_total > _MAX_ARCHIVE_DECOMPRESSED_BYTES:
                raise DocumentTextError(
                    "Archive trop volumineuse une fois décompressée — dépose les fichiers un par un."
                )
            readable = [
                info
                for info in infos
                if _safe_archive_member_name(info.filename)
                and info.filename.lower().endswith(_ARCHIVE_INNER_EXTENSIONS)
            ]
            if not readable:
                raise DocumentTextError(
                    "Aucun fichier lisible dans cette archive (formats acceptés : "
                    "PDF, Word, Excel, texte)."
                )
            if len(readable) > _MAX_ARCHIVE_ENTRIES:
                raise DocumentTextError(
                    f"Cette archive porte plus de {_MAX_ARCHIVE_ENTRIES} fichiers lisibles — "
                    "dépose-les un par un (même plafond qu'une pièce jointe)."
                )
            parts: list[str] = []
            any_partial = False
            decompressed_so_far = 0
            for info in readable:
                try:
                    member_bytes = archive.read(info)
                except (RuntimeError, zipfile.BadZipFile) as exc:
                    # Entrée protégée par mot de passe, ou corrompue — sautée
                    # comme un format non supporté, jamais un contenu deviné.
                    logger.warning("archive member unreadable (skipping): %s (%s)", info.filename, exc)
                    continue
                decompressed_so_far += len(member_bytes)
                if decompressed_so_far > _MAX_ARCHIVE_DECOMPRESSED_BYTES:
                    # Seconde vérification, PENDANT la lecture : au cas où
                    # l'en-tête déclaré mentait.
                    raise DocumentTextError(
                        "Archive trop volumineuse une fois décompressée — dépose les fichiers un par un."
                    )
                try:
                    extracted = extract_document_text(member_bytes, info.filename)
                except DocumentTextError as exc:
                    # Un fichier illisible À L'INTÉRIEUR ne doit pas emporter
                    # toute l'archive — comme une feuille Excel illisible ou
                    # une page PDF vide ne le font pas déjà ailleurs ici.
                    logger.warning("archive member unreadable (skipping): %s (%s)", info.filename, exc)
                    continue
                any_partial = any_partial or extracted.partial
                parts.append(f"--- {info.filename} ---\n{extracted.text}")
    except zipfile.BadZipFile as exc:
        raise DocumentTextError("Archive illisible (corrompue ou protégée par mot de passe).") from exc

    if not parts:
        raise DocumentTextError("Aucun texte extractible des fichiers de cette archive.")
    return ExtractedDocument(text="\n\n".join(parts)[:_MAX_TEXT_CHARS], partial=any_partial or len(parts) < len(readable))


def extract_document_text(data: bytes, filename: str | None = None) -> ExtractedDocument:
    """Return the plain text of an uploaded document (and whether the
    extraction is COMPLETE — see :class:`ExtractedDocument`). Raises
    ``DocumentTextError`` if the bytes are empty or yield no usable text at
    all (e.g. a fully scanned image-only PDF).
    """
    if not data:
        raise DocumentTextError("Fichier vide.")

    if _looks_like_pdf(data, filename):
        extracted = _extract_pdf(data)
        if not extracted.text.strip():
            # Image-only / scanned PDF → no embedded text layer, nothing to ingest.
            raise DocumentTextError(
                "Aucun texte extractible du PDF (probablement un scan/image). "
                "Fournissez un PDF texte ou copiez le contenu."
            )
        # #2542 — un calque texte NON vide mais illisible (polices sans table
        # Unicode : `(cid:12)`, `�`, symboles) ne vaut pas un CV lu. On le
        # refuse par son nom : `/cv/extract` tente alors l'OCR, sinon l'écran
        # dit « encodage illisible » au lieu de rester « en analyse ».
        if _is_garbled(extracted.text):
            raise DocumentTextError(
                "Le texte de ce PDF est illisible (encodage non standard). "
                "Réexporte-le en PDF texte, ou dépose-le en DOCX."
            )
        return extracted

    # RTF derrière une extension `.doc` — le cas le plus fréquent des viviers
    # anciens. La signature tranche, pas l'extension : c'est elle qui ment.
    if data[:5] == _RTF_MAGIC:
        text = _extract_rtf(data)
        if not text.strip():
            raise DocumentTextError("Aucun texte extractible de ce document RTF.")
        return ExtractedDocument(text=text[:_MAX_TEXT_CHARS])

    # Word 97-2003 authentique (archive OLE) — #3935 : lu par la table de
    # pièces. Illisible (corrompu, protégé) : refus NOMMÉ, jamais un texte approché.
    if data[:8] == _OLE_MAGIC:
        try:
            text = _extract_word97(data)
        except DocumentTextError as exc:
            raise DocumentTextError(
                f"{exc} Réenregistre le fichier en .docx ou en PDF — les deux sont lus directement."
            ) from exc
        if not text.strip():
            raise DocumentTextError("Aucun texte extractible de ce document Word.")
        return ExtractedDocument(text=text[:_MAX_TEXT_CHARS])

    office = _office_kind(data, filename)
    if office is not None:
        text = _OFFICE_EXTRACTORS[office](data)
        if not text.strip():
            raise DocumentTextError(
                "Aucun texte extractible du document Office (fichier vide ou uniquement des images)."
            )
        return ExtractedDocument(text=text[:_MAX_TEXT_CHARS])

    # #2667.1 — une archive `.zip` DÉPOSÉE COMME TELLE (les deux formats
    # Office ci-dessus sont AUSSI des zips, mais déjà tranchés au-dessus).
    if _is_plain_archive(data, filename):
        return _extract_archive(data, filename)

    # Non-PDF: decode as UTF-8, tolerating stray bytes rather than failing hard.
    text = data.decode("utf-8", errors="replace").strip()
    if not text:
        raise DocumentTextError("Aucun texte lisible dans le fichier.")
    # A high share of U+FFFD means we decoded a binary blob (image/office doc)
    # sent under a text extension — refuse it instead of ingesting garbage.
    replacements = text.count("�")
    if replacements and replacements / len(text) > _MAX_REPLACEMENT_RATIO:
        raise DocumentTextError(
            "Fichier binaire non supporté — fournissez un PDF, un document Word, "
            "un classeur Excel ou un fichier texte (.txt, .md, .csv, .json)."
        )
    return ExtractedDocument(text=text)


# ─────────────────────────────────────────────────────────────────────────────
# #3750 — les UNITÉS d'un document : ce qu'une citation peut nommer.
# ─────────────────────────────────────────────────────────────────────────────
#
# `extract_document_text` rend UN texte — c'est ce que stocke `rag_documents`,
# et ça ne change pas. Le découpage en morceaux (`rag_chunking.build_chunks`)
# a besoin, lui, de savoir où commence l'onglet « 07 · Objections » et la
# diapositive 13 : c'est ce que rend `extract_document_units`, une liste
# `(étiquette, texte)` lue dans la structure du FICHIER. Un format sans
# structure lisible (pdf, txt, md, rtf, archive) retombe sur
# `rag_chunking.units_from_text` — titres Markdown, sinon une seule unité.

_HEADING_STYLE = re.compile(r"^(heading|titre|title|berschrift)\s*\d*$", re.IGNORECASE)


def _xlsx_sheet_names(archive: zipfile.ZipFile) -> dict[str, str]:
    """`xl/worksheets/sheetN.xml` → nom de l'onglet, par `workbook.xml` et ses
    relations. Illisible ⇒ `{}` : l'onglet gardera son nom de fichier."""
    try:
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    except (KeyError, ElementTree.ParseError):
        return {}
    targets: dict[str, str] = {}
    for rel in rels:
        target = rel.get("Target") or ""
        path = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        targets[rel.get("Id") or ""] = path
    names: dict[str, str] = {}
    for node in workbook.iter():
        if _local_name(node.tag) != "sheet":
            continue
        rel_id = next((value for key, value in node.attrib.items() if _local_name(key) == "id"), None)
        if rel_id and rel_id in targets and node.get("name"):
            names[targets[rel_id]] = node.get("name") or ""
    return names


def _xlsx_units(data: bytes) -> list[tuple[str, str]]:
    """Une unité par onglet NOMMÉ, une rangée par ligne — même lecture que
    `_extract_xlsx`, même plafond de rangées."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            shared = _xlsx_shared_strings(archive)
            names = _xlsx_sheet_names(archive)
            sheets = sorted(
                (name for name in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)),
                key=_pptx_slide_index,
            )
            units: list[tuple[str, str]] = []
            total = 0
            for sheet in sheets:
                try:
                    root = ElementTree.fromstring(archive.read(sheet))
                except ElementTree.ParseError:
                    logger.warning("xlsx sheet unreadable (skipping): %s", sheet)
                    continue
                lines: list[str] = []
                for row in root.iter():
                    if _local_name(row.tag) != "row" or total >= _MAX_XLSX_ROWS:
                        continue
                    cells = [_xlsx_cell_text(cell, shared) for cell in row if _local_name(cell.tag) == "c"]
                    line = "\t".join(cells).strip()
                    if line:
                        lines.append(line)
                        total += 1
                if lines:
                    label = names.get(sheet) or sheet.rsplit("/", 1)[-1].removesuffix(".xml")
                    units.append((label, "\n".join(lines)))
            return units
    except zipfile.BadZipFile as exc:
        raise DocumentTextError("Classeur Excel illisible (archive corrompue).") from exc


def _docx_units(data: bytes) -> list[tuple[str, str]]:
    """Une unité par section TITRÉE (style « Heading N » / « Titre N ») ; ce
    qui précède le premier titre est une unité sans étiquette."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            root = ElementTree.fromstring(archive.read("word/document.xml"))
    except (KeyError, zipfile.BadZipFile, ElementTree.ParseError) as exc:
        raise DocumentTextError("Document Word illisible.") from exc
    units: list[tuple[str, list[str]]] = []
    label = ""
    current: list[str] = []
    for paragraph in root.iter():
        if _local_name(paragraph.tag) != "p":
            continue
        style = next(
            (
                value
                for node in paragraph.iter()
                if _local_name(node.tag) == "pStyle"
                for key, value in node.attrib.items()
                if _local_name(key) == "val"
            ),
            "",
        )
        text = "".join(
            node.text for node in paragraph.iter() if _local_name(node.tag) in _OOXML_TEXT_TAGS and node.text
        ).strip()
        if not text:
            continue
        if _HEADING_STYLE.match(style):
            if current:
                units.append((label, current))
            label, current = text, [text]
            continue
        current.append(text)
    if current:
        units.append((label, current))
    return [(name, "\n".join(lines)) for name, lines in units]


def extract_document_units(data: bytes, filename: str | None = None) -> list[tuple[str, str]]:
    """#3750 — les unités citables d'un fichier : `[(étiquette, texte)]`.

    * `.xlsx` : un onglet par unité, étiqueté de son NOM (« 07 · Objections ») ;
    * `.pptx` : une diapositive par unité (« Slide 13 »), notes comprises ;
    * `.docx` : une section par titre ;
    * le reste : `rag_chunking.units_from_text` sur le texte extrait.

    Mêmes refus que `extract_document_text` (`DocumentTextError`). Ne remplace
    PAS `extract_document_text` : le texte stocké reste celui-là.
    """
    from app.services.rag_chunking import units_from_text

    office = _office_kind(data, filename) if data else None
    if office == "xlsx":
        units = _xlsx_units(data)
    elif office == "pptx":
        units = [(f"Slide {index}", text) for index, text in _pptx_slide_blocks(data)]
    elif office == "docx":
        units = _docx_units(data)
    else:
        units = units_from_text(extract_document_text(data, filename).text)
    return [(label, text) for label, text in units if text.strip()]
