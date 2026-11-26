"""#4401.1 (recette prod 23/10) — /consultants : 6 fiches sur 20 « Nom non renseigné » alors que leur CV porte un nom.
Les formes d'en-tête qui échappaient à `guess_name` : civilité devant le nom (« M. Jean DUPONT » rendait rien,
« Mme Claire Martin » gardait la civilité), nom suivi du poste sur la même ligne (« Jean Dupont – Développeur »),
champs étiquetés (« Nom : Dupont / Prénom : Jean »). Une ligne qui n'est pas un nom reste vide — jamais un nom approché."""

from __future__ import annotations

import pytest

from app.services.cv_identity import guess_name


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("M. Jean DUPONT\nIngénieur", "Jean DUPONT"),
        ("Mme Claire Martin\nConsultante", "Claire Martin"),
        ("Monsieur Paul Durand\nArchitecte", "Paul Durand"),
        ("Jean Dupont - Développeur Java Senior\nParis", "Jean Dupont"),
        ("Jean DUPONT – Chef de projet", "Jean DUPONT"),
        ("Jean Dupont | Architecte cloud", "Jean Dupont"),
        ("Jean Dupont, Ingénieur", "Jean Dupont"),
        ("Nom : Dupont\nPrénom : Jean\nIngénieur", "Jean Dupont"),
        ("Nom et prénom : Jean Dupont\nIngénieur", "Jean Dupont"),
        ("Prénom : Jean\nNom : Dupont", "Jean Dupont"),
        ("Jean Dupont\nIngénieur Java", "Jean Dupont"),
        ("CURRICULUM VITAE\nDUPONT Jean-Luc\n", "DUPONT Jean-Luc"),
    ],
)
def test_le_nom_se_lit_dans_l_en_tete(text: str, expected: str) -> None:
    assert guess_name(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "Ingénieur Java\nParis\n06 12 34 56 78",
        "Développeur Full Stack - Paris",
        "Nom : \nPrénom : ",
        "Compétences\nJava, Spring",
        "M. \nIngénieur",
    ],
)
def test_une_ligne_qui_n_est_pas_un_nom_reste_vide(text: str) -> None:
    assert guess_name(text) is None
