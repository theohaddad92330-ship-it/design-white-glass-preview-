from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any, Literal, TypedDict
from urllib.parse import urlsplit

from firecrawl import AsyncFirecrawl
from firecrawl.v2.utils.error_handler import (
    FirecrawlError,
    InternalServerError,
    PaymentRequiredError,
    RateLimitError,
    UnauthorizedError,
    WebsiteNotSupportedError,
)

from app.services import cost_ledger, crawl_browser_tier, crawl_free_tier, web_documents
from app.services.rate_limiter import back_off_provider, throttle
from app.services.research.sources import SourceCategory
from app.services.scrape_cache import cached_markdown

logger = logging.getLogger(__name__)


# ── Typed scrape error ────────────────────────────────────────────────────────
#
# Maps Firecrawl SDK exceptions to a small set of stable codes the rest of the
# stack can route on (FastAPI handler in main.py, API worker IaErrorPayload,
# UI banner). The message is French and user-facing — it shows up directly in
# the analysis error card, so be concrete about the cause and the next action.

ERROR_CODE_INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"
ERROR_CODE_RATE_LIMITED = "RATE_LIMITED"
ERROR_CODE_AUTH_FAILED = "AUTH_FAILED"
ERROR_CODE_WEBSITE_BLOCKED = "WEBSITE_BLOCKED"
ERROR_CODE_FIRECRAWL_INTERNAL = "FIRECRAWL_INTERNAL"
ERROR_CODE_FIRECRAWL_UNKNOWN = "FIRECRAWL_UNKNOWN"

_USER_MESSAGES: dict[str, str] = {
    ERROR_CODE_INSUFFICIENT_CREDITS: (
        "Crédits Firecrawl insuffisants. "
        "Recharger sur firecrawl.dev/pricing ou contacter le support."
    ),
    ERROR_CODE_RATE_LIMITED: (
        "Limite de requêtes Firecrawl atteinte. Patientez quelques minutes "
        "puis réessayez."
    ),
    ERROR_CODE_AUTH_FAILED: (
        "Clé API Firecrawl invalide ou expirée. Vérifier la configuration."
    ),
    ERROR_CODE_WEBSITE_BLOCKED: (
        "Le site cible bloque le scraping (robots.txt, captcha ou anti-bot)."
    ),
    ERROR_CODE_FIRECRAWL_INTERNAL: (
        "Erreur serveur Firecrawl. Le service IA réessayera automatiquement."
    ),
    ERROR_CODE_FIRECRAWL_UNKNOWN: (
        "Erreur Firecrawl inattendue. Détails techniques dans les logs."
    ),
}


# Hard per-URL ceiling. Firecrawl's SDK does its own timeout but we wrap an
# `asyncio.timeout` around it so a single slow page can't park a worker.
#
# 15s, down from 25s: the scrape sits on the phase-1 critical path (the Claude
# prompts consume its output), so the ceiling is really "how long is one page
# worth waiting for". Pages needing >15s are heavy JS renders that rarely carry
# the firmographic content we extract, and their loss is now reported through
# source_health instead of vanishing. Env-tunable for a coverage-first deploy.
PER_URL_TIMEOUT_S = float(os.getenv("FIRECRAWL_PER_URL_TIMEOUT_S", "15"))

# Concurrent scrapes. Was hardcoded 5, so 7 selected pages ran in two waves
# (5 + 2) — a full extra scrape wave on the phase-1 critical path. Env-tunable
# (FIRECRAWL_CONCURRENCY) and defaulted to 10 so the usual page set fires in ONE
# wave. Kept aligned with the Firecrawl throttle's concurrency (rate_limiter),
# which still gates the real outbound rate so this never exceeds the plan limit.
_SCRAPE_CONCURRENCY = int(os.getenv("FIRECRAWL_CONCURRENCY", "10"))

# Firecrawl server-side cache (``max_age``, in ms). When Firecrawl has scraped a
# URL within this window it returns the cached page from ITS index instead of
# re-rendering it live — the single biggest per-page latency lever (Firecrawl
# documents it as up to ~5× faster), quality-neutral for slow-moving corporate
# pages. Default 2 days, consistent with the 14-day local scrape cache. Set
# FIRECRAWL_MAX_AGE_MS=0 to force an always-fresh live scrape.
_SCRAPE_MAX_AGE_MS = int(os.getenv("FIRECRAWL_MAX_AGE_MS", str(2 * 24 * 3600 * 1000)))


