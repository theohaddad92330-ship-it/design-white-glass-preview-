"""B3 — deterministic source attribution for the research factsheet.

"Citer ses sources" the same way B4 computes confidence: from objective
provenance, **never** asked to the LLM. Three providers feed Phase 1 and each
carries a verifiable identity —

- ``pappers``   → legal/official anchor (SIREN, financials, subsidiaries). The
                  firmographic facts Pappers owns get a *hard* citation: the
                  company SIREN, and each subsidiary its own SIREN.
- ``firecrawl`` → pages actually scraped (their source URL).
- ``brave``     → web-search hits (url + title).

The output is a ``sources`` block on the merged research output: a *registry*
of everything consulted, plus per-fact citations for the facts we can prove.
We never fabricate a 1:1 URL for synthesised narrative (e.g.
``business_description``) — that would invent precision the data doesn't have
(cf. "JAMAIS de données fictives"). Such fields are simply left uncited; the
registry still lets a salesperson audit the evidence base.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence

from pydantic import BaseModel, Field

from app.services.signal_freshness import (
    FRESHNESS_ARCHIVE,
    FRESHNESS_CURRENT,
    FRESHNESS_UNDATED,
)
from app.services.source_judge import SourceVerdict, judge_source

PROVIDER_PAPPERS = "pappers"
PROVIDER_FIRECRAWL = "firecrawl"
PROVIDER_BRAVE = "brave"

# Firmographic facts Pappers is the source of truth for — mirror of the
# overwrite list in ``phase1_research._merge_pappers``. Each, when present in
# the merged factsheet, gets a ``pappers:<siren>`` citation.
PAPPERS_BACKED_FACTS: tuple[str, ...] = (
    "revenue",
    "employees",
    "sector",
    "headquarters",
    "siren",
    "legal_form",
    "creation_date",
    "capital",
    "financials_history",
    "executives",
    "c_level",
    "branch_count",
)


class SourceRef(BaseModel):
    """One verifiable source consulted during research."""

    provider: str
    ref: str  # stable id: "pappers:552120222" | "firecrawl:<url>" | "brave:<url>"
    url: str | None = None
    title: str | None = None
    # Source Judge verdict (datation + qualité par SOURCE) — additive; ``None``
    # when the source was never judged. Lets the front/chat say "source X datée
    # de 2021 — archive". Never removes a source, only annotates + demotes it.
    freshness: SourceVerdict | None = None


class FactEvidence(BaseModel):
    """Proof for one key fact: a cited extract + the data's date + its refs."""

    extract: str
    date: str | None = None
    refs: list[str] = Field(default_factory=list)


class FactsSources(BaseModel):
    """The ``sources`` block attached to a research result (B3)."""

    registry: list[SourceRef] = Field(default_factory=list)
    facts: dict[str, list[str]] = Field(default_factory=dict)
    # Per key fact: a human-readable extract + the date of the data, so each
    # fait clé carries "source (extrait + date)" — Palier-1 versement gate.
    evidence: dict[str, FactEvidence] = Field(default_factory=dict)
    # Per field: a trust tag (deck p.6) — PUBLIC (sourced / official) vs
    # HYPOTHÈSE (AI interpretation) — so a salesperson knows what's verified.
    tags: dict[str, str] = Field(default_factory=dict)
    coverage: dict[str, int] = Field(default_factory=dict)


