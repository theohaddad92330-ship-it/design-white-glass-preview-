"""DECATHLON 11/10 — le rattachement d'une offre se fait au niveau du GROUPE.

Symptôme (bêta, 11/10/2026) : trois recrutements sur DECATHLON alors qu'Adzuna
en rendait 536. ``same_employer`` rejetait « DECATHLON Logistics & Supply
chain » et « Decathlon Digital » (un mot non générique restait). Ce que ces
tests tiennent :

- une SUBDIVISION nommée du groupe (Digital, Logistics, Supply chain, Retail…)
  est le même employeur ;
- une entité DÉJÀ CONNUE du groupe (filiale, marque, raison sociale, SIREN)
  compte, quel que soit son nom ;
- jamais un homonyme : racine commune + activité différente, racine courte,
  SIREN différent sur un nom identique, collectivité.
"""

from __future__ import annotations

import pytest

from app.services.data_sources.employer_match import EmployerScope, same_group_employer


@pytest.mark.parametrize(
    "employer",
    [
        "DECATHLON",
        "Decathlon SE",
        "DECATHLON Logistics & Supply chain",
        "Decathlon Digital",
        "Decathlon Retail",
        "DECATHLON FRANCE",
        "Groupe Decathlon International",
        "Décathlon Logistique",
        "Decathlon Technology",
    ],
)
def test_group_subdivisions_are_the_same_employer(employer: str) -> None:
    assert same_group_employer(employer, "DECATHLON") is True


@pytest.mark.parametrize(
    ("employer", "company"),
    [
        ("Decathlon Plomberie SARL", "DECATHLON"),  # racine commune, activité autre, inconnue du groupe
        ("Decathlon Immobilier Conseil", "DECATHLON"),
        ("Cap Digital", "Cap"),  # racine courte : homonyme probable
        ("Still Digital", "Still"),  # racine courte (5 lettres)
        ("Orange Business", "Orange"),  # « Business » n'est pas une subdivision
        ("Renault Trucks", "Renault"),  # #3915.b — autre groupe
        ("Still Logistique Services", "Still"),
        ("Digital Decathlon", "DECATHLON"),  # la racine doit OUVRIR le nom
        ("Mairie de Decathlon", "DECATHLON"),
        ("", "DECATHLON"),
        (None, "DECATHLON"),
    ],
)
def test_homonyms_are_never_attached(employer: str | None, company: str) -> None:
    assert same_group_employer(employer, company) is False


def test_siren_of_the_account_attaches_any_name() -> None:
    assert same_group_employer("Oxylane", "DECATHLON", employer_siren="30613890000012", company_siren="306138900")


def test_identical_name_with_another_siren_is_a_homonym() -> None:
    # Nom identique, SIREN différent et inconnu du groupe : homonyme, écarté.
    assert not same_group_employer("Still", "Still", employer_siren="987654321", company_siren="123456789")


def test_subdivision_with_another_siren_is_a_group_entity() -> None:
    # Filiale nommée « Decathlon Digital » : son SIREN n'est pas celui du compte.
    assert same_group_employer(
        "Decathlon Digital", "DECATHLON", employer_siren="111222333", company_siren="306138900"
    )


def test_known_group_entities_attach_by_name_and_by_siren() -> None:
    known = {"names": ("Oxylane Group", "Kipsta"), "sirens": ("500569405",)}
    assert same_group_employer("KIPSTA SAS", "DECATHLON", known_names=known["names"])
    assert same_group_employer("Oxylane", "DECATHLON", known_names=known["names"])
    # SIREN d'une filiale connue : la raison sociale ne porte pas le nom du groupe.
    assert same_group_employer(
        "DECATHLON FRANCE", "DECATHLON", employer_siren="50056940500123", company_siren="306138900",
        known_sirens=known["sirens"],
    )
    # Sans la connaissance du groupe, ce même SIREN différent sur un nom égal est écarté.
    assert not same_group_employer(
        "DECATHLON FRANCE", "DECATHLON", employer_siren="50056940500123", company_siren="306138900"
    )
    assert not same_group_employer("Kipsta", "DECATHLON")


def test_scope_reads_the_registry_profile_of_the_account() -> None:
    from types import SimpleNamespace

    profile = SimpleNamespace(
        siren="306138900",
        legal_name="DECATHLON SE",
        commercial_name="Oxylane",
        subsidiaries=[SimpleNamespace(name="DECATHLON FRANCE", siren="500569405"), SimpleNamespace(name=None, siren=None)],
    )
    scope = EmployerScope.from_registry("DECATHLON", siren=None, profile=profile)
    assert scope.matches("Oxylane")
    assert scope.matches("DECATHLON FRANCE", employer_siren="50056940500123")
    assert scope.matches("Siège", employer_siren="306138900")
    assert not scope.matches("Decathlon Plomberie SARL")
    # Fiche absente ou illisible : seul le nom compte, rien n'est inventé.
    assert EmployerScope.from_registry("DECATHLON", profile=None).fingerprint() == EmployerScope.build("DECATHLON").fingerprint()
    assert not EmployerScope.from_registry("DECATHLON", profile=SimpleNamespace(subsidiaries=3)).matches("Oxylane")


def test_scope_carries_the_group_knowledge() -> None:
    scope = EmployerScope.build(
        "DECATHLON", siren="306138900", known_names=["Kipsta", "", None], known_sirens=["500569405", "x"]
    )
    assert scope.matches("Decathlon Digital")
    assert scope.matches("Kipsta")
    assert scope.matches("DECATHLON FRANCE", employer_siren="500569405")
    assert not scope.matches("Decathlon Plomberie SARL")
    # Empreinte stable (clé de cache), indépendante de l'ordre.
    other = EmployerScope.build("DECATHLON", siren="306138900", known_names=["Kipsta"], known_sirens=["500569405"])
    assert scope.fingerprint() == other.fingerprint()
    assert scope.fingerprint() != EmployerScope.build("DECATHLON").fingerprint()