class ScrapeResult(TypedDict):
    """Structured result for one scrape attempt — success or per-URL failure.

    Per-URL failures keep their slot here (with ``markdown=None`` and a
    non-"ok" ``scrape_status``) so the caller can render exhaustive
    per-category metrics in ``_api_metrics``. Terminal errors (credits /
    auth / rate limit) still raise :class:`FirecrawlScrapeError`.
    """

    url: str
    title: str
    category: SourceCategory
    snippet: str | None
    markdown: str | None
    char_count: int
    scrape_status: Literal["ok", "skipped", "error", "empty", "timeout"]
    error_code: str | None


class FirecrawlScrapeError(Exception):
    """Raised when a Firecrawl scrape fails in a way that should fail the
    whole analysis — credit exhaustion, auth failure, etc. The pipeline
    cannot recover from these so we propagate up to the FastAPI handler
    rather than silently returning 0 pages.
    """

    service = "firecrawl"

    def __init__(self, code: str, *, url: str = "", details: str = "") -> None:
        self.code = code
        self.url = url
        self.details = details[:500]
        self.user_message = _USER_MESSAGES.get(code, _USER_MESSAGES[ERROR_CODE_FIRECRAWL_UNKNOWN])
        super().__init__(f"Firecrawl {code} on {url or '<n/a>'}: {details[:200]}")


class _ScrapeOutcome(Exception):
    """Internal signal only — carries a NON-terminal per-URL scrape outcome
    (error / empty / timeout) through ``cached_markdown``'s single-flight
    ``fetch`` (lot 16, câble 1 / GA-321), so every waiter sharing a cold URL
    gets the exact SAME classification instead of only the caller whose own
    fetch actually ran. Never crosses ``_scrape_one``'s boundary — caught
    there and turned back into a :class:`ScrapeResult`."""

    #: #4458 — un échec de scrape attendu (site qui bloque, page vide, timeout, panne fournisseur) n'est pas un
    #: défaut : ``sentry_init._before_send`` ne l'envoie pas.
    sentry_expected = True

    def __init__(self, status: Literal["error", "empty", "timeout"], error_code: str | None) -> None:
        self.status = status
        self.error_code = error_code
        super().__init__(f"{status}:{error_code}")


def _classify(exc: Exception) -> str:
    """Map a SDK exception (or generic Exception) to a stable code."""
    if isinstance(exc, PaymentRequiredError):
        return ERROR_CODE_INSUFFICIENT_CREDITS
    if isinstance(exc, RateLimitError):
        return ERROR_CODE_RATE_LIMITED
    if isinstance(exc, UnauthorizedError):
        return ERROR_CODE_AUTH_FAILED
    if isinstance(exc, WebsiteNotSupportedError):
        return ERROR_CODE_WEBSITE_BLOCKED
    if isinstance(exc, InternalServerError):
        return ERROR_CODE_FIRECRAWL_INTERNAL
    if isinstance(exc, FirecrawlError):
        return ERROR_CODE_FIRECRAWL_UNKNOWN
    return ERROR_CODE_FIRECRAWL_UNKNOWN


def _is_terminal(code: str) -> bool:
    """Codes that should abort the analysis (vs. per-URL recoverable errors).

    Per-URL errors like ``WEBSITE_BLOCKED`` are common and shouldn't kill the
    whole run — we just skip that URL. Account-wide errors (credits, auth,
    rate limit) mean the rest of the pipeline will keep failing, so we fail
    fast.
    """
    return code in {
        ERROR_CODE_INSUFFICIENT_CREDITS,
        ERROR_CODE_RATE_LIMITED,
        ERROR_CODE_AUTH_FAILED,
    }


# ── Domain filtering & priority ───────────────────────────────────────────────

EXCLUDED_DOMAINS = [
    "linkedin.com",
    "facebook.com",
    "youtube.com",
    "twitter.com",
    "instagram.com",
    "tiktok.com",
    "pinterest.com",
]

