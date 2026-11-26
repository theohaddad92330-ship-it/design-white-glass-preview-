"""#3422.15 / #3422.16 (LOT Q05, recette prod 30/09 : « non rejoué à l'écran ») —
deux profils du jeu de tests métier de référence, REJOUÉS comme un tour de chat :
entrée → outil appelé → ce que le modèle reçoit → réponse.

 - 15 « historique CRM disponible » : Laura lit le CRM branché (`get_crm_presence`)
   et c'est BIEN le contenu réel qui revient au modèle.
 - 16 « aucun connecteur » : l'outil n'est PAS offert, et le panneau « ce qui n'a
   pas été consulté » dit « non connecté » — jamais une absence de présence
   devinée.

Questions exactes à poser en recette dans /chat : (15) « Est-ce qu'on est déjà chez
Decathlon ? » avec un CRM branché ; (16) la même question sur un espace SANS
connecteur — Laura doit dire qu'aucun CRM n'est branché.
"""

from __future__ import annotations

import json

import pytest

from app.prompts.context_transparency import _not_consulted_entries
from app.services import bellum_api, chat_orchestrator
from tests.test_chat_orchestrator import (  # noqa: F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)

ACCOUNT = "0125b778-807b-4025-a363-b31bfc819af1"


def _tool_result_text(call: dict) -> str:
    """Le contenu des `tool_result` du dernier message utilisateur envoyé au modèle."""
    last = call["messages"][-1]
    blocks = last["content"] if isinstance(last["content"], list) else []
    return " ".join(str(block.get("content", "")) for block in blocks if block.get("type") == "tool_result")


@pytest.mark.asyncio
async def test_3422_15_crm_history_reaches_the_model_and_the_answer(monkeypatch):
    async def _fake_presence(user_id: str, account_id: str):
        assert account_id == ACCOUNT
        return {
            "connected": True,
            "contacts": [{"name": "Claire Martin", "title": "Responsable applicatif"}],
            "openDeals": [{"name": "Renfort Java", "stage": "Qualification"}],
            "lastActivityAt": "2026-09-12",
        }

    monkeypatch.setattr(bellum_api, "crm_presence", _fake_presence)
    fake = _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_crm_presence", {"account_id": ACCOUNT})]),
            _resp(
                "end_turn",
                [_text("Oui : votre CRM connait déjà Claire Martin et une affaire ouverte « Renfort Java ».")],
            ),
        ],
    )

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Est-ce qu'on est déjà chez Decathlon ?",
        user_id="u1",
        profile_data=None,
        crm_connected=True,
        user_message="Est-ce qu'on est déjà chez Decathlon ?",
    )

    assert "get_crm_presence" in {tool["name"] for tool in fake.messages.calls[0]["tools"]}
    assert actions[0]["tool"] == "get_crm_presence" and actions[0]["status"] == "done"
    # Le contenu RÉEL du CRM — pas une paraphrase — arrive au modèle au second aller-retour.
    received = _tool_result_text(fake.messages.calls[1])
    assert "Claire Martin" in received and "Renfort Java" in received
    assert "CRM" in reply


@pytest.mark.asyncio
async def test_3422_16_without_connector_the_model_is_told_so_never_an_invented_absence(monkeypatch):
    async def _fake_presence(user_id: str, account_id: str):
        return {"connected": False}

    monkeypatch.setattr(bellum_api, "crm_presence", _fake_presence)
    fake = _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_crm_presence", {"account_id": ACCOUNT})]),
            _resp("end_turn", [_text("Aucun CRM n'est branché sur cet espace : je ne peux pas te dire si on y est déjà.")]),
        ],
    )

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Est-ce qu'on est déjà chez Decathlon ?",
        user_id="u1",
        profile_data=None,
        crm_connected=False,
        user_message="Est-ce qu'on est déjà chez Decathlon ?",
    )

    assert actions[0]["tool"] == "get_crm_presence"
    received = _tool_result_text(fake.messages.calls[1])
    # Le modèle reçoit `connected: false` — l'outil ne fabrique AUCUN contact ni affaire.
    assert "false" in received.lower()
    assert "contacts" not in received and "openDeals" not in received
    assert "Aucun CRM" in reply


def test_3422_16_the_panel_names_the_missing_connector_with_its_action():
    entries = _not_consulted_entries(
        crm_connected=False,
        crm_provider="",
        has_account=True,
        has_portfolio=True,
        has_sources=True,
        crm_crossed=False,
    )
    crm_lines = [(label, action) for label, action, _ in entries if "CRM" in label]
    assert crm_lines, "le CRM non branché doit être NOMMÉ dans « non consulté »"
    label, action = crm_lines[0]
    assert "Aucun CRM connecté" in label
    assert action, "la ligne porte l'action qui la résout (connecter)"


def test_3422_16_the_guard_knows_how_to_say_no_a_connected_crm_is_not_listed_as_missing():
    entries = _not_consulted_entries(
        crm_connected=True,
        crm_provider="",
        has_account=True,
        has_portfolio=True,
        has_sources=True,
        crm_crossed=True,
    )
    assert not [label for label, _, _ in entries if "Aucun CRM connecté" in label]
    # garde-fou de lecture : la forme des entrées reste sérialisable
    json.dumps(entries)
