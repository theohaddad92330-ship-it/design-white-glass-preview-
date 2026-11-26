"""Mentions LÉGALES et pages PARTENAIRES — #3205.1 (épopée #3239), lot M05 29/09.

Deux sources de plus pour #3205 (LAU-FINAL-211), extension DÉLIBÉRÉE de #3095
(`site_credit_partners.py`) : zéro nouveau fournisseur, zéro appel réseau
supplémentaire — ce module relit les pages QUE LE RUN SCRAPE DÉJÀ
(`ResearchBundle`) et cherche une ESN CONNUE (`known_esn_names`) sous deux
formes distinctes du crédit de pied de page déjà couvert par #3095.
"""

from __future__ import annotations

from app.services.provider_footprint_mentions import (
    collect_legal_notice_partners,
    collect_partner_page_mentions,
)

_DETECTED_AT = "2026-09-29"


def test_a_labelled_legal_notice_field_naming_a_known_esn_is_detected():
    pages = [
        {
            "url": "https://www.acme.fr/mentions-legales",
            "markdown": "Mentions légales\n\nRéalisation : Capgemini\nHébergement : OVH\n",
        }
    ]
    out = collect_legal_notice_partners(pages, detected_at=_DETECTED_AT)
    assert len(out) == 1
    assert out[0]["name"] == "Capgemini"
    assert out[0]["detectedAt"] == _DETECTED_AT
    assert "https://www.acme.fr/mentions-legales" in out[0]["evidence"]


def test_a_hosting_label_alone_is_not_a_provider_credit():
    """`Hébergement` n'est pas dans les marqueurs : héberger un site n'est pas
    un prestataire IT commercial au sens de la spec."""
    pages = [{"url": "https://www.acme.fr/mentions-legales", "markdown": "Hébergement : OVH"}]
    assert collect_legal_notice_partners(pages, detected_at=_DETECTED_AT) == []


def test_a_legal_notice_credit_for_an_unreferenced_name_is_never_invented():
    pages = [{"url": "https://www.acme.fr/mentions-legales", "markdown": "Conception : Studio Web Local"}]
    assert collect_legal_notice_partners(pages, detected_at=_DETECTED_AT) == []


def test_no_pages_yields_no_legal_notice_entries_without_error():
    assert collect_legal_notice_partners(None, detected_at=_DETECTED_AT) == []
    assert collect_legal_notice_partners([], detected_at=_DETECTED_AT) == []


def test_an_official_partner_mention_naming_a_known_esn_is_detected():
    pages = [
        {
            "url": "https://www.acme.fr/partenaires",
            "markdown": "Nos partenaires\n\nAlten est notre partenaire officiel pour la transformation digitale.",
        }
    ]
    out = collect_partner_page_mentions(pages, detected_at=_DETECTED_AT)
    assert len(out) == 1
    assert out[0]["name"] == "Alten"
    assert out[0]["detectedAt"] == _DETECTED_AT
    assert "https://www.acme.fr/partenaires" in out[0]["evidence"]


def test_an_english_in_partnership_with_mention_is_also_detected():
    pages = [{"url": "https://www.acme.fr/en", "markdown": "Built in partnership with Devoteam."}]
    out = collect_partner_page_mentions(pages, detected_at=_DETECTED_AT)
    assert [e["name"] for e in out] == ["Devoteam"]


def test_a_plain_co_mention_in_prose_is_not_a_partnership():
    """Doctrine (#3205, RÈGLE) : ne jamais appeler toute agence VISIBLE une
    partenaire — deux sociétés citées côte à côte dans un article n'est pas un
    partenariat déclaré."""
    pages = [{"url": "https://www.acme.fr/presse", "markdown": "Acme et Capgemini ont assisté au salon Vivatech."}]
    assert collect_partner_page_mentions(pages, detected_at=_DETECTED_AT) == []


def test_a_partner_page_mention_for_an_unreferenced_name_is_never_invented():
    pages = [{"url": "https://www.acme.fr/partenaires", "markdown": "En partenariat avec Studio Web Local."}]
    assert collect_partner_page_mentions(pages, detected_at=_DETECTED_AT) == []


def test_no_pages_yields_no_partner_page_entries_without_error():
    assert collect_partner_page_mentions(None, detected_at=_DETECTED_AT) == []
    assert collect_partner_page_mentions([], detected_at=_DETECTED_AT) == []


def test_the_same_esn_mentioned_on_two_partner_pages_appears_once():
    pages = [
        {"url": "https://www.acme.fr/partenaires", "markdown": "Partenaire officiel : Alten"},
        {"url": "https://www.acme.fr/a-propos", "markdown": "En partenariat avec Alten depuis 2024."},
    ]
    out = collect_partner_page_mentions(pages, detected_at=_DETECTED_AT)
    assert len(out) == 1