# URLs containing these keywords are more valuable for sales intelligence.
# Kept as a secondary score — the primary signal is the source category.
HIGH_VALUE_KEYWORDS = [
    "communique", "press", "presse", "news", "actualite",
    "rapport-annuel", "annual-report", "document-reference",
    "carrieres", "careers", "recrutement", "jobs",
    "organigramme", "organisation", "governance", "gouvernance",
    "innovation", "digital", "numerique", "transformation",
    "strategie", "strategy", "direction", "comex",
    "partenaire", "partner", "fournisseur",
    # #4738 — ce qu'un site énonce de lui-même (projet, chantier, ouverture de
    # site, partenariat, recrutement, investissement) vit sous des URL que la
    # liste ci-dessus ne nommait pas : la page tombait au niveau du bruit et le
    # budget de scrape la laissait de côté.
    "projet", "project", "chantier", "blog", "actus", "evenement", "event", "agenda",
    "partenariat", "emploi", "rejoindre", "implantation", "nouveau-site", "ouverture",
    "investissement", "acquisition", "realisation",
    # #4016.6 — plus de bonus ".pdf" : un document est lu en local (gratuit),
    # donc un candidat NORMAL, ni favorisé ni pénalisé.
]

LOW_VALUE_KEYWORDS = [
    "cookie", "cgu", "cgv", "legal",
    "politique-confidentialite", "privacy",
    "login", "signup", "inscription",
    "panier", "cart", "checkout",
]

# #4743 — mentions légales : raison sociale, immatriculation, dirigeant, hébergeur,
# agence. Elles sortent de la liste « faible valeur » (variantes comprises) ; les
# CGU / CGV / cookies / confidentialité y restent, même sous un dossier /legal/.
LEGAL_NOTICE_KEYWORDS = (
    "mentions-legales", "mention-legale", "mentions_legales", "mentionslegales",
    "informations-legales", "information-legale", "legal-notice", "legal/notice",
    "legal-information", "impressum",
)
_LEGAL_TERMS_KEYWORDS = (
    "cookie", "cgu", "cgv", "politique-confidentialite", "privacy", "terms",
    "conditions-generales",
)


def is_legal_notice_url(url: str) -> bool:
    lower = url.lower()
    return any(kw in lower for kw in LEGAL_NOTICE_KEYWORDS) and not any(
        kw in lower for kw in _LEGAL_TERMS_KEYWORDS
    )


# Per-category boost applied on top of the URL-keyword score so PRESS /
# PROJECT / OFFICIAL pages get picked first when the budget caps the scrape.
_CATEGORY_BOOST: dict[SourceCategory, int] = {
    SourceCategory.PRESS: 15,
    SourceCategory.PROJECT: 15,
    SourceCategory.OFFICIAL: 10,
    SourceCategory.INTERVIEW: 5,
    SourceCategory.JOBS: 10,
    SourceCategory.OTHER: -5,
}


def _url_priority(url: str, category: SourceCategory) -> int:
    """Score URL relevance. Higher = more valuable for sales intelligence."""
    lower = url.lower()
    score = _CATEGORY_BOOST.get(category, 0)
    for kw in HIGH_VALUE_KEYWORDS:
        if kw in lower:
            score += 10
    if is_legal_notice_url(lower):
        return score + 10  # lue comme une page de valeur, jamais pénalisée par « legal »
    for kw in LOW_VALUE_KEYWORDS:
        if kw in lower:
            score -= 20
    return score


# Recency proxy: Brave web hits carry NO date, so a recent year in the title /
# snippet is the best signal we have that a page is fresh (a 2026 press item beats
# an undated one). 2023+ only — older years shouldn't lift a stale page.
_RECENT_YEAR_RE = re.compile(r"\b20(?:2[3-9]|[3-9]\d)\b")


def _hit_content_score(hit: dict[str, Any]) -> int:
    """Tie-break score from the hit's TITLE + SNIPPET (#9). Same value vocabulary
    as the URL score, plus a recency bonus. Breaks ``_url_priority`` ties by
    content relevance instead of arbitrary Brave order."""
    text = f"{hit.get('title', '')} {hit.get('description', '')}".lower()
    score = 0
    for kw in HIGH_VALUE_KEYWORDS:
        if kw in text:
            score += 5
    for kw in LOW_VALUE_KEYWORDS:
        if kw in text:
            score -= 10
    if _RECENT_YEAR_RE.search(text):
        score += 8
    return score


