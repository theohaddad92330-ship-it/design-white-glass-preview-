"""Archétype par code NAF officiel (p5) + les 5 routines de la table p23.

Deux trous fermés.

1. L'archétype se dérivait du LIBELLÉ de secteur en texte libre. « Groupe X » ne
   dit rien ; la division NAF 64 dit « activités des services financiers ». Le
   code officiel, déclaré à l'INSEE, est un signal plus fort — il doit primer.

2. p23 nomme CINQ routines, le code en implémentait trois. Les deux manquantes
   ne se déduisent pas d'un effectif : « fondateur + alternant » est un binôme à
   rôles ASYMÉTRIQUES (on n'assigne pas le closing à l'alternant) et
   « account team » est pluridisciplinaire (sales + recruteur + delivery +
   consultant capteur). Les traiter comme « une équipe de 2 » ou « une équipe de
   5 » produit un plan que personne n'exécute comme écrit.
"""

from __future__ import annotations

import pytest

from app.services.sales_context import (
    SALES_STRUCTURES,
    classify_account_archetype,
    classify_sales_structure,
)
from app.services.team_routines import ROUTINES, routine_for_structure


class TestArchetypeParNaf:
    @pytest.mark.parametrize(
        ("naf", "attendu"),
        [
            ("6419Z", "banque_assurance"),  # autres intermédiations monétaires
            ("6511Z", "banque_assurance"),  # assurance vie
            ("8411Z", "public"),            # administration publique générale
            ("2910Z", "industrie"),         # construction de véhicules
            ("3511Z", "industrie"),         # production d'électricité
            ("4941A", "industrie"),         # transport routier de fret
            ("4711D", "luxe_retail_media"), # supermarchés
            ("5911C", "luxe_retail_media"), # production de films
            ("6020A", "luxe_retail_media"), # édition de chaînes généralistes
        ],
    )
    def test_la_division_naf_tranche_l_archetype(self, naf: str, attendu: str) -> None:
        archetype, derivation, confidence, evidence = classify_account_archetype(
            None, naf_code=naf
        )

        assert archetype == attendu
        assert derivation == "inferred"
        assert evidence and naf in evidence[0]

    def test_le_naf_prime_sur_un_libelle_trompeur(self) -> None:
        """Le cas qui motive le chantier : un libellé marketing (« scale-up de la
        finance ») ne doit pas l'emporter sur le code officiel du registre."""
        archetype, _, _, _ = classify_account_archetype(
            "scale-up de la finance", naf_code="6419Z"
        )

        assert archetype == "banque_assurance"

    def test_le_naf_est_plus_confiant_que_le_libelle(self) -> None:
        _, _, conf_naf, _ = classify_account_archetype(None, naf_code="6419Z")
        _, _, conf_texte, _ = classify_account_archetype("banque de détail")

        assert conf_naf > conf_texte

    def test_la_confiance_ne_peut_pas_atteindre_cent(self) -> None:
        """Invariant du contrat : 100 est réservé à une assertion de
        l'utilisateur. Une inférence, même officielle, plafonne."""
        _, derivation, confidence, _ = classify_account_archetype(None, naf_code="8411Z")

        assert derivation == "inferred"
        assert confidence <= 99

    @pytest.mark.parametrize("naf", [None, "", "  ", "62", "6201Z", "inconnu", "ZZ"])
    def test_un_naf_absent_ou_non_tranchant_ne_conclut_rien(self, naf: str | None) -> None:
        """SÛRETÉ : une division absente de la table (dont 62 = l'informatique,
        qui ne désigne aucun archétype p5) laisse la dérivation textuelle
        historique décider. On ne force jamais un archétype par défaut."""
        sans_naf, _, _, _ = classify_account_archetype("services numériques")
        avec_naf, _, _, _ = classify_account_archetype("services numériques", naf_code=naf)

        assert avec_naf == sans_naf


class TestLesCinqRoutinesP23:
    def test_les_cinq_lignes_de_la_table_existent(self) -> None:
        assert set(ROUTINES) == {
            "founder_solo",
            "founder_alternant",
            "duo_trio",
            "equipe",
            "account_team",
        }
        assert set(ROUTINES) | {"inconnu"} == set(SALES_STRUCTURES)

    @pytest.mark.parametrize(
        ("reponse", "attendu"),
        [
            ("je vends seul", "founder_solo"),
            ("fondateur + 1 alternant", "founder_alternant"),
            ("moi et un apprenti", "founder_alternant"),
            ("3", "duo_trio"),
            ("8 commerciaux", "equipe"),
            ("une account team dédiée", "account_team"),
        ],
    )
    def test_la_reponse_du_questionnaire_donne_la_routine(
        self, reponse: str, attendu: str
    ) -> None:
        assert classify_sales_structure(reponse) == attendu

    def test_le_binome_alternant_n_est_pas_un_duo_symetrique(self) -> None:
        """Le point du chantier : la routine doit dire QUI fait quoi, pas
        « l'équipe ». Le closing ne s'assigne pas à un alternant."""
        routine = routine_for_structure("founder_alternant")

        assert routine is not None
        assert "closing" in routine["focus"]
        assert routine["owner"] != ROUTINES["duo_trio"]["owner"]

    def test_l_account_team_nomme_ses_quatre_fonctions(self) -> None:
        routine = routine_for_structure("account_team")

        assert routine is not None
        for fonction in ("sales", "recruteur", "delivery", "consultant capteur"):
            assert fonction in routine["owner"] or fonction in routine["label"]

    def test_toutes_les_routines_respectent_le_moteur_3_a_5(self) -> None:
        """p28 : « 3 à 5 actions, jamais 20 en vrac ». Aucune routine ne peut
        sortir de la fourchette, y compris les deux nouvelles."""
        for structure, routine in ROUTINES.items():
            assert 3 <= routine["action_cap"] <= 5, structure

    @pytest.mark.parametrize("reponse", [None, "", "pas d'équipe", "je ne sais pas"])
    def test_une_reponse_vide_ne_devine_aucune_routine(self, reponse: str | None) -> None:
        assert classify_sales_structure(reponse) == "inconnu"
        assert routine_for_structure("inconnu") is None
