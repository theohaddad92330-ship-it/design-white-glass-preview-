"""#3935 (12/10) — LE lecteur de documents : lecture directe, qualité, OCR.

Décision de Louis (12/10) : « L'OCR Mistral doit être utilisé PARTOUT : Laura,
tous les imports, tout. » Avant ce module, Mistral n'était branché que sur le CV
et les notes de frais ; Mes documents, les appels d'offres, les organigrammes,
les missions et les pièces jointes de Laura lisaient par `extract_document_text`
(pypdf, XML, UTF-8) : un PDF scanné sortait vide, un texte « L a m i s » sortait
tel quel, une image d'organigramme n'était pas lue.

Ordre, pour UN fichier (:func:`read_document`) :

1. **image** → OCR (clé posée) → sinon lecture par Claude ;
2. **lecture directe** (`extract_document_text`) → texte JUGÉ (`text_quality`,
   le score du lot CV-OCR, pas dupliqué) → recollé (déterministe, sans réseau)
   → si encore mauvais ou si des pages manquent : OCR → Claude ; le MEILLEUR au
   score est gardé ;
3. **lecture directe impossible** (PDF scanné, illisible) → OCR → Claude → le
   refus d'origine, qui est vrai.

Sans `OCR_API_KEY` : le comportement d'avant, aucun appel réseau (le recollage
seul reste actif : il est local). Le journal dit la VOIE et la LONGUEUR, jamais
le contenu.
"""

from __future__ import annotations

import logging

from app.services import ocr
from app.services.document_text import (
    _MAX_TEXT_CHARS,
    DocumentTextError,
    ExtractedDocument,
    docx_embedded_images,
    extract_document_text,
    extract_image_text,
    looks_like_image,
)
from app.services.image_minimization import minimized
from app.services.text_quality import (
    assess_text_quality,
    is_acceptable,
    pdf_page_count,
    repair_letter_spacing,
)

logger = logging.getLogger(__name__)

_PDF_MAGIC = b"%PDF-"


def _too_large_error(data: bytes) -> DocumentTextError:
    return DocumentTextError(
        f"Fichier de {len(data) / 1_048_576:.1f} Mo au-delà de la limite de lecture "
        f"({ocr._MAX_BYTES // 1_048_576} Mo) — découpe-le ou réexporte-le plus léger."  # noqa: SLF001
    )


async def read_document(
    data: bytes,
    filename: str | None = None,
    *,
    response_cache: bool = False,
    judge_pages: bool = False,
    fallback_without_key: bool = False,
) -> ExtractedDocument:
    """Le texte d'un fichier, par la meilleure voie disponible.

    ``response_cache=True`` (CACHE-LLM, 15/10) — document PUBLIC seulement (appel
    d'offres) : la lecture OCR / modèle d'un PDF se garde par l'empreinte SHA-256
    du contenu (``ocr.extract_text_with_route``). Jamais pour un document qui
    porte des personnes (CV, organigramme, justificatif, mission).

    ``judge_pages=True`` — la densité de texte PAR PAGE entre dans le jugement (un CV d'une
    page de 80 caractères est vide ; un appel d'offres a des pages de garde). C'est le seul
    réglage propre au CV avec ``fallback_without_key=True`` : sans clé OCR, le repli part
    quand même vers la lecture du PDF par Claude (``/cv/extract``, #3935) — là où les autres
    appelants gardent « sans clé = aucune requête ».

    Lève ``DocumentTextError`` (message NOMMÉ) quand rien ne lit le fichier —
    jamais un texte vide présenté comme un succès.
    """
    if not data:
        raise DocumentTextError("Fichier vide.")
    if looks_like_image(data, filename):
        return await _read_image(data, filename)

    is_pdf = data[:5] == _PDF_MAGIC or bool(filename and filename.lower().endswith(".pdf"))
    can_read_images = ocr.is_configured() or fallback_without_key
    try:
        extracted = extract_document_text(data, filename)
    except DocumentTextError as exc:
        if not is_pdf:
            # Un .docx fait seulement d'images : on les lit, sinon le refus d'origine.
            if can_read_images and (images := await _read_docx_images(data)):
                return ExtractedDocument(text=images)
            raise  # Office / Word 97 / RTF / texte : pas de couche scannée à reprendre
        return await _read_unreadable_pdf(
            data, filename, exc, response_cache=response_cache, fallback_without_key=fallback_without_key
        )

    if not is_pdf or data[:5] != _PDF_MAGIC:
        if can_read_images and len(extracted.text.strip()) < _SPARSE_DOCX_CHARS:
            images = await _read_docx_images(data)
            if images:
                logger.info("Document lu : voie=docx_images longueur=%s", len(images))
                return ExtractedDocument(
                    text=f"{extracted.text.strip()}\n\n{images}".strip()[:_MAX_TEXT_CHARS], partial=extracted.partial
                )
        return extracted
    return await _retain_best_pdf_text(
        data,
        filename,
        extracted,
        response_cache=response_cache,
        judge_pages=judge_pages,
        fallback_without_key=fallback_without_key,
    )


