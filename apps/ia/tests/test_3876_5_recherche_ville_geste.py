"""#3876.5 (lot Q02, recette prod 09/10 soir) — « ESN à Marseille » rendait une réponse
texte, sans la carte « ville de Marseille » ni le lien vers Découvrir promis par le lot M13.
La demande de NOUVELLES entreprises dans une ville nommée se reconnaît, et la consigne du tour
nomme l'appel `find_accounts` avec `city` (le clic ouvre Découvrir, champ « Ville »).
"""

from __future__ import annotations

import pytest

from app.services.account_read_first import (
    city_company_search_city,
    city_company_search_note,
)


@pytest.mark.parametrize(
    ("message", "city"),
    [
        ("ESN à Marseille", "Marseille"),
        ("Trouve-moi des ESN à Marseille", "Marseille"),
        ("des entreprises de services numériques à Aix-en-Provence", "Aix-en-Provence"),
        ("cherche des PME près de Montpellier", "Montpellier"),
        ("Quelles ESN sur Lyon ?", "Lyon"),
    ],
)
def test_a_new_company_search_in_a_named_city_is_recognised(message: str, city: str) -> None:
    assert city_company_search_city(message) == city


@pytest.mark.parametrize(
    "message",
    [
        "Que fait l'ESN Sopra à Marseille ?",  # un compte nommé : autre geste
        "Mes comptes à Marseille",  # l'espace, pas Découvrir
        "Priorise mes ESN à Marseille",
        "Je suis ESN",
        "ESN à la semaine",
        "",
    ],
)
def test_other_phrasings_are_not_recognised(message: str) -> None:
    assert city_company_search_city(message) is None


def test_the_note_names_the_tool_and_the_city() -> None:
    note = city_company_search_note("Marseille")
    assert "find_accounts" in note and "Marseille" in note and "city" in note
