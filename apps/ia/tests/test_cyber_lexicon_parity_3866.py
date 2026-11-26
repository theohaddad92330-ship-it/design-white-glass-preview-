"""#3866 / #3901 (Louis 15/10/2026) — parité du lexique cyber entre les sources d'offres,
et ESN de placement : TOUTE offre reste une piste, sans filtre métier.

Les quatre sources (France Travail, APEC, WTTJ, recherche web) trient avec le MÊME
lexique IT/cyber ; deux lexiques qui divergent rejettent chez l'une ce que l'autre garde.
"""

from __future__ import annotations

import pytest

from app.services.data_sources import apec, job_search, wttj
from app.services.data_sources.france_travail import is_it_offer
from app.services.domain_job_filters import offer_relevant_to_profile

CYBER_TITLES = [
    "Pentester confirmé",
    "Analyste SOC N2",
    "RSSI adjoint",
    "Ingénieur cybersécurité",
    "Consultant sécurité des systèmes d'information",
    "Ingénieur DevSecOps",
]
NON_IT_TITLES = ["Caissier / Caissière", "Boulanger", "Directeur périscolaire"]


@pytest.mark.parametrize("title", CYBER_TITLES)
def test_apec_et_france_travail_gardent_le_meme_cyber(title):
    offer = {"intitule": title}
    assert is_it_offer(offer) is True
    assert apec._is_it(offer) is True


@pytest.mark.parametrize("title", NON_IT_TITLES)
def test_les_deux_lexiques_disent_non_au_non_it(title):
    offer = {"intitule": title}
    assert is_it_offer(offer) is False
    assert apec._is_it(offer) is False


def test_wttj_et_recherche_web_utilisent_le_tri_de_france_travail():
    # Une seule source de vérité (GA-26) : le même objet, pas une copie qui divergerait.
    assert wttj.is_it_offer is is_it_offer
    assert job_search.is_it_offer is is_it_offer


@pytest.mark.parametrize("title", CYBER_TITLES + NON_IT_TITLES)
def test_esn_de_placement_toute_offre_reste_une_piste(title):
    profile = {"recruitsForClients": True, "offerDomain": "cybersecurity"}
    assert offer_relevant_to_profile({"intitule": title}, profile, it_check=is_it_offer) is True


def test_sait_dire_non_sans_placement_le_non_it_est_ecarte():
    profile = {"offerDomain": "esn_it"}
    assert offer_relevant_to_profile({"intitule": "Boulanger"}, profile, it_check=is_it_offer) is False
