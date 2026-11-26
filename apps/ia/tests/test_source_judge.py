"""Source Judge — datation + qualité par SOURCE (document / URL), pas par signal.

Lifts the signal freshness policy (Théo p.7/p.12) to the source level and never
invents a date: no reliable date → ``undated``.
"""

from __future__ import annotations

from datetime import date

from app.config.knowledge_config import clear_overrides, set_overrides
from app.services.source_judge import (
    QUALITY_RECONSTRUCTION,
    QUALITY_STRONG,
    QUALITY_WEAK,
    REFRESH_AFTER_DAYS,
    judge_source,
    judge_sources,
    needs_refresh,
)

TODAY = date(2026, 7, 14)


# ── Freshness (status) — reuses classify_signal_freshness ─────────────────────

def test_recent_source_is_current():
    # Date read from the URL path (…/2026/06/12/…) — within 24 months.
    v = judge_source("https://lesechos.fr/2026/06/12/article-titre", today=TODAY)
    assert v.status == "current"
    assert v.published == "2026-06-12"
    assert v.age_days is not None and 0 <= v.age_days < REFRESH_AFTER_DAYS


def test_recent_source_from_metadata_date():
    hit = {"url": "https://x.fr/news", "date": "2025-12-01"}
    v = judge_source(hit, provider="brave", today=TODAY)
    assert v.status == "current"
    assert v.published == "2025-12-01"


def test_old_source_is_archive():
    # > 24 months → archive, demoted not dropped; carries an "à rafraîchir" reason.
    v = judge_source("https://lesechos.fr/2021/03/10/vieux-communique", today=TODAY)
    assert v.status == "archive"
    assert v.published == "2021-03-10"
    assert v.age_days is not None and v.age_days > REFRESH_AFTER_DAYS
    assert needs_refresh(v) is True
    assert "archive" in v.reason


def test_old_source_from_iso_metadata_is_archive():
    hit = {"url": "https://x.fr/p", "page_age": "2020-01-15T09:00:00Z"}
    assert judge_source(hit, provider="brave", today=TODAY).status == "archive"


def test_undated_source_stays_undated():
    v = judge_source("https://www.societegenerale.com/fr", today=TODAY)
    assert v.status == "undated"
    assert v.published is None
    assert v.age_days is None
    assert needs_refresh(v) is False


def test_never_invents_a_date_from_a_bare_year_id():
    # A year that is part of an id / slug (…-2021.html, …/p2021) is NOT a date —
    # honest undated over a fabricated one ("JAMAIS de données fictives").
    for url in (
        "https://x.fr/article-titre-2021.html",
        "https://x.fr/produits/p2021",
        "https://x.fr/ref/123456789",
    ):
        assert judge_source(url, today=TODAY).status == "undated", url


def test_non_year_metadata_is_ignored():
    # "2 days ago" carries no year → not accepted as a date → undated.
    hit = {"url": "https://x.fr/a", "age": "2 days ago"}
    assert judge_source(hit, provider="brave", today=TODAY).status == "undated"


def test_future_dated_source_is_not_an_archive():
    v = judge_source("https://x.fr/2027/01/01/futur", today=TODAY)
    assert v.status == "current"
    assert v.age_days == 0  # never negative


# ── Quality — reuses is_weak_source ───────────────────────────────────────────

def test_real_scraped_source_is_strong():
    for provider in ("firecrawl", "brave", "pappers"):
        assert judge_source("https://x.fr/a", provider=provider, today=TODAY).quality == QUALITY_STRONG


def test_ai_reconstruction_source_is_reconstruction():
    v = judge_source({"url": "https://x.fr/a"}, provider="ia_reconstruction", today=TODAY)
    assert v.quality == QUALITY_RECONSTRUCTION
    assert "reconstruite" in v.reason


def test_weak_source_is_weak():
    # A source listed weak in the knowledge config (but not the reconstruction
    # marker) → weak. Exercised via the documented runtime override.
    set_overrides({"sources": {"weak_sources": ["ia_reconstruction", "forum"]}})
    try:
        v = judge_source({"url": "https://forum.x.fr/t"}, provider="forum", today=TODAY)
        assert v.quality == QUALITY_WEAK
        assert "source faible" in v.reason
    finally:
        clear_overrides()


# ── Reliability tier (#2289.8) — composed from the SAME provider identity ────

def test_verdict_carries_the_reliability_tier():
    assert judge_source("https://x.fr/a", provider="pappers", today=TODAY).reliability == "officiel"
    assert judge_source("https://x.fr/a", provider="firecrawl", today=TODAY).reliability == "primaire"
    assert judge_source("https://x.fr/a", provider="brave", today=TODAY).reliability == "public fiable"
    v = judge_source({"url": "https://x.fr/a"}, provider="ia_reconstruction", today=TODAY)
    assert v.reliability == "non vérifiable"


def test_provider_read_from_mapping_when_not_passed():
    v = judge_source({"url": "https://x.fr/a", "source": "ia_reconstruction"}, today=TODAY)
    assert v.quality == QUALITY_RECONSTRUCTION


# ── Batch helper ──────────────────────────────────────────────────────────────

def test_judge_sources_preserves_order():
    urls = [
        "https://x.fr/2021/01/01/vieux",   # archive
        "https://x.fr/2026/01/01/recent",  # current
        "https://x.fr/nodate",             # undated
    ]
    out = judge_sources(urls, provider="firecrawl", today=TODAY)
    assert [v.status for v in out] == ["archive", "current", "undated"]


def test_judge_sources_handles_none():
    assert judge_sources(None) == []
