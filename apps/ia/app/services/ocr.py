"""OCR d'un document sans couche de texte (CV scanné, PDF image).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE CORRIGE
─────────────────────────────────────────────────────────────────────────────
Le chantier du PDF 3 avait classé l'OCR « bloqué » avec une raison juste :
aucun moteur dans le dépôt, et en ajouter un est un choix de fournisseur, pas
une ligne de code. La moitié qui comptait a été livrée — quand l'extraction ne
donne rien, l'écran le DIT et propose la saisie.

Louis a tranché le 21/08 : ajouter le fournisseur, en env-gated strict. Beaucoup
de CV arrivent en PDF image, et « recopie-le à la main » est exactement le
travail que le vivier promet d'éviter.

─────────────────────────────────────────────────────────────────────────────
LA RÈGLE QUI PORTE TOUT
─────────────────────────────────────────────────────────────────────────────
**Sans clé, no-op strict : aucune requête ne part, et le comportement reste
byte-identique à celui d'avant.** C'est la même discipline que la
transcription, SalesQL ou Dropcontact — la clé est le seul interrupteur.

Et un OCR qui échoue ne remplace RIEN : on retombe sur le message « aucun texte
extractible », qui est vrai. Un texte partiel présenté comme le CV serait pire
que pas de texte du tout.
"""

from __future__ import annotations

import base64
import io
import logging
import os
from contextvars import ContextVar

import httpx
from pypdf import PdfReader, PdfWriter

from app.services import llm_response_cache
from app.services.claude_service import IMAGE_NO_TEXT_SENTINEL, call_claude_document_text
from app.services.document_text import image_media_type
from app.services.model_policy import model_for
from app.services.text_quality import pdf_page_count

logger = logging.getLogger(__name__)

#: URL surchargeable sans redéploiement — même discipline que
#: `BOONDMANAGER_SEARCH_PARAM` : le contrat exact d'un fournisseur se vérifie
#: sur une instance réelle, pas dans une documentation.
_DEFAULT_URL = "https://api.mistral.ai/v1/ocr"
_DEFAULT_MODEL = "mistral-ocr-latest"
_TIMEOUT_S = 60.0
#: Au-delà, on n'envoie pas : un scan de 200 pages n'est pas un CV, et
#: l'appel coûterait sans rien rendre d'exploitable.
_MAX_BYTES = 20 * 1024 * 1024


def is_configured() -> bool:
    """L'OCR est-il branché ? La clé est le SEUL interrupteur."""
    return bool(os.getenv("OCR_API_KEY", "").strip())


def _endpoint() -> str:
    return os.getenv("OCR_API_URL", "").strip() or _DEFAULT_URL


#: Au-delà de ce nombre de pages, un PDF part par PAQUETS : un seul appel de
#: 200 pages dépasserait le délai de `_TIMEOUT_S`, et le vide qui en sortirait
#: serait silencieux (#3935 OCR-PARTOUT, point 6).
_PACKET_PAGES = 40


def _document_payload(data: bytes) -> dict | None:
    """Le BON type envoyé au fournisseur, choisi par SIGNATURE (jamais par
    l'extension, qui ment) — ``None`` pour un format que l'OCR ne reçoit pas.

    - PDF → ``document_url`` ``application/pdf`` ;
    - PNG / JPEG / WEBP → ``image_url`` avec le MIME de la signature.

    Un docx / pptx n'est PAS envoyé : que le fournisseur accepte un type Office
    ne se vérifie pas d'ici (« un contrat d'API non vérifiable ne se devine
    pas », doctrine) — ils restent lus par leur XML (`document_text.py`).
    """
    if data[:5] == b"%PDF-":
        encoded = base64.b64encode(data).decode("ascii")
        return {"type": "document_url", "document_url": f"data:application/pdf;base64,{encoded}"}
    media_type = image_media_type(data)
    if media_type:
        encoded = base64.b64encode(data).decode("ascii")
        return {"type": "image_url", "image_url": f"data:{media_type};base64,{encoded}"}
    return None


