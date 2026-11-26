"""Real-API smoke test for the Apollo integration.

How to run
----------

From the repo root::

    cd apps/ia
    APOLLO_API_KEY=ak_... PYTHONPATH=. .venv/bin/python scripts/apollo_smoke.py
    # or with a custom company:
    APOLLO_API_KEY=ak_... PYTHONPATH=. .venv/bin/python scripts/apollo_smoke.py Doctolib

If you already source ``apps/ia/.env`` in your shell, the key is picked up
automatically and the ``APOLLO_API_KEY=...`` prefix can be dropped.

This script is NOT run in CI — each enrich call burns Apollo credits.

Plan / API-key gotcha
---------------------

Both endpoints we hit (``/api/v1/mixed_people/api_search`` and
``/api/v1/people/match``) require a **master API key** *and* an Apollo plan
that includes them. With a Free / Trial regular API key both return
``403 / API_INACCESSIBLE``. In that case:

  - Generate a master API key in Apollo (Settings → Integrations → API)
  - Or upgrade to the Basic plan ($49/mo) — Free is read-only on these
    endpoints in practice.

The smoke script just reports the situation; it does not retry or fake
data.

What it covers
--------------

Walks the full Apollo flow used by the contacts pipeline:

1. ``search_people(company)`` — Apollo People Search.
2. ``enrich_person(first_name, last_name, organization_name)`` on the first
   hit — Apollo People Match by name + org (fuzzy, fallback path).
3. ``enrich_person(linkedin_url=...)`` on a hit that exposes a LinkedIn URL
   — Apollo People Match by URL (preferred match key).

Asserts the Definition of Done: at least one full path returns a usable
contact with an email. Phone reveal is intentionally not exercised here
(needs an async webhook, out of scope of the unblock PR).
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from app.models.contacts import ApolloEnrichmentResult, ApolloSearchHit
from app.services.apollo import ApolloPlanError, enrich_person, search_people

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("apollo_smoke")


def _summarise(label: str, result: ApolloEnrichmentResult) -> None:
    log.info(
        "%s → matched=%s email=%s email_status=%s linkedin=%s title=%r",
        label,
        result.matched,
        result.email or "—",
        result.email_status or "—",
        bool(result.linkedin_url),
        result.title or "—",
    )


def _print_top(hits: list[ApolloSearchHit], n: int = 5) -> None:
    for h in hits[:n]:
        log.info(
            "  - %s %s — %s @ %s (linkedin=%s)",
            h.first_name or "?",
            h.last_name or "?",
            h.title or "?",
            h.organization_name or "?",
            bool(h.linkedin_url),
        )


async def main(company: str) -> int:
    if not os.environ.get("APOLLO_API_KEY"):
        log.error("APOLLO_API_KEY missing; aborting.")
        return 2

    log.info("=== 1. search_people(%r) ===", company)
    hits = await search_people(company_name=company, max_pages=1)
    log.info("Found %d contacts on page 1.", len(hits))
    if not hits:
        log.error(
            "Apollo search returned 0 contacts for %r. If you saw a "
            "'API_INACCESSIBLE' warning above, your Apollo API key/plan "
            "is missing the master-key permission on /mixed_people/api_search.",
            company,
        )
        return 1
    _print_top(hits)

    first = hits[0]
    log.info("=== 2. enrich_person(name + org) on %r ===", first.first_name)
    try:
        by_name = await enrich_person(
            first_name=first.first_name,
            last_name=first.last_name,
            organization_name=first.organization_name or company,
        )
    except ApolloPlanError as exc:
        log.error("Apollo enrich is plan-gated: %s", exc)
        return 3
    _summarise("name+org", by_name)

    with_linkedin = next((h for h in hits if h.linkedin_url), None)
    if with_linkedin is None:
        log.warning("No contact with a LinkedIn URL — skipping URL match path.")
        ok = bool(by_name.email)
    else:
        log.info("=== 3. enrich_person(linkedin_url=...) on %r ===", with_linkedin.first_name)
        try:
            by_url = await enrich_person(linkedin_url=with_linkedin.linkedin_url)
        except ApolloPlanError as exc:
            log.error("Apollo enrich is plan-gated: %s", exc)
            return 3
        _summarise("linkedin_url", by_url)
        ok = bool(by_name.email or by_url.email)

    if not ok:
        log.error("DoD failed: neither match path returned an email.")
        return 1

    log.info("DoD met: at least one path returned a usable contact with an email.")
    return 0


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "Doctolib"
    sys.exit(asyncio.run(main(target)))
