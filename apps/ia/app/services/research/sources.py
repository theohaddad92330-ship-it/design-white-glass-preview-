"""Source typology for the phase-1 web research step.

Each Brave hit is tagged with a :class:`SourceCategory` so the downstream
pipeline can:

- inject sources into Claude prompts grouped by intent (press / interview /
  official / project / jobs / other) — Claude can then cite ``[P1]``,
  ``[O2]``…  as traceable references in the structured output;
- expose per-category counters in ``_api_metrics`` (how many press hits did
  we get? how many were successfully scraped?);
- skip or de-prioritise categories that the caller doesn't want.

The classification is **rule-based, not Claude-based** — a regex pass on the
URL and the Brave title is enough to cover the typology in the ticket
(scraping page web, interviews, presse, site officiel, projets, offres
d'emploi) and stays free of LLM calls so it never becomes the bottleneck.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import urlparse


class SourceCategory(StrEnum):
    """Tag attached to each Brave hit + scraped page.

    Order matters for the dedup tiebreak in ``brave_search.search``: when the
    same URL appears under multiple queries, the **first** category seen
    wins, so the more specific categories should be processed before
    ``OTHER``. The render order in ``ResearchBundle.render_for_prompt``
    follows the declaration order.
    """

    PRESS = "press"
    INTERVIEW = "interview"
    OFFICIAL = "official"
    PROJECT = "project"
    JOBS = "jobs"
    OTHER = "other"


@dataclass(frozen=True)
class CategoryRules:
    """Regex sets for one category. Empty tuples mean "no rule for this lane"."""

    url_patterns: tuple[re.Pattern[str], ...]
    title_patterns: tuple[re.Pattern[str], ...]
    host_seeds: tuple[str, ...]


CATEGORY_RULES: dict[SourceCategory, CategoryRules] = {
    SourceCategory.PRESS: CategoryRules(
        url_patterns=(
            re.compile(r"/(presse|press|communique|news|actualite)s?(/|$)", re.IGNORECASE),
            re.compile(r"press-release|communique-de-presse", re.IGNORECASE),
        ),
        title_patterns=(
            re.compile(r"(communiqué|press release|annonce officielle)", re.IGNORECASE),
        ),
        host_seeds=(
            "usinedigitale.fr",
            "lesechos.fr",
            "journaldunet.com",
            "lemondeinformatique.fr",
            "lefigaro.fr",
            "lemonde.fr",
            "reuters.com",
            "bloomberg.com",
            "ft.com",
        ),
    ),
    SourceCategory.INTERVIEW: CategoryRules(
        url_patterns=(
            re.compile(r"(interview|itw|podcast|transcript)", re.IGNORECASE),
        ),
        title_patterns=(
            re.compile(r"(interview|podcast|entretien|au micro|s'exprime)", re.IGNORECASE),
        ),
        host_seeds=(),
    ),
    SourceCategory.PROJECT: CategoryRules(
        url_patterns=(
            re.compile(
                r"(rapport[-_]?annuel|annual[-_]?report|document[-_]?reference|"
                r"strateg(?:ie|y)|investor|finance|publications)",
                re.IGNORECASE,
            ),
            re.compile(r"\.pdf($|\?)", re.IGNORECASE),
        ),
        title_patterns=(
            re.compile(
                r"(rapport annuel|annual report|plan stratégique|investor|"
                r"programme transformation|document de référence)",
                re.IGNORECASE,
            ),
        ),
        host_seeds=(),
    ),
    SourceCategory.JOBS: CategoryRules(
        url_patterns=(
            re.compile(r"(carrieres?|careers?|jobs?|recrutement|emploi)", re.IGNORECASE),
        ),
        title_patterns=(
            re.compile(
                r"(recrutement|nous recrutons|offres? d'emploi|join us|careers|"
                r"hiring|rejoignez-nous)",
                re.IGNORECASE,
            ),
        ),
        host_seeds=(
            "welcometothejungle.com",
            "hellowork.com",
            "linkedin.com/jobs",
            "indeed.fr",
            "indeed.com",
            "monster.fr",
        ),
    ),
}


def _host(url: str) -> str:
    try:
        parsed = urlparse(url)
        return (parsed.hostname or "").lower()
    except Exception:
        return ""


def _match_any(patterns: tuple[re.Pattern[str], ...], value: str) -> bool:
    return any(p.search(value) for p in patterns)


def classify(url: str, title: str, *, official_hosts: set[str]) -> SourceCategory:
    """Map a Brave hit (``url`` + ``title``) to a :class:`SourceCategory`.

    Resolution order:

    1. If the host is in ``official_hosts`` AND the URL doesn't look like a
       press / project / jobs page on the corporate site, the source is
       OFFICIAL.
    2. Host-seed lookup (e.g. ``welcometothejungle.com`` → JOBS,
       ``lesechos.fr`` → PRESS).
    3. URL pattern match (path segments).
    4. Title pattern match (Brave's descriptive title).
    5. Fallback to ``OTHER``.

    Order between (3) and (4) matters: PRESS and PROJECT can both match the
    corporate site, so we walk categories in declaration order and return
    the first hit — PRESS wins over PROJECT for an ambiguous URL on the
    corporate domain.
    """
    host = _host(url)
    haystack_url = f"{host}{urlparse(url).path}".lower()

    # 1. Official corporate site — but only if the URL isn't a press release
    # or job posting *on* the corporate site (those still belong to their
    # respective categories so they group with similar external sources).
    if host and host in official_hosts:
        for cat in (SourceCategory.PRESS, SourceCategory.PROJECT, SourceCategory.JOBS, SourceCategory.INTERVIEW):
            rules = CATEGORY_RULES[cat]
            if _match_any(rules.url_patterns, haystack_url) or _match_any(rules.title_patterns, title):
                return cat
        return SourceCategory.OFFICIAL

    # 2 + 3 + 4 — walk categories in declaration order.
    for cat, rules in CATEGORY_RULES.items():
        if any(seed in host for seed in rules.host_seeds if seed):
            return cat
        if _match_any(rules.url_patterns, haystack_url):
            return cat
        if title and _match_any(rules.title_patterns, title):
            return cat

    return SourceCategory.OTHER


def infer_official_hosts(
    hits: list[dict[str, str]],
    company_name: str,
) -> set[str]:
    """Pick the host(s) most likely to be the company's corporate site.

    Heuristic: look at hits where the host's leftmost label matches a slug
    of ``company_name``. We don't have a clean canonical domain anywhere
    upstream (Pappers doesn't expose it for most non-tech companies), so
    we infer it from what Brave returned for the company. Returns up to
    3 hosts so corporate sites with regional variants (``capgemini.com`` +
    ``capgemini.fr``) are both recognised.
    """
    slug = re.sub(r"[^a-z0-9]", "", company_name.lower())
    if not slug:
        return set()

    counts: dict[str, int] = {}
    for hit in hits:
        host = _host(hit.get("url", ""))
        if not host:
            continue
        # Strip leading "www." then keep only the leftmost label (e.g.
        # "capgemini" from "capgemini.com").
        bare = host[4:] if host.startswith("www.") else host
        label = bare.split(".", 1)[0]
        if slug in label or label in slug:
            counts[host] = counts.get(host, 0) + 1

    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    return {host for host, _ in ranked[:3]}
