"""Le profil commercial de l'ESN (tome 3, D87 : trois profils, pas huit)."""

from __future__ import annotations

from app.services.esn_sales_profile import (
    ESN_SALES_PROFILES,
    PROFILE_DEFAULT_SORT,
    classify_esn_sales_profile,
)


def test_three_profiles_and_no_more() -> None:
    """D87 : huit profils × huit axes = soixante-quatre valeurs calibrées sans
    donnée d'usage. Trois couvrent les trois extrêmes."""
    assert ESN_SALES_PROFILES == ("createur", "specialiste", "etablie")
    assert set(PROFILE_DEFAULT_SORT) == set(ESN_SALES_PROFILES)


def test_a_starting_esn_is_a_creator_and_sees_accessibility_first() -> None:
    assert classify_esn_sales_profile({"size": "1-4"}) == "createur"
    assert PROFILE_DEFAULT_SORT["createur"] == "addressability"


def test_a_named_expertise_wins_over_the_size() -> None:
    """Une ESN de six personnes avec UNE expertise rare est un spécialiste : ce
    qui lui ouvre les portes est son expertise, pas l'accessibilité du compte."""
    assert classify_esn_sales_profile({"size": "1-10", "offers": ["Data & IA"]}) == "specialiste"
    assert PROFILE_DEFAULT_SORT["specialiste"] == "interest"


def test_a_broad_catalogue_is_not_a_specialist() -> None:
    """Ni un spécialiste, ni rangé de force : sans rien qui distingue, on laisse
    le tri par taille répondre. Un profil imposé changerait l'écran d'accueil
    d'ESN déjà servies, sans qu'elles comprennent pourquoi."""
    generalist = {"size": "10-30", "offers": ["Data", "Cloud", "Cyber", "ERP", "QA"]}
    assert classify_esn_sales_profile(generalist) is None


def test_a_large_esn_is_established_whatever_it_sells() -> None:
    assert classify_esn_sales_profile({"size": "80-200", "offers": ["Data"]}) == "etablie"


def test_nothing_to_go_on_returns_nothing() -> None:
    """Un profil deviné trierait l'écran d'accueil sur une hypothèse, et
    l'utilisateur ne saurait pas pourquoi."""
    assert classify_esn_sales_profile({}) is None
    assert classify_esn_sales_profile(None) is None
    assert classify_esn_sales_profile({"size": "je ne sais pas"}) is None
