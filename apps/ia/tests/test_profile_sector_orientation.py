"""#2489.3 — le pont libellé PROFIL (onboarding, libre) → codes NAF (Découvrir).

Voir `app/services/profile_sector_orientation.py` pour la raison du pont par
mot partagé plutôt qu'une table figée : les deux vocabulaires sont VOISINS,
jamais égaux terme à terme.
"""

from __future__ import annotations

from app.services.profile_sector_orientation import (
    application_sectors_from_profile_labels,
    profile_sector_naf_prefixes,
)


def test_a_combined_onboarding_label_resolves_to_both_fine_sectors() -> None:
    # « Aéronautique & Défense » (catalogue onboarding) sépare, dans le
    # vocabulaire codé, `aerospace` (« Aéronautique & spatial ») et `defense`
    # (« Défense ») — la table TS le dit explicitement.
    codes = application_sectors_from_profile_labels(["Aéronautique & Défense"])
    assert set(codes) == {"aerospace", "defense"}


def test_an_unmatched_label_resolves_to_nothing() -> None:
    assert application_sectors_from_profile_labels(["Ce secteur n'existe nulle part"]) == []


def test_retail_never_pulls_in_the_power_grid_on_the_word_distribution() -> None:
    # « Retail & Grande distribution » (onboarding) et « Réseaux électriques &
    # distribution » (power_grid_distribution) partagent le mot « distribution »
    # sans rien partager de leur MARCHÉ — un mot-catégorie ne doit pas relier
    # deux secteurs sans rapport.
    codes = application_sectors_from_profile_labels(["Retail & Grande distribution"])
    assert codes == ["retail"]


def test_empty_or_missing_profile_resolves_to_nothing() -> None:
    assert application_sectors_from_profile_labels([]) == []
    assert application_sectors_from_profile_labels(None) == []


def test_naf_prefixes_follow_the_resolved_sectors() -> None:
    prefixes = profile_sector_naf_prefixes({"sectors": ["Aéronautique & Défense"]})
    assert "3030" in prefixes  # aerospace
    assert {"2540", "3040"} <= set(prefixes)  # defense


def test_missing_profile_data_never_orients() -> None:
    assert profile_sector_naf_prefixes({}) == []
    assert profile_sector_naf_prefixes(None) == []