def _is_excluded(url: str) -> bool:
    """Return True if the URL belongs to an excluded domain."""
    lower = url.lower()
    return any(domain in lower for domain in EXCLUDED_DOMAINS)


# ── Coût par requête (#4016 / W11) ───────────────────────────────────────────

_PROXY_ALLOWED = ("basic", "auto", "stealth")
_CREDIT_WARN_THRESHOLD = 10
_RUN_CREDITS_MAX = 256


def _proxy_mode() -> str:
    """#4016.B — ``basic`` par défaut ; ``auto`` bascule en stealth (5 crédits)."""
    raw = os.getenv("FIRECRAWL_PROXY", "").strip().lower()
    return raw if raw in _PROXY_ALLOWED else "basic"


# Crédits réellement facturés, agrégés par run (clé = identifiant de corrélation).
_run_credits: dict[str, dict[str, int]] = {}


def _record_credits(url: str, result: Any) -> None:
    """#4016.D — lit ``metadata.credits_used`` (champ du SDK 4.24, jamais deviné).
    Absent ⇒ 0 crédit compté, mais l'appel réel l'est (``firecrawl_requests_live``)."""
    from app.middleware.correlation_id import get_correlation_id

    meta = getattr(result, "metadata", None)
    if meta is None and isinstance(result, dict):
        meta = result.get("metadata")
    credits = meta.get("credits_used") if isinstance(meta, dict) else getattr(meta, "credits_used", None)
    credits = credits if isinstance(credits, int) and not isinstance(credits, bool) else 0
    cid = get_correlation_id()
    if cid not in _run_credits and len(_run_credits) >= _RUN_CREDITS_MAX:
        _run_credits.pop(next(iter(_run_credits)))  # run abandonné : on borne la mémoire
    stats = _run_credits.setdefault(cid, {"firecrawl_credits_used": 0, "firecrawl_requests_live": 0})
    stats["firecrawl_credits_used"] += credits
    stats["firecrawl_requests_live"] += 1
    if credits > _CREDIT_WARN_THRESHOLD:
        logger.warning("Firecrawl : une requête a coûté %d crédits (> %d) : %s", credits, _CREDIT_WARN_THRESHOLD, url)


def run_credit_metrics(correlation_id: str) -> dict[str, int]:
    """Crédits + appels réels du run (consommé UNE fois par ``_api_metrics``, qui vide l'entrée)."""
    return dict(_run_credits.pop(correlation_id, {"firecrawl_credits_used": 0, "firecrawl_requests_live": 0}))


# ── Scrape ────────────────────────────────────────────────────────────────────

def _extract_markdown(scrape_result: Any) -> str:
    """The SDK returns either an object with a ``.markdown`` attribute or a
    dict with a ``markdown`` key, depending on the version. Handle both.
    """
    if scrape_result is None:
        return ""
    md = getattr(scrape_result, "markdown", None)
    if md:
        return md
    if isinstance(scrape_result, dict):
        return scrape_result.get("markdown") or scrape_result.get("content") or ""
    return ""


