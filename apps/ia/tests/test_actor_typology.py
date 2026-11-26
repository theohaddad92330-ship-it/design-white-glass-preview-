"""#2265.1 / #2265.3 — LA TYPOLOGIE DES ACTEURS, au moins 24 types nommés.

Le chapitre (LAU-FINAL-009) demande une typologie unifiée « ESN, cabinet
recrutement, marketplace, MSP/VMS… » — la liste EXACTE du document source
n'est pas dans le dépôt (même situation que `PROOF_CHANNELS`/
`PROOF_CONTENT_TYPES`, #2424.4/.6) : tranché sans Louis (doctrine §3c), les
noms ci-dessous sont les plus cités du domaine ESN/staffing, à corriger si
Louis en tient une liste différente.

Ce test vérifie deux choses séparément, comme le reste du dépôt distingue le
NOMMÉ du PROUVÉ (`copilote_scenario_metadata.py`) :

1. la typologie NOMME au moins 24 types (l'énoncé du ticket) ;
2. le CLASSIFIEUR ne détermine que ce que deux signaux RÉELS et déjà éprouvés
   ailleurs permettent (`esn_naf.py`, `intermediation.py`) — jamais un type
   deviné. Un acteur sans signal reste `NON_CLASSE`, jamais rangé au hasard.
"""

from __future__ import annotations

import pytest

from app.services.actor_typology import ActorType, classify_actor_type


def test_the_typology_names_at_least_24_actor_types() -> None:
    assert len(list(ActorType)) >= 24, f"seulement {len(list(ActorType))} types nommés"
    # Les types que le ticket cite nommément.
    named = {member.name for member in ActorType}
    for expected in ("ESN", "CABINET_RECRUTEMENT", "PLATEFORME_INTERMEDIATION", "MSP", "VMS", "NON_CLASSE"):
        assert expected in named, f"le ticket nomme « {expected} », absent de la typologie"


def test_every_actor_type_is_a_non_empty_label() -> None:
    for member in ActorType:
        assert member.value.strip(), f"{member.name} porte un libellé vide"


@pytest.mark.parametrize(
    ("naf", "name", "expected"),
    [
        # Une ESN au NAF cœur de cible.
        ("6202A", "CAPGEMINI", ActorType.ESN),
        # Un client final : NAF hors des préfixes ESN.
        ("2313Z", "USINE SA", ActorType.CLIENT_FINAL),
        # Un cabinet de recrutement — NAF prouvé, prioritaire sur tout le reste.
        ("78.10Z", "UN CABINET QUELCONQUE", ActorType.CABINET_RECRUTEMENT),
        # Un cabinet reconnu par le NOM seul (pas de NAF résolu).
        (None, "Michael Page France", ActorType.CABINET_RECRUTEMENT),
        # Une plateforme de mise en relation, reconnue par le nom.
        (None, "Collective.work", ActorType.PLATEFORME_INTERMEDIATION),
        # Une entreprise de travail temporaire : NAF nommément exclu de
        # l'intermédiation (intermediation.py) car c'est un besoin RÉEL.
        ("78.20Z", "ADECCO FRANCE", ActorType.ENTREPRISE_INTERIM),
        # Un NAF ambigu (cabinet de conseil OU ESN) sans autre preuve.
        ("7022Z", "CONSEIL & CO", ActorType.AMBIGU_CONSEIL_OU_ESN),
        # Aucun NAF, aucun nom reconnu : jamais deviné.
        (None, "ENTREPRISE INCONNUE SARL", ActorType.NON_CLASSE),
        (None, None, ActorType.NON_CLASSE),
    ],
)
def test_classify_actor_type_uses_only_proven_signals(naf, name, expected) -> None:
    assert classify_actor_type(naf=naf, name=name) is expected


def test_a_known_esn_competitor_is_named_distinctly_when_the_caller_says_so() -> None:
    """`is_known_esn_competitor` est un signal DÉJÀ résolu par l'appelant
    (`esn_name_match.py`, référentiel de 477 noms) — ce module ne le recalcule
    jamais, il le reçoit."""
    assert classify_actor_type(naf="6202A", name="SOPRA STERIA", is_known_esn_competitor=True) is (
        ActorType.ESN_CONCURRENTE
    )
    # Sans le signal, une ESN reste une ESN générique — jamais promue concurrente
    # sur une simple ressemblance de nom.
    assert classify_actor_type(naf="6202A", name="SOPRA STERIA") is ActorType.ESN


def test_a_cabinet_or_platform_proof_wins_over_the_esn_competitor_flag() -> None:
    """Un NAF de cabinet prouvé ne doit jamais être écrasé par un flag externe :
    l'ordre des preuves est celui du module, pas celui de l'appelant."""
    assert (
        classify_actor_type(naf="78.10Z", name="UN CABINET", is_known_esn_competitor=True)
        is ActorType.CABINET_RECRUTEMENT
    )


