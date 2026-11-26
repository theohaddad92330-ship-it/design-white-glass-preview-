"""#3244 (reste de #3186.10) — la position dans la chaine de sous-traitance
(rang2, #2645.1) et le mode de delivery (nearshore, staffingModes) etaient
CALCULES/CAPTURES mais n'avaient AUCUN appelant en aval : aucune strategie ne
refusait une route qu'une ESN rang2 ne peut pas tenir, contrairement a
l'exemple meme cite par l'epopee (« une ESN rang 2 ne peut pas pretendre a un
acces direct au client final »). Meme discipline que
``test_strategy_revenue_model.py`` : la VALEUR doit changer le texte envoye au
modele, pas seulement exister quelque part (le defaut n°1 de ce depot,
« capture != consomme »).
"""

from __future__ import annotations

from app.prompts.bellum_strategy import build_system_prompt
from app.services.sales_context import nearshore_cost_block, rank_position_block

_RANG2 = {"service_types": ["Sous-traitance rang 2"]}
_MIXTE = {"service_types": ["Régie", "Sous-traitance rang 2"]}
_DIRECT = {"service_types": ["Régie", "Forfait"]}
_NEARSHORE = {"staffingModes": ["Nearshore"]}


class TestRankPositionBlock:
    def test_non_declare_ne_produit_aucun_bloc(self):
        # GA-18/GA-19 — non mesure n'est pas une valeur.
        assert rank_position_block({}) == ""

    def test_sous_traitance_seule_sans_rang_2_ne_produit_aucun_bloc(self):
        # "Sous-traitance" seule (sans "rang 2") reste inconnu (_rank_position) :
        # jamais un rang2 devine a partir d'un libelle voisin.
        assert rank_position_block({"service_types": ["Régie", "Sous-traitance"]}) == ""

    def test_direct_seul_ne_produit_aucun_bloc(self):
        # Vente directe seule (rang1 implicite) : rien a signaler, prompt inchange.
        assert rank_position_block(_DIRECT) == ""

    def test_rang2_interdit_l_acces_direct_au_client_final(self):
        bloc = rank_position_block(_RANG2).lower()
        assert "rang 2" in bloc
        assert "acces direct" in bloc
        assert "delivery" in bloc

    def test_mixte_ne_tranche_pas_a_la_place_du_commercial(self):
        bloc = rank_position_block(_MIXTE).lower()
        assert "mixte" in bloc


class TestNearshoreCostBlock:
    def test_non_declare_ne_produit_aucun_bloc(self):
        assert nearshore_cost_block({}) == ""

    def test_sous_traitance_ne_declenche_pas_le_bloc_nearshore(self):
        # "Sous-traitance" (staffingModes) n'est pas "Nearshore" : pas de bloc.
        assert nearshore_cost_block({"staffingModes": ["Sous-traitance"]}) == ""

    def test_nearshore_declare_adresse_le_cout_explicitement(self):
        bloc = nearshore_cost_block(_NEARSHORE).lower()
        assert "nearshore" in bloc
        assert "cout" in bloc

    def test_snake_case_aussi_lu(self):
        bloc = nearshore_cost_block({"staffing_modes": ["Nearshore"]}).lower()
        assert "nearshore" in bloc


class TestStrategyPromptCarriesRankPositionAndNearshore:
    """La preuve d'APPELANT : les blocs ne valent que s'ils atteignent le prompt."""

    def test_le_prompt_change_avec_rang2(self):
        direct = build_system_prompt(_DIRECT)
        rang2 = build_system_prompt(_RANG2)
        assert direct != rang2, "rang2 declare doit changer le prompt"
        assert rank_position_block(_RANG2) in rang2
        assert rank_position_block(_DIRECT) not in direct or rank_position_block(_DIRECT) == ""

    def test_le_prompt_change_avec_nearshore(self):
        sans = build_system_prompt({})
        nearshore = build_system_prompt(_NEARSHORE)
        assert sans != nearshore, "nearshore declare doit changer le prompt"
        assert nearshore_cost_block(_NEARSHORE) in nearshore

    def test_un_profil_sans_axe_declare_garde_le_prompt_historique(self):
        # Byte-identite sur les DEUX BLOCS (le header a section, pas la phrase
        # generique de l'ANTI-RECOMMANDATION qui, elle, reste toujours presente
        # — comme "offre absente" ou "hors de ta zone geo" pour les autres axes).
        sans = build_system_prompt({})
        assert "===== POSITION DANS LA CHAINE DE SOUS-TRAITANCE =====" not in sans
        assert "===== MODE DE DELIVERY =====" not in sans

    def test_anti_recommandation_cite_la_position_dans_la_chaine(self):
        # La consigne generique reste presente que l'axe soit declare ou non —
        # c'est la LISTE des axes qu'un angle doit respecter, comme offre/geo/taille.
        assert "position dans la chaine de sous-traitance" in build_system_prompt({}).lower()