def _is_present(value: object) -> bool:
    """A fact is citable only if it actually carries data."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, dict)):
        return bool(value)
    return True


def _siren_of(item: object) -> str | None:
    if isinstance(item, Mapping):
        siren = item.get("siren")
    else:
        siren = getattr(item, "siren", None)
    siren = (str(siren).strip() if siren is not None else "")
    return siren or None


def build_source_registry(
    *,
    brave_hits: Iterable[Mapping[str, object]],
    firecrawl_urls: Iterable[str],
    pappers_siren: str | None,
    pappers_url: str | None,
) -> list[SourceRef]:
    """Every verifiable source consulted, deduplicated by URL.

    Scraped pages (Firecrawl) win over the same URL surfaced as a Brave
    snippet — the scrape is the richer evidence. URL-less Brave hits are
    dropped rather than invented into the registry.
    """
    registry: list[SourceRef] = []
    seen_urls: set[str] = set()

    if pappers_siren:
        registry.append(
            SourceRef(
                provider=PROVIDER_PAPPERS,
                ref=f"{PROVIDER_PAPPERS}:{pappers_siren}",
                url=pappers_url or None,
                title="Registre légal",
                freshness=judge_source(
                    {"url": pappers_url or None}, provider=PROVIDER_PAPPERS
                ),
            )
        )

    for url in firecrawl_urls:
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        registry.append(
            SourceRef(
                provider=PROVIDER_FIRECRAWL,
                ref=f"{PROVIDER_FIRECRAWL}:{url}",
                url=url,
                freshness=judge_source(url, provider=PROVIDER_FIRECRAWL),
            )
        )

    for hit in brave_hits:
        url = hit.get("url") if isinstance(hit, Mapping) else None
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        title = hit.get("title") if isinstance(hit, Mapping) else None
        registry.append(
            SourceRef(
                provider=PROVIDER_BRAVE,
                ref=f"{PROVIDER_BRAVE}:{url}",
                url=url,
                title=title,
                # Judge the whole hit — it may carry a publication-date metadata
                # key (date / page_age / age) alongside the URL.
                freshness=judge_source(hit, provider=PROVIDER_BRAVE),
            )
        )

    # Source Judge ordering (Théo p.7/p.12, lifted to the source level): an
    # ARCHIVE source is DEMOTED, never dropped (additive). Stable sort keeps the
    # Pappers legal anchor first and preserves the firecrawl-before-brave /
    # insertion order for every non-archive source; only archives sink.
    registry.sort(
        key=lambda r: (
            0 if r.provider == PROVIDER_PAPPERS else 1,
            1 if (r.freshness is not None and r.freshness.status == FRESHNESS_ARCHIVE) else 0,
        )
    )

    return registry


def attribute_facts(*, facts: Mapping[str, object], pappers_siren: str | None) -> dict[str, list[str]]:
    """Per-fact hard citations for the facts we can legally prove.

    Only Pappers-backed firmographics and per-subsidiary SIRENs are cited.
    Synthesised narrative is intentionally left out — no fake precision.
    """
    if not pappers_siren:
        return {}

    cite = f"{PROVIDER_PAPPERS}:{pappers_siren}"
    out: dict[str, list[str]] = {}

    for field in PAPPERS_BACKED_FACTS:
        if _is_present(facts.get(field)):
            out[field] = [cite]

    subsidiaries = facts.get("subsidiaries")
    if isinstance(subsidiaries, Sequence) and not isinstance(subsidiaries, (str, bytes)):
        sub_refs: list[str] = []
        for sub in subsidiaries:
            siren = _siren_of(sub)
            if siren:
                ref = f"{PROVIDER_PAPPERS}:{siren}"
                if ref not in sub_refs:
                    sub_refs.append(ref)
        if sub_refs:
            out["subsidiaries"] = sub_refs

    return out


# Human labels for the key firmographic facts, used to phrase the extract.
_FACT_LABELS: dict[str, str] = {
    "revenue": "Chiffre d'affaires",
    "employees": "Effectif",
    "sector": "Secteur (NAF)",
    "headquarters": "Siège social",
    "siren": "SIREN",
}
# Facts whose date is the financial-year vintage (vs. the legal creation date).
_FINANCIAL_FACTS = ("revenue", "employees")


def _latest_financial_year(facts: Mapping[str, object]) -> str | None:
    hist = facts.get("financials_history") or facts.get("financialsHistory") or []
    if not isinstance(hist, Sequence):
        return None
    years = [str(f.get("year")) for f in hist if isinstance(f, Mapping) and f.get("year")]
    return max(years) if years else None


def build_fact_evidence(
    *, facts: Mapping[str, object], fact_citations: Mapping[str, list[str]]
) -> dict[str, FactEvidence]:
    """For each cited key fact, a readable extract + the date of the data.

    Deterministic: the extract is the Pappers value itself (never invented),
    the date is the financial-year vintage for CA / effectif, else the legal
    creation date. Answers "chaque fait clé porte source + extrait + date".
    """
    fin_year = _latest_financial_year(facts)
    creation = facts.get("creation_date") or facts.get("creationDate")
    creation = str(creation).strip() if creation else None

    evidence: dict[str, FactEvidence] = {}
    for field, label in _FACT_LABELS.items():
        if field not in fact_citations:
            continue
        value = facts.get(field)
        if not _is_present(value):
            continue
        date = fin_year if field in _FINANCIAL_FACTS else (creation or fin_year)
        evidence[field] = FactEvidence(
            extract=f"{label} : {value}", date=date, refs=list(fact_citations[field])
        )
    return evidence


# Source tags (deck p.6). INTERNE (CRM) isn't applicable to research output.
TAG_PUBLIC = "PUBLIC"  # sourced / officially verifiable
TAG_HYPOTHESIS = "HYPOTHÈSE"  # AI interpretation, to confirm

# Synthesised narrative fields — AI interpretation, not a sourced fact.
_HYPOTHESIS_FIELDS = (
    "businessDescription", "business_description",
    "itImplicationsForEsn", "it_implications_for_esn",
    "accountOpeningStrategy", "account_opening_strategy",
    "concreteActivity", "concrete_activity",
    "angles", "pains", "itChallenges", "it_challenges",
    "powerQuestions", "power_questions", "objections",
    "orgChartLogic", "org_chart_logic",
)


def build_fact_tags(*, facts: Mapping[str, object], evidence: Mapping[str, object]) -> dict[str, str]:
    """Tag fields PUBLIC (sourced/official) vs HYPOTHÈSE (AI interpretation),
    so a salesperson knows what's verified vs to-confirm (deck p.6)."""
    tags: dict[str, str] = {}
    for field in evidence:
        tags[field] = TAG_PUBLIC
    for field in _HYPOTHESIS_FIELDS:
        if field not in tags and _is_present(facts.get(field)):
            tags[field] = TAG_HYPOTHESIS
    return tags


