"""#4182 (EX-12) — de l'offre RH à l'équipe métier demandeuse, avec preuve."""

from __future__ import annotations

import json

from app.services.job_context import derive_reporting_line, derive_team
from app.services.offer_requester import (
    AUTHOR_AGENCY,
    AUTHOR_HR,
    AUTHOR_UNSPECIFIED,
    METHOD_ASK_FIRST_CONTACT,
    METHOD_FIND_FUNCTION,
    METHOD_HR_NAMES_AUTHOR,
    METHOD_READ_OFFER,
    STATUS_SUPPORTED,
    STATUS_TO_IDENTIFY,
    derive_offer_requester,
    is_hr_function,
)


def _requester(detail: str, *, site_city: str | None = "Lyon", intermediated: bool = False) -> dict:
    return derive_offer_requester(
        "Ingénieur Java",
        detail,
        team=derive_team(detail),
        reports_to=derive_reporting_line(detail),
        site_city=site_city,
        job_family="developpement",
        intermediated=intermediated,
    )


def test_a_stated_reporting_line_becomes_a_supported_possible_manager() -> None:
    r = _requester("Rattaché au Directeur Technique, au sein de l'équipe Plateforme Data.")
    assert r["status"] == STATUS_SUPPORTED
    assert r["possibleManager"] == {"function": "directeur technique", "entity": "Lyon", "evidence": "texte_de_l_offre"}
    assert r["team"] == "plateforme data"
    assert "method" not in r


def test_an_hr_reporting_line_names_the_author_never_the_manager() -> None:
    """« rattaché à la DRH » nomme l'auteur de l'annonce : jamais proposé comme demandeur."""
    r = _requester("Poste rattaché à la Direction des Ressources Humaines.")
    assert is_hr_function(derive_reporting_line("Poste rattaché à la Direction des Ressources Humaines."))
    assert r["possibleManager"] is None
    assert r["status"] == STATUS_TO_IDENTIFY
    assert METHOD_HR_NAMES_AUTHOR in r["method"]


def test_nothing_stated_stays_a_role_to_identify_with_a_method_never_a_person() -> None:
    r = _requester("Nous recherchons un développeur Java confirmé.")
    assert r["status"] == STATUS_TO_IDENTIFY
    assert r["possibleManager"] is None and r["team"] is None
    assert r["method"] == [METHOD_READ_OFFER, METHOD_FIND_FUNCTION, METHOD_ASK_FIRST_CONTACT]
    assert r["scope"] == {"city": "Lyon"}  # l'entité visée, pas le groupe
    # Aucune personne, aucun fournisseur dans le dossier.
    dumped = json.dumps(r, ensure_ascii=False)
    for forbidden in ("LinkedIn", "Apollo", "France Travail"):
        assert forbidden not in dumped


def test_the_author_of_the_ad_is_distinct_from_the_manager() -> None:
    hr = _requester("Offre diffusée par notre service recrutement. Rattaché au Directeur Technique.")
    assert hr["author"]["kind"] == AUTHOR_HR
    assert hr["possibleManager"]["function"] == "directeur technique"
    assert _requester("Poste Java à pourvoir.")["author"] == {"kind": AUTHOR_UNSPECIFIED, "evidence": None}
    assert _requester("Poste Java.", intermediated=True)["author"]["kind"] == AUTHOR_AGENCY
    assert _requester("Cabinet de recrutement, pour le compte de notre client.")["author"]["kind"] == AUTHOR_AGENCY


def test_an_hr_ad_is_never_an_open_freelance_mission() -> None:
    for detail in ("CDI Java", "Mission freelance Java en régie", "Rattaché au CTO"):
        assert _requester(detail)["openFreelanceMission"] is False


def test_the_entity_is_the_offer_site_never_the_group() -> None:
    assert _requester("Rattaché au CTO.", site_city="Marseille")["scope"] == {"city": "Marseille"}
    assert _requester("Rattaché au CTO.", site_city=None)["scope"] == {"city": None}
    assert _requester("Rattaché au CTO.", site_city=None)["possibleManager"]["entity"] is None
