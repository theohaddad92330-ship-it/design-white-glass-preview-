"""#2371 — la matrice du message (persona × stade × objectif), côté moteur.

La parité TS ↔ miroir JSON est tenue par ``message-matrix.test.ts`` (contracts).
Ici : le miroir couvre bien les axes que le MOTEUR connaît, et les deux
consommateurs le lisent au lieu d'une copie.
"""

from __future__ import annotations

import pytest

from app.knowledge.message_matrix import MESSAGE_MATRIX
from app.knowledge.persona import PERSONAS
from app.services.message_brief import MESSAGE_OBJECTIVES, derive_message_brief, message_brief_block
from app.services.relationship_playbook import MESSAGE_PLAYBOOK, message_directive_block, objective_premise_holds
from app.services.sales_context import RELATIONSHIP_STATES


class TestLesAxesSontCeuxDuMoteur:
    def test_les_stades_sont_ceux_du_contrat(self) -> None:
        assert set(MESSAGE_MATRIX["stages"]) == set(RELATIONSHIP_STATES)
        assert MESSAGE_MATRIX["stages"]["froid"] is None

    def test_les_objectifs_sont_ceux_du_moteur(self) -> None:
        assert set(MESSAGE_MATRIX["objectives"]) == set(MESSAGE_OBJECTIVES)
        assert set(MESSAGE_MATRIX["objectivePremises"]) == set(MESSAGE_OBJECTIVES)

    def test_les_personas_sont_ceux_du_moteur(self) -> None:
        assert set(MESSAGE_MATRIX["personas"]) == set(PERSONAS)


class TestLePlaybookLitLaMatrice:
    """GA-26 — le playbook n'a plus sa propre copie des consignes de stade."""

    @pytest.mark.parametrize("state", [s for s in RELATIONSHIP_STATES if s != "froid"])
    def test_chaque_stade_du_playbook_vient_de_la_matrice(self, state: str) -> None:
        entry = MESSAGE_MATRIX["stages"][state]
        assert MESSAGE_PLAYBOOK[state]["must"] == entry["must"]
        assert MESSAGE_PLAYBOOK[state]["lifts_rule_3"] is entry["liftsRule3"]
        assert entry["must"] in message_directive_block(state)

    def test_le_bloc_non_mesure_vient_de_la_matrice(self) -> None:
        assert MESSAGE_MATRIX["unmeasuredStage"]["directive"] in message_directive_block(None)


class TestLaPremisseDeLObjectif:
    """stade × objectif : « premier contact sur ce compte » adressé à un client
    actif est une contradiction que le prompt doit NOMMER — sans retirer au
    commercial l'objectif qu'il a choisi (une correction humaine gagne)."""

    def test_une_premisse_qui_tient(self) -> None:
        assert objective_premise_holds("froid", "ouverture_compte") is True
        assert objective_premise_holds("client_actif", "renouvellement") is True

    def test_une_premisse_contredite(self) -> None:
        assert objective_premise_holds("client_actif", "ouverture_compte") is False
        assert objective_premise_holds("froid", "suivi_rendez_vous") is False

    def test_un_objectif_sans_premisse_vaut_partout(self) -> None:
        assert objective_premise_holds("client_actif", "nurturing") is True

    @pytest.mark.parametrize("state", ["", None, "stade_hors_contrat"])
    def test_une_relation_non_mesuree_ne_contredit_rien(self, state: str | None) -> None:
        """Non mesuré : on ne peut rien affirmer — ni que la prémisse tient, ni
        qu'elle est contredite."""
        assert objective_premise_holds(state, "ouverture_compte") is None

    def test_le_cadrage_nomme_la_contradiction_et_garde_le_choix_humain(self) -> None:
        brief = derive_message_brief(
            contact={"title": "DSI"},
            relationship_state="client_actif",
            angle=None,
            parameters={"objective": "ouverture_compte"},
        )
        bloc = message_brief_block(brief)

        assert brief["objective"] == "ouverture_compte"
        assert MESSAGE_OBJECTIVES["ouverture_compte"]["label"] in bloc
        assert "prémisse" in bloc
        assert MESSAGE_MATRIX["stages"]["client_actif"]["label"] in bloc

    def test_une_combinaison_coherente_ne_change_pas_le_cadrage(self) -> None:
        brief = derive_message_brief(
            contact={"title": "DSI"},
            relationship_state="froid",
            angle=None,
            parameters={"objective": "ouverture_compte"},
        )

        assert "prémisse" not in message_brief_block(brief)
