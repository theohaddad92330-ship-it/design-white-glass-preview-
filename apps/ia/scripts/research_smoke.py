"""Real-API smoke test for the Brave + Firecrawl research step.

Usage:
    BRAVE_API_KEY=... FIRECRAWL_API_KEY=... \
        uv run python apps/ia/scripts/research_smoke.py [COMPANY]

Default company is ``Capgemini``. Three artefacts written to
``apps/ia/tests/fixtures/`` :

- ``brave_hits_<slug>.json``       — raw Brave hits with their category tag
- ``firecrawl_bundle_<slug>.json`` — bundle dump (markdown trimmed to 2 k chars)
- ``research_prompt_<slug>.txt``   — what would be injected into Claude

Soft asserts (warn only) plus a hard `sys.exit(2)` if no Brave hit at all
or zero successful Firecrawl scrape — those are real outages.

NOT run in CI: keys are not provisioned there.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import time
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ia"))

from app.services.research.brave import research_brave  # noqa: E402
from app.services.research.firecrawl import research_firecrawl  # noqa: E402
from app.services.research.sources import SourceCategory  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

FIXTURES_DIR = REPO_ROOT / "ia" / "tests" / "fixtures"
SOFT_TARGETS = {
    "min_categories_with_hits": 3,
    "min_pages_scraped_ok": 3,
    "max_prompt_chars": 35000,
    "max_wall_seconds": 90.0,
}


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


async def main(query: str) -> None:
    if not os.environ.get("BRAVE_API_KEY"):
        print("ERROR: BRAVE_API_KEY missing in env.", file=sys.stderr)
        sys.exit(1)
    dry_run = not os.environ.get("FIRECRAWL_API_KEY")
    if dry_run:
        print("⚠️  FIRECRAWL_API_KEY missing — running in --dry-run (Brave only).")

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    slug = _slug(query)

    profile = {
        "companyName": "Test ESN",
        "size": 50,
        "offers": ["data", "cloud", "cybersécurité"],
        "sectors": ["banque", "industrie"],
        "personas": ["DSI", "CTO", "directeur data"],
    }

    t0 = time.monotonic()
    print(f"→ Brave search for {query!r}…")
    brave_hits = await research_brave(query, profile)
    brave_seconds = time.monotonic() - t0
    print(f"  ↳ {len(brave_hits)} hits in {brave_seconds:.1f}s")

    (FIXTURES_DIR / f"brave_hits_{slug}.json").write_text(
        json.dumps(
            [{**h, "category": h["category"].value} for h in brave_hits],
            ensure_ascii=False,
            indent=2,
        )
    )
    print(f"  ↳ wrote fixtures/brave_hits_{slug}.json")

    per_cat = Counter(h["category"] for h in brave_hits)
    print("  ↳ per category :", {c.value: per_cat.get(c, 0) for c in SourceCategory})

    if dry_run:
        print("\nDone (--dry-run, no Firecrawl).")
        return

    print("\n→ Firecrawl scrape of top URLs…")
    t1 = time.monotonic()
    bundle = await research_firecrawl(brave_hits)
    firecrawl_seconds = time.monotonic() - t1
    total = time.monotonic() - t0
    print(f"  ↳ {len(bundle.sources)} sources in {firecrawl_seconds:.1f}s "
          f"(wall total {total:.1f}s)")

    status_counts = {
        c.value: counts for c, counts in bundle.status_counts().items()
    }
    print("  ↳ status per category :", status_counts)

    # Write a trimmed bundle for committing — full markdown can be MB-large.
    bundle_dump = []
    for s in bundle.sources:
        bundle_dump.append(
            {
                "url": s.url,
                "title": s.title,
                "category": s.category.value,
                "snippet": s.snippet,
                "scrape_status": s.scrape_status,
                "error_code": s.error_code,
                "char_count": len(s.scraped_markdown or ""),
                "markdown_preview": (s.scraped_markdown or "")[:2000],
            }
        )
    (FIXTURES_DIR / f"firecrawl_bundle_{slug}.json").write_text(
        json.dumps(bundle_dump, ensure_ascii=False, indent=2)
    )
    print(f"  ↳ wrote fixtures/firecrawl_bundle_{slug}.json")

    prompt = bundle.render_for_prompt(max_chars_per_category=6000)
    (FIXTURES_DIR / f"research_prompt_{slug}.txt").write_text(prompt)
    print(f"  ↳ wrote fixtures/research_prompt_{slug}.txt ({len(prompt):,} chars)")

    # ── Sanity checks ────────────────────────────────────────────────────────
    failures: list[str] = []
    warnings: list[str] = []

    if not brave_hits:
        failures.append("Brave returned 0 hits")
    ok_pages = sum(1 for s in bundle.sources if s.scrape_status == "ok")
    if ok_pages == 0:
        failures.append("Firecrawl returned 0 successful scrapes")

    categories_with_hits = sum(1 for c in SourceCategory if per_cat.get(c, 0) > 0)
    if categories_with_hits < SOFT_TARGETS["min_categories_with_hits"]:
        warnings.append(
            f"only {categories_with_hits} categories with Brave hits "
            f"(target ≥ {SOFT_TARGETS['min_categories_with_hits']})"
        )
    if ok_pages < SOFT_TARGETS["min_pages_scraped_ok"]:
        warnings.append(
            f"only {ok_pages} pages successfully scraped "
            f"(target ≥ {SOFT_TARGETS['min_pages_scraped_ok']})"
        )
    if len(prompt) > SOFT_TARGETS["max_prompt_chars"]:
        warnings.append(
            f"rendered prompt is {len(prompt):,} chars "
            f"(target ≤ {SOFT_TARGETS['max_prompt_chars']:,})"
        )
    if total > SOFT_TARGETS["max_wall_seconds"]:
        warnings.append(
            f"wall time {total:.1f}s exceeded {SOFT_TARGETS['max_wall_seconds']:.0f}s target"
        )

    print()
    print("─── summary ────────────────────────────────────────")
    print(f"  query           : {query}")
    print(f"  brave_hits      : {len(brave_hits)}")
    print(f"  scrape_ok       : {ok_pages}")
    print(f"  prompt_chars    : {len(prompt):,}")
    print(f"  wall_total_s    : {total:.1f}")
    print("────────────────────────────────────────────────────")

    if warnings:
        print("\n⚠️  soft warnings:")
        for w in warnings:
            print(f"  - {w}")
    if failures:
        print("\n❌ FAILED smoke checks:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(2)

    print("\n✓ smoke checks passed.")


if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else "Capgemini"
    asyncio.run(main(query))