@pytest.mark.parametrize("name", ["Pappers", "PAPPERS SAS", "Dun & Bradstreet France", "Hunter.io", "Société.com"])
def test_a_known_data_provider_is_never_a_prospect_even_with_an_esn_naf(name) -> None:
    """#2265.7 — la preuve par le nom passe AVANT le NAF : un fournisseur de
    données qui porte un NAF de programmation reste une source, pas une ESN."""
    assert classify_actor_type(naf="6202A", name=name) is ActorType.SOURCE_DE_DONNEES
    assert classify_actor_type(naf=None, name=name) is ActorType.SOURCE_DE_DONNEES


@pytest.mark.parametrize("name", ["Hunters Conseil", "Apollo Consulting", "Pappersoft", "", None])
def test_the_data_source_proof_says_no_on_a_lookalike_or_an_empty_name(name) -> None:
    """La garde sait dire NON : frontière de mot, et sans nom on ne devine pas."""
    assert classify_actor_type(naf="6202A", name=name) is not ActorType.SOURCE_DE_DONNEES


def test_a_declared_partner_is_named_partner_only_when_the_caller_says_so() -> None:
    """#2265.5 — le partenaire est un FAIT DÉCLARÉ de l'espace, résolu par
    l'appelant. Sans lui, la même ESN reste une ESN ; avec lui, elle prime sur
    le NAF — et la source de données reste devant."""
    assert classify_actor_type(naf="6202A", name="ALTEN") is ActorType.ESN
    assert classify_actor_type(naf="6202A", name="ALTEN", is_declared_partner=True) is ActorType.PARTENAIRE
    assert classify_actor_type(naf=None, name="Kompass", is_declared_partner=True) is ActorType.SOURCE_DE_DONNEES


# #4746.1 / #4814.1 (lot P) — recette prod 01/11 : FRANCE TRAVAIL (organisme public de l'emploi, site d'annonces)
# sortait dans « Comptes ». Un site d'annonces n'est jamais un client final ; « Franc Travail Conseil » (autre mot
# entier) ne matche pas.
@pytest.mark.parametrize("name", ["FRANCE TRAVAIL", "France Travail", "Pôle emploi", "POLE EMPLOI Hauts-de-France"])
def test_employment_agency_is_an_ads_site_not_an_end_client(name: str) -> None:
    from app.services.actor_typology import matches_end_client

    actor = classify_actor_type(name=name)
    assert actor is ActorType.PLATEFORME_INTERMEDIATION
    assert matches_end_client(actor, is_known_esn=False) is False


def test_a_lookalike_name_is_not_taken_for_the_employment_agency() -> None:
    assert classify_actor_type(name="Travail et Territoires") is not ActorType.PLATEFORME_INTERMEDIATION


# #4746.2 (lot P) — « Autres acteurs » : la nature NOMMÉE de ce qui n'est pas un client final, pour les pastilles.
def test_other_actor_kind_names_every_non_end_client() -> None:
    from app.services.actor_typology import other_actor_kind

    assert other_actor_kind(ActorType.ESN, is_known_esn=False) == "esn"
    assert other_actor_kind(ActorType.CABINET_RECRUTEMENT, is_known_esn=False) == "recruiter"
    assert other_actor_kind(ActorType.ENTREPRISE_INTERIM, is_known_esn=False) == "interim"
    assert other_actor_kind(ActorType.PARTENAIRE, is_known_esn=False) == "partner"
    assert other_actor_kind(ActorType.PLATEFORME_INTERMEDIATION, is_known_esn=False) == "adsite"


def test_a_known_esn_name_wins_over_an_unresolved_or_ambiguous_naf() -> None:
    """EXTIA (recette 01/11) : ESN du référentiel, NAF non tranché → « Autres acteurs », pas « Comptes »."""
    from app.services.actor_typology import other_actor_kind

    assert other_actor_kind(ActorType.AMBIGU_CONSEIL_OU_ESN, is_known_esn=True) == "esn"
    assert other_actor_kind(ActorType.NON_CLASSE, is_known_esn=True) == "esn"
    # un site d'annonces reste un site d'annonces même si son nom ressemble à une ESN
    assert other_actor_kind(ActorType.PLATEFORME_INTERMEDIATION, is_known_esn=True) == "adsite"


def test_an_end_client_or_an_unproven_actor_has_no_other_kind() -> None:
    from app.services.actor_typology import other_actor_kind

    assert other_actor_kind(ActorType.CLIENT_FINAL, is_known_esn=False) is None
    assert other_actor_kind(ActorType.NON_CLASSE, is_known_esn=False) is None
    assert other_actor_kind(ActorType.AMBIGU_CONSEIL_OU_ESN, is_known_esn=False) is None
