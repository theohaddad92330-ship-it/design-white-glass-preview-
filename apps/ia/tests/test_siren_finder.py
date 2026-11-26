"""SIREN resolution from the web (mentions légales) — for companies whose brand
name doesn't match their legal name in Pappers (e.g. OVHcloud → OVH GROUPE SA)."""

from __future__ import annotations

import pytest

from types import SimpleNamespace

from app.services.research.siren_finder import extract_siren, find_siren_in_bundle, find_siren_via_web

# A realistic "mentions légales" snippet (brand ≠ legal name).
OVH_LEGAL = """
Mentions légales — OVHcloud
Éditeur : OVH GROUPE SA, société anonyme au capital de 50 000 000 €.
Siège social : 2 rue Kellermann, 59100 Roubaix.
RCS Lille Métropole 537 407 926 — SIRET 537 407 926 00014.
"""


def test_extracts_siren_near_a_legal_keyword():
    assert extract_siren(OVH_LEGAL) == "537407926"


def test_plain_siren_label():
    assert extract_siren("SIREN : 552 120 222") == "552120222"
    assert extract_siren("Siren552120222") == "552120222"


def test_siret_is_reduced_to_its_siren():
    assert extract_siren("SIRET 537 407 926 00014") == "537407926"


def test_invalid_luhn_is_rejected():
    # 9 digits near a keyword but not a valid SIREN (Luhn fails).
    assert extract_siren("SIREN 123 456 789") is None


def test_no_siren_returns_none():
    assert extract_siren("Aucune info légale ici.") is None
    assert extract_siren("") is None


def test_keyword_adjacent_wins_over_a_stray_number():
    # A stray Luhn-valid 9-digit far from any keyword, plus the real one labelled.
    text = "Téléphone 552120222 ... blah ... \n RCS Roubaix 537 407 926"
    assert extract_siren(text) == "537407926"


@pytest.mark.asyncio
async def test_find_siren_via_web_scrapes_legal_pages():
    async def fake_search(query: str) -> list[str]:
        assert "mentions" in query.lower() or "rcs" in query.lower()
        return ["https://www.ovhcloud.com/fr/", "https://www.ovhcloud.com/fr/mentions-legales/"]

    scraped: list[str] = []

    async def fake_scrape(url: str) -> str | None:
        scraped.append(url)
        if "mentions-legales" in url:
            return OVH_LEGAL
        return "Page accueil, pas de SIREN."

    siren = await find_siren_via_web("OVHcloud", search_fn=fake_search, scrape_fn=fake_scrape)
    assert siren == "537407926"
    # Legal-looking URLs are tried first.
    assert scraped[0].endswith("/mentions-legales/")


def test_find_siren_in_bundle_reuses_scraped_markdown():
    # No network — reads the SIREN off pages already scraped in phase 1.
    sources = [
        SimpleNamespace(url="https://www.boursorama.com", scraped_markdown="banque en ligne"),
        SimpleNamespace(url="https://www.ovhcloud.com/fr/mentions-legales/", scraped_markdown=OVH_LEGAL),
    ]
    assert find_siren_in_bundle(sources, "OVHcloud") == "537407926"


def test_find_siren_in_bundle_ignores_stranger_hosts():
    # A SIREN on a page that isn't the company's host must not be trusted.
    sources = [SimpleNamespace(url="https://www.gencovery.com/mentions", scraped_markdown="RCS Lyon 882 921 570")]
    assert find_siren_in_bundle(sources, "OVHcloud") is None


def test_find_siren_in_bundle_handles_empty():
    assert find_siren_in_bundle([], "OVHcloud") is None
    assert find_siren_in_bundle(None, "OVHcloud") is None


@pytest.mark.asyncio
async def test_official_apex_domain_is_preferred_over_a_subsite():
    # Both are legal pages; the apex official host should be scraped first so we
    # land on the group's registration, not a subsite's operating entity.
    async def fake_search(query: str) -> list[str]:
        return [
            "https://marketplace.ovhcloud.com/legale-mentions",
            "https://www.ovhcloud.com/fr/mentions-legales/",
        ]

    scraped: list[str] = []

    async def fake_scrape(url: str) -> str | None:
        scraped.append(url)
        return None  # force it to try every candidate, in ranked order

    await find_siren_via_web("OVHcloud", search_fn=fake_search, scrape_fn=fake_scrape)
    assert scraped[0] == "https://www.ovhcloud.com/fr/mentions-legales/"


@pytest.mark.asyncio
async def test_find_siren_via_web_returns_none_when_absent():
    async def fake_search(query: str) -> list[str]:
        return ["https://x.example/a"]

    async def fake_scrape(url: str) -> str | None:
        return "rien de légal"

    assert await find_siren_via_web("Acme", search_fn=fake_search, scrape_fn=fake_scrape) is None


@pytest.mark.asyncio
async def test_find_siren_via_web_tolerates_scrape_errors():
    async def fake_search(query: str) -> list[str]:
        # Both on the company's host; the apex one is tried first and errors.
        return ["https://www.ovhcloud.com/mentions-legales", "https://shop.ovhcloud.com/mentions-legales"]

    async def fake_scrape(url: str) -> str | None:
        if "www." in url:
            raise RuntimeError("scrape boom")
        return OVH_LEGAL

    siren = await find_siren_via_web("OVHcloud", search_fn=fake_search, scrape_fn=fake_scrape)
    assert siren == "537407926"


def test_host_match_rejects_short_label_strangers():
    from app.services.research.siren_finder import _host_matches_company

    # The company's own brand-carrying host matches (incl. subdomains).
    assert _host_matches_company("https://www.ovhcloud.com/fr/mentions-legales", "ovhcloud")
    assert _host_matches_company("https://shop.ovhcloud.com/legal", "ovhcloud")
    assert _host_matches_company("https://www.airfrance.fr/cgv", "airfrance")
    # Strangers sharing only a short prefix/substring must NOT match (no wrong dossier).
    assert not _host_matches_company("https://air.io/legal", "airfrance")
    assert not _host_matches_company("https://coin.fr/cgv", "leboncoin")
    assert not _host_matches_company("https://ovh.com/legal", "ovhcloud")  # prefix ≠ trust
    assert not _host_matches_company("https://www.gencovery.com/mentions", "ovhcloud")


@pytest.mark.asyncio
async def test_never_grabs_a_stranger_company_siren():
    # A foreign legal page (gencovery) outranks nothing here — its host doesn't
    # match the company, so we must NOT read its SIREN even though it has one.
    async def fake_search(query: str) -> list[str]:
        return [
            "https://www.gencovery.com/mentions-legales",  # stranger, has a SIREN
            "https://www.ovhcloud.com/fr/mentions-legales/",  # the right one
        ]

    async def fake_scrape(url: str) -> str | None:
        if "gencovery" in url:
            return "RCS Lyon 882 921 570"  # a different company's SIREN
        return OVH_LEGAL

    siren = await find_siren_via_web("OVHcloud", search_fn=fake_search, scrape_fn=fake_scrape)
    assert siren == "537407926"  # OVH's, never gencovery's


@pytest.mark.asyncio
async def test_returns_none_rather_than_a_wrong_company():
    # Only a stranger's legal page is available → no SIREN beats a wrong one.
    async def fake_search(query: str) -> list[str]:
        return ["https://www.gencovery.com/mentions-legales"]

    async def fake_scrape(url: str) -> str | None:
        return "RCS Lyon 882 921 570"

    assert await find_siren_via_web("OVHcloud", search_fn=fake_search, scrape_fn=fake_scrape) is None
