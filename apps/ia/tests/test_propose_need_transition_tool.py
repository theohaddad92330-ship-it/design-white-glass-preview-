"""#2320.26 / #2320.27 (épopée #2967) — Laura PRÉPARE une transition de besoin
sans l'exécuter, et SIGNALE ce qui manque pour la franchir.

`ProjectPipelineService.needTransitionCheck` (NestJS) calcule le MÊME verdict
que `changeNeedStatus` calcule juste avant d'écrire — jamais un second calcul.
Ce fichier tient le contrat de l'outil `propose_need_transition` :

1. il exige `need_id` et un `next_status` VALABLE ;
2. il lit le verdict AVANT de proposer quoi que ce soit — jamais une
   transition qu'il sait déjà refusée (ordre des statuts, gates need-level) ;
3. un motif obligatoire et absent est SIGNALÉ, jamais deviné ;
4. une transition permise devient une PROPOSITION (`_proposal()`) — l'outil
   n'écrit rien, l'exécution reste le clic de l'utilisateur ;
5. un pont éteint ou un besoin introuvable rend une erreur métier lisible.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict | None = None) -> dict:
    return await execute_chat_tool("propose_need_transition", tool_input or {}, user_id=USER, profile_data=None)


def test_tool_is_registered_at_the_end_of_chat_tools() -> None:
    # Pas `CHAT_TOOLS[-1]` : `evaluate_qualification_filters` (#2273, épopée
    # #2959, LOT g10 26/09) a été ajouté PLUS TARD que ce lot — même situation
    # que documentée dans `test_chat_crm_presence_tool.py`. L'invariant est
    # « jamais inséré avant `get_need_transition_history` », le dernier outil
    # du catalogue au moment où ce lot a écrit.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names.index("propose_need_transition") > names.index("get_need_transition_history")


def test_it_is_a_write_tool_never_parallelised() -> None:
    assert "propose_need_transition" in WRITE_TOOL_NAMES


def test_requires_a_need_id() -> None:
    import asyncio

    result = asyncio.run(_run({"next_status": "qualified"}))
    assert "error" in result
    assert "besoin" in result["error"].lower()


def test_rejects_an_unknown_status() -> None:
    import asyncio

    result = asyncio.run(_run({"need_id": "n-1", "next_status": "gagné"}))
    assert "error" in result
    assert "gagné" in result["error"]


@pytest.mark.asyncio
async def test_names_the_refusal_instead_of_proposing_an_impossible_transition(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _check(user_id: str, need_id: str, next_status: str) -> dict:
        assert user_id == USER
        assert need_id == "n-1"
        assert next_status == "matching"
        return {
            "currentStatus": "to_qualify",
            "allowed": False,
            "reason": "Ce besoin doit d’abord passer par l’étape précédente.",
            "requiresReason": False,
        }

    monkeypatch.setattr(bellum_api, "need_transition_check", _check)
    result = await _run({"need_id": "n-1", "next_status": "matching"})
    assert result == {"error": "Ce besoin doit d’abord passer par l’étape précédente."}


@pytest.mark.asyncio
async def test_signals_a_missing_mandatory_reason_instead_of_guessing_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _check(*_a: object, **_k: object) -> dict:
        return {"currentStatus": "client_review", "allowed": True, "reason": None, "requiresReason": True}

    monkeypatch.setattr(bellum_api, "need_transition_check", _check)
    result = await _run({"need_id": "n-1", "next_status": "lost"})
    assert "error" in result
    assert "motif" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_permitted_transition_becomes_a_proposal_never_a_write(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _check(*_a: object, **_k: object) -> dict:
        return {"currentStatus": "to_qualify", "allowed": True, "reason": None, "requiresReason": False}

    monkeypatch.setattr(bellum_api, "need_transition_check", _check)
    result = await _run({"need_id": "n-1", "next_status": "qualified"})
    assert result["proposal"]["action"] == "propose_need_transition"
    assert result["proposal"]["need_id"] == "n-1"
    assert result["proposal"]["from_status"] == "to_qualify"
    assert result["proposal"]["to_status"] == "qualified"
    assert result["proposal"]["cost_credits"] == 0


@pytest.mark.asyncio
async def test_a_dead_bridge_or_unknown_need_says_so_rather_than_a_silent_proposal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _check(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "need_transition_check", _check)
    result = await _run({"need_id": "n-absent", "next_status": "qualified"})
    assert "error" in result
    assert "proposal" not in result


@pytest.mark.asyncio
async def test_carries_the_canonical_missing_evidence_read_from_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    """Épopée #2967 (lot V39, #2320.27) — les preuves que la machine canonique
    exige sont LUES dans la réponse du pont, jamais recalculées par l'outil."""

    async def _check(*_a: object, **_k: object) -> dict:
        return {
            "currentStatus": "matching",
            "allowed": True,
            "reason": None,
            "requiresReason": False,
            "canonical": {
                "fromStage": "match",
                "toStage": "shortlist",
                "missingEvidence": ["criteria_review", "unknowns_review"],
                "requiresHumanValidation": True,
            },
        }

    monkeypatch.setattr(bellum_api, "need_transition_check", _check)
    result = await _run({"need_id": "n-1", "next_status": "shortlist_ready"})
    assert result["proposal"]["missing_evidence"] == ["criteria_review", "unknowns_review"]


@pytest.mark.asyncio
async def test_no_canonical_block_means_an_empty_list_never_an_invented_one(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _check(*_a: object, **_k: object) -> dict:
        return {"currentStatus": "to_qualify", "allowed": True, "reason": None, "requiresReason": False}

    monkeypatch.setattr(bellum_api, "need_transition_check", _check)
    result = await _run({"need_id": "n-1", "next_status": "qualified"})
    assert result["proposal"]["missing_evidence"] == []