def _pdf_packets(data: bytes) -> list[bytes] | None:
    """Découpe un PDF en paquets de pages, chacun ≤ ``_MAX_BYTES``.

    ``None`` quand on ne SAIT pas découper (PDF illisible, protégé, ou UNE page
    seule au-delà de la borne) : l'appelant nomme alors la limite.
    """
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            return None
        total = len(reader.pages)
    except Exception:  # noqa: BLE001 — un PDF qu'on ne sait pas ouvrir ne se découpe pas
        return None
    if total == 0:
        return None

    def build(start: int, stop: int) -> list[bytes] | None:
        writer = PdfWriter()
        for index in range(start, stop):
            writer.add_page(reader.pages[index])
        buffer = io.BytesIO()
        writer.write(buffer)
        blob = buffer.getvalue()
        if len(blob) <= _MAX_BYTES:
            return [blob]
        if stop - start <= 1:
            return None  # une page seule dépasse la borne
        middle = (start + stop) // 2
        left, right = build(start, middle), build(middle, stop)
        return None if left is None or right is None else left + right

    packets: list[bytes] = []
    try:
        for start in range(0, total, _PACKET_PAGES):
            chunk = build(start, min(start + _PACKET_PAGES, total))
            if chunk is None:
                return None
            packets.extend(chunk)
    except Exception as exc:  # noqa: BLE001 — un découpage raté n'est pas un texte
        logger.warning("OCR : découpage du PDF impossible : %s", exc)
        return None
    return packets


def can_read_size(data: bytes) -> bool:
    """Le document tient-il dans la borne, ou se découpe-t-il pour y tenir ?

    Sert à NOMMER la limite (« fichier de N Mo au-delà de la limite ») au lieu
    de rendre un vide : image ou PDF indécoupable au-delà de ``_MAX_BYTES``.
    """
    if len(data) <= _MAX_BYTES:
        return True
    return data[:5] == b"%PDF-" and _pdf_packets(data) is not None


async def extract_text(data: bytes, filename: str | None = None) -> str | None:
    """Le texte d'un document scanné, ou ``None``.

    ``None`` couvre TOUS les cas où l'on ne sait pas : pas de clé, format que le
    fournisseur ne reçoit pas, fichier trop gros pour être découpé, fournisseur
    muet, réponse d'une forme inattendue. L'appelant retombe alors sur son
    message honnête — jamais sur un texte approximatif.
    """
    if not is_configured():
        return None  # aucune requête ne part
    if not data:
        return None
    if _document_payload(data) is None:
        return None  # ni PDF ni image reconnue : rien à envoyer

    if data[:5] == b"%PDF-" and (len(data) > _MAX_BYTES or (pdf_page_count(data) or 0) > _PACKET_PAGES):
        packets = _pdf_packets(data)
        if packets is None:
            logger.warning("OCR ignoré : document de %s octets, indécoupable", len(data))
            return None
        parts: list[str] = []
        for packet in packets:
            text = await _ocr_one(packet, filename)
            if text is None:
                return None  # un paquet muet ⇒ pas de texte « presque complet »
            parts.append(text)
        return "\n\n".join(parts) or None

    if len(data) > _MAX_BYTES:
        logger.warning("OCR ignoré : document de %s octets, au-delà de la borne", len(data))
        return None
    return await _ocr_one(data, filename)


