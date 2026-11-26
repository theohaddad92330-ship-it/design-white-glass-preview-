"""#4060 — « approche directe » : un message qui annonce ce qu'on propose et
qualifie le besoin, sans signal public ni accroche imposés.

Un objectif CHOISI (formulaire) ou demandé dans l'angle ; les autres voix
(signal crédible, relance…) restent disponibles et inchangées.
"""

from __future__ import annotations

import pytest

from app.knowledge.message_matrix import MESSAGE_MATRIX
from app.prompts.bellum_outreach import build_system_prompt, build_user_prompt
from app.services.message_brief import MESSAGE_OBJECTIVES, derive_message_brief, message_brief_block

_MANAGER = {"name": "Claire Dupont", "title": "RSSI"}


def test_approche_directe_a_ses_regles_propres():
    entry = MESSAGE_OBJECTIVES["approche_directe"]
    assert entry["label"] and entry["rules"] and entry["cta"]
    rules = entry["rules"].lower()
    # #4060 — aucun signal ni article imposé, aucun besoin non établi affirmé.
    assert "aucun signal" in rules
    assert "n'affirme jamais un besoin" in rules


@pytest.mark.parametrize("angle", ["approche directe", "une approche directe, sans détour", "message direct"])
def test_l_angle_libre_atteint_approche_directe(angle: str):
    brief = derive_message_brief(contact=_MANAGER, relationship_state="froid", angle=angle)
    assert brief["objective"] == "approche_directe"
    assert brief["objectiveSource"] == "angle"


def test_le_choix_du_formulaire_gagne():
    brief = derive_message_brief(
        contact=_MANAGER, relationship_state="froid", angle="", parameters={"objective": "approche_directe"}
    )
    assert brief["objective"] == "approche_directe"


def test_la_version_directe_differe_de_la_version_d_orientation():
    direct = message_brief_block({"objective": "approche_directe", "relationship": None})
    ouverture = message_brief_block({"objective": "ouverture_compte", "relationship": None})
    assert direct != ouverture
    assert MESSAGE_OBJECTIVES["approche_directe"]["rules"] in direct
    assert "signal crédible" not in direct.lower()


def test_la_voix_signal_reste_la_regle_des_autres_objectifs():
    # Les signaux restent disponibles pour les autres usages.
    system = build_system_prompt({"companyName": "Acme"}, "email")
    assert "SIGNAL CRÉDIBLE" in system
    # …mais la ligne dit que le cadrage direct la lève, au lieu de se contredire.
    assert "approche directe" in system.lower()


def test_le_prompt_utilisateur_porte_l_objectif_direct():
    prompt = build_user_prompt(
        _MANAGER,
        {},
        {"offers": ["cybersécurité"]},
        None,
        "email",
        "",
        "Acme",
        brief={"objective": "approche_directe", "relationship": None, "persona": None, "cta": "echange_court"},
    )
    assert MESSAGE_OBJECTIVES["approche_directe"]["rules"] in prompt


def test_la_matrice_le_connait_sans_premisse_de_relation():
    assert "approche_directe" in MESSAGE_MATRIX["objectives"]
    assert MESSAGE_MATRIX["objectivePremises"]["approche_directe"] is None


# #4060 (recette prod 14/10, Renault) — préférence « Approche directe » active, le
# brouillon du DSI citait 3 signaux/articles (futuREady, Gemini/openR, IA
# industrielle). CAUSE : `build_user_prompt` concatène `render_message_signals`
# (bloc « SIGNAUX RÉCENTS (source d'ACCROCHE PRIORITAIRE) ») À TOUS LES OBJECTIFS,
# `approche_directe` compris — l'instruction « aucun signal » cohabitait avec un
# bloc qui en impose un. Jumeau direct de la règle qui tient déjà « SIGNAL
# CRÉDIBLE » côté system prompt (test ci-dessus).
def test_approche_directe_ne_voit_aucun_signal_dans_le_prompt_utilisateur():
    signals = [{"signal": "futuREady : plan IA industrielle", "date": "2026-09-01", "type": "press"}]
    prompt = build_user_prompt(
        _MANAGER,
        {},
        {},
        signals,
        "email",
        "",
        "Renault",
        brief={"objective": "approche_directe", "relationship": None, "persona": None, "cta": "echange_court"},
    )
    assert "futuREady" not in prompt
    assert "SIGNAUX RÉCENTS" not in prompt


def test_les_autres_objectifs_voient_toujours_les_signaux():
    signals = [{"signal": "futuREady : plan IA industrielle", "date": "2026-09-01", "type": "press"}]
    prompt = build_user_prompt(
        _MANAGER,
        {},
        {},
        signals,
        "email",
        "",
        "Renault",
        brief={"objective": "ouverture_compte", "relationship": None, "persona": None, "cta": "question_facile"},
    )
    assert "futuREady" in prompt
