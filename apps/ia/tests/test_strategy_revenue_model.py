"""#2645.2 — le modèle de revenu change l'ANGLE d'attaque proposé.

Louis a tranché le 20/09/2026, en QCM : le modèle de revenu change l'angle ET la
cadence. La cadence est tenue par ``test_cadence_parity``. Ce fichier tient
l'angle.

Ce que la garde exige, et qui n'est pas négociable : que la VALEUR change le
texte envoyé au modèle — pas seulement que le champ existe quelque part. C'est
la même discipline que ``test_answer_contract_influences_audit`` : un champ
présent dans le prompt mais dont la valeur ne change rien est un champ recueilli
et jamais lu, le défaut n°1 de ce dépôt.
"""

from __future__ import annotations

from app.prompts.bellum_strategy import build_system_prompt
from app.services.sales_context import revenue_model_block

_PONCTUEL = {"revenueRecurrence": "Essentiellement du one-shot (mission ponctuelle, projet unique)"}
_RECURRENT = {"revenueRecurrence": "Essentiellement du contrat récurrent (régie longue, forfait reconduit)"}
_MIXTE = {"revenueRecurrence": "Un mix de récurrent et de one-shot"}


class TestRevenueModelBlock:
    def test_non_declare_ne_produit_aucun_bloc(self):
        """GA-18/GA-19 — non mesuré n'est pas une valeur : on ne calibre pas
        l'angle sur un modèle de revenu qu'on n'a pas."""
        assert revenue_model_block({}) == ""
        assert revenue_model_block({"revenueRecurrence": "libellé hors catalogue"}) == ""

    def test_ponctuel_ouvre_sur_un_besoin_date(self):
        # Les prompts de ce service sont écrits sans accents (contrainte du
        # fichier, pas une négligence) : la garde lit ce qui est réellement là.
        bloc = revenue_model_block(_PONCTUEL).lower()
        assert "ponctuel" in bloc
        assert "besoin date" in bloc
        assert "livraison" in bloc

    def test_recurrent_ouvre_sur_une_capacite_installee(self):
        bloc = revenue_model_block(_RECURRENT).lower()
        assert "recurrent" in bloc
        assert "duree" in bloc
        assert "livraison" not in bloc

    def test_mixte_ne_tranche_pas_a_la_place_du_commercial(self):
        bloc = revenue_model_block(_MIXTE).lower()
        assert "mixte" in bloc


class TestStrategyPromptCarriesTheRevenueModel:
    """La preuve d'APPELANT : le bloc ne vaut que s'il atteint le prompt."""

    def test_le_prompt_change_avec_la_valeur(self):
        ponctuel = build_system_prompt(_PONCTUEL)
        recurrent = build_system_prompt(_RECURRENT)
        assert ponctuel != recurrent, "deux modèles de revenu opposés produisent le même prompt"
        assert revenue_model_block(_PONCTUEL) in ponctuel
        assert revenue_model_block(_RECURRENT) in recurrent

    def test_un_profil_sans_modele_declare_garde_le_prompt_historique(self):
        """Byte-identité : ce lot n'ajoute RIEN au prompt de qui n'a rien déclaré."""
        sans = build_system_prompt({})
        assert "MODELE DE REVENU" not in sans
