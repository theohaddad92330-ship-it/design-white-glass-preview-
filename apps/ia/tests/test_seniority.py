"""Séniorité recherchée par une offre d'emploi — #3097 (call bêta Apricot
Labs, 24/09/2026).

> « Cibler des comptes par séniorité recherchée (la boîte cherche des
> juniors, pour tel TJM…). »

Déterministe, sans LLM : le TITRE de l'offre (explicite : « Junior »,
« Senior »…) prime, sinon le niveau d'expérience CHIFFRÉ que la source
affiche (France Travail `experienceLibelle`) tranche par seuil. Silence sur
les deux ⇒ `None`, jamais deviné (doctrine : « non mesuré » ≠ « confirmé »).
"""

from __future__ import annotations

from app.services.seniority import derive_seniority


def test_a_junior_title_is_recognised():
    assert derive_seniority("Développeur Junior", None) == "junior"


def test_a_senior_title_is_recognised():
    assert derive_seniority("Ingénieur Senior Cloud", None) == "senior"


def test_an_internship_title_counts_as_junior():
    assert derive_seniority("Stagiaire Data Analyst", None) == "junior"


def test_experience_required_under_two_years_is_junior():
    assert derive_seniority("Chef de projet IT", "Expérience exigée de 1 An(s)") == "junior"


def test_experience_required_between_two_and_five_years_is_confirme():
    assert derive_seniority("Chef de projet IT", "Expérience exigée de 3 An(s)") == "confirme"


def test_experience_required_over_five_years_is_senior():
    assert derive_seniority("Chef de projet IT", "Expérience exigée de 8 An(s)") == "senior"


def test_no_experience_required_is_junior():
    assert derive_seniority("Chef de projet IT", "Débutant accepté") == "junior"


def test_a_title_word_wins_over_a_conflicting_experience_figure():
    """Le titre EXPLICITE (« Senior ») est la déclaration la plus forte — un
    champ d'expérience générique ne le contredit pas."""
    assert derive_seniority("Ingénieur Senior", "Expérience exigée de 1 An(s)") == "senior"


def test_silence_on_both_fields_is_never_evaluated():
    assert derive_seniority("Chef de projet IT", None) is None
    assert derive_seniority(None, None) is None