async def _ocr_one(data: bytes, filename: str | None) -> str | None:
    document = _document_payload(data)
    if document is None:
        return None
    payload = {
        "model": os.getenv("OCR_MODEL", "").strip() or _DEFAULT_MODEL,
        # Le fichier voyage en data-URL : le fournisseur n'a pas besoin
        # d'accéder à un stockage, donc rien n'est exposé publiquement.
        "document": document,
    }
    headers = {"Authorization": f"Bearer {os.environ['OCR_API_KEY'].strip()}"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            response = await client.post(_endpoint(), json=payload, headers=headers)
        if response.status_code >= 400:
            logger.warning("OCR refusé (%s) pour %s", response.status_code, filename or "document")
            return None
        body = response.json()
    except Exception as exc:  # noqa: BLE001 — un OCR indisponible ne casse rien
        logger.warning("OCR injoignable : %s", exc)
        return None

    # CACHE-LLM (15/10) — la ligne de mesure de CET appel (aucun contenu). Pas de
    # cache de prompt côté OCR : le fournisseur n'en documente aucun sur ce point.
    llm_response_cache.log_line("ocr_document", _OCR_CACHE_STATUS.get())
    return _text_of(body)


def _text_of(body: object) -> str | None:
    """Le texte d'une réponse OCR, sans jamais deviner un champ.

    On accepte deux formes documentées (pages markdown, ou texte à plat) et on
    rend ``None`` pour tout le reste. Fouiller la réponse à la recherche de
    « quelque chose qui ressemble à du texte » rendrait un jour un identifiant
    de requête comme s'il s'agissait d'un CV.
    """
    if not isinstance(body, dict):
        return None
    pages = body.get("pages")
    if isinstance(pages, list):
        parts = [
            str(page.get("markdown") or page.get("text") or "").strip()
            for page in pages
            if isinstance(page, dict)
        ]
        joined = "\n\n".join(part for part in parts if part)
        return joined or None
    flat = body.get("text")
    if isinstance(flat, str) and flat.strip():
        return flat.strip()
    return None


#: Repli Claude : au-delà, ce n'est plus un CV (coût et durée bornés AVANT l'appel).
_CLAUDE_MAX_PAGES = 10
_CLAUDE_MAX_BYTES = 20 * 1024 * 1024
_CLAUDE_READ_MAX_TOKENS = 16000


async def _provider_extract_text(data: bytes, filename: str | None = None) -> str | None:
    return await extract_text(data, filename)


#: CACHE-LLM (15/10) — le rôle sous lequel se garde la lecture d'un document
#: PUBLIC (appel d'offres). Jamais un CV, un organigramme, un justificatif.
PUBLIC_DOCUMENT_ROLE = "public_document_text"

#: Vrai quand la DERNIÈRE lecture par Claude de ce contexte a été coupée à
#: ``max_tokens`` — lu par le cache, qui ne garde jamais une lecture tronquée.
_READ_TRUNCATED: ContextVar[bool] = ContextVar("ocr_read_truncated", default=False)
#: Statut du cache de réponse pour la ligne de mesure de l'appel OCR.
_OCR_CACHE_STATUS: ContextVar[str] = ContextVar("ocr_cache_status", default=llm_response_cache.STATUS_EXCLUDED)


def _reading_pipeline() -> dict[str, object]:
    """Ce qui LIT le fichier — tout changement ici change la clé du cache : modèle
    et branchement de l'OCR, modèle, consigne et budget de la lecture par Claude."""
    from app.services.claude_service import _IMAGE_TEXT_SYSTEM_PROMPT  # noqa: PLC0415 — même consigne que l'appel

    return {
        "ocr": is_configured(),
        "ocr_model": os.getenv("OCR_MODEL", "").strip() or _DEFAULT_MODEL,
        "packet_pages": _PACKET_PAGES,
        "claude_model": model_for("bellum_cv_parse"),
        "claude_prompt": llm_response_cache.prompt_fingerprint(_IMAGE_TEXT_SYSTEM_PROMPT),
        "claude_max_tokens": _CLAUDE_READ_MAX_TOKENS,
    }


async def extract_text_with_route(
    data: bytes, filename: str | None = None, *, response_cache: bool = False
) -> tuple[str | None, str | None]:
    """Comme :func:`extract_text_with_fallback`, mais nomme la VOIE prise
    (``ocr`` / ``claude_pdf``) pour le journal — ``(None, None)`` si rien ne lit.

    ``response_cache=True`` (CACHE-LLM, 15/10) — document PUBLIC seulement (appel
    d'offres) : la lecture se garde par l'empreinte SHA-256 du CONTENU, commune à
    tous les espaces. Jamais écrite vide ni tronquée."""
    if not response_cache:
        text, route, _complete = await _read_with_route(data, filename)
        return text, route
    key = llm_response_cache.file_key(content=data, pipeline=_reading_pipeline())
    hit = await llm_response_cache.lookup(PUBLIC_DOCUMENT_ROLE, key)
    if (
        isinstance(hit, dict)
        and isinstance(hit.get("text"), str)
        and hit["text"].strip()
        and hit.get("route") in ("ocr", "claude_pdf")
    ):
        llm_response_cache.log_line(PUBLIC_DOCUMENT_ROLE, llm_response_cache.STATUS_HIT)
        return hit["text"], hit["route"]
    token = _OCR_CACHE_STATUS.set(llm_response_cache.STATUS_MISS)
    try:
        text, route, complete = await _read_with_route(data, filename)
    finally:
        _OCR_CACHE_STATUS.reset(token)
    if text and route and complete:
        await llm_response_cache.store(PUBLIC_DOCUMENT_ROLE, key, {"text": text, "route": route})
    return text, route


async def _read_with_route(data: bytes, filename: str | None) -> tuple[str | None, str | None, bool]:
    """``(texte, voie, complet)`` — ``complet`` est faux quand la lecture par Claude
    a été coupée à ``max_tokens`` (rendue telle quelle, jamais gardée)."""
    scanned = await _provider_extract_text(data, filename)
    if scanned and scanned.strip():
        return scanned, "ocr", True
    _READ_TRUNCATED.set(False)
    claude = await _claude_document_text(data, filename)
    if claude and claude.strip():
        return claude, "claude_pdf", not _READ_TRUNCATED.get()
    return None, None, True


async def extract_text_with_fallback(data: bytes, filename: str | None = None) -> str | None:
    """Ordre : OCR (clé posée) → lecture du PDF par Claude → ``None``.

    Le repli Claude n'a pas d'interrupteur propre : `ANTHROPIC_API_KEY` est
    obligatoire du service. Il ne lit que des PDF de ≤ 10 pages ; toute
    panne rend ``None`` — l'appelant dit alors pourquoi, il n'invente rien.
    """
    text, _route = await extract_text_with_route(data, filename)
    return text


async def _claude_document_text(data: bytes, filename: str | None) -> str | None:
    """Lecture du PDF par Claude. Pose :data:`_READ_TRUNCATED` quand la sortie a
    touché ``max_tokens`` (le texte coupé reste rendu, comme avant)."""
    if not data or len(data) > _CLAUDE_MAX_BYTES or data[:5] != b"%PDF-":
        return None
    try:
        pages = len(PdfReader(io.BytesIO(data)).pages)
    except Exception:  # noqa: BLE001 — un PDF qu'on ne sait pas compter n'est pas envoyé
        return None
    if pages == 0 or pages > _CLAUDE_MAX_PAGES:
        logger.warning("Lecture Claude ignorée : %s page(s) pour %s", pages, filename or "document")
        return None
    try:
        # #3935.4 — 16 000 jetons de sortie (8 000 par défaut) : un gros CV de
        # 10 pages ne doit pas être coupé net en fin de lecture (expériences,
        # formation) — une coupe silencieuse est pire qu'un appel plus long.
        text, usage = await call_claude_document_text(
            data, model=model_for("bellum_cv_parse"), max_tokens=_CLAUDE_READ_MAX_TOKENS
        )
    except Exception as exc:  # noqa: BLE001 — un repli indisponible ne casse rien
        logger.warning("Lecture Claude du PDF impossible : %s", exc)
        return None
    text = (text or "").strip()
    if not text or text == IMAGE_NO_TEXT_SENTINEL:
        return None
    _READ_TRUNCATED.set(getattr(usage, "stop_reason", None) == "max_tokens")
    return text
