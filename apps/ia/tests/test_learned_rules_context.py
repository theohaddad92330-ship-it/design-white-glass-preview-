"""#3295 — l'apprentissage contrôlé modifie réellement Laura.

Une règle apprise (proposition adoptée PUIS activée) arrive du pont API dans
``workspace_learned_rules_context`` ; ce fichier verrouille :

1. la byte-identité du prompt sans règle active ;
2. l'injection prudente du bloc (jamais universel, jamais un critère sur une personne) ;
3. le TOUR REJOUÉ dans ``/chat/message`` : entrée → prompt système envoyé au
   modèle → la règle y figure ; sans règle, elle n'y figure pas.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.prompts.bellum_advisor import build_system_prompt as build_advisor_prompt
from app.services.learned_rules_context import learned_rules_context_block

RULES = "- [Compte] Sans sponsor identifié avant la démonstration, la perte suit à 90 jours."
QUESTION = "Comment j'approche ce compte, on l'a déjà perdu une fois ?"


def test_block_is_empty_without_rules():
    assert learned_rules_context_block("") == ""
    assert learned_rules_context_block(None) == ""
    assert learned_rules_context_block("  \n ") == ""


def test_block_carries_rules_and_stays_prudent():
    block = learned_rules_context_block(RULES)
    assert RULES in block
    assert "pertes" in block
    assert "universelle" in block
    assert "critère sur une personne" in block


def test_block_caps_hostile_payloads():
    assert len(learned_rules_context_block("x" * 100_000)) < 3_000


def test_advisor_prompt_byte_identical_without_rules():
    baseline = build_advisor_prompt({}, {}, "", "")
    assert build_advisor_prompt({}, {}, "", "", workspace_learned_rules_context="") == baseline
    assert "RÈGLES APPRISES" not in baseline


def test_advisor_prompt_injects_rules_additively():
    prompt = build_advisor_prompt({}, {}, "", "", workspace_learned_rules_context=RULES)
    assert RULES in prompt
    assert prompt.replace(learned_rules_context_block(RULES), "") == build_advisor_prompt({}, {}, "", "")


def _system_prompt_of_turn(client: TestClient, learned: str) -> str:
    captured: dict[str, str] = {}

    async def _run(system_prompt, *_a, **_k):
        captured["system"] = system_prompt
        return ("Réponse.", [])

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new=_run),
        patch("app.services.rag_service.retrieve_knowledge_docs", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post(
            "/chat/message",
            json={"message": QUESTION, "user_id": "u-1", "workspace_learned_rules_context": learned},
        )
    assert res.status_code == 200
    return captured["system"]


def test_le_tour_rejoue_porte_la_regle_apprise_dans_le_prompt(client: TestClient):
    assert RULES in _system_prompt_of_turn(client, RULES)


def test_le_tour_rejoue_sans_regle_active_ne_porte_aucun_bloc(client: TestClient):
    assert "RÈGLES APPRISES" not in _system_prompt_of_turn(client, "")


