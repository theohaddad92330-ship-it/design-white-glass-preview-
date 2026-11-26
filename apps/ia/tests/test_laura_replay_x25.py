"""Lot X25 (02/10) — TOURS REJOUÉS : #3224 (« Je pars sur … ») et #3443 (appel à froid).

Faute d'appel Claude vivant en CI, le tour est rejoué : entrée → prompt RÉEL reçu
par le modèle (capturé) → appel d'outil du modèle (scripté) → VRAI exécuteur
d'outil → carte renvoyée à l'écran. Prouve ce que Laura REÇOIT et ce qui
atteint l'écran ; que le modèle vivant obéit = question de recette (issues).
"""

from __future__ import annotations

import pytest

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.intent_route import constraint_consistency_block
from app.services import chat_orchestrator
from app.services.compilers.intent_router import route_chat_intent
from tests.test_chat_replay_q06 import (  # noqa: F401 — fixture autouse
    USER,
    _install_client,
    _patch_env,
    _prompt_of,
    _resp,
    _text,
    _tool_use,
)

CONFLICT = "Trouve-moi des comptes grand groupe, sans référencement — le grand groupe compte plus que le reste"
ASSUMPTION = "Je conserve tes secteurs… ne les modifies pas."
COLD_CALL = (
    "Prépare-moi un appel à froid pour le responsable Data d'un compte où je n'ai aucun partenariat "
    "confirmé : un projet est documenté, aucune preuve de budget."
)


def test_3224_la_contradiction_oriente_vers_la_carte_de_clarification_avec_hypotheses():
    route = route_chat_intent(message=CONFLICT)
    block = constraint_consistency_block(route, "fr")
    assert "ask_clarification" in block
    assert "assumptions" in block


@pytest.mark.asyncio
async def test_3224_replay_la_carte_porte_l_hypothese_redigee_jusqu_a_l_ecran(monkeypatch):
    system = build_system_prompt({}, {}, "", "") + constraint_consistency_block(
        route_chat_intent(message=CONFLICT), "fr"
    )
    client = _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use(
                        "ask_clarification",
                        {
                            "question": "Grand groupe ou sans référencement : lequel prime ?",
                            "options": ["Grand groupe d'abord", "Sans référencement d'abord"],
                            "assumptions": [ASSUMPTION],
                        },
                        "t1",
                    )
                ],
            ),
            _resp("end_turn", [_text("Dis-moi lequel prime.")]),
        ],
    )
    _reply, actions = await chat_orchestrator.run_chat_with_tools(system, CONFLICT, user_id=USER, profile_data=None)

    assert "ask_clarification" in _prompt_of(client.messages.calls[0])
    card = next(a for a in actions if a.get("status") == "clarification")
    assert card["clarification"]["assumptions"] == [ASSUMPTION]


def test_3443_le_cadre_d_appel_a_froid_se_livre_sans_compte_nomme():
    prompt = build_system_prompt({}, {}, "", "")
    assert "SANS COMPTE NOMMÉ" in prompt
    assert "TOUT DE SUITE" in prompt
    assert "jamais inventés" in prompt


@pytest.mark.asyncio
async def test_3443_replay_la_demande_atteint_le_modele_avec_le_cadre_et_sans_outil_de_compte(monkeypatch):
    system = build_system_prompt({}, {}, "", "")
    client = _install_client(
        monkeypatch,
        [_resp("end_turn", [_text("Cadre : 1) permission de 30 s … 6) email ou synthèse courte.")])],
    )
    reply, actions = await chat_orchestrator.run_chat_with_tools(system, COLD_CALL, user_id=USER, profile_data=None)

    assert actions == []
    prompt = _prompt_of(client.messages.calls[0])
    for needle in ("APPEL À FROID, LE DÉROULÉ", "SANS COMPTE NOMMÉ", "30 secondes", "visibilité sur les compétences"):
        assert needle in prompt
    assert "30 s" in reply


def test_3443_x37_le_cadre_se_joue_en_dialogue_et_ne_finit_pas_sur_une_demande_de_compte():
    prompt = build_system_prompt({}, {}, "", "")
    for needle in (
        "OUVERTURE DE LA RÉPONSE",
        "Est-ce que tu m'accordes 30 secondes",
        "Quel est le meilleur email",
        "Ne commence jamais par ce qui te manque",
        "jamais sur une demande de compte",
    ):
        assert needle in prompt