async def _scrape_one(
    hit: dict[str, Any],
    client: AsyncFirecrawl,
) -> ScrapeResult:
    """Scrape a single URL via the Firecrawl SDK with a hard timeout.

    Returns a :class:`ScrapeResult` for any per-URL outcome (ok / error /
    empty / timeout). Raises :class:`FirecrawlScrapeError` only for terminal
    account-wide errors (credits / auth / rate limit) — those can't be
    recovered by retrying or skipping the URL.
    """
    url = hit["url"]
    base: ScrapeResult = {
        "url": url,
        "title": hit.get("title", ""),
        "category": hit["category"],
        "snippet": hit.get("description") or None,
        "markdown": None,
        "char_count": 0,
        "scrape_status": "error",
        "error_code": None,
    }

    async def _fetch() -> str | None:
        """The actual Firecrawl call — runs only for the single-flight WINNER
        on a cold URL (lot 16, câble 1 / GA-321). Before this lot, a cache hit
        was checked here and the live call made directly, with NO lock: N
        concurrent cold callers on the SAME url each ran their own Firecrawl
        call — each one a BILLED page."""
        # #4108 paliers 1 et 2 — lecture gratuite (trafilatura) puis navigateur
        # auto-hébergé (crawl4ai) AVANT Firecrawl. Flags éteints (défaut) : ce bloc
        # est sauté, chemin byte-identique ; chaque palier peut être activé seul.
        tier_attempted = False
        if crawl_free_tier.is_enabled():
            tier_attempted = True
            free = await crawl_free_tier.try_free(url)
            if free.status == "refused":
                raise _ScrapeOutcome("skipped", crawl_free_tier.ERROR_CODE_DOMAIN_REFUSED)
            if free.status == "robots_disallowed":
                # robots.txt interdit : on ne crawle PAS du tout (Firecrawl non plus).
                raise _ScrapeOutcome("skipped", crawl_free_tier.ERROR_CODE_ROBOTS_DISALLOWED)
            if free.status == "served" and free.text:
                cost_ledger.record("crawl_tier", "free")  # interne, jamais affiché
                return free.text
        if crawl_browser_tier.is_enabled():
            tier_attempted = True
            browser = await crawl_browser_tier.try_browser(url)
            if browser.status == "refused":
                raise _ScrapeOutcome("skipped", crawl_free_tier.ERROR_CODE_DOMAIN_REFUSED)
            if browser.status == "robots_disallowed":
                raise _ScrapeOutcome("skipped", crawl_free_tier.ERROR_CODE_ROBOTS_DISALLOWED)
            if browser.status == "served" and browser.text:
                cost_ledger.record("crawl_tier", "browser")  # interne, jamais affiché
                return browser.text
        if tier_attempted:
            cost_ledger.record("crawl_tier", "firecrawl")
        try:
            async with throttle("firecrawl"):
                async with asyncio.timeout(PER_URL_TIMEOUT_S):
                    # Strip boilerplate (nav/footer/cookie/scripts) + base64 images so
                    # the char budget carries real content, not chrome (audit scraping #3).
                    result = await client.scrape(
                        url=url,
                        formats=["markdown"],
                        only_main_content=True,
                        remove_base64_images=True,
                        # #4016.B — proxy basique explicite (jamais de bascule stealth silencieuse).
                        proxy=_proxy_mode(),
                        exclude_tags=["nav", "footer", "aside", "header", "script", "style", "noscript", "form"],
                        # #4016.5 — filet : aucun parseur de document côté Firecrawl. Un
                        # PDF déguisé en page HTML ne peut plus être facturé PAR PAGE
                        # (161k crédits PDF sur 30 j) ; les vrais documents passent par
                        # ``web_documents`` (lecture locale).
                        parsers=[],
                        # ``max_age`` opts into Firecrawl's server-side cache: a page it
                        # scraped within the window comes back near-instantly instead of a
                        # fresh multi-second render. Omitted when 0 so the request isn't
                        # pinned to an uncacheable zero-age fetch.
                        **({"max_age": _SCRAPE_MAX_AGE_MS} if _SCRAPE_MAX_AGE_MS > 0 else {}),
                    )
            _record_credits(url, result)
        except TimeoutError:
            logger.warning("Firecrawl scrape timed out (>%ss) for %s", PER_URL_TIMEOUT_S, url)
            raise _ScrapeOutcome("timeout", "TIMEOUT") from None
        except Exception as exc:
            code = _classify(exc)
            if code == ERROR_CODE_RATE_LIMITED:
                # Le SDK expose la réponse HTTP sur l'exception (``requests``, pas
                # httpx) — on en tire ``Retry-After`` quand Firecrawl le donne.
                retry_after = None
                sdk_response = getattr(exc, "response", None)
                if sdk_response is not None:
                    headers = getattr(sdk_response, "headers", None) or {}
                    retry_after = headers.get("retry-after") or headers.get("Retry-After")
                back_off_provider("firecrawl", retry_after)
            if _is_terminal(code):
                raise FirecrawlScrapeError(code, url=url, details=str(exc)) from exc
            logger.warning("Firecrawl scrape failed for %s (%s): %s", url, code, exc)
            raise _ScrapeOutcome("error", code) from exc

        markdown = _extract_markdown(result)
        if not markdown:
            logger.info("No markdown content returned for %s", url)
            raise _ScrapeOutcome("empty", None)
        return markdown

    async def _fetch_document() -> str | None:
        """#4016 — voie document : lecture LOCALE (zéro crédit Firecrawl). Même
        cache, même single-flight : un rapport annuel n'est lu qu'une fois pour
        tous les espaces. Les issues non réussies voyagent en ``_ScrapeOutcome``
        pour que tous les waiters partagent la même classification."""
        try:
            return await web_documents.read_document(url)
        except web_documents.WebDocumentError as exc:
            raise _ScrapeOutcome(exc.status, exc.error_code) from None

    is_document = web_documents.is_document_url(url)
    if is_document and web_documents.is_unsupported_document_url(url):
        # Format que le lecteur ne sait pas ouvrir : écarté, JAMAIS envoyé à Firecrawl.
        return {
            **base,
            "scrape_status": "skipped",
            "error_code": web_documents.ERROR_CODE_UNSUPPORTED_FORMAT,
        }

    try:
        # Cache-or-fetch WITH the anti-stampede single-flight lock (GA-301
        # combinator) — a cache hit returns immediately; a cold miss collapses
        # N concurrent callers on the SAME url into ONE real ``_fetch()`` and
        # only the winner writes the result through. Was two separate,
        # unlocked ``get_markdown()``/``set_markdown()`` calls before this lot
        # (GA-321) — N concurrent cold callers each re-scraped AND re-billed.
        markdown = await cached_markdown(url, _fetch_document if is_document else _fetch)
    except _ScrapeOutcome as outcome:
        # Issue de scrape attendue (site qui bloque, page vide, timeout, panne
        # fournisseur) : déjà portée par ``scrape_status`` / ``error_code`` jusqu'à
        # l'écran — un warning structuré (code + hôte, jamais l'URL entière).
        logger.warning(
            "Firecrawl scrape outcome %s (%s) for host %s",
            outcome.status,
            outcome.error_code,
            urlsplit(url).hostname or "?",
        )
        return {**base, "scrape_status": outcome.status, "error_code": outcome.error_code}

    if not markdown:
        # Defensive only — ``_fetch`` always either returns non-empty markdown
        # or raises ``_ScrapeOutcome``/``FirecrawlScrapeError``; keeps the
        # pre-refactor "error" default shape if ever reached.
        return base

    return {
        **base,
        "markdown": markdown,
        "char_count": len(markdown),
        "scrape_status": "ok",
    }


