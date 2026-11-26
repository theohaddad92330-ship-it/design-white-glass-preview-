"""#2322 — L'OUTIL `compile_need` est branché, et il propose sans écrire.

Le motif que ce dépôt répète : « du code juste, calculé, testé, que personne
n'appelle ». Le compilateur (`app/services/compilers/need_compiler.py`) a ses
propres tests ; ceux-ci tiennent l'APPELANT — que l'outil soit bien dans la
boîte du modèle, qu'il passe par `_proposal`, et qu'une erreur du compilateur
remonte comme une erreur et non comme une proposition vide.
"""

from __future__ import annotations

import asyncio

from app.services import chat_tools

USER = "11111111-1111-4111-8111-111111111111"


def _run(tool_input: dict) -> dict:
    return asyncio.run(
        chat_tools.execute_chat_tool(
            chat_tools.COMPILE_NEED_TOOL["name"],
            tool_input,
            user_id=USER,
            profile_data=None,
        )
    )


def _entree(**overrides) -> dict:
    payload = {
        "source": {"kind": "email", "locator": "fil « besoin EDI »", "stated_at": "2026-09-12"},
        "statements": [
            {
                "field": "work_to_do",
                "value": "reprendre les flux EDI fournisseurs",
                "excerpt": "il faut reprendre les flux EDI fournisseurs",
                "confidence": "explicite",
            }
        ],
        "confirmation_level": "rapporte",
    }
    payload.update(overrides)
    return payload


class TestLOutilEstDansLaBoite:
    def test_il_est_enregistre(self) -> None:
        assert chat_tools.COMPILE_NEED_TOOL in chat_tools.CHAT_TOOLS

    def test_il_est_une_ecriture_donc_une_proposition_a_valider(self) -> None:
        assert chat_tools.COMPILE_NEED_TOOL["name"] in chat_tools.WRITE_TOOL_NAMES

    def test_il_ne_demande_aucune_integration_branchee(self) -> None:
        # Un email collé dans le chat n'exige aucun connecteur : l'outil doit
        # rester visible même sans CRM ni messagerie.
        assert chat_tools.COMPILE_NEED_TOOL["name"] not in chat_tools.TOOL_REQUIRED_FAMILIES
        sans_rien = [tool["name"] for tool in chat_tools.tools_for([])]
        assert chat_tools.COMPILE_NEED_TOOL["name"] in sans_rien

    def test_le_champ_du_besoin_est_une_liste_fermee(self) -> None:
        champ = chat_tools.COMPILE_NEED_TOOL["input_schema"]["properties"]["statements"]["items"][
            "properties"
        ]["field"]
        assert "work_to_do" in champ["enum"]
        assert "expected_outcome" in champ["enum"]
        # Le décideur est une PERSONNE (#2322.48) : il passe par `people`.
        assert "decision_maker" not in champ["enum"]


class TestCeQueLOutilRend:
    def test_une_proposition_a_valider_jamais_un_besoin_cree(self) -> None:
        result = _run(_entree())
        assert result["status"] == "pending_confirmation"
        assert result["proposal"]["action"] == "compile_need"
        assert result["proposal"]["compiled"]["status"] == "proposition"

    def test_ce_qui_a_ete_ecarte_est_nomme(self) -> None:
        result = _run(
            _entree(
                statements=[
                    *_entree()["statements"],
                    {"field": "seniority", "value": "senior", "excerpt": ""},
                ]
            )
        )
        assert {"field": "seniority", "reason": "sans_extrait"} in result["proposal"]["dropped"]

    def test_une_source_impossible_remonte_une_erreur_pas_une_proposition(self) -> None:
        result = _run(_entree(source={"filename": "besoins.xlsx"}))
        assert "error" in result
        assert "proposal" not in result
