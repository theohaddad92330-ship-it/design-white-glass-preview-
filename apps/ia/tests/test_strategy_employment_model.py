"""#3244 (reste de #3186.10) — les 2 dernieres des 4 valeurs de l'axe modele
de staffing (CDI / freelance, apres rang2 et nearshore livres dans
``test_strategy_rank_position.py``). `staffing_model` (choix unique,
`positionnement.ts`) porte DEJA le spectre CDI<->freelance en clair — une
collecte qui EXISTE, jamais lue pour ce sens (elle n'etait lue que pour un
axe orthogonal, le CONTRAT regie/forfait, par `_staffing_model`). Meme
discipline que ``test_strategy_rank_position.py`` : la VALEUR doit changer le
texte envoye au modele, pas seulement exister quelque part.
"""

from __future__ import annotations

from app.prompts.bellum_strategy import build_system_prompt
from app.services.sales_context import employment_model_block

_CDI = {"staffingModel": "Uniquement des CDI internes"}
_CDI_DOMINANT = {"staffingModel": "Principalement CDI + quelques freelances ponctuels"}
_MIXTE = {"staffingModel": "Mix équilibré CDI / Freelances"}
_FREELANCE = {"staffingModel": "Uniquement freelances (pas de CDI)"}
_FREELANCE_DOMINANT = {"staffingModel": "Principalement freelances / sous-traitants"}


class TestEmploymentModelBlock:
    def test_non_declare_ne_produit_aucun_bloc(self):
        # GA-18/GA-19 — non mesure n'est pas une valeur.
        assert employment_model_block({}) == ""

    def test_libelle_hors_catalogue_ne_produit_aucun_bloc(self):
        # Jamais une sous-chaine devinee : seule une correspondance EXACTE
        # au catalogue declenche le bloc.
        assert employment_model_block({"staffingModel": "Un peu des deux, ca depend"}) == ""

    def test_uniquement_cdi_met_en_avant_la_stabilite(self):
        bloc = employment_model_block(_CDI).lower()
        assert "cdi" in bloc
        assert "stabilite" in bloc

    def test_principalement_cdi_est_classe_cdi(self):
        assert employment_model_block(_CDI_DOMINANT) == employment_model_block(_CDI)

    def test_uniquement_freelances_met_en_avant_la_rapidite(self):
        bloc = employment_model_block(_FREELANCE).lower()
        assert "freelance" in bloc
        assert "rapidite" in bloc
        assert "turnover" in bloc

    def test_principalement_freelances_est_classe_freelance(self):
        assert employment_model_block(_FREELANCE_DOMINANT) == employment_model_block(_FREELANCE)

    def test_mixte_ne_tranche_pas_a_la_place_du_commercial(self):
        bloc = employment_model_block(_MIXTE).lower()
        assert "mixte" in bloc

    def test_snake_case_aussi_lu(self):
        bloc = employment_model_block({"staffing_model": "Uniquement des CDI internes"}).lower()
        assert "cdi" in bloc


class TestStrategyPromptCarriesEmploymentModel:
    """La preuve d'APPELANT : le bloc ne vaut que s'il atteint le prompt."""

    def test_le_prompt_change_avec_cdi(self):
        sans = build_system_prompt({})
        cdi = build_system_prompt(_CDI)
        assert sans != cdi, "CDI declare doit changer le prompt"
        assert employment_model_block(_CDI) in cdi

    def test_le_prompt_change_avec_freelance(self):
        sans = build_system_prompt({})
        freelance = build_system_prompt(_FREELANCE)
        assert sans != freelance, "freelance declare doit changer le prompt"
        assert employment_model_block(_FREELANCE) in freelance

    def test_un_profil_sans_axe_declare_garde_le_prompt_historique(self):
        sans = build_system_prompt({})
        assert "===== MODELE D'EMPLOI =====" not in sans