def build_facts_sources(
    *,
    facts: Mapping[str, object],
    brave_hits: Iterable[Mapping[str, object]],
    firecrawl_urls: Iterable[str],
    pappers_siren: str | None,
    pappers_url: str | None,
) -> FactsSources:
    """Assemble the full B3 ``sources`` block for a research result."""
    registry = build_source_registry(
        brave_hits=brave_hits,
        firecrawl_urls=firecrawl_urls,
        pappers_siren=pappers_siren,
        pappers_url=pappers_url,
    )
    fact_citations = attribute_facts(facts=facts, pappers_siren=pappers_siren)
    evidence = build_fact_evidence(facts=facts, fact_citations=fact_citations)
    tags = build_fact_tags(facts=facts, evidence=evidence)

    legal_citations = sum(
        1 for refs in fact_citations.values() for r in refs if r.startswith(f"{PROVIDER_PAPPERS}:")
    )
    # Source Judge roll-up: how many consulted sources are current vs archive vs
    # undated (front/chat "N sources archivées à recroiser"). Additive.
    def _status(r: SourceRef) -> str:
        return r.freshness.status if r.freshness is not None else FRESHNESS_UNDATED

    coverage = {
        "facts_with_source": len(fact_citations),
        "facts_with_evidence": len(evidence),
        "public_facts": sum(1 for t in tags.values() if t == TAG_PUBLIC),
        "hypothesis_facts": sum(1 for t in tags.values() if t == TAG_HYPOTHESIS),
        "registry_size": len(registry),
        "legal_citations": legal_citations,
        "sources_current": sum(1 for r in registry if _status(r) == FRESHNESS_CURRENT),
        "sources_archive": sum(1 for r in registry if _status(r) == FRESHNESS_ARCHIVE),
        "sources_undated": sum(1 for r in registry if _status(r) == FRESHNESS_UNDATED),
    }
    return FactsSources(
        registry=registry, facts=fact_citations, evidence=evidence, tags=tags, coverage=coverage
    )
