"""Ce que `en-vol.py` doit savoir refuser.

Le défaut qui a coûté le plus cher le 18/09/2026 n'était pas de rater une
livraison en vol : c'était d'en inventer. La première version comptait TOUT
changement d'état entre `main` et une branche — et remontait des vieilles
branches de deux jours dont le registre était plus ancien que `main`
(« recetté → livré »), en proposant de re-livrer des points déjà recettés en
production. Ces tests tiennent les deux sens.
"""
import importlib.util
import pathlib

_spec = importlib.util.spec_from_file_location(
    "en_vol", pathlib.Path(__file__).with_name("en-vol.py")
)
en_vol = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(en_vol)


def test_un_point_ouvert_sur_main_et_livre_sur_la_branche_est_en_vol():
    assert en_vol.livraison_en_vol("retenu", "livré")
    assert en_vol.livraison_en_vol("à trancher", "déjà là")


def test_un_point_neuf_sur_la_branche_est_en_vol():
    # La branche crée la ligne : elle n'existe pas encore sur `main`.
    assert en_vol.livraison_en_vol(None, "livré")


def test_un_registre_de_branche_EN_RETARD_n_est_jamais_une_livraison():
    # Le faux positif réel du 18/09 : `main` dit recetté, la vieille branche
    # dit encore livré. Rien n'est en vol — la branche est en retard.
    assert not en_vol.livraison_en_vol("recetté", "livré")
    assert not en_vol.livraison_en_vol("déjà là", "livré")
    assert not en_vol.livraison_en_vol("recetté", "déjà là")


def test_un_point_qui_reste_ouvert_n_est_pas_une_livraison():
    assert not en_vol.livraison_en_vol("retenu", "retenu")
    assert not en_vol.livraison_en_vol("retenu", "à trancher")


def test_ecarte_n_est_pas_une_livraison_en_vol():
    # Écarter est un ARBITRAGE PRODUIT : il remonte à l'humain, il ne se
    # compte pas comme un point livré par une branche.
    assert not en_vol.livraison_en_vol("retenu", "écarté")


def test_etat_lit_le_numero_et_l_etat_d_une_ligne_de_registre():
    ligne = "| 2566.4 | la demande | api | la mesure | livré | la preuve |"
    assert en_vol.etat(ligne) == ("2566.4", "livré")


def test_etat_ignore_une_ligne_qui_n_est_pas_un_point():
    assert en_vol.etat("| # | demande | sujet | mesure | état | preuve |") is None
    assert en_vol.etat("du texte libre") is None
