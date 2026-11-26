"""#1124 — les offres d'emploi d'une ESN qui PLACE des profils chez ses clients.

« Je propose aussi à mes clients du recrutement de profil IT en fixe chez eux.
Donc je t'avoue que si tu peux me sortir les annonces de postes comme ça, je
suis assez refait. »

Ce que ces tests protègent tient en deux phrases :

* l'élargissement est ORTHOGONAL au domaine — un placeur informatique garde ses
  offres IT et gagne les autres ; en faire un « pack recrutement » qui remplace
  le tri IT lui ferait perdre exactement ce qu'il a déjà ;
* il est DÉCLARÉ, jamais déduit. Tous les espaces qui n'ont pas répondu gardent
  le tri historique à l'octet près.
"""

from __future__ import annotations

from app.services.data_sources.france_travail import is_domain_offer
from app.services.domain_job_filters import recruits_for_clients

IT_OFFER = {"intitule": "Ingénieur DevOps", "romeCode": "M1805"}
NON_IT_OFFER = {"intitule": "Directeur Régional F/H", "romeCode": "M1302"}
INDUSTRIAL_OFFER = {"intitule": "Technicien méthodes", "romeCode": "H1404"}


# ── Le drapeau se DÉCLARE ────────────────────────────────────────────────────


def test_absent_profile_never_widens() -> None:
    """L'état de tous les espaces existants."""
    assert recruits_for_clients(None) is False
    assert recruits_for_clients({}) is False


def test_only_an_explicit_true_widens() -> None:
    # `False` et absent disent la même chose — « ne change rien » — et c'est la
    # bonne lecture : le contrat n'émet la clé que pour un `true`.
    assert recruits_for_clients({"recruitsForClients": True}) is True
    assert recruits_for_clients({"recruitsForClients": False}) is False
    assert recruits_for_clients({"recruitsForClients": "oui"}) is False


def test_a_recruitment_consulting_domain_does_NOT_widen() -> None:
    """La dérivation qu'on a REFUSÉE.

    « RH, talent, recrutement » est un domaine de CONSEIL : le vendre ne veut
    pas dire qu'on place des gens. En tirer l'élargissement ferait exploser le
    signal d'un vendeur de SIRH qui n'a rien demandé — et ne changerait rien
    pour l'ESN informatique qui place réellement, dont tous les domaines sont
    IT. Une dérivation qui se trompe dans les deux sens n'est pas une
    dérivation.
    """
    assert recruits_for_clients({"offerPortfolio": ["HR_TALENT_LEARNING"]}) is False


# ── Ce que l'élargissement change, et ce qu'il ne change pas ─────────────────


def test_historical_it_sort_is_untouched_without_the_flag() -> None:
    assert is_domain_offer(IT_OFFER) is True
    assert is_domain_offer(NON_IT_OFFER) is False


def test_a_placer_keeps_its_IT_offers_AND_gains_the_others() -> None:
    # C'est tout l'enjeu : un « pack recrutement » qui remplacerait le tri IT
    # lui ferait PERDRE les offres IT, l'inverse de ce qu'il demande.
    assert is_domain_offer(IT_OFFER, all_roles=True) is True
    assert is_domain_offer(NON_IT_OFFER, all_roles=True) is True


def test_the_axis_composes_with_a_domain_pack_instead_of_replacing_it() -> None:
    # Un vendeur industriel SANS placement garde son tri métier…
    assert is_domain_offer(INDUSTRIAL_OFFER, pack="industrial_engineering") is True
    assert is_domain_offer(NON_IT_OFFER, pack="industrial_engineering") is False
    # …et avec placement, il prend tout, sans perdre son domaine.
    assert is_domain_offer(INDUSTRIAL_OFFER, pack="industrial_engineering", all_roles=True) is True
    assert is_domain_offer(NON_IT_OFFER, pack="industrial_engineering", all_roles=True) is True
