"""B3 — deterministic source attribution for the research factsheet."""

from __future__ import annotations

from app.services.sources import (
    PROVIDER_BRAVE,
    PROVIDER_FIRECRAWL,
    PROVIDER_PAPPERS,
    build_facts_sources,
)

# A trimmed Société-Générale-shaped merged factsheet (post `_merge_pappers`).
SG_FACTS = {
    "siren": "552120222",
    "revenue": "26788000000",
    "employees": "Plus de 10 000 salariés",
    "sector": "Autres intermédiations monétaires",
    "headquarters": "29 boulevard Haussmann, 75009 Paris",
    "business_description": "Groupe bancaire universel français.",
    "subsidiaries": [
        {"siren": "311769780", "name": "GIE COMMERC C C BOIS ST PERES"},
        {"siren": "472500503", "name": "SOCIÉTÉ DE BOURSE GILBERT DUPONT"},
        {"name": "Filiale sans SIREN connu"},
    ],
}

BRAVE_HITS = [
    {"url": "https://www.societegenerale.com/fr", "title": "Société Générale — Accueil"},
    {"url": "https://www.boursorama.com", "title": "Boursorama"},
    {"title": "hit sans url"},
]

FIRECRAWL_URLS = ["https://www.societegenerale.com/fr", "https://forge.societegenerale.com"]


def _refs(block, provider):
    return [r for r in block.registry if r.provider == provider]


def test_registry_lists_every_consulted_source():
    block = build_facts_sources(
        facts=SG_FACTS,
        brave_hits=BRAVE_HITS,
        firecrawl_urls=FIRECRAWL_URLS,
        pappers_siren="552120222",
        pappers_url="https://www.pappers.fr/entreprise/552120222",
    )
    # Pappers anchor present.
    pappers = _refs(block, PROVIDER_PAPPERS)
    assert len(pappers) == 1
    assert pappers[0].ref == "pappers:552120222"
    assert pappers[0].url == "https://www.pappers.fr/entreprise/552120222"

    # Both scraped pages present.
    assert {r.url for r in _refs(block, PROVIDER_FIRECRAWL)} == set(FIRECRAWL_URLS)


def test_brave_hit_without_url_is_dropped_and_scraped_url_wins():
    block = build_facts_sources(
        facts=SG_FACTS,
        brave_hits=BRAVE_HITS,
        firecrawl_urls=FIRECRAWL_URLS,
        pappers_siren="552120222",
        pappers_url=None,
    )
    brave = _refs(block, PROVIDER_BRAVE)
    # The url-less hit is dropped (no invented source).
    assert all(r.url for r in brave)
    # societegenerale.com was scraped by Firecrawl → not duplicated as a Brave snippet.
    brave_urls = {r.url for r in brave}
    assert "https://www.societegenerale.com/fr" not in brave_urls
    assert "https://www.boursorama.com" in brave_urls


def test_pappers_backed_facts_get_hard_citation():
    block = build_facts_sources(
        facts=SG_FACTS,
        brave_hits=BRAVE_HITS,
        firecrawl_urls=FIRECRAWL_URLS,
        pappers_siren="552120222",
        pappers_url=None,
    )
    cite = "pappers:552120222"
    for field in ("revenue", "employees", "sector", "headquarters", "siren"):
        assert block.facts[field] == [cite], field
    # Synthesised narrative is NOT given a fake citation.
    assert "business_description" not in block.facts


def test_each_subsidiary_cites_its_own_siren():
    block = build_facts_sources(
        facts=SG_FACTS,
        brave_hits=BRAVE_HITS,
        firecrawl_urls=FIRECRAWL_URLS,
        pappers_siren="552120222",
        pappers_url=None,
    )
    assert block.facts["subsidiaries"] == ["pappers:311769780", "pappers:472500503"]
    assert block.coverage["legal_citations"] >= 7


def test_no_pappers_means_no_legal_citations_but_registry_survives():
    block = build_facts_sources(
        facts={"business_description": "x", "subsidiaries": []},
        brave_hits=BRAVE_HITS,
        firecrawl_urls=FIRECRAWL_URLS,
        pappers_siren=None,
        pappers_url=None,
    )
    assert block.facts == {}
    assert block.coverage["legal_citations"] == 0
    # Web evidence is still listed for audit.
    assert block.coverage["registry_size"] >= 2
    assert not _refs(block, PROVIDER_PAPPERS)


