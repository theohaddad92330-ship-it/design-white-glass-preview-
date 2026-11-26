"""Logo entreprise dérivé du domaine (Théo : récupérer logo entreprise)."""

from __future__ import annotations

import pytest

from app.services.assets import company_logo_url, website_domain


@pytest.mark.parametrize(
    ("website", "domain"),
    [
        ("https://www.vinci.com/en", "vinci.com"),
        ("http://vinci.fr/", "vinci.fr"),
        ("VINCI.COM", "vinci.com"),
        ("www.societegenerale.com/particuliers", "societegenerale.com"),
        ("https://sub.example.co.uk?x=1", "sub.example.co.uk"),
        ("", None),
        (None, None),
        ("localhost", None),  # no dot → not a domain
        ("   ", None),
    ],
)
def test_website_domain(website, domain):
    assert website_domain(website) == domain


def test_company_logo_url_from_website():
    assert company_logo_url("https://www.vinci.com/en") == "https://logo.clearbit.com/vinci.com"


def test_company_logo_url_none_without_domain():
    assert company_logo_url("") is None
    assert company_logo_url(None) is None
    assert company_logo_url("not a url") is None