#: #4401 (N4) — un PDF de CV dont le texte direct tient en moins de ça est suspect (calque partiel, scan
#: surmonté d'une ligne) : le repli OCR existant le relit EN ENTIER, et le plus long texte lu est gardé.
_SPARSE_PDF_CHARS = 200

#: Un .docx dont la couche texte tient en moins de ça est suspect : le contenu est dans ses images.
_SPARSE_DOCX_CHARS = 600


async def _read_docx_images(data: bytes) -> str:
    """Le texte lu dans les images embarquées d'un .docx (``""`` si aucune ou rien de lisible).
    Une image muette ou refusée est sautée : les autres comptent."""
    parts: list[str] = []
    for image, name in docx_embedded_images(data):
        try:
            read = await _read_image(image, name)
        except DocumentTextError:
            continue
        if read.text.strip():
            parts.append(read.text.strip())
    return "\n\n".join(parts)


async def _read_image(data: bytes, filename: str | None) -> ExtractedDocument:
    """Image : OCR d'abord (clé posée), puis la lecture par Claude (inchangée)."""
    if ocr.is_configured():
        if not ocr.can_read_size(data):
            logger.warning("Image de %s octets : OCR ignoré, lecture Claude", len(data))
        else:
            text = await ocr.extract_text(minimized(data)[0], filename)
            if text and text.strip():
                logger.info("Document lu : voie=ocr_image longueur=%s", len(text))
                return ExtractedDocument(text=text.strip()[:_MAX_TEXT_CHARS])
    # Sans clé, ou OCR muet : le chemin d'avant (Claude), et ses refus nommés.
    extracted = await extract_image_text(data, filename)
    logger.info("Document lu : voie=claude_image longueur=%s", len(extracted.text))
    return extracted


async def _read_unreadable_pdf(
    data: bytes,
    filename: str | None,
    cause: DocumentTextError,
    *,
    response_cache: bool = False,
    fallback_without_key: bool = False,
) -> ExtractedDocument:
    """PDF scanné / illisible en direct : OCR → Claude → le refus d'origine."""
    if not ocr.is_configured() and not fallback_without_key:
        raise cause  # aucune requête ne part : comportement d'avant
    if not ocr.can_read_size(data):
        raise _too_large_error(data) from cause
    scanned, route = await ocr.extract_text_with_route(data, filename, response_cache=response_cache)
    if not scanned or not scanned.strip():
        raise cause
    logger.info("Document lu : voie=%s longueur=%s", route, len(scanned))
    return ExtractedDocument(text=scanned.strip()[:_MAX_TEXT_CHARS])


async def _retain_best_pdf_text(
    data: bytes,
    filename: str | None,
    extracted: ExtractedDocument,
    *,
    response_cache: bool = False,
    judge_pages: bool = False,
    fallback_without_key: bool = False,
) -> ExtractedDocument:
    """Le texte direct d'un PDF est JUGÉ, pas supposé bon.

    Densité par page non jugée par défaut (``pages=None``) : un appel d'offres a des
    pages de garde et des schémas ; seuls « lettre à lettre » et « illisible »
    déclenchent. Un CV (``judge_pages``) la juge aussi. Des pages sans texte (``partial``) déclenchent aussi l'OCR,
    qui lit le document ENTIER.
    """
    text = extracted.text
    pages = pdf_page_count(data) if judge_pages else None
    quality = assess_text_quality(text, pages)
    # #4401 (N4) — un CV (``judge_pages``) quasi vide passe par l'OCR même si ce peu de texte est propre.
    sparse = judge_pages and len(text.strip()) < _SPARSE_PDF_CHARS
    if is_acceptable(quality) and not extracted.partial and not sparse:
        logger.info("Document lu : voie=direct longueur=%s", len(text))
        return extracted

    best_text, best_quality, route = text, quality, "direct"
    repaired = repair_letter_spacing(text)
    if repaired != text:
        repaired_quality = assess_text_quality(repaired, pages)
        if repaired_quality.score >= best_quality.score:
            best_text, best_quality, route = repaired, repaired_quality, "recollé"
    if is_acceptable(best_quality) and not extracted.partial and not sparse:
        logger.info("Document lu : voie=%s longueur=%s", route, len(best_text))
        return ExtractedDocument(text=best_text)

    if (ocr.is_configured() or fallback_without_key) and ocr.can_read_size(data):
        fallback, fallback_route = await ocr.extract_text_with_route(data, filename, response_cache=response_cache)
        if fallback and fallback.strip():
            fallback_quality = assess_text_quality(fallback, pages)
            if (fallback_quality.score, len(fallback)) > (best_quality.score, len(best_text)) or (
                sparse and len(fallback.strip()) > len(best_text.strip())
            ):
                logger.info("Document lu : voie=%s longueur=%s", fallback_route, len(fallback))
                # Le repli lit le document ENTIER : plus de page « jamais lue ».
                return ExtractedDocument(text=fallback.strip()[:_MAX_TEXT_CHARS])
    logger.info("Document lu : voie=%s longueur=%s (pas de meilleur texte)", route, len(best_text))
    return ExtractedDocument(text=best_text, partial=extracted.partial)
