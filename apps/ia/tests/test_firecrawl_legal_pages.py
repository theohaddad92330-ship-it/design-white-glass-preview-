"""#4743 / #4738 — les mentions légales et les pages « actualité / projet » du site
sont des pages à LIRE ; CGU, CGV, cookies et confidentialité restent de faible valeur."""
from __future__ import annotations

import pytest

from app.services import firecrawl as fc
from app.services.official_directory import is_team_page
from app.services.research.sources import SourceCategory

NEUTRAL = fc._url_priority("https://acme.fr/page", SourceCategory.OFFICIAL)

LEGAL_NOTICE_URLS = [
    "https://acme.fr/mentions-legales",
    "https://acme.fr/mentions-legales/",
    "https://acme.fr/fr/informations-legales",
    "https://acme.fr/impressum",
    "https://acme.fr/legal-notice",
    "https://acme.fr/legal/notice",
]

STILL_LOW_URLS = [
    "https://acme.fr/cgu",
    "https://acme.fr/cgv",
    "https://acme.fr/cookies",
    "https://acme.fr/politique-confidentialite",
    "https://acme.fr/privacy",
    "https://acme.fr/legal/cgu",
]


@pytest.mark.parametrize("url", LEGAL_NOTICE_URLS)
def test_mentions_legales_ne_sont_plus_de_faible_valeur(url):
    assert fc._url_priority(url, SourceCategory.OFFICIAL) >= NEUTRAL


@pytest.mark.parametrize("url", STILL_LOW_URLS)
def test_cgu_cgv_cookies_confidentialite_restent_de_faible_valeur(url):
    assert fc._url_priority(url, SourceCategory.OFFICIAL) < NEUTRAL


def test_mentions_legales_gagnent_le_budget_face_a_une_page_banale():
    legal = fc._url_priority("https://acme.fr/mentions-legales", SourceCategory.OFFICIAL)
    assert legal > NEUTRAL


@pytest.mark.parametrize("slug", ["projets", "blog", "evenements", "realisations"])
def test_pages_de_signaux_du_site_sont_priorisees(slug):
    assert fc._url_priority(f"https://acme.fr/{slug}/2026", SourceCategory.OFFICIAL) > NEUTRAL


def test_organigramme_garde_son_exclusion_pour_les_mentions_legales():
    # Décision #4743 : une mention légale nomme le représentant légal, pas un
    # organigramme — l'exclusion reste pour is_team_page.
    assert not is_team_page("https://acme.fr/mentions-legales")
    assert not is_team_page("https://acme.fr/informations-legales/direction")
    assert not is_team_page("https://acme.fr/impressum")
