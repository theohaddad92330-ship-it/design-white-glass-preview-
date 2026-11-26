"""#2204.21 (épopée #2947) — DÉCISION LOUIS 16-17/10 : « valider un contexte » = l'objectif
`demande_information`, PAS un objectif en plus (GA-26). La demande y MÈNE (angle libre, formulaire, rang du
contact) ; le code historique `valider_contexte` reste accepté pour les valeurs déjà enregistrées, mais se résout
sur `demande_information` et n'est plus ni détecté ni proposé.
"""

from __future__ import annotations

import pytest

from app.services.message_brief import MESSAGE_OBJECTIVES, derive_message_brief, message_brief_block

_MANAGER = {"name": "Claire Dupont", "title": "Responsable des études"}


@pytest.mark.parametrize(
    "angle",
    ["valider le contexte du besoin", "confirmer notre compréhension du contexte", "valider une hypothèse de contexte"],
)
def test_l_angle_libre_mene_a_demande_information(angle: str):
    brief = derive_message_brief(contact=_MANAGER, relationship_state="froid", angle=angle)
    assert brief["objective"] == "demande_information"
    assert brief["objectiveSource"] == "angle"


def test_le_code_historique_se_resout_sur_demande_information():
    brief = derive_message_brief(
        contact=_MANAGER, relationship_state="froid", angle="", parameters={"objective": "valider_contexte"}
    )
    assert brief["objective"] == "demande_information"
    assert brief["objectiveSource"] == "formulaire"


def test_demande_information_porte_le_cas_valider_un_contexte_sans_presenter_l_hypothese_comme_un_fait():
    entry = MESSAGE_OBJECTIVES["demande_information"]
    assert "valider un contexte" in entry["label"]
    rules = entry["rules"].lower()
    assert "hypothèse" in rules and "jamais comme un fait" in rules


def test_le_prompt_porte_les_regles_de_demande_information_pour_le_code_historique():
    block = message_brief_block({"objective": "valider_contexte", "relationship": None})
    assert MESSAGE_OBJECTIVES["demande_information"]["rules"] in block


def test_ne_vole_pas_une_relance():
    relance = derive_message_brief(
        contact=_MANAGER, relationship_state="froid", angle="relance pour valider le contexte"
    )
    assert relance["objective"] == "relance"
