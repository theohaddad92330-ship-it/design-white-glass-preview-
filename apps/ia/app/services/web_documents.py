"""Documents web lus EN LOCAL — Firecrawl ne voit plus que le HTML (#4016, lot W12).

Mesure Louis (tableau de bord Firecrawl, 30 j) : PDF inclus 167 329 crédits,
PDF exclus 5 615 — soit ~1 900 requêtes PDF = 161 700 crédits (97 % de la
facture), ~85 crédits chacune, Firecrawl facturant le PDF PAR PAGE. Un document
(PDF, Office, RTF, CSV, TXT) est donc téléchargé ici (``httpx``) puis lu par le
lecteur EXISTANT ``document_text`` (pypdf & co) : zéro crédit, même contrat de
sortie que ``firecrawl._scrape_one`` (le texte devient le « markdown »).

Rien d'inventé : un PDF scanné ou un encodage illisible rend ``empty`` /
``UNREADABLE`` (pas d'OCR) ; un format que le lecteur ne sait pas lire
(.doc/.xls/.ppt/.od*) est ``skipped`` / ``UNSUPPORTED_FORMAT`` et ne part
JAMAIS chez Firecrawl.

Sécurité (SSRF) : seulement http/https ; un hôte (littéral OU résolu par DNS)
qui n'est pas une adresse publique est refusé, à chaque redirection aussi. La
garde de ``progress.py`` AUTORISE les plages privées (callback interne Railway) :
elle ne convient pas ici, où l'URL vient du web.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
from contextvars import ContextVar
from typing import Literal
from urllib.parse import unquote, urljoin, urlparse

import httpx

from app.services import safe_fetch
from app.services.document_text import DocumentTextError, _is_garbled, extract_document_text

logger = logging.getLogger(__name__)

#: Lus en local (le lecteur sait les ouvrir).
_READABLE_EXTENSIONS = frozenset({".pdf", ".docx", ".xlsx", ".pptx", ".rtf", ".csv", ".txt"})
#: Documents que le lecteur ne sait PAS lire : écartés, jamais envoyés à Firecrawl.
_UNSUPPORTED_EXTENSIONS = frozenset({".odt", ".ods", ".odp", ".doc", ".xls", ".ppt"})

ERROR_CODE_TOO_LARGE = "TOO_LARGE"
ERROR_CODE_UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
ERROR_CODE_UNREADABLE = "UNREADABLE"
ERROR_CODE_UNSAFE_URL = "UNSAFE_URL"

_MAX_REDIRECTS = 5
_USER_AGENT = "Mozilla/5.0 (compatible; BellumAI/1.0)"


def _max_bytes() -> int:
    return int(os.getenv("WEB_DOCUMENT_MAX_BYTES", str(20 * 1024 * 1024)))


def _timeout_s() -> float:
    return float(os.getenv("WEB_DOCUMENT_TIMEOUT_S", "15"))


def _char_budget() -> int:
    """Le budget existant par catégorie : un document n'est jamais tronqué
    plus large que ce que la phase 1 injecte de toute façon au prompt."""
    return int(os.getenv("FIRECRAWL_CHARS_PER_CATEGORY", "6000"))


class WebDocumentError(Exception):
    """Issue NON réussie d'une lecture de document, avec le statut ``ScrapeResult``
    qu'elle porte (``error`` / ``empty`` / ``timeout`` / ``skipped``)."""

    def __init__(
        self,
        status: Literal["error", "empty", "timeout", "skipped"],
        error_code: str,
    ) -> None:
        self.status = status
        self.error_code = error_code
        super().__init__(f"{status}:{error_code}")


def _extension(url: str) -> str:
    path = unquote(urlparse(url).path or "").lower()
    dot = path.rfind(".")
    slash = path.rfind("/")
    return path[dot:] if dot > slash else ""


def is_document_url(url: str) -> bool:
    """L'URL se termine-t-elle par une extension de document (casse et
    querystring ignorées) ? Pas de HEAD : sans extension, c'est du HTML."""
    ext = _extension(url)
    return ext in _READABLE_EXTENSIONS or ext in _UNSUPPORTED_EXTENSIONS


def is_unsupported_document_url(url: str) -> bool:
    return _extension(url) in _UNSUPPORTED_EXTENSIONS


# ── SSRF ─────────────────────────────────────────────────────────────────────


async def _resolve_ips(host: str) -> list[str]:
    return await safe_fetch.resolve_public_ips(host)


