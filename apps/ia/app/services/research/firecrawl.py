"""Phase 1 — Firecrawl page-scrape step.

Wraps :func:`scrape_hits` and shapes its output into a :class:`ResearchBundle`
that the phase-1 router can inject into Claude prompts as sectioned,
traceable markdown. Terminal errors (credits / auth / rate limit) propagate
as :class:`FirecrawlScrapeError` because the API worker needs the typed 402
to fail fast.
"""

from __future__ import annotations

import logging
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.brave_search import BraveHit
from app.services.firecrawl import (
    FirecrawlScrapeError,
    ScrapeResult,
    scrape_hits,
)
from app.services.relevance_extract import ContentDeduper, select_relevant_excerpt
from app.services.research.sources import SourceCategory

logger = logging.getLogger(__name__)


_CATEGORY_PREFIX: dict[SourceCategory, str] = {
    SourceCategory.PRESS: "P",
    SourceCategory.INTERVIEW: "I",
    SourceCategory.OFFICIAL: "O",
    SourceCategory.PROJECT: "PR",
    SourceCategory.JOBS: "J",
    SourceCategory.OTHER: "X",
}

_CATEGORY_LABEL: dict[SourceCategory, str] = {
    SourceCategory.PRESS: "PRESSE",
    SourceCategory.INTERVIEW: "INTERVIEWS",
    SourceCategory.OFFICIAL: "SITE OFFICIEL",
    SourceCategory.PROJECT: "PROJETS",
    SourceCategory.JOBS: "OFFRES D'EMPLOI",
    SourceCategory.OTHER: "AUTRES",
}


@dataclass
class ResearchSource:
    """One source = one Brave hit + (optionally) one Firecrawl scrape.

    ``ref`` is the stable in-prompt citation token (``[P1]``, ``[O2]``…) so
    Claude can cite evidence by reference instead of re-quoting the URL. We
    assign it at render time so the numbering is stable within the prompt
    even when the bundle is rendered with a category filter.
    """

    url: str
    title: str
    category: SourceCategory
    snippet: str | None
    scraped_markdown: str | None
    scrape_status: Literal["ok", "skipped", "error", "empty", "timeout"]
    error_code: str | None = None


