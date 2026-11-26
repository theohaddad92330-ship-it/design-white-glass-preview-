"""SalesQL person enrichment — env-gated cascade partner for Apollo.

Second source in the contact-enrichment cascade (Apollo → **SalesQL** →
Dropcontact). SalesQL resolves verified pro emails + phones from a LinkedIn URL
or a name + company, so it can complete a contact Apollo could not reach.

Hard rules (same discipline as ``apollo.py`` / ``apollo_org.py``):
  - **env-gated on ``SALESQL_API_KEY``** — no key = strict no-op: ``matched=False``
    and **ZERO network calls** (the cascade behaves exactly as before this file);
  - **JAMAIS de donnée inventée** — a field absent from SalesQL is absent here,
    an HTTP/network error yields an empty (unmatched) result, never a guess;
  - rate-limited via the shared limiter (``throttle("salesql")``), graceful on
    every failure, and a real hit is cached (Redis, best-effort, TTL-bounded) so
    re-enrichments don't re-spend the SalesQL credit.

API contract (verified 2026-07-18 against https://salesql.com/docs — the person
enrichment endpoint). SalesQL exposes a single GET enrichment endpoint that
accepts EITHER a ``linkedin_url`` OR a name + organization, and returns
``emails[]`` / ``phones[]``::

    GET https://api-public.salesql.com/v1/persons/enrich
        ?linkedin_url=https://www.linkedin.com/in/...
        (or) ?first_name=..&last_name=..&organization_name=..&organization_domain=..
    Authorization: Bearer <SALESQL_API_KEY>

    → { "first_name", "last_name", "full_name", "linkedin_url", "title",
        "emails": [ { "email", "type", "status" }, ... ],
        "phones": [ { "phone", "type" }, ... ] }

NOTE on auth: the persons endpoint documents a ``Authorization: Bearer`` header;
an older organizations example used a ``?api_key=`` query param. We send the
Bearer header (the documented person-endpoint form). If SalesQL only honours the
query param on a given account, set the key and it degrades gracefully to an
empty result — flip ``SALESQL_AUTH_STYLE=query`` to switch without a redeploy.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, cast, get_args

import httpx

from app.models.contacts import (
    ApolloEmailStatus,
    ApolloEnrichmentResult,
    ApolloPhoneNumber,
)
from app.services import provider_cache
from app.services.distributed_rate_limiter import get_client, redis_url
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle

logger = logging.getLogger(__name__)

SALESQL_ENRICH_URL = "https://api-public.salesql.com/v1/persons/enrich"

# A real SalesQL hit costs a credit and is slow; cache MATCHED results (keyed on
# the strongest identity) so re-enrichments don't re-spend. Misses/errors are
# NOT cached (the data improves over time; an error isn't a real "no match").
#
# ⚠️ DÉLIBÉRÉMENT sans étage Postgres durable (lot 16, câble 3 / GA-323 —
# arbitrage de Louis le 12/09/2026, revenu en arrière après une première
# implémentation). Comme ``apollo.py`` juste à côté : cette entrée est un
# e-mail et un téléphone d'une PERSONNE identifiée, pas de la donnée
# d'entreprise. ``source_cache.py`` documente « PUBLIC data ONLY … NEVER
# user or CRM data » — un Postgres durable et partagé PROLONGE la rétention
# de cette donnée personnelle dans les faits (Redis s'évince, Postgres non),
# même à clé et TTL identiques. On ne prolonge pas la rétention de données
# personnelles pour économiser un crédit SalesQL. Ne pas « compléter » ce
# fichier avec un ``source_cache.get/put`` sans relecture RGPD explicite.
_CACHE_TTL_S = int(os.getenv("SALESQL_CACHE_TTL_S", str(provider_cache.TTL_CONTACT)))  # 30 j (CACHE_TTL_CONTACT_S), Redis seul

_VALID_EMAIL_STATUSES: frozenset[str] = frozenset(get_args(ApolloEmailStatus))


def is_enabled() -> bool:
    """True when ``SALESQL_API_KEY`` is configured. Sans clé = no-op strict."""
    return bool(os.environ.get("SALESQL_API_KEY", "").strip())


def _auth(api_key: str) -> tuple[dict[str, str], dict[str, str]]:
    """Return (headers, extra_query) for the configured auth style.

    Default = ``Authorization: Bearer`` (the documented persons-endpoint form).
    ``SALESQL_AUTH_STYLE=query`` switches to the ``?api_key=`` query param that
    the older organizations example used — no redeploy needed."""
    if os.environ.get("SALESQL_AUTH_STYLE", "").strip().lower() == "query":
        return {"Accept": "application/json"}, {"api_key": api_key}
    return {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}, {}


def _coerce_email_status(raw: Any) -> ApolloEmailStatus | None:
    """Map SalesQL's ``status`` onto our ``ApolloEmailStatus`` literal. Unknown /
    absent values fall to ``None`` rather than leaking an off-enum string."""
    s = str(raw or "").strip().lower()
    if not s:
        return None
    if s in {"valid", "verified"}:
        return cast(ApolloEmailStatus, "verified")
    if s in {"catch-all", "catch_all", "accept-all", "accept_all"}:
        return cast(ApolloEmailStatus, "unverified")
    if s in _VALID_EMAIL_STATUSES:
        return cast(ApolloEmailStatus, s)
    return cast(ApolloEmailStatus, "unknown")


def _pick_email(emails: Any) -> tuple[str | None, ApolloEmailStatus | None, list[str]]:
    """Best email + status + the remaining ones. Prefer a work email, then a
    verified one, then the first. Present-only; ``([],)`` → ``(None, None, [])``."""
    if not isinstance(emails, list):
        return None, None, []
    rows = [e for e in emails if isinstance(e, dict) and str(e.get("email") or "").strip()]
    if not rows:
        return None, None, []

    def _rank(e: dict[str, Any]) -> tuple[int, int]:
        is_work = str(e.get("type") or "").strip().lower() in {"work", "professional", "business"}
        is_valid = str(e.get("status") or "").strip().lower() in {"valid", "verified"}
        return (0 if is_work else 1, 0 if is_valid else 1)

    rows.sort(key=_rank)
    best = rows[0]
    primary = str(best.get("email") or "").strip()
    status = _coerce_email_status(best.get("status"))
    seen = {primary.lower()}
    extras: list[str] = []
    for e in rows[1:]:
        value = str(e.get("email") or "").strip()
        if value and value.lower() not in seen:
            seen.add(value.lower())
            extras.append(value)
    return primary or None, status, extras[:5]


def _phone_entries(phones: Any) -> list[ApolloPhoneNumber]:
    if not isinstance(phones, list):
        return []
    out: list[ApolloPhoneNumber] = []
    for p in phones:
        if not isinstance(p, dict):
            continue
        number = str(p.get("phone") or p.get("number") or "").strip()
        if not number:
            continue
        ptype = str(p.get("type") or "").strip() or None
        out.append(ApolloPhoneNumber(number=number, type=ptype, status=None))
    return out[:6]


def _to_result(person: dict[str, Any]) -> ApolloEnrichmentResult:
    """SalesQL person JSON → the shared normalised enrichment shape. Matched only
    when SalesQL actually returned something reachable (email/phone) OR a real
    identity — never on an empty payload."""
    primary_email, email_status, extra_emails = _pick_email(person.get("emails"))
    phone_numbers = _phone_entries(person.get("phones"))
    best_phone = phone_numbers[0].number if phone_numbers else None
    first = str(person.get("first_name") or "").strip() or None
    last = str(person.get("last_name") or "").strip() or None
    linkedin = str(person.get("linkedin_url") or "").strip() or None
    matched = bool(primary_email or best_phone or (first and last))
    return ApolloEnrichmentResult(
        matched=matched,
        first_name=first,
        last_name=last,
        email=primary_email,
        email_status=email_status,
        phone=best_phone,
        linkedin_url=linkedin,
        title=str(person.get("title") or "").strip() or None,
        organization_name=str(person.get("organization_name") or person.get("company") or "").strip() or None,
        headline=str(person.get("headline") or "").strip() or None,
        personal_emails=extra_emails,
        phone_numbers=phone_numbers,
    )


def _cache_key(
    linkedin_url: str | None,
    first_name: str | None,
    last_name: str | None,
    organization_name: str | None,
    organization_domain: str | None,
) -> str | None:
    if linkedin_url and linkedin_url.strip():
        basis = "li:" + provider_cache.linkedin_identity(linkedin_url)
    elif first_name and last_name and (organization_name or organization_domain):
        org = (organization_domain or organization_name or "").strip().lower()
        basis = f"no:{first_name}|{last_name}|{org}".strip().lower()
    else:
        return None
    return "salesql:enrich:" + hashlib.sha256(basis.encode("utf-8")).hexdigest()


async def _cache_redis():
    """Pooled redis client, or None when caching is unavailable (best-effort)."""
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("SalesQL cache: Redis unavailable (%s) — caching off", exc)
        return None


def _empty() -> ApolloEnrichmentResult:
    return ApolloEnrichmentResult(matched=False)


async def enrich_person(
    *,
    linkedin_url: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    organization_name: str | None = None,
    organization_domain: str | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> ApolloEnrichmentResult:
    """Enrich one person via SalesQL. No-op (``matched=False``, ZERO network) when
    the key is missing or there is no usable match key (a LinkedIn URL, or a
    ``first_name`` + an org anchor). A real hit is cached; misses/errors are not.

    Never raises: any SalesQL/network failure degrades to an empty result so the
    cascade simply moves on (e.g. to Dropcontact)."""
    api_key = os.environ.get("SALESQL_API_KEY", "").strip()
    if not api_key:
        return _empty()  # env-gated no-op, zero network

    has_name_key = bool((first_name or "").strip()) and bool(
        (organization_name or "").strip() or (organization_domain or "").strip()
    )
    if not (linkedin_url and linkedin_url.strip()) and not has_name_key:
        return _empty()  # nothing reliable to query — never guess

    key = _cache_key(linkedin_url, first_name, last_name, organization_name, organization_domain)
    if key:
        r = await _cache_redis()
        if r is not None:
            try:
                raw = await r.get(key)
                if raw:
                    provider_cache.log_call("contact:salesql", hit=True)
                    return ApolloEnrichmentResult.model_validate_json(raw)
            except Exception as exc:  # noqa: BLE001 — best-effort
                logger.debug("SalesQL cache get failed: %s", exc)
        provider_cache.log_call("contact:salesql", hit=False)

    result = await _enrich_uncached(
        api_key=api_key,
        linkedin_url=linkedin_url,
        first_name=first_name,
        last_name=last_name,
        organization_name=organization_name,
        organization_domain=organization_domain,
        http_client=http_client,
    )

    if key and result.matched:
        r = await _cache_redis()
        if r is not None:
            try:
                await r.set(key, result.model_dump_json(), ex=_CACHE_TTL_S)
            except Exception as exc:  # noqa: BLE001 — best-effort
                logger.debug("SalesQL cache set failed: %s", exc)
    return result


async def _enrich_uncached(
    *,
    api_key: str,
    linkedin_url: str | None,
    first_name: str | None,
    last_name: str | None,
    organization_name: str | None,
    organization_domain: str | None,
    http_client: httpx.AsyncClient | None,
) -> ApolloEnrichmentResult:
    headers, extra_query = _auth(api_key)
    params: dict[str, str] = dict(extra_query)
    if linkedin_url and linkedin_url.strip():
        params["linkedin_url"] = linkedin_url.strip()
        match_key = "linkedin_url"
    else:
        if first_name:
            params["first_name"] = first_name.strip()
        if last_name:
            params["last_name"] = last_name.strip()
        if organization_name:
            params["organization_name"] = organization_name.strip()
        if organization_domain:
            params["organization_domain"] = organization_domain.strip()
        match_key = "name_org"

    client = http_client or httpx.AsyncClient(timeout=30)
    should_close = http_client is None
    started = time.monotonic()
    try:
        try:
            async with throttle("salesql"):
                res = await client.get(SALESQL_ENRICH_URL, params=params, headers=headers)
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            logger.warning("SalesQL enrich network error: match_key=%s exc=%s", match_key, exc)
            return _empty()

        duration_ms = int((time.monotonic() - started) * 1000)
        if not res.is_success:
            if res.status_code == 429:
                back_off_provider("salesql", retry_after_header(res))
            # Graceful on every failure mode (401 bad key, 402 no credit, 404 not
            # found, 429, 5xx…): the cascade simply moves to the next provider.
            logger.warning(
                "SalesQL enrich non-2xx: match_key=%s status=%d duration_ms=%d body=%s",
                match_key,
                res.status_code,
                duration_ms,
                res.text[:200],
            )
            return _empty()

        try:
            body = res.json()
        except ValueError:
            logger.warning("SalesQL enrich: 200 but non-JSON body match_key=%s", match_key)
            return _empty()

        # SalesQL may return the person object directly, or wrap it (``data`` /
        # ``person`` / a single-element list). Read defensively; never guess.
        person = _unwrap_person(body)
        if not isinstance(person, dict) or not person:
            logger.info("SalesQL enrich miss match_key=%s duration_ms=%d", match_key, duration_ms)
            return _empty()

        result = _to_result(person)
        # Booleans only — never log PII (emails/phones).
        logger.info(
            "SalesQL enrich %s match_key=%s email=%s phone=%s duration_ms=%d",
            "hit" if result.matched else "miss",
            match_key,
            bool(result.email),
            bool(result.phone),
            duration_ms,
        )
        return result
    finally:
        if should_close:
            await client.aclose()


def _unwrap_person(body: Any) -> dict[str, Any] | None:
    """SalesQL returns the person inline; be tolerant of a ``data``/``person``
    wrapper or a single-element list without ever inventing fields."""
    if isinstance(body, dict):
        for wrapper in ("data", "person", "result"):
            inner = body.get(wrapper)
            if isinstance(inner, dict) and inner:
                return inner
            if isinstance(inner, list) and inner and isinstance(inner[0], dict):
                return inner[0]
        return body
    if isinstance(body, list) and body and isinstance(body[0], dict):
        return body[0]
    return None
