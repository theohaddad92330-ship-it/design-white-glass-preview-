"""LUD.3 — le recrutement industriel couvre le génie civil / BTP / conduite de travaux."""

from __future__ import annotations

import pytest

from app.services.data_sources.france_travail import is_domain_offer

PACK = "industrial_engineering"


@pytest.mark.parametrize(
    "offer",
    [
        {"intitule": "Coordinateur de chantier"},
        {"intitule": "Conducteur de travaux CVC H/F"},
        {"intitule": "Ingénieur Génie Civil"},
        {"intitule": "Chargé d'affaires travaux"},
        {"intitule": "Technicien méthodes"},
        {"intitule": "Automaticien"},
        {"intitule": "Responsable de chantier", "romeCode": "F1202"},
        {"intitule": "Dessinateur du BTP", "romeCode": "F1104"},
    ],
)
def test_industrial_pack_keeps_btp_and_site_offers(offer) -> None:
    assert is_domain_offer(offer, pack=PACK) is True


def test_it_space_rejects_a_site_coordinator() -> None:
    # LUD.3 — non-régression IT : sans pack, le tri IT historique rejette l'offre.
    assert is_domain_offer({"intitule": "Coordinateur de chantier"}, pack=None) is False
    assert is_domain_offer({"intitule": "Coordinateur de chantier"}, pack="esn_it") is False


def test_masonry_trade_stays_out() -> None:
    assert is_domain_offer({"intitule": "Maçon coffreur", "romeCode": "F1703"}, pack=PACK) is False
