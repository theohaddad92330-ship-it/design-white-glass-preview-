"""#4469 (famille) — recette prod 23/10 : `/discover?keywords=java` proposait DASSAULT AVIATION avec « Aucun signal ne
mentionne java ». La lecture souple d'une offre acceptait le PRÉFIXE d'une autre compétence du référentiel
(« java » → « JavaScript »), alors que la carte, elle, lit des mots entiers. Une compétence du référentiel ne se lit
que comme elle-même (mot entier, alias déclaré, ou suffixe de version/édition) — jamais comme une AUTRE compétence."""

from __future__ import annotations

import pytest

from app.services.discover_skill_offers import _mentions


@pytest.mark.parametrize(
    "text",
    [
        "Développeur JavaScript senior",
        "Ingénieur TypeScript / Node",
        "Ingénieur avionique embarqué",
    ],
)
def test_java_ne_lit_pas_une_autre_competence(text: str) -> None:
    assert _mentions("java", text) is False


@pytest.mark.parametrize(
    "text",
    [
        "Développeur Java 17",
        "Développeur JavaEE confirmé",
        "Ingénieur Java/Spring",
        "Développeur JavaScript, Java",
    ],
)
def test_java_se_lit_comme_lui_meme(text: str) -> None:
    assert _mentions("java", text) is True


def test_react_garde_ses_ecritures_collees() -> None:
    assert _mentions("react", "Développeur ReactJS") is True
    assert _mentions("react", "Dev front React.js") is True


def test_une_saisie_hors_referentiel_reste_souple() -> None:
    assert _mentions("archi cyber", "Architecte cybersécurité") is True
