"""Real-API smoke test for the Pappers integration.

Usage:
    PAPPERS_API_KEY=... uv run python apps/ia/scripts/pappers_smoke.py [COMPANY]

Default company is ``Capgemini``. Dumps three artifacts:

- ``apps/ia/tests/fixtures/pappers_entreprise_<siren>.json`` — raw /v2/entreprise
- ``apps/ia/tests/fixtures/pappers_cartographie_<siren>.json`` — raw /v2/entreprise/cartographie
- ``apps/ia/tests/fixtures/pappers_profile_<siren>.json`` — validated CompanyProfile

Asserts the minimal scope of the ticket (siège, dirigeants, c_level, infos
société). Prints a short summary plus a hint on whether the cartographie
edges revealed a usable subsidiary list.

This script is NOT run in CI — there is no Pappers key available there.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ia"))

from app.services.pappers import (  # noqa: E402
    CompanyProfile,
    get_company,
    search_company,
)
from app.services.pappers.detail import (  # noqa: E402
    PAPPERS_CARTOGRAPHIE_URL,
    PAPPERS_DETAIL_URL,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

FIXTURES_DIR = REPO_ROOT / "ia" / "tests" / "fixtures"


async def _dump_raw(url: str, params: dict[str, str], path: Path) -> None:
    """Refetch raw JSON for archival next to the typed profile."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(url, params=params)
    path.write_text(json.dumps(res.json(), ensure_ascii=False, indent=2))
    print(f"  ↳ wrote raw payload to {path.relative_to(REPO_ROOT)}")


async def main(query: str) -> None:
    api_key = os.environ.get("PAPPERS_API_KEY", "")
    if not api_key:
        print("ERROR: PAPPERS_API_KEY missing in env.", file=sys.stderr)
        sys.exit(1)

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

    print(f"→ searching Pappers for {query!r}…")
    hit = await search_company(query)
    print(f"  ↳ matched SIREN={hit.siren} legal_name={hit.legal_name!r}")

    print(f"→ fetching profile + cartographie for SIREN={hit.siren}…")
    profile: CompanyProfile = await get_company(hit.siren)

    # Archive both raw payloads alongside the typed dump.
    await _dump_raw(
        PAPPERS_DETAIL_URL,
        {
            "siren": hit.siren,
            "api_token": api_key,
            "entreprise_cessee": "false",
            "extrait_rcs": "true",
            "champs_supplementaires": "representants_legaux,lien_pappers",
        },
        FIXTURES_DIR / f"pappers_entreprise_{hit.siren}.json",
    )
    await _dump_raw(
        PAPPERS_CARTOGRAPHIE_URL,
        {
            "siren": hit.siren,
            "api_token": api_key,
            "include_entreprises_dirigees": "true",
            "include_sci": "true",
            "rejeter_premier_degre": "true",
        },
        FIXTURES_DIR / f"pappers_cartographie_{hit.siren}.json",
    )

    profile_path = FIXTURES_DIR / f"pappers_profile_{hit.siren}.json"
    profile_path.write_text(
        json.dumps(profile.model_dump(by_alias=False, mode="json"), ensure_ascii=False, indent=2)
    )
    print(f"  ↳ wrote typed profile to {profile_path.relative_to(REPO_ROOT)}")

    # ── Sanity checks ────────────────────────────────────────────────────────
    print()
    print("─── summary ────────────────────────────────────────")
    print(f"  legal_name      : {profile.legal_name}")
    print(f"  legal_form      : {profile.legal_form}")
    print(f"  capital         : {profile.capital}")
    print(f"  activity_label  : {profile.activity_label}")
    print(f"  headquarters    : {profile.headquarters.city}  {profile.headquarters.postal_code}  ({profile.headquarters.address_line_1})")
    print(f"  revenue_latest  : {profile.revenue_latest}")
    print(f"  executives      : {len(profile.executives)}")
    print(f"  c_level         : {len(profile.c_level)}  -> {[(e.role, e.last_name) for e in profile.c_level]}")
    print(f"  branches        : {profile.branch_count}")
    print(f"  subsidiaries    : {len(profile.subsidiaries)}")
    if profile.corporate_graph:
        print(
            f"  graph           : {len(profile.corporate_graph.companies)} companies, "
            f"{len(profile.corporate_graph.persons)} persons, "
            f"{len(profile.corporate_graph.company_to_company_edges)} c2c edges"
        )
    else:
        print("  graph           : (not available — 404 from cartographie)")
    print("────────────────────────────────────────────────────")

    failures: list[str] = []
    if not profile.headquarters.city:
        failures.append("headquarters.city is empty")
    if not profile.executives:
        failures.append("no executives returned")
    if not profile.c_level:
        failures.append("no c_level derived from executives")

    if failures:
        print("\nFAILED smoke checks:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(2)

    print("\n✓ smoke checks passed.")


if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else "Capgemini"
    asyncio.run(main(query))
