"""#3288 — profondeur d'analyse à trois paliers, choisie PAR RUN.

Source unique : ``ANALYSIS_DEPTH_PRESETS`` (``packages/contracts/src/schemas/
analysis.ts``) ; l'IA en porte les pages. Le test PROUVE qu'il lit quelque chose
avant de comparer, et que le palier atteint réellement le scrape.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.services.research import firecrawl as research_firecrawl_module
from app.services.research.firecrawl import MAX_PAGES_PER_RUN, PAGES_BY_DEPTH, research_firecrawl

_TS_REL = Path("packages/contracts/src/schemas/analysis.ts")


def _ts_source() -> str:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / _TS_REL
        if candidate.is_file():
            return candidate.read_text(encoding="utf-8")
    raise AssertionError("analysis.ts introuvable — la garde ne lirait rien")


def test_les_pages_par_palier_sont_celles_du_contrat():
    found = dict(
        (m.group(1), int(m.group(2)))
        for m in re.finditer(r"(quick|verified|deep): \{ pages: (\d+),", _ts_source())
    )
    assert set(found) == {"quick", "verified", "deep"}, "la garde doit lire les trois paliers"
    assert found == PAGES_BY_DEPTH


def test_verifiee_est_le_defaut_d_avant():
    assert PAGES_BY_DEPTH["verified"] == MAX_PAGES_PER_RUN == 12


def test_le_palier_atteint_le_scrape():
    class _Hit:
        pass

    captured: dict[str, int] = {}

    async def _scrape(_hits, max_pages):
        captured["pages"] = max_pages
        return []

    hit = research_firecrawl_module.BraveHit if hasattr(research_firecrawl_module, "BraveHit") else _Hit
    with (
        patch.object(research_firecrawl_module, "scrape_hits", new=_scrape),
        patch.object(research_firecrawl_module, "_hit_to_dict", new=lambda h: {}),
    ):
        for depth, expected in (("quick", 6), ("deep", 15), (None, 12), ("inconnu", 12)):
            asyncio.run(research_firecrawl([hit()], depth=depth))
            assert captured["pages"] == expected, depth
