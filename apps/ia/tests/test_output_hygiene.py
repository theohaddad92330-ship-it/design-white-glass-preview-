"""Le nettoyage des valeurs affichées : étroit par construction.

Deux risques symétriques, et le second est le pire :
 - laisser passer « donnée Pappers "revenue_latest" non disponible » (le défaut) ;
 - manger « (exercice 2023, source Usine Digitale) » (une vraie source citée,
   c'est-à-dire exactement ce que le produit promet).

Chaque test ci-dessous tient l'un des deux bords.
"""

from __future__ import annotations

import pytest

from app.services.output_hygiene import clean_display_value, clean_firmographics


class TestCeQuiEstRetire:
    def test_le_cas_reel_blablacar(self):
        value = (
            "253 millions d'euros (exercice 2023, en hausse de 29% par rapport à 2022, "
            'source Usine Digitale) - donnée Pappers "revenue_latest" non disponible'
        )
        assert clean_display_value(value) == (
            "253 millions d'euros (exercice 2023, en hausse de 29% par rapport à 2022, "
            "source Usine Digitale)"
        )

    def test_un_identifiant_technique_seul_suffit_a_faire_tomber_le_morceau(self):
        # Aucun fournisseur nommé, mais `naf_code` ne peut venir que de chez nous.
        assert clean_display_value("64.19Z - champ naf_code repris tel quel") == "64.19Z"

    def test_un_fournisseur_qui_dit_ne_rien_avoir_tombe_aussi(self):
        assert clean_display_value("1 200 salariés | Apollo ne renseigne pas cette donnée") == "1 200 salariés"

    @pytest.mark.parametrize("separator", [" - ", " – ", " — ", " ; ", " | "])
    def test_tous_les_separateurs_de_commentaire_sont_reconnus(self, separator):
        assert clean_display_value(f"12 M€{separator}donnée Pappers non disponible") == "12 M€"

    def test_quand_il_ne_reste_rien_la_valeur_est_vide(self):
        # VIDE, jamais « N/A » : un marque-place finit toujours par être lu comme
        # une donnée par quelqu'un.
        assert clean_display_value('donnée Pappers "revenue_latest" non disponible') == ""


class TestCeQuiEstPreserve:
    def test_une_source_publique_citee_reste_intacte(self):
        value = "27,3 Md€ (exercice 2024, source rapport annuel)"
        assert clean_display_value(value) == value

    def test_un_nom_de_lieu_a_trait_d_union_n_est_pas_coupe(self):
        # « Saint-Denis » n'est pas un commentaire : le séparateur exige des
        # espaces autour du tiret, sinon on mutile des noms de villes.
        value = "2 place aux Étoiles, 93210 Saint-Denis, Auvergne-Rhône-Alpes"
        assert clean_display_value(value) == value

    def test_une_valeur_composee_legitime_survit(self):
        value = "Entre 1 000 et 1 999 salariés (holding) - environ 83 000 dans le groupe"
        assert clean_display_value(value) == value

    def test_les_sources_publiques_ne_sont_pas_des_fournisseurs_internes(self):
        # INSEE, BODACC, INPI : les nommer est ce que le produit PROMET.
        value = "10 000 salariés et plus (tranche INSEE 2023) - annonce BODACC du 03/07/2026"
        assert clean_display_value(value) == value

    @pytest.mark.parametrize("value", [None, 42, [], {}])
    def test_ce_qui_n_est_pas_une_chaine_rend_une_chaine_vide(self, value):
        assert clean_display_value(value) == ""


class TestChampsFirmographiques:
    def test_seuls_les_champs_de_la_fiche_sont_touches(self):
        result = {
            "revenue": 'X - donnée Pappers "revenue_latest" non disponible',
            "employees": "500 à 999 salariés",
            # Un texte long n'est PAS découpé : y couper des segments sur un tiret
            # ferait plus de dégâts que le défaut réparé.
            "businessDescription": 'A - donnée Pappers "revenue_latest" non disponible',
        }
        cleaned = clean_firmographics(result)
        assert cleaned["revenue"] == "X"
        assert cleaned["employees"] == "500 à 999 salariés"
        assert cleaned["businessDescription"] == 'A - donnée Pappers "revenue_latest" non disponible'

    def test_un_champ_absent_ou_vide_est_laisse_tel_quel(self):
        result = {"revenue": "", "sector": None}
        cleaned = clean_firmographics(result)
        assert cleaned["revenue"] == ""
        assert cleaned["sector"] is None


class TestTrancheEffectifInsee:
    """Un CODE de tranche INSEE n'est pas un effectif.

    `sites_for_siren` écrivait `trancheEffectifsEtablissement` tel quel dans
    `estimated_headcount` : l'onglet Sites affichait « 12 » pour un
    établissement de 20 à 49 personnes. Un chiffre faux, et d'autant plus
    dangereux qu'il ressemble à un effectif plausible.
    """

    def test_le_code_devient_son_libelle_officiel(self):
        from app.services.insee_sirene import headcount_band_label

        assert headcount_band_label("12") == "20 à 49 salariés"
        assert headcount_band_label("53") == "10 000 salariés et plus"
        assert headcount_band_label("00") == "0 salarié"

    def test_un_code_inconnu_ou_absent_ne_rend_rien(self):
        from app.services.insee_sirene import headcount_band_label

        # « NN » (non renseigné) est une réponse : elle s'écrit par l'absence,
        # jamais en recrachant le code.
        for value in ("NN", "", None, "99"):
            assert headcount_band_label(value) == ""


class TestWebsiteIsAHostname:
    """Le champ site d'un compte porte un NOM D'HÔTE, jamais une phrase.

    Trouvé en recette live sur la production : trois comptes portaient de la
    prose dans `website`, et l'écran Comptes partait chercher un logo pour la
    phrase entière — un 404 par chargement. Corrigé côté écran, mais l'écriture
    continuait de produire la valeur.
    """

    def test_rejette_la_prose_vue_en_production(self) -> None:
        from app.services.output_hygiene import clean_firmographics

        for prose in (
            "non identifié explicitement dans les sources fournies (le site officiel blablacar est notoirement blablacar.fr",
            "totalenergies.com (site du groupe totalenergies, identifié dans les sources web)",
            "non identifié dans les sources (page magasin sur e.leclerc mentionnée : https:",
            "Non disponible",
            "à vérifier",
        ):
            assert clean_firmographics({"website": prose})["website"] == ""

    def test_laisse_passer_un_vrai_site(self) -> None:
        from app.services.output_hygiene import clean_firmographics

        for site in (
            "airbus.com",
            "https://www.airbus.com",
            "https://airbus.com/fr/contact",
            "sncf-reseau.com",
            "  AIRBUS.COM  ",
        ):
            assert clean_firmographics({"website": site})["website"] != ""

    def test_un_site_absent_reste_absent(self) -> None:
        from app.services.output_hygiene import clean_firmographics

        assert clean_firmographics({})  == {}
        assert clean_firmographics({"website": None})["website"] is None
