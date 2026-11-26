"""L'échelle de taille ESN est UNE, et c'est celle de l'annexe p3.

Le trou que ce test ferme : trois échelles vivaient en parallèle — 5/20/80/300
(`sales_context.classify_esn_stage`), 5/20/100/500 (`esn_profiler.esn_archetype`)
et 1-20 / 20-100 / 100+ (calibration du prompt strategy). Une ESN de 90
consultants était simultanément « établie », « mid_market_challenger » et
« MOYENNE ». « Petite vs grande ESN » (DoD p31 n°1) n'avait donc pas de
définition unique dans le produit.

Les coupures ici sont celles ÉCRITES dans l'annexe p3 (Freelance 0-5, Petite
5-15, Structuration 15-50, Établie 50-200, Grande 200+), pas une approximation.
"""

from __future__ import annotations

import pytest

from app.services.esn_profiler import esn_archetype, preferred_entry_mode
from app.services.esn_stage import (
    ESN_STAGES,
    STAGE_PLAYBOOK,
    classify_esn_stage,
    esn_stage_playbook_block,
)
from app.services.sales_context import classify_esn_stage as sales_context_stage


class TestLesCoupuresSontCellesDeLAnnexe:
    """p3 : Freelance 0-5 · Petite 5-15 · Structuration 15-50 · Établie 50-200 · Grande 200+."""

    @pytest.mark.parametrize(
        ("size", "expected"),
        [
            (1, "freelance"),
            (5, "freelance"),
            (6, "petite"),
            (15, "petite"),
            (16, "structuration"),
            (50, "structuration"),
            (51, "etablie"),
            (200, "etablie"),
            (201, "grande"),
            (5000, "grande"),
        ],
    )
    def test_chaque_borne_de_la_table_p3(self, size: int, expected: str) -> None:
        assert classify_esn_stage(size) == expected

    def test_une_fourchette_textuelle_prend_sa_borne_haute(self) -> None:
        """« 20-100 consultants » est une ESN de 100, pas de 20 : on ne sous-estime
        jamais la capacité déclarée."""
        assert classify_esn_stage("20-100") == "etablie"

    def test_taille_inconnue_se_lit_petite(self) -> None:
        """Défaut SÛR : un profil vide est traité comme une petite ESN, donc aucun
        réflexe grand-compte (board / top-down) ne peut être autorisé sans preuve."""
        assert classify_esn_stage(None) == "petite"
        assert classify_esn_stage("") == "petite"

    def test_les_stades_sont_ordonnes_du_plus_petit_au_plus_grand(self) -> None:
        assert ESN_STAGES == ("freelance", "petite", "structuration", "etablie", "grande")


class TestUneSeuleEchelle:
    """Le point du chantier : plus aucun module ne porte ses propres coupures."""

    @pytest.mark.parametrize("size", [1, 5, 6, 15, 16, 50, 51, 90, 200, 201, 900])
    def test_le_sales_context_et_le_socle_ne_peuvent_pas_diverger(self, size: int) -> None:
        assert sales_context_stage(size) == classify_esn_stage(size)

    @pytest.mark.parametrize(
        ("size", "expected"),
        [
            (3, "solo_hunter"),
            (10, "boutique_expert"),
            (30, "mid_market_challenger"),
            (90, "scale_up"),
            (400, "enterprise_player"),
        ],
    )
    def test_l_archetype_deck_est_une_projection_du_stade(self, size: int, expected: str) -> None:
        """L'archétype du deck reste affiché tel quel côté produit, mais il n'a plus
        ses propres bornes : c'est une PROJECTION 1-pour-1 du stade."""
        assert esn_archetype(size) == expected

    def test_une_esn_de_90_n_est_plus_dans_deux_bandes_a_la_fois(self) -> None:
        """Le cas qui prouvait la divergence : 90 consultants était `etablie` d'un
        côté et `mid_market_challenger` (bande 20-100) de l'autre."""
        assert classify_esn_stage(90) == "etablie"
        assert esn_archetype(90) == "scale_up"

    @pytest.mark.parametrize(
        ("size", "expected"),
        [
            (3, "bottom-up"),
            (15, "bottom-up"),
            (50, "middle-out"),
            (200, "middle-out"),
            (201, "top-down"),
        ],
    )
    def test_le_mode_d_entree_prefere_suit_le_meme_stade(self, size: int, expected: str) -> None:
        assert preferred_entry_mode(size) == expected


class TestPlaybookDeStade:
    """p3 porte une colonne « Stratégie prioritaire » par stade : elle doit ATTEINDRE
    les prompts, sinon la table reste un document."""

    def test_chaque_stade_a_son_profil_et_sa_strategie_prioritaire(self) -> None:
        assert set(STAGE_PLAYBOOK) == set(ESN_STAGES)
        for stage, entry in STAGE_PLAYBOOK.items():
            assert entry["profil"].strip(), stage
            assert entry["strategie"].strip(), stage

    def test_le_bloc_nomme_le_stade_et_sa_strategie(self) -> None:
        block = esn_stage_playbook_block({"size": "8"})
        assert "petite" in block.lower()
        assert STAGE_PLAYBOOK["petite"]["strategie"] in block

    def test_deux_stades_ne_produisent_pas_le_meme_bloc(self) -> None:
        """C'est tout l'objet du chantier : la stratégie prioritaire d'un freelance
        et celle d'une grande ESN ne peuvent pas être le même texte."""
        assert esn_stage_playbook_block({"size": "3"}) != esn_stage_playbook_block({"size": "900"})

    def test_profil_sans_taille_ne_produit_aucun_bloc(self) -> None:
        """SÛRETÉ : sans taille déclarée, on n'affirme pas un stade dans le prompt —
        le bloc est vide et le prompt reste byte-identique à l'historique."""
        assert esn_stage_playbook_block({}) == ""
        assert esn_stage_playbook_block(None) == ""
