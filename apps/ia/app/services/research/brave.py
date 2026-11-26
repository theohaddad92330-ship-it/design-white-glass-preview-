"""Phase 1 — Brave web-search step.

Soft-fails to an empty list so a Brave outage degrades the analysis
quality instead of killing the job.
"""

from __future__ import annotations

import logging
from typing import Any

from app.middleware.correlation_id import get_correlation_id
from app.services.brave_search import BraveHit
from app.services.brave_search import search as brave_search
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)


async def research_brave(
    company_name: str,
    profile_data: dict[str, Any],
) -> list[BraveHit]:
    """Return typed Brave hits for ``company_name`` or ``[]`` on failure.

    Each hit carries a ``category`` tag (press / interview / official /
    project / jobs / other) classified server-side from the URL + title —
    see ``app.services.research.sources``.
    """
    try:
        return await brave_search(company_name, profile_data)
    except Exception as exc:
        logger.warning("Brave research failed (continuing): %s", exc)
        # Phase 1 only ever sees ``[]`` here, which it cannot tell apart from a
        # company nobody writes about — a missing key and a 429 both looked like
        # "0 résultat". The cause has to travel with the run.
        record_degradation(get_correlation_id(), source="brave", reason=str(exc) or type(exc).__name__)
        return []
