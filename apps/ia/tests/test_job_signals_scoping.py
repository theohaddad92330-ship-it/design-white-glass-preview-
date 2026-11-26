"""Un recrutement affiché sous le nom d'un compte doit être CELUI de ce compte.

La recherche d'offres cadres se fait en mots-clés plein texte : « SNCF » remonte
aussi les offres d'une ESN qui staffe pour la SNCF, d'un cabinet de recrutement,
ou d'un hôpital voisin d'une gare. Sur le run réel du 11/08/2026, le dossier SNCF
affichait comme « recrutements du compte » des postes ouverts par KLANIK,
Hellowork, EURAILTEST et un CHU.

Un commercial lit ça comme un signal du compte : il prépare une accroche sur un
recrutement qui n'existe pas chez son prospect. Les cas ci-dessous sont les
lignes RÉELLES de ce run.
"""

from __future__ import annotations

import pytest

from app.services.data_sources.apec import _mentions_company
from app.services.data_sources.france_travail import _mentions_company as _ft_mentions_company


class TestCeQuiEstGarde:
    def test_l_employeur_porte_le_nom_du_compte(self):
        offer = {"nomCommercial": "SNCF", "intitule": "Conseiller Prévention"}
        assert _mentions_company(offer, "SNCF") is True

    def test_3901_l_intitule_ne_prouve_plus_l_employeur(self):
        # #3901 — le nom du compte dans le titre n'est pas l'employeur : un
        # employeur absent est ÉCARTÉ (jamais de donnée non attribuée).
        offer = {"nomCommercial": None, "intitule": "SNCF - Data Analyst Santé Sécurité au Travail (H/F)"}
        assert _mentions_company(offer, "SNCF") is False

    def test_3901_une_filiale_ou_une_collectivite_homonyme_est_ecartee(self):
        assert _mentions_company({"nomCommercial": "Thales SIX GTS France S.A.S.", "intitule": "x"}, "Thales") is False
        assert _mentions_company({"nomCommercial": "Mairie de Still", "intitule": "Directeur périscolaire"}, "Still") is False

    def test_les_accents_et_la_casse_ne_font_pas_perdre_une_offre(self):
        offer = {"nomCommercial": "SOCIÉTÉ GÉNÉRALE", "intitule": "Ingénieur"}
        assert _mentions_company(offer, "société générale") is True

    def test_3817_un_suffixe_pays_du_compte_n_efface_pas_la_marque_publiee(self):
        # #3817.1 — JCDecaux France : la raison sociale porte le suffixe, les
        # offres publiées ne nomment que la marque. Le nom complet n'est
        # substring d'aucun champ ; la forme réduite doit rattraper l'offre.
        offer = {"nomCommercial": "JCDecaux", "intitule": "Technicien de maintenance informatique"}
        assert _mentions_company(offer, "JCDecaux France") is True


class TestCeQuiEstEcarte:
    @pytest.mark.parametrize(
        "employer,title",
        [
            ("KLANIK", "Release Train Engineer (H/F)"),
            ("Hellowork", "Automaticien ou Automaticienne Tergnier F/H"),
            ("EURAILTEST", "INGENIEUR D'AFFAIRES F/H"),
            ("HOTEL DIEU SAINT JACQUES", "Architecte applicatif SIH F/H"),
            ("C-WAYS", "DATA ENGINEER F/H"),
        ],
    )
    def test_les_offres_d_un_tiers_du_run_reel_sont_ecartees(self, employer, title):
        assert _mentions_company({"nomCommercial": employer, "intitule": title}, "SNCF") is False

    def test_une_offre_inattribuable_est_ecartee_plutot_que_gardee(self):
        # Le choix assumé : un onglet plus court vaut mieux qu'un signal faux.
        assert _mentions_company({"nomCommercial": None, "intitule": "Développeur Java"}, "SNCF") is False

    def test_un_nom_de_compte_vide_n_attribue_rien(self):
        assert _mentions_company({"nomCommercial": "SNCF", "intitule": "x"}, "") is False

    # #3901 — call bêta 08/10/2026 : « c'est une mairie, c'est une ville » pour
    # l'entreprise industrielle « Still ». Le sous-chaîne seul ne départage PAS
    # ce cas : « still » est une sous-chaîne vraie de « mairie de still ».
    def test_un_homonyme_commune_n_est_jamais_attribue_a_l_entreprise(self):
        offer = {"nomCommercial": "Mairie de Still", "intitule": "Directeur périscolaire"}
        assert _mentions_company(offer, "Still") is False

    def test_la_vraie_entreprise_homonyme_de_la_commune_reste_gardee(self):
        offer = {"nomCommercial": "STILL SAS", "intitule": "Technicien SAV chariots élévateurs"}
        assert _mentions_company(offer, "Still") is True

    def test_rechercher_litteralement_une_administration_la_garde(self):
        # Le filet n'écarte l'administration QUE si elle n'est pas elle-même la
        # cible cherchée — un commercial peut légitimement suivre une mairie.
        offer = {"nomCommercial": "Mairie de Still", "intitule": "Directeur périscolaire"}
        assert _mentions_company(offer, "Mairie de Still") is True


# #3901 — France Travail n'avait AUCUN filtre employeur (contrairement à APEC,
# qui refiltrait déjà, imparfaitement). Même doctrine, même cas réel.
class TestFranceTravailMemeFiletQueApec:
    def test_un_homonyme_commune_n_est_jamais_attribue_a_l_entreprise(self):
        offer = {"entreprise": {"nom": "Mairie de Still"}, "intitule": "Directeur périscolaire"}
        assert _ft_mentions_company(offer, "Still") is False

    def test_la_vraie_entreprise_homonyme_de_la_commune_reste_gardee(self):
        offer = {"entreprise": {"nom": "STILL SAS"}, "intitule": "Technicien SAV chariots élévateurs"}
        assert _ft_mentions_company(offer, "Still") is True

    def test_une_offre_sans_employeur_connu_est_ecartee_plutot_que_gardee(self):
        # Même choix assumé qu'APEC : un onglet plus court vaut mieux qu'un
        # signal faux. France Travail n'avait, avant ce lot, AUCUN filet — un
        # recrutement d'un tiers sans rapport remontait tel quel.
        offer = {"entreprise": None, "intitule": "Développeur Java"}
        assert _ft_mentions_company(offer, "Still") is False

    def test_l_intitule_porte_le_nom_quand_l_employeur_est_absent(self):
        offer = {"entreprise": None, "intitule": "STILL - Technicien SAV (H/F)"}
        assert _ft_mentions_company(offer, "Still") is True
