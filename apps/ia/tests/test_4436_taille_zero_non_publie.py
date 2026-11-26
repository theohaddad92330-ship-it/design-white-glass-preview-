"""#4436.3 — la tranche INSEE « 00 » n'est jamais affichée « 0 salarié ».

Recette prod 22/10 : 6 cartes sur 10 (dont SONACA, un grand groupe) disaient
« 0 salarié ». « 00 » = aucun effectif au 31/12, pas « zéro mesuré » : une
valeur non publiée ne s'affiche jamais 0 (GA-18/19). Le compte reste.
"""

import pytest

from app.routers.discover import _registry_row
from app.services.company_filters import HEADCOUNT_TRANCHE_LABELS, headcount_label
from app.services.insee_sirene import headcount_band_label


def test_tranche_00_n_a_pas_de_libelle():
    # #4436.3 — pas de « 0 salarié » : la carte écrit « taille non publiée ».
    assert headcount_label("00") is None


def test_tranches_publiees_gardent_leur_libelle():
    assert headcount_label("12") == "20 à 49 salariés"
    assert headcount_label("NN") is None
    assert headcount_label(None) is None


def test_tranche_00_reste_un_code_valide_de_filtre():
    # Le code reste connu (validation des filtres) ; seul l'AFFICHAGE change.
    assert "00" in HEADCOUNT_TRANCHE_LABELS


# --- Recette prod 23/10 : SANS département, la recherche secteur nationale passe par d'autres
# sources (registre facturé, identité INSEE, appoint par compétence) dont le libellé arrive DÉJÀ
# écrit (« 0 salarié », « 0 à 0 salariés ») ou en code brut — `headcount_label` n'y était jamais appelé.

@pytest.mark.parametrize(
    "label",
    ["0 salarié", "0 salariés", "0 à 0 salariés", "Entre 0 et 0 salariés", "00", "NN", "Pas de salarié"],
)
def test_registry_row_ne_porte_jamais_un_effectif_nul(label):
    # #4436.3 — chemin national : la ligne reste, l'effectif devient « non publié » (None).
    row = _registry_row({"siren": "552100554", "name": "SONACA", "headcountRange": label})
    assert row is not None
    assert row["headcountRange"] is None


def test_registry_row_traduit_un_code_brut_et_garde_un_libelle_publie():
    assert _registry_row({"siren": "552100554", "name": "A", "headcountRange": "12"})["headcountRange"] == (
        "20 à 49 salariés"
    )
    assert _registry_row({"siren": "552100554", "name": "A", "headcountRange": "1 000 à 1 999 salariés"})[
        "headcountRange"
    ] == "1 000 à 1 999 salariés"


def test_identite_insee_garde_le_libelle_officiel_du_code():
    # Le code « 00 » a son libellé officiel ; le masque d'affichage est dans les sites (appelant).
    assert headcount_band_label("00") == "0 salarié"
    assert headcount_band_label("12") == "20 à 49 salariés"
