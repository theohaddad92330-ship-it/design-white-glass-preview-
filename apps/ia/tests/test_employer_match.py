"""#3901 — une offre n'est rattachée à un compte que si l'EMPLOYEUR correspond."""

import pytest

from app.services.data_sources.employer_match import named_in_text, same_employer


@pytest.mark.parametrize(
    ("employer", "company"),
    [
        ("Still", "Still"),
        ("STILL SAS", "Still"),
        ("Still France", "Still"),
        ("Still", "Still France"),
        ("Société Générale", "Societe Generale"),
        ("Groupe Décathlon", "Decathlon"),
        ("Decathlon", "Groupe Decathlon"),
        ("Capgemini International", "Capgemini"),
        ("Jean-Luc & Fils S.A.R.L.", "jean luc fils"),
        ("Mairie de Still", "Mairie de Still"),
        ("Commune de Still", "Commune de Still"),
        ("Mobimeo GmbH", "Mobimeo"),  # #3915.a — forme étrangère d'un ATS
        ("Airbus SE", "Airbus"),
    ],
)
def test_same_employer_accepts(employer: str, company: str) -> None:
    assert same_employer(employer, company) is True


@pytest.mark.parametrize(
    ("employer", "company"),
    [
        ("Mairie de Still", "Still"),
        ("Ville de Still", "Still"),
        ("Commune de Still", "Still SAS"),
        ("Communauté de communes de Still", "Still"),
        ("CCAS de Still", "Still"),
        ("Conseil départemental du Bas-Rhin", "Bas-Rhin"),
        ("Syndicat intercommunal Still", "Still"),
        ("Ville de Still", "Mairie de Still"),
        ("Still Logistique Services", "Still"),  # reste non générique
        ("Capgemini", "Cap"),  # pas une frontière de mot
        ("Orange Business", "Orange"),
        ("", "Still"),
        (None, "Still"),
        ("Still", ""),
        ("Groupe", "Groupe France"),  # rien de significatif
    ],
)
def test_same_employer_rejects(employer: str | None, company: str) -> None:
    assert same_employer(employer, company) is False


def test_siren_prevails_over_name() -> None:
    assert same_employer("Mairie de Still", "Still", employer_siren="12345678900011", company_siren="123456789")
    assert not same_employer("Still", "Still", employer_siren="987654321", company_siren="123456789")


def test_siren_ignored_when_one_side_unknown() -> None:
    assert same_employer("Still", "Still", employer_siren=None, company_siren="123456789")
    assert not same_employer("Mairie de Still", "Still", employer_siren="abc", company_siren="123456789")


# #3915.a — la presse rattache par le MÊME contrôle : le nom propre qui contient le
# nom du compte doit être ce compte (same_employer), jamais une entité plus longue.
@pytest.mark.parametrize(
    ("text", "company"),
    [
        ("Renault lève 2 milliards", "Renault"),
        ("Groupe Renault : nouveau DSI", "Renault"),
        ("Jean Dupont rejoint Sopra Steria", "Sopra Steria Group"),
        ("Acme Logiciels Group rachète Beta", "Acme Logiciels"),
        ("Il s'agit d'Acme Logiciels, basé à Lyon", "Acme Logiciels SAS"),
        ("Renault et Nissan signent un accord", "Renault"),
    ],
)
def test_named_in_text_accepts(text: str, company: str) -> None:
    assert named_in_text(text, company) is True


@pytest.mark.parametrize(
    ("text", "company"),
    [
        ("Renault Trucks recrute 300 personnes", "Renault"),  # #3915.b — homonyme plus long
        ("Orange Business lance une offre cloud", "Orange"),
        ("Superacme Logiciels lève", "Acme Logiciels"),
        ("Acme lève 3 M€", "Acme Logiciels"),  # nom partiel
        ("", "Renault"),
        ("Renault lève", ""),
    ],
)
def test_named_in_text_rejects(text: str, company: str) -> None:
    assert named_in_text(text, company) is False
