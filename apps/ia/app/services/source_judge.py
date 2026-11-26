"""Source Judge — datation + qualité par SOURCE (document / URL), pas par signal.

Signal-level freshness (:mod:`app.services.signal_freshness`) classifies one
*dated commercial signal*; this module lifts the **same** policy to the SOURCE
level. Every scraped page (Firecrawl), web hit (Brave) or legal anchor (Pappers)
gets one structured verdict::

    { status: current|archive|undated, age_days?, quality: strong|weak|reconstruction, reason }

Composition, not rewrite. Dates go through ``classify_signal_freshness`` (same
730-day / ~24-month archive threshold as signals) and quality through
``is_weak_source`` — the judge only *assembles* the existing rules for a source.
It never re-implements either.

Refresh policy (documented, NOT scheduled here)
-----------------------------------------------
A source older than ``REFRESH_AFTER_DAYS`` (= 730 days = the signal archive
threshold, ``signal_freshness._ARCHIVE_AFTER_DAYS``) is an ARCHIVE: still usable
evidence, but flagged « à rafraîchir » so the front / chat can say « source X
datée de 2021 — archive, à recroiser ». This module computes the classification
and the exploitable ``needs_refresh`` flag only; a scheduler / re-crawl loop is
deliberately out of scope (P0 = policy + judge, not orchestration).

Never invents a date (« JAMAIS de données fictives »). A publication date is read
only from explicit source metadata or a date embedded in the URL path; absent a
reliable one, the source is ``undated`` — honest, never assumed current.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime

from pydantic import BaseModel, Field

from app.services.signal_freshness import (
    _ARCHIVE_AFTER_DAYS,
    FRESHNESS_ARCHIVE,
    FRESHNESS_CURRENT,
    FRESHNESS_UNDATED,
    _parse_signal_date,
    classify_signal_freshness,
)
from app.services.source_quality import is_weak_source
from app.services.source_reliability import TIER_NON_VERIFIABLE, classify_source_reliability

# Refresh policy threshold — the SAME ~24-month archive cut as commercial signals.
REFRESH_AFTER_DAYS = _ARCHIVE_AFTER_DAYS  # 730

QUALITY_STRONG = "strong"
QUALITY_WEAK = "weak"
QUALITY_RECONSTRUCTION = "reconstruction"

# Relevance order for ranking a set of sources (mirror of phase4 _FRESHNESS_RANK):
# a current source outranks an undated one, an archive sinks below both.
FRESHNESS_ORDER: dict[str, int] = {
    FRESHNESS_CURRENT: 0,
    FRESHNESS_UNDATED: 1,
    FRESHNESS_ARCHIVE: 2,
}

# The AI-reconstruction marker (lives in the weak_sources config) — never proof.
_RECONSTRUCTION_TOKEN = "ia_reconstruction"

# Metadata keys a source Mapping may carry a publication date under (first match
# wins). A value is kept ONLY when it parses to a real year — never invented.
_DATE_META_KEYS: tuple[str, ...] = (
    "published", "published_date", "publishedDate", "publishedAt",
    "date", "page_age", "pageAge", "age",
)

# A date embedded in a URL path — only the two RELIABLE shapes:
#   ISO date anywhere       …/2021-03-10-titre
#   dated path segments     …/2021/03/12/titre  |  …/2021/
# A bare year that could be an id / product name (…-2021.html, …/p2021) is NOT a
# date — we stay ``undated`` rather than fabricate one.
_URL_ISO_DATE_RE = re.compile(r"((?:19|20)\d{2}-\d{2}-\d{2})")
_URL_PATH_DATE_RE = re.compile(r"/((?:19|20)\d{2})(?:/(\d{1,2})(?:/(\d{1,2}))?)?/")


class SourceVerdict(BaseModel):
    """Datation + qualité pour UNE source (document / URL). Additive output — a
    ``None`` verdict simply means the source was never judged."""

    status: str = FRESHNESS_UNDATED  # current | archive | undated
    quality: str = QUALITY_STRONG    # strong | weak | reconstruction
    age_days: int | None = Field(default=None, alias="ageDays")
    published: str | None = None     # the date string we FOUND (never invented)
    reason: str = ""
    # 7-level reliability taxonomy (#2289.8) — additive, composed from the SAME
    # provider identity as ``quality`` above, never re-derived independently.
    reliability: str = TIER_NON_VERIFIABLE

    model_config = {"populate_by_name": True}


def _date_from_url(url: str) -> str | None:
    """A publication date embedded in a URL path, best-effort. Only the two
    reliable shapes (ISO date, ``/YYYY/MM/DD/`` segments); ``None`` otherwise."""
    m = _URL_ISO_DATE_RE.search(url)
    if m:
        return m.group(1)
    m = _URL_PATH_DATE_RE.search(url)
    if m:
        parts = [p for p in (m.group(1), m.group(2), m.group(3)) if p]
        return "-".join(parts)
    return None


def _extract_source_date(source: object) -> str | None:
    """Best-effort publication date STRING for a source, or ``None`` (→ undated).
    Explicit metadata date wins over a URL-embedded date. Never invents: a value
    is kept only when it actually parses to a year."""
    if isinstance(source, str):
        return _date_from_url(source)
    if isinstance(source, Mapping):
        for key in _DATE_META_KEYS:
            v = source.get(key)
            if v not in (None, "") and _parse_signal_date(v) is not None:
                return str(v)
        url = source.get("url")
        if url:
            return _date_from_url(str(url))
    return None


def _resolve_provider(source: object, provider: str | None) -> str:
    """The provider/source token used for the quality verdict."""
    if provider:
        return provider
    if isinstance(source, Mapping):
        return str(source.get("provider") or source.get("source") or "").strip()
    return ""


def _classify_quality(provider: str) -> str:
    """strong | weak | reconstruction — composed from ``is_weak_source``.

    The AI-reconstruction marker is the most non-probative (its own tier); any
    other token listed as weak in the knowledge config is ``weak``; everything
    else (a real scraped page / registry / press hit) is ``strong``.
    """
    token = provider.strip().lower()
    if token == _RECONSTRUCTION_TOKEN:
        return QUALITY_RECONSTRUCTION
    if is_weak_source(provider):
        return QUALITY_WEAK
    return QUALITY_STRONG


def _reason(status: str, quality: str, published: str | None) -> str:
    """A short, human-readable French justification for the verdict."""
    if quality == QUALITY_RECONSTRUCTION:
        base = "source reconstruite par l'IA (non probante)"
    elif quality == QUALITY_WEAK:
        base = "source faible"
    else:
        base = "source"
    if status == FRESHNESS_ARCHIVE:
        years = REFRESH_AFTER_DAYS // 365
        return f"{base} datée {published} (> {years} ans / {REFRESH_AFTER_DAYS}j) → archive, à rafraîchir"
    if status == FRESHNESS_CURRENT:
        return f"{base} datée {published} → actuelle"
    return f"{base} sans date fiable → non datée"


def judge_source(
    source: object,
    *,
    provider: str | None = None,
    today: date | None = None,
) -> SourceVerdict:
    """Verdict ``{ status, quality, age_days?, published?, reason }`` for one source.

    ``source`` is a URL string or a Mapping carrying at least ``url`` (and
    optionally ``provider``/``source`` + a publication-date metadata key). The
    date is classified by ``classify_signal_freshness`` and the quality by
    ``is_weak_source`` — this function only assembles the two into one verdict.
    """
    today = today or datetime.now(UTC).date()
    prov = _resolve_provider(source, provider)
    quality = _classify_quality(prov)

    published = _extract_source_date(source)
    if published is None:
        status = FRESHNESS_UNDATED
        age_days: int | None = None
    else:
        status = classify_signal_freshness(published, today=today)
        d = _parse_signal_date(published)
        # Future-dated (LLM/URL slip) → age 0, never a negative age.
        age_days = (today - d).days if (d is not None and d <= today) else (0 if d else None)

    return SourceVerdict(
        status=status,
        quality=quality,
        age_days=age_days,
        published=published,
        reason=_reason(status, quality, published),
        reliability=classify_source_reliability(prov),
    )


def needs_refresh(verdict: SourceVerdict | None) -> bool:
    """The exploitable refresh-policy flag: an ARCHIVE source is « à rafraîchir »
    (older than :data:`REFRESH_AFTER_DAYS`). ``None`` / undated / current → False."""
    return bool(verdict is not None and verdict.status == FRESHNESS_ARCHIVE)


def judge_sources(
    sources: Iterable[object],
    *,
    provider: str | None = None,
    today: date | None = None,
) -> list[SourceVerdict]:
    """Verdicts for a batch of sources, in input order (no reordering here)."""
    return [judge_source(s, provider=provider, today=today) for s in sources or []]