async def scrape_hits(
    hits: list[dict[str, Any]],
    *,
    max_pages: int = 12,
    max_chars: int = 120000,
    http_client: AsyncFirecrawl | None = None,
) -> list[ScrapeResult]:
    """Scrape Brave hits in parallel via Firecrawl.

    - Filters out excluded social-media domains.
    - Takes at most ``max_pages`` hits after filtering, ordered by
      ``_url_priority`` (category boost + keyword score).
    - Scrapes in parallel (semaphore = 3).
    - Stops accumulating content once ``max_chars`` is exceeded; remaining
      hits are emitted with ``scrape_status="skipped"`` so the caller can
      still see them in metrics. 120k default = 12 pages × ~10k markdown
      avg — sized so the total budget never silently re-caps ``max_pages``
      (the old 40k saturated at ~5 pages of ~8k, quietly dropping the rest).
      Prompt injection stays bounded downstream by the per-category render
      budget (FIRECRAWL_CHARS_PER_CATEGORY), so this only gates the bundle.
    - On the first terminal account-wide error (credits / auth / rate limit),
      cancels the remaining tasks and raises :class:`FirecrawlScrapeError`.
    """
    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if not api_key:
        raise ValueError("FIRECRAWL_API_KEY environment variable is not set")

    if not hits:
        return []

    filtered = [h for h in hits if not _is_excluded(h["url"])]
    # Primary key = URL priority (category + slug); tie-break = title/snippet
    # relevance + recency (#9), so same-priority hits are ordered by content
    # value, not the arbitrary Brave query order.
    filtered.sort(
        key=lambda h: (_url_priority(h["url"], h["category"]), _hit_content_score(h)),
        reverse=True,
    )

    selected = filtered[:max_pages]
    skipped = filtered[max_pages:]

    if not selected:
        return []

    client = http_client or AsyncFirecrawl(api_key=api_key)

    # Match the Firecrawl throttle's concurrency (rate_limiter: 5). A stricter
    # local cap just under-utilizes the budget and adds a full 25s wave to the
    # phase-1 wall-time on rich accounts (F7). The throttle still gates the real
    # request rate, so this never exceeds the plan's limit.
    sem = asyncio.Semaphore(_SCRAPE_CONCURRENCY)
    aborted = asyncio.Event()

    async def _throttled(h: dict[str, Any]) -> ScrapeResult | FirecrawlScrapeError:
        if aborted.is_set():
            return _skipped_result(h)
        async with sem:
            if aborted.is_set():
                return _skipped_result(h)
            try:
                return await _scrape_one(h, client)
            except FirecrawlScrapeError as exc:
                aborted.set()
                return exc

    raw_results = await asyncio.gather(*[_throttled(h) for h in selected])

    for item in raw_results:
        if isinstance(item, FirecrawlScrapeError):
            logger.error(
                "Firecrawl terminal error — aborting analysis",
                extra={"tags": {"service": "firecrawl", "error_code": item.code}},
            )
            raise item

    out: list[ScrapeResult] = []
    total_chars = 0
    for item in raw_results:
        if isinstance(item, Exception):  # defensive — handled above
            continue
        assert isinstance(item, dict)
        if item["scrape_status"] == "ok" and total_chars >= max_chars:
            # Budget exhausted — record the URL but don't return its body to
            # the prompts. Useful for "we found this but didn't fit it in".
            out.append({**item, "markdown": None, "scrape_status": "skipped"})
            continue
        if item["scrape_status"] == "ok":
            total_chars += item["char_count"]
        out.append(item)

    # Surface hits below the ``max_pages`` cutoff so per-category metrics
    # match what Brave actually returned.
    for h in skipped:
        out.append(_skipped_result(h))

    # Registre de coûts (D19) : une unité = une page RÉELLEMENT scrapée, donc
    # facturée par Firecrawl. Les `skipped` n'ont pas coûté un crédit — les
    # compter gonflerait la facture d'un run de tout ce qu'il n'a pas fait.
    # #4016.7 — les documents lus en local ne coûtent AUCUN crédit : ni au
    # registre Firecrawl, ni dans le bilan « scrapé » ; ils ont leurs compteurs.
    doc_items = [item for item in out if web_documents.is_document_url(item["url"])]
    doc_read = sum(1 for item in doc_items if item["scrape_status"] == "ok")
    doc_failed = sum(1 for item in doc_items if item["scrape_status"] in ("error", "empty", "timeout"))
    web_documents.record_run(doc_read, doc_failed)
    scraped = sum(
        1
        for item in out
        if item["scrape_status"] == "ok" and not web_documents.is_document_url(item["url"])
    )
    if scraped:
        cost_ledger.record("firecrawl", "scrape", units=scraped)
    from app.middleware.correlation_id import get_correlation_id

    cid = get_correlation_id()
    stats = _run_credits.get(cid)
    if stats:
        logger.info(
            "Firecrawl : %d pages, %d crédits ; web_documents_read=%d web_documents_failed=%d",
            scraped,
            stats["firecrawl_credits_used"],
            doc_read,
            doc_failed,
        )

    return out


def _skipped_result(hit: dict[str, Any]) -> ScrapeResult:
    return {
        "url": hit["url"],
        "title": hit.get("title", ""),
        "category": hit["category"],
        "snippet": hit.get("description") or None,
        "markdown": None,
        "char_count": 0,
        "scrape_status": "skipped",
        "error_code": None,
    }


__all__ = [
    "ERROR_CODE_AUTH_FAILED",
    "ERROR_CODE_FIRECRAWL_INTERNAL",
    "ERROR_CODE_FIRECRAWL_UNKNOWN",
    "ERROR_CODE_INSUFFICIENT_CREDITS",
    "ERROR_CODE_RATE_LIMITED",
    "ERROR_CODE_WEBSITE_BLOCKED",
    "FirecrawlScrapeError",
    "PER_URL_TIMEOUT_S",
    "ScrapeResult",
    "run_credit_metrics",
    "scrape_hits",
]
