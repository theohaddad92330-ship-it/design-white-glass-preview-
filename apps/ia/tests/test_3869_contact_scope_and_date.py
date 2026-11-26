"""#3869.2 / #3869.4 — recette prod 11/10 : « Tarik » (Head of Procurement Morocco/Tunisia/Libya) proposé pour des
achats IT du groupe, des contacts « Julia » / « Tarik » prénoms seuls, « aucune source datée ». Le pont rend
désormais l'entité, le lieu et la date de vérification de l'emploi ; la description de `get_account_contacts`
dit à Laura d'en juger le périmètre et de dater sa preuve, sans jamais compléter un nom."""

from __future__ import annotations

from app.services.chat_tools import GET_ACCOUNT_CONTACTS_TOOL

DESCRIPTION = str(GET_ACCOUNT_CONTACTS_TOOL["description"])


def test_the_scope_of_a_contact_is_judged_against_the_request() -> None:
    assert "`entity`" in DESCRIPTION and "`place`" in DESCRIPTION
    assert "borné à une zone, un pays ou une entité" in DESCRIPTION
    assert "ne couvre pas le périmètre demandé" in DESCRIPTION


def test_the_verification_date_is_the_dated_proof() -> None:
    assert "`employment_verified_on`" in DESCRIPTION
    # Absente = jamais vérifiée : on le dit, on n'invente pas une date.
    assert "jamais vérifié" in DESCRIPTION


def test_a_first_name_alone_is_said_and_never_completed() -> None:
    assert "prénom seul" in DESCRIPTION
    assert "ne complète JAMAIS un nom" in DESCRIPTION
