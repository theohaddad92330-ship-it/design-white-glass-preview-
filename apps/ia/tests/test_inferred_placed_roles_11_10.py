"""Métiers placés DÉDUITS du contexte de l'espace (décision Louis 11/10/2026).

« Il faut que ce système soit vraiment excellent et qu'il alimente toujours
beaucoup de signaux. » Les métiers déduits (`inferredPlacedRoles`, calculés par
l'API depuis l'onboarding, le portefeuille, le vivier et les missions) :
  - ÉLARGISSENT ce qui remonte — jamais ne retirent une offre qui remontait ;
  - passent EN TÊTE ;
  - ne pèsent plus dès qu'un métier est DÉCLARÉ (le déclaré gagne toujours).
"""

from __future__ import annotations

from app.services.data_sources.france_travail import is_it_offer
from app.services.domain_job_filters import (
    offer_relevant_to_profile,
    profile_widens_collection,
    rank_offers_by_placed_roles,
)

DEV = {"intitule": "Développeur Java confirmé"}
CAISSIER = {"intitule": "Caissier / Caissière"}
SOC = {"intitule": "Analyste SOC N2"}
ASSOCIE = {"intitule": "Associé conseil"}

CYBER = [
    {"role": "Analyste SOC", "terms": ["soc", "siem"]},
    {"role": "Pentester", "terms": ["pentest", "pentester", "test d intrusion"]},
]


def _relevant(offer, profile):
    return offer_relevant_to_profile(offer, profile, it_check=is_it_offer)


def test_esn_it_avec_metiers_deduits_cyber_elargit_sans_retirer_l_it():
    profile = {"offerDomain": "esn_it", "inferredPlacedRoles": CYBER}
    assert _relevant(DEV, profile) is True  # l'IT qui remontait remonte toujours
    assert _relevant(SOC, profile) is True  # le métier déduit élargit
    assert _relevant({"intitule": "Pentester senior"}, profile) is True
    assert _relevant(CAISSIER, profile) is False


def test_sans_profil_les_deduits_ne_retirent_rien():
    profile = {"inferredPlacedRoles": CYBER}
    assert _relevant(CAISSIER, profile) is True
    assert _relevant(SOC, profile) is True


def test_le_declare_gagne_les_deduits_ne_pesent_plus():
    profile = {"placedRoles": ["Data"], "inferredPlacedRoles": CYBER}
    assert _relevant(SOC, profile) is False
    assert _relevant({"intitule": "Data engineer"}, profile) is True


def test_mot_entier_seulement():
    profile = {"offerDomain": "esn_it", "inferredPlacedRoles": CYBER}
    assert _relevant(ASSOCIE, profile) is False
    assert _relevant({"intitule": "Consultant test d'intrusion"}, profile) is True


def test_collecte_elargie_des_qu_un_metier_est_deduit():
    assert profile_widens_collection({"offerDomain": "esn_it"}) is False
    assert profile_widens_collection({"offerDomain": "esn_it", "inferredPlacedRoles": CYBER}) is True
    # Le déclaré gagne : un déduit ne change rien quand le profil déclare déjà.
    assert profile_widens_collection({"placedRoles": ["Data"], "inferredPlacedRoles": CYBER}) is True


def test_les_metiers_places_passent_en_tete_ordre_stable_sinon():
    offers = [DEV, CAISSIER, SOC]
    assert rank_offers_by_placed_roles(offers, {"inferredPlacedRoles": CYBER}) == [SOC, DEV, CAISSIER]
    assert rank_offers_by_placed_roles(offers, {"placedRoles": ["caissier"]}) == [CAISSIER, DEV, SOC]
    # Sans métier : la liste revient telle quelle (même objet, à l'octet près).
    assert rank_offers_by_placed_roles(offers, {"offerDomain": "esn_it"}) is offers
    assert rank_offers_by_placed_roles(offers, None) is offers


def test_ligne_rendue_title_lue_comme_intitule():
    rendered = {"title": "Analyste SIEM"}
    assert rank_offers_by_placed_roles([DEV, rendered], {"inferredPlacedRoles": CYBER}) == [rendered, DEV]


def test_entree_illisible_ignoree():
    malformed = ["soc", {"role": 3}, {"terms": "soc"}]
    profile = {"offerDomain": "industrial_engineering", "inferredPlacedRoles": malformed}
    assert _relevant(SOC, profile) is False
    assert profile_widens_collection({"offerDomain": "esn_it", "inferredPlacedRoles": malformed}) is False
