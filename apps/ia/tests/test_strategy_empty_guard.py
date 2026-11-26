"""Une sortie stratégique vide doit se DIRE, pas se lire « ce compte n'a rien ».

Tous les champs de `ResearchStrategy` ont un défaut vide. Une réponse que
Pydantic ne mappe sur aucun champ rend donc un objet entièrement par défaut,
sans lever : le dossier se termine « completed » et les onglets Angles / Défis IT
s'ouvrent vides. C'est ce qui est arrivé le 10/08 sur deux runs réels (leboncoin,
BlaBlaCar) — sept sections hétérogènes vides d'un seul coup pendant que faits et
signaux étaient pleins.

Ce que ces tests verrouillent : la détection, la relance unique, et le fait qu'on
ne remplace JAMAIS le vide par du contenu de repli.
"""

from __future__ import annotations

from app.models.outputs.research import ResearchStrategy
from app.routers.phase1_research import _strategy_is_empty, _strategy_warning


class TestDetection:
    def test_une_sortie_entierement_par_defaut_est_vide(self):
        # ⚠️ `ResearchStrategy()` LEVAIT ici avant le 29/08/2026 : le schéma
        # refuse désormais ce que ce filet rattrapait. `empty()` est le seul
        # chemin sanctionné pour fabriquer l'objet vide — celui que le routeur
        # emprunte quand le modèle a échoué jusqu'au bout et que le dossier part
        # quand même.
        assert _strategy_is_empty(ResearchStrategy.empty()) is True

    def test_un_seul_angle_suffit_a_ne_plus_l_etre(self):
        strategy = ResearchStrategy(angles=[{"title": "Renfort build"}])
        assert _strategy_is_empty(strategy) is False

    def test_une_section_de_texte_seule_suffit_aussi(self):
        # Un compte peut légitimement n'avoir aucun angle chiffré tout en ayant
        # une porte d'entrée décrite : ce n'est pas le cas qu'on traque.
        strategy = ResearchStrategy(commentOuvrirCompte="Entrer par la DSI groupe.")
        assert _strategy_is_empty(strategy) is False

    def test_le_script_de_rdv_ne_compte_pas_comme_une_section_remplie(self):
        """`rdvScript` a un OBJET pour défaut, plein de chaînes vides.

        Le compter ferait passer le cas cassé pour normal — c'est exactement
        pourquoi il est exclu de la liste des sections.
        """
        strategy = ResearchStrategy.empty()
        assert strategy.rdv_script is not None
        assert _strategy_is_empty(strategy) is True


class TestAvertissement:
    def test_un_dossier_sans_aucune_section_strategique_porte_l_avertissement(self):
        warnings = _strategy_warning({"sector": "Portails Internet", "angles": [], "itChallenges": []})
        assert len(warnings) == 1
        assert warnings[0].code == "STRATEGY_SECTIONS_EMPTY"
        # Le message doit être lisible par le commercial, pas par nous : il dit
        # ce qui manque et quoi faire, sans nommer un prompt ni un modèle.
        assert "angle" in warnings[0].message
        assert "bellum" not in warnings[0].message.lower()
        assert "prompt" not in warnings[0].message.lower()

    def test_un_dossier_avec_des_angles_n_en_porte_aucun(self):
        assert _strategy_warning({"angles": [{"title": "Renfort build"}]}) == []

    def test_un_dossier_avec_des_defis_it_seuls_n_en_porte_aucun(self):
        assert _strategy_warning({"angles": [], "itChallenges": [{"title": "NIS2"}]}) == []

    def test_une_donnee_qui_n_est_pas_un_dossier_ne_produit_rien(self):
        # Le chemin de succès passe `response.data` tel quel : une forme
        # inattendue ne doit pas fabriquer un avertissement de plus.
        assert _strategy_warning(None) == []
        assert _strategy_warning("dossier") == []
