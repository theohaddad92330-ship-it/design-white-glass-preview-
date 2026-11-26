"""#3213 (LAU-FINAL-219, #219.2/#219.5) — le vocabulaire de la relation
PERSONNE ↔ ENTREPRISE, et la garde qui l'accompagne : sans preuve déclarée,
la relation reste `unknown_relationship`, jamais devinée depuis un simple
historique d'emploi (Apollo ne dit pas salarié vs consultant)."""

from __future__ import annotations

from app.services.person_company_relation import (
    PERSON_COMPANY_RELATION_VALUES,
    PersonCompanyRelation,
    classify_person_company_relation,
)


def test_default_without_declared_signal_is_unknown():
    assert classify_person_company_relation() is PersonCompanyRelation.UNKNOWN_RELATIONSHIP


def test_declared_relation_is_honored_case_and_space_insensitively():
    assert (
        classify_person_company_relation(declared_relation="  Employee_Current ")
        is PersonCompanyRelation.EMPLOYEE_CURRENT
    )


def test_unrecognised_declared_relation_falls_back_to_unknown_rather_than_guessing():
    # « ceo » ressemble à un rôle mais n'est pas une valeur du vocabulaire —
    # jamais rapproché par ressemblance (doctrine : jamais de donnée inventée).
    assert classify_person_company_relation(declared_relation="ceo") is PersonCompanyRelation.UNKNOWN_RELATIONSHIP


def test_blank_declared_relation_is_treated_as_absent():
    assert classify_person_company_relation(declared_relation="   ") is PersonCompanyRelation.UNKNOWN_RELATIONSHIP


def test_the_thirteen_values_of_the_issue_are_all_named_once():
    expected = {
        "employee_current",
        "employee_former",
        "contractor_current",
        "contractor_historical",
        "freelancer",
        "manager",
        "buyer",
        "technical_reviewer",
        "sponsor",
        "user",
        "recruiter",
        "consultant_presented",
        "unknown_relationship",
    }
    assert set(PERSON_COMPANY_RELATION_VALUES) == expected
    assert len(PERSON_COMPANY_RELATION_VALUES) == 13