async def _assert_safe(url: str) -> None:
    """Refus rapide avant chaque saut ; la connexion, elle, est épinglée à l'IP
    validée par ``safe_fetch.PinnedNetworkBackend`` (anti DNS rebinding, audit IA M4)."""
    parsed = urlparse(url)
    host = parsed.hostname
    if parsed.scheme not in ("http", "https") or not host:
        raise WebDocumentError("error", ERROR_CODE_UNSAFE_URL)
    try:
        ipaddress.ip_address(host)
        addresses = [host]  # littéral : jamais de DNS
    except ValueError:
        addresses = None
    try:
        if addresses is None:
            addresses = await _resolve_ips(host)
    except safe_fetch.DnsResolutionError:
        raise WebDocumentError("error", "DNS_FAILED") from None
    except safe_fetch.UnsafeHostError:
        raise WebDocumentError("error", ERROR_CODE_UNSAFE_URL) from None
    if not addresses or not all(safe_fetch.is_public_ip(a) for a in addresses):
        raise WebDocumentError("error", ERROR_CODE_UNSAFE_URL)


# ── Lecture ──────────────────────────────────────────────────────────────────


def _new_client() -> httpx.AsyncClient:
    # Redirections suivies à la main (chaque saut revalidé) ; connexion épinglée (M4).
    return safe_fetch.new_pinned_client(
        timeout=_timeout_s(), headers={"User-Agent": _USER_AGENT, "Accept": "*/*"}
    )


async def _download(client: httpx.AsyncClient, url: str, cap: int) -> bytes:
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        await _assert_safe(current)
        async with client.stream("GET", current) as resp:
            if resp.is_redirect:
                location = resp.headers.get("location")
                if not location:
                    raise WebDocumentError("error", "BAD_REDIRECT")
                current = urljoin(current, location)
                continue
            if resp.status_code >= 400:
                raise WebDocumentError("error", f"HTTP_{resp.status_code}")
            ctype = resp.headers.get("content-type", "").lower()
            if "html" in ctype:
                # Une page (mur de connexion, redirection vers une landing) derrière
                # une URL en .pdf : pas un document, et surtout pas de repli payant.
                raise WebDocumentError("empty", ERROR_CODE_UNREADABLE)
            declared = resp.headers.get("content-length", "")
            if declared.isdigit() and int(declared) > cap:
                raise WebDocumentError("error", ERROR_CODE_TOO_LARGE)
            chunks: list[bytes] = []
            total = 0
            async for chunk in resp.aiter_bytes():
                total += len(chunk)
                if total > cap:
                    raise WebDocumentError("error", ERROR_CODE_TOO_LARGE)
                chunks.append(chunk)
            return b"".join(chunks)
    raise WebDocumentError("error", "TOO_MANY_REDIRECTS")


async def read_document(url: str) -> str:
    """Télécharge ``url`` et rend son texte (tronqué au budget par catégorie).
    Lève :class:`WebDocumentError` pour toute issue non réussie."""
    if is_unsupported_document_url(url):
        raise WebDocumentError("skipped", ERROR_CODE_UNSUPPORTED_FORMAT)
    try:
        async with _new_client() as client:
            data = await _download(client, url, _max_bytes())
    except WebDocumentError:
        raise
    except httpx.TimeoutException:
        raise WebDocumentError("timeout", "TIMEOUT") from None
    except httpx.HTTPError as exc:
        logger.warning("Document fetch failed for %s: %s", url, exc.__class__.__name__)
        raise WebDocumentError("error", "FETCH_FAILED") from None

    filename = unquote(urlparse(url).path.rsplit("/", 1)[-1]) or None
    try:
        extracted = await asyncio.to_thread(extract_document_text, data, filename)
    except DocumentTextError:
        raise WebDocumentError("empty", ERROR_CODE_UNREADABLE) from None
    except Exception as exc:  # noqa: BLE001 — un fichier corrompu ne casse pas le run
        logger.warning("Document parse failed for %s: %s", url, exc.__class__.__name__)
        raise WebDocumentError("empty", ERROR_CODE_UNREADABLE) from None
    text = extracted.text.strip()
    if not text or _is_garbled(text):
        raise WebDocumentError("empty", ERROR_CODE_UNREADABLE)
    return text[: _char_budget()]


# ── Métriques par run ────────────────────────────────────────────────────────

_metrics: ContextVar[dict[str, int] | None] = ContextVar("web_documents_metrics", default=None)


def reset_run_metrics() -> None:
    _metrics.set({"web_documents_read": 0, "web_documents_failed": 0})


def run_metrics() -> dict[str, int]:
    current = _metrics.get()
    return dict(current) if current else {"web_documents_read": 0, "web_documents_failed": 0}


def record_run(read: int, failed: int) -> None:
    """Ajoute le bilan d'un lot et écrit UNE ligne INFO (#4016.7)."""
    if not (read or failed):
        return
    totals = run_metrics()
    totals["web_documents_read"] += read
    totals["web_documents_failed"] += failed
    _metrics.set(totals)
    logger.info(
        "web_documents_read=%d web_documents_failed=%d (lus en local, 0 crédit Firecrawl)",
        totals["web_documents_read"],
        totals["web_documents_failed"],
    )


__all__ = [
    "ERROR_CODE_UNSUPPORTED_FORMAT",
    "WebDocumentError",
    "is_document_url",
    "is_unsupported_document_url",
    "read_document",
    "record_run",
    "reset_run_metrics",
    "run_metrics",
]