def test_empty_pappers_field_is_not_cited():
    block = build_facts_sources(
        facts={"siren": "552120222", "revenue": "", "employees": "   "},
        brave_hits=[],
        firecrawl_urls=[],
        pappers_siren="552120222",
        pappers_url=None,
    )
    assert "siren" in block.facts
    assert "revenue" not in block.facts  # empty string → no citation
    assert "employees" not in block.facts  # whitespace → no citation


def test_each_key_fact_carries_extract_and_date():
    facts = {
        **SG_FACTS,
        "creation_date": "1864-05-04",
        "financials_history": [{"year": 2022}, {"year": 2024}, {"year": 2023}],
    }
    block = build_facts_sources(
        facts=facts,
        brave_hits=[],
        firecrawl_urls=[],
        pappers_siren="552120222",
        pappers_url=None,
    )
    ev = block.evidence
    # CA / effectif dated by the latest financial year.
    assert ev["revenue"].date == "2024"
    assert ev["revenue"].extract.startswith("Chiffre d'affaires : ")
    assert ev["revenue"].refs == ["pappers:552120222"]
    assert ev["employees"].date == "2024"
    # SIREN / sector / siège dated by the legal creation date.
    assert ev["siren"].date == "1864-05-04"
    assert ev["sector"].extract.startswith("Secteur (NAF) : ")
    assert block.coverage["facts_with_evidence"] >= 4


def test_source_tags_public_vs_hypothesis():
    facts = {
        **SG_FACTS,
        "businessDescription": "Groupe bancaire universel.",
        "angles": [{"title": "Data"}],
    }
    block = build_facts_sources(
        facts=facts,
        brave_hits=[],
        firecrawl_urls=[],
        pappers_siren="552120222",
        pappers_url=None,
    )
    # Pappers-cited firmographics are PUBLIC (sourced); synthesised narrative is HYPOTHÈSE.
    assert block.tags["revenue"] == "PUBLIC"
    assert block.tags["siren"] == "PUBLIC"
    assert block.tags["businessDescription"] == "HYPOTHÈSE"
    assert block.tags["angles"] == "HYPOTHÈSE"
    assert block.coverage["public_facts"] >= 4
    assert block.coverage["hypothesis_facts"] >= 2


def test_no_evidence_without_a_legal_anchor():
    block = build_facts_sources(
        facts={"revenue": "100", "employees": "10"},
        brave_hits=[],
        firecrawl_urls=[],
        pappers_siren=None,
        pappers_url=None,
    )
    assert block.evidence == {}
    assert block.coverage["facts_with_evidence"] == 0


# ── Source Judge integration (datation/qualité par SOURCE) ────────────────────

def test_every_registry_source_carries_a_freshness_verdict():
    block = build_facts_sources(
        facts=SG_FACTS,
        brave_hits=BRAVE_HITS,
        firecrawl_urls=FIRECRAWL_URLS,
        pappers_siren="552120222",
        pappers_url="https://www.pappers.fr/entreprise/552120222",
    )
    # Additive: every consulted source is judged (status + quality present).
    for ref in block.registry:
        assert ref.freshness is not None
        assert ref.freshness.status in {"current", "archive", "undated"}
        assert ref.freshness.quality == "strong"  # real scraped/registry sources
    # Undated web/registry sources (no date in the URL) — honest, never invented.
    assert block.coverage["sources_undated"] == block.coverage["registry_size"]


def test_dated_url_source_is_judged_and_archive_demoted():
    # A scraped page whose URL carries an OLD date is flagged archive and sinks
    # below the undated pages — additive, nothing is dropped.
    firecrawl = [
        "https://www.societegenerale.com/fr",              # undated
        "https://presse.example.com/2021/03/10/vieux",     # archive (>24 mois)
    ]
    block = build_facts_sources(
        facts=SG_FACTS,
        brave_hits=[],
        firecrawl_urls=firecrawl,
        pappers_siren=None,
        pappers_url=None,
    )
    by_url = {r.url: r for r in block.registry}
    assert by_url["https://presse.example.com/2021/03/10/vieux"].freshness.status == "archive"
    assert by_url["https://www.societegenerale.com/fr"].freshness.status == "undated"
    # Both sources still present (registry_size unchanged), archive demoted last.
    assert {r.url for r in block.registry} == set(firecrawl)
    assert block.registry[-1].url == "https://presse.example.com/2021/03/10/vieux"
    assert block.coverage["sources_archive"] == 1