@dataclass
class ResearchBundle:
    sources: list[ResearchSource] = field(default_factory=list)

    def by_category(self) -> dict[SourceCategory, list[ResearchSource]]:
        out: dict[SourceCategory, list[ResearchSource]] = defaultdict(list)
        for s in self.sources:
            out[s.category].append(s)
        return out

    def status_counts(self) -> dict[SourceCategory, dict[str, int]]:
        """Per-category histogram of ``scrape_status`` — used in ``_api_metrics``."""
        keys = ("ok", "error", "empty", "timeout", "skipped")
        out: dict[SourceCategory, dict[str, int]] = {
            c: dict.fromkeys(keys, 0) for c in SourceCategory
        }
        for s in self.sources:
            bucket = out[s.category]
            bucket[s.scrape_status] = bucket.get(s.scrape_status, 0) + 1
        return out

    def ref_urls(self) -> dict[str, str]:
        """Jeton (``[P1]``…) → URL, avec LA numérotation de ``render_for_prompt``
        (index dans la catégorie) — #3922.1 : le jeton que le modèle cite retrouve
        la page qui l'a porté, sans rapprochement par texte."""
        out: dict[str, str] = {}
        for cat, sources in self.by_category().items():
            for idx, source in enumerate(sources, start=1):
                if source.url:
                    out[f"[{_CATEGORY_PREFIX[cat]}{idx}]"] = source.url
        return out

    def hit_counts(self) -> dict[SourceCategory, int]:
        """Total Brave hits per category (regardless of scrape outcome)."""
        counter: Counter[SourceCategory] = Counter(s.category for s in self.sources)
        return {c: counter.get(c, 0) for c in SourceCategory}

    def render_for_prompt(self, max_chars_per_category: int | None = None) -> str:
        """Render the bundle as sectioned markdown for a Claude user prompt.

        Each section gets its own header with counts (``n sources, m
        scrapées``), each source gets a stable reference token (``[P1]``,
        ``[O2]``…), and the scraped markdown is sliced to fit the
        per-category budget. Empty / errored sources still show up so
        Claude can see what we tried.

        Sections are emitted in :class:`SourceCategory` declaration order
        (PRESS first, OTHER last). Empty categories are skipped.

        ``max_chars_per_category`` is the scraped-content budget fed to EACH of
        the 3 research Claude prompts (×N categories = the research input).
        Default 6000 (vannes ouvertes): 6 categories × 6000 = 36k chars ≈ 9k
        tokens of scraped evidence per prompt — sane vs the 200k context, and
        ≈ +0,015€/run vs the previous 4500. The old "past ~4-5k the model
        skims" concern applied to head-truncated content; excerpts are now
        relevance-selected (``select_relevant_excerpt``) + near-dup filtered,
        so the extra chars carry signal, not boilerplate. Env-tunable DOWN via
        FIRECRAWL_CHARS_PER_CATEGORY if research input must be trimmed.
        """
        if max_chars_per_category is None:
            max_chars_per_category = int(os.getenv("FIRECRAWL_CHARS_PER_CATEGORY", "6000"))
        parts: list[str] = []
        # Near-dup content filter (#7), spanning ALL categories: a press release
        # mirrored across two URLs (or a print/AMP variant) passed the URL-only
        # dedup and filled the budget twice. Shared across the loop so a PRESS
        # page and its OTHER copy collapse to one body.
        deduper = ContentDeduper()
        for cat in SourceCategory:
            sources = [s for s in self.sources if s.category is cat]
            if not sources:
                continue

            scraped = sum(1 for s in sources if s.scrape_status == "ok")
            header = (
                f"--- {_CATEGORY_LABEL[cat]} ({len(sources)} sources, {scraped} scrapée"
                f"{'s' if scraped > 1 else ''}) ---"
            )
            parts.append(header)

            # Per-category budget split across the scraped sources, with a
            # floor so a single mega-page can't gobble the whole slot.
            ok_sources = [s for s in sources if s.scrape_status == "ok" and s.scraped_markdown]
            per_source_cap = max(500, max_chars_per_category // max(1, len(ok_sources)))

            for idx, source in enumerate(sources, start=1):
                ref = f"[{_CATEGORY_PREFIX[cat]}{idx}]"
                line1 = f'{ref} {_host(source.url)} — "{source.title}"'
                if source.snippet:
                    line1 += f"  ({source.snippet[:160]})"
                parts.append(line1)
                parts.append(f"URL: {source.url}")
                if source.scrape_status == "ok" and source.scraped_markdown:
                    dup_ref = deduper.duplicate_of(source.scraped_markdown, ref)
                    if dup_ref:
                        # Near-duplicate of an already-injected page (#7) — point to
                        # it instead of re-spending the budget on the same content.
                        parts.append(f"(contenu quasi-identique à {dup_ref} — non répété)")
                    else:
                        # Relevance-aware, not head-truncation (#6): keep the ESN/IT +
                        # dated-signal paragraphs, not just the intro/nav boilerplate.
                        parts.append(select_relevant_excerpt(source.scraped_markdown, per_source_cap))
                else:
                    parts.append(f"(no body — scrape_status={source.scrape_status}"
                                 f"{f', {source.error_code}' if source.error_code else ''})")
                parts.append("")

        return "\n".join(parts).rstrip()


def _host(url: str) -> str:
    from urllib.parse import urlparse

    try:
        return urlparse(url).hostname or url
    except Exception:
        return url


def _to_source(result: ScrapeResult) -> ResearchSource:
    return ResearchSource(
        url=result["url"],
        title=result["title"],
        category=result["category"],
        snippet=result["snippet"],
        scraped_markdown=result["markdown"],
        scrape_status=result["scrape_status"],
        error_code=result["error_code"],
    )


def _hit_to_dict(hit: BraveHit) -> dict[str, Any]:
    # Firecrawl-side helpers consume ``dict``s, not TypedDicts, so cast.
    return {
        "url": hit["url"],
        "title": hit["title"],
        "description": hit["description"],
        "category": hit["category"],
    }


async def research_firecrawl(hits: list[BraveHit], depth: str | None = None) -> ResearchBundle:
    """Scrape ``hits`` and bundle the results into a :class:`ResearchBundle`.

    Recoverable failures are swallowed (warning logged, source kept in the
    bundle with ``scrape_status != "ok"``); terminal failures re-raise as
    :class:`FirecrawlScrapeError` so the API worker can surface the typed
    402.
    """
    if not hits:
        return ResearchBundle()

    # Page count is the #1 research latency driver (~each page is a multi-second
    # scrape, 25s hard cap). Default 12 (vannes ouvertes — depth by default, env
    # tunes DOWN if needed): 12 pages = 3 waves of 5 concurrent = 75s worst case,
    # well inside the 180s phase budget. Cost ≈ +0,5-3c€/run vs 7 pages (1
    # Firecrawl credit/page). Coverage: 12 of the ~34 ranked Brave hits get a
    # full-text scrape (press + official + projects + jobs) instead of 7 — the
    # per-category prompt budget bounds injection, so extra pages add breadth
    # and better excerpt selection, not prompt bloat.
    max_pages = _resolve_max_pages(depth)
    try:
        results = await scrape_hits([_hit_to_dict(h) for h in hits], max_pages=max_pages)
    except FirecrawlScrapeError:
        raise
    except Exception as exc:
        logger.warning("Firecrawl research failed (continuing): %s", exc)
        return ResearchBundle()

    return ResearchBundle(sources=[_to_source(r) for r in results])


#: Pages scrapées par run. **En dur, délibérément** (arbitrage Louis, 02/08).
#:
#: C'était un réglage d'environnement, censé servir à tuner à la baisse. En
#: pratique, une bride posée un jour pour une raison ponctuelle survit au
#: redéploiement et devient invisible : ``FIRECRAWL_MAX_PAGES=3`` traînait en
#: production depuis des semaines. Conséquence, la page équipe / gouvernance
#: d'un site n'était plus jamais lue, l'organigramme perdait sa confirmation
#: « site officiel », et rien nulle part ne le disait. Le rapport le classe P0
#: (§54) — et le correctif ne pouvait pas venir du code tant que la variable
#: gagnait.
#:
#: Le réglage disparaît donc. Douze pages, c'est trois vagues de cinq à 25 s,
#: soit 75 s au pire dans un budget de phase de 180 s : la valeur tient sans
#: garde-fou. Un produit dont la profondeur de collecte dépend d'une variable
#: que personne ne relit n'a pas de profondeur de collecte — il a une loterie.
MAX_PAGES_PER_RUN = 12


#: #3288 — pages par PALIER de profondeur, choisi PAR RUN avant le débit (miroir
#: de ``ANALYSIS_DEPTH_PRESETS``, ``packages/contracts/src/schemas/analysis.ts`` ;
#: ``test_analysis_depth.py`` lit les deux). Ce n'est pas le réglage d'environnement
#: supprimé le 02/08 : le palier est CHOISI à l'écran, annoncé avec son prix et
#: épinglé sur le run (`scope_selection.depth`) — jamais une bride invisible.
#: ``verified`` = ``MAX_PAGES_PER_RUN`` : absent ou inconnu, rien ne change.
PAGES_BY_DEPTH: dict[str, int] = {"quick": 6, "verified": MAX_PAGES_PER_RUN, "deep": 15}


def _resolve_max_pages(depth: str | None = None) -> int:
    """Le nombre de pages scrapées par run — le palier choisi, sinon {@link MAX_PAGES_PER_RUN}."""
    return PAGES_BY_DEPTH.get((depth or "").strip(), MAX_PAGES_PER_RUN)


__all__ = ["MAX_PAGES_PER_RUN", "PAGES_BY_DEPTH", "ResearchBundle", "ResearchSource", "research_firecrawl"]
