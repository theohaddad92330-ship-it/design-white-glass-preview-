"""Lightweight tech-stack detection (Wappalyzer-style) — no key, no paid API.

Fetches the company homepage once and matches a curated signature set against the
HTML + response headers. Gives a REAL, observed front-of-house stack (framework /
CMS / e-commerce / analytics / cloud / CDN / enterprise software) instead of the
LLM's guess — directly answering "what does an ESN sell into here". Runs in
parallel with the rest of Phase 1; empty on any error or without a URL.

Curated (~30 high-signal techs), not exhaustive: detecting the obvious public
stack is enough to ground the dossier; deep detection isn't worth a paid API.
"""

from __future__ import annotations

import logging
import re

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.data_sources._http_pool import get_shared_client
from app.services.source_health import error_reason, record_degradation

logger = logging.getLogger(__name__)

_TIMEOUT_S = 15.0  # SIGNAUX-OPTI 16/10 : 8 s expirait en prod (gather phase 1, pairs ≤ 12 s)

# tech → (where, compiled pattern). where ∈ {"html", "header:<name>"}.
_SIGNATURES: list[tuple[str, str, re.Pattern[str]]] = [
    ("React", "html", re.compile(r"data-reactroot|react(?:-dom)?(?:\.production)?\.min\.js|__NEXT_DATA__", re.I)),
    ("Next.js", "html", re.compile(r"/_next/|__NEXT_DATA__", re.I)),
    ("Vue.js", "html", re.compile(r"vue(?:\.runtime)?(?:\.min)?\.js|data-v-[0-9a-f]{8}", re.I)),
    ("Nuxt", "html", re.compile(r"__NUXT__|/_nuxt/", re.I)),
    ("Angular", "html", re.compile(r"ng-version|angular(?:\.min)?\.js", re.I)),
    ("Svelte", "html", re.compile(r"svelte-[0-9a-z]+", re.I)),
    ("jQuery", "html", re.compile(r"jquery(?:-[0-9.]+)?(?:\.min)?\.js", re.I)),
    ("WordPress", "html", re.compile(r"/wp-content/|/wp-includes/|wp-json", re.I)),
    ("Drupal", "html", re.compile(r"/sites/default/files/|Drupal\.settings", re.I)),
    ("Shopify", "html", re.compile(r"cdn\.shopify\.com|Shopify\.theme", re.I)),
    ("Salesforce", "html", re.compile(r"force\.com|salesforce|pardot", re.I)),
    ("HubSpot", "html", re.compile(r"hs-scripts\.com|hubspot", re.I)),
    ("Google Analytics", "html", re.compile(r"google-analytics\.com|gtag\(|googletagmanager\.com", re.I)),
    ("Google Tag Manager", "html", re.compile(r"googletagmanager\.com/gtm", re.I)),
    ("Matomo", "html", re.compile(r"matomo\.js|piwik\.js", re.I)),
    ("Adobe Experience Manager", "html", re.compile(r"/etc/designs/|/content/dam/|cq-", re.I)),
    ("Typeform", "html", re.compile(r"typeform\.com", re.I)),
    ("Cloudflare", "header:server", re.compile(r"cloudflare", re.I)),
    ("Nginx", "header:server", re.compile(r"nginx", re.I)),
    ("Apache", "header:server", re.compile(r"apache", re.I)),
    ("Microsoft IIS", "header:server", re.compile(r"microsoft-iis", re.I)),
    ("Varnish", "header:via", re.compile(r"varnish", re.I)),
    ("AWS", "header:server", re.compile(r"awselb|amazons3", re.I)),
    ("AWS CloudFront", "header:via", re.compile(r"cloudfront", re.I)),
    ("Akamai", "header:server", re.compile(r"akamai", re.I)),
    ("Fastly", "header:x-served-by", re.compile(r"cache-", re.I)),
    ("PHP", "header:x-powered-by", re.compile(r"php", re.I)),
    ("ASP.NET", "header:x-powered-by", re.compile(r"asp\.net", re.I)),
]


def _normalize_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    return u


def detect_from(html: str, headers: dict[str, str]) -> list[str]:
    """Pure matcher — exposed for tests. Returns the detected tech names, ordered."""
    lower_headers = {k.lower(): str(v) for k, v in (headers or {}).items()}
    found: list[str] = []
    for tech, where, pat in _SIGNATURES:
        if where == "html":
            hay = html or ""
        else:
            hay = lower_headers.get(where.split(":", 1)[1], "")
        if hay and pat.search(hay) and tech not in found:
            found.append(tech)
    return found


@provider_cache.cached_by("tech:detect", lambda website, **_: (website or "").strip().lower(), ttl=provider_cache.TTL_TECH)
async def detect_stack(website: str, *, client: httpx.AsyncClient | None = None) -> list[str]:
    """Observed front-of-house tech stack from the homepage. Empty without a URL
    or on any error."""
    url = _normalize_url(website)
    if not url:
        return []

    http = client if client is not None else get_shared_client("tech_detect", timeout=_TIMEOUT_S, follow_redirects=True)
    try:
        resp = await http.get(url, headers={"User-Agent": "Mozilla/5.0 (compatible; BellumAI/1.0)"})
        html = resp.text[:400_000]
        headers = {k: v for k, v in resp.headers.items()}
    except Exception as exc:  # noqa: BLE001 — a source must never break research
        logger.warning("tech_detect failed for %r: %s", url, exc)
        # Report the REAL cause: without it the run can only say "aucun
        # résultat", which reads identically to a company that genuinely has
        # nothing here — opposite facts, same message.
        record_degradation(get_correlation_id(), source="tech_detect", reason=error_reason(exc))
        return []
    return detect_from(html, headers)
