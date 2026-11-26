"""Le tri des offres suit le domaine que le vendeur VEND (addendum Stelya §11).

La sûreté d'abord : sans pack, avec `esn_it` ou avec un pack sans filtre, le tri
IT historique s'applique — c'est ce qui garantit qu'aucun client existant ne voit
son Découvrir changer.
"""

from __future__ import annotations

import pytest

from app.services.domain_job_filters import job_filter_for
from app.services.data_sources.france_travail import is_domain_offer, is_it_offer


def offer(intitule: str, rome: str = "", rome_libelle: str = "") -> dict:
    return {"intitule": intitule, "romeCode": rome, "romeLibelle": rome_libelle}


@pytest.mark.parametrize("pack", [None, "", "esn_it", "pack-inconnu"])
def test_no_filter_means_the_historical_it_sort(pack: str | None) -> None:
    assert job_filter_for(pack) is None
    # Et le tri appliqué est EXACTEMENT l'ancien.
    dev = offer("Développeur Python", "M1805")
    assert is_domain_offer(dev, pack=pack) is is_it_offer(dev)
    methodes = offer("Responsable Méthodes", "H1402")
    assert is_domain_offer(methodes, pack=pack) is is_it_offer(methodes) is False


def test_industrial_pack_keeps_what_the_it_sort_threw_away() -> None:
    """Les offres que le commentaire du tri IT cite comme contre-exemples —
    « méthodes industrielles », « régleur sur commande numérique » — sont
    précisément ce qu'une société de conseil en ingénierie cherche."""
    for title, rome in (
        ("Responsable Méthodes", "H1402"),
        ("Ingénieur Bureau d'Études Mécanique", "H1203"),
        ("Technicien Automatisme", "H1208"),
        ("Ingénieur Qualité Fournisseur", "H1502"),
        ("Responsable Maintenance Industrielle", "I1102"),
        ("Ingénieur Industrialisation", "H1401"),
    ):
        job = offer(title, rome)
        assert is_it_offer(job) is False, f"{title} n'est pas une offre IT"
        assert is_domain_offer(job, pack="industrial_engineering") is True, title


def test_industrial_pack_still_rejects_the_noise_the_it_sort_rejected() -> None:
    """Le filtre industriel ne doit pas rouvrir la porte au bruit que le tri IT
    fermait : sans lui, « Michelin » remontait 21 offres de restaurant."""
    for title, rome in (("Serveur en restauration", "G1803"), ("Hôte de caisse", "D1505"), ("Aide-soignant", "J1501")):
        job = offer(title, rome)
        assert is_domain_offer(job, pack="industrial_engineering") is False, title


def test_a_rome_prefix_is_a_family_not_a_letter() -> None:
    """« H » couvre toute l'industrie jusqu'à la conduite de machine, qui
    noierait le signal d'un bureau d'études. Les préfixes sont des
    sous-familles."""
    conduite = offer("Conducteur de ligne de production", "H2701")
    assert is_domain_offer(conduite, pack="industrial_engineering") is False


def test_an_it_offer_at_an_industrial_seller_is_not_kept_by_accident() -> None:
    """Un vendeur industriel ne doit pas se voir proposer les offres de la DSI :
    ce n'est pas son marché, et les compter gonflerait son signal."""
    assert is_domain_offer(offer("Développeur Java", "M1805"), pack="industrial_engineering") is False


# ── Le bloc de surface de Découvrir (lot 6, seconde moitié) ─────────────────


def _surface_labels(profile: dict) -> list[str]:
    from app.services.discover_scoring import _it_surface_factors

    company = {"headcountRange": "500 à 999 salariés"}
    signals = [{"type": "hiring"}, {"type": "tech"}]
    return [f["label"] for f in _it_surface_factors(company, signals, profile)]


def test_surface_block_speaks_it_without_a_profile() -> None:
    """La non-régression : sans profil ou en ESN IT, les libellés d'avant, à
    l'octet près — des milliers de comptes sont déjà scorés avec eux."""
    for profile in ({}, {"offerDomain": "esn_it"}, {"offerDomain": "finance"}):
        labels = _surface_labels(profile)
        assert labels and set(labels) == {"surface informatique"}, profile


def test_surface_block_speaks_industry_for_an_industrial_seller() -> None:
    labels = _surface_labels({"offerDomain": "industrial_engineering"})
    assert labels and set(labels) == {"surface industrielle"}


def test_the_block_KEY_never_changes() -> None:
    """La clé `it_surface` vit pour toujours dans les `raw_analysis` déjà
    produites, le contrat partagé la porte et quatre composants web la lisent.
    Seul le LIBELLÉ se spécialise."""
    from app.services.discover_scoring import _BLOCK_MAXIMA

    assert any(block == "it_surface" for block, _max in _BLOCK_MAXIMA)
