"""#2320.24 (épopée #2967) — Laura peut LIRE l'état de la chaîne commerciale.

`CommercialTransitionsService.history()` (#2320.23) écrit un journal
APPEND-ONLY à chaque changement de statut d'un besoin, sans aucun appelant en
lecture jusqu'ici — aucun controller ne le servait, aucun outil `/chat` ne le
lisait. Ce fichier tient le contrat du nouvel outil
`get_need_transition_history` :

1. il exige un `need_id` — jamais un besoin choisi au hasard ;
2. il relaie le statut et l'historique TELS QUE le pont les rend, sans les
   recalculer (GA-26) ;
3. `actor`/`proof` absents restent NOMMÉS (« non identifié », « aucune preuve
   déclarée »), jamais devinés ;
4. un pont éteint ou un besoin introuvable (`None`, `bellum_api._post` couvre
   les trois cas) rend une erreur métier lisible, jamais un historique vide
   qui se lirait « ce besoin n'a jamais bougé ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict | None = None) -> dict:
    return await execute_chat_tool("get_need_transition_history", tool_input or {}, user_id=USER, profile_data=None)


def test_tool_is_registered_at_the_end_of_chat_tools() -> None:
    # Un outil neuf s'ajoute EN FIN, sinon il invalide le préfixe d'outils mis
    # en cache pour tous les tours suivants. `propose_need_transition`
    # (#2320.26/.27) a suivi le même jour, juste après.
    #
    # Pas une égalité stricte sur la FIN de liste : `evaluate_qualification_filters`
    # (#2273, épopée #2959, LOT g10 26/09) a été ajouté PLUS TARD que ce lot —
    # même situation que documentée dans `test_chat_crm_presence_tool.py`.
    # L'invariant est « jamais inséré avant `propose_need_transition` », le
    # dernier outil du catalogue au moment où ce lot a écrit.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names.index("get_need_transition_history") < names.index("propose_need_transition")


def test_requires_a_need_id() -> None:
    import asyncio

    result = asyncio.run(_run({}))
    assert "error" in result
    assert "besoin" in result["error"].lower()


@pytest.mark.asyncio
async def test_relays_the_current_status_and_full_history(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _history(user_id: str, need_id: str) -> dict:
        assert user_id == USER
        assert need_id == "n-1"
        return {
            "needId": "n-1",
            "status": "qualified",
            "transitions": [
                {
                    "id": "t-1",
                    "fromState": "to_qualify",
                    "toState": "qualified",
                    "actorId": "u-1",
                    "proof": "Entretien du 20/09",
                    "occurredAt": "2026-09-20T10:00:00.000Z",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "need_transition_history", _history)
    result = await _run({"need_id": "n-1"})
    assert result["status"] == "qualified"
    assert result["transitions"] == [
        {
            "from_state": "to_qualify",
            "to_state": "qualified",
            "actor": "u-1",
            "proof": "Entretien du 20/09",
            "occurred_at": "2026-09-20T10:00:00.000Z",
        }
    ]


@pytest.mark.asyncio
async def test_names_a_missing_actor_or_proof_instead_of_guessing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _history(*_a: object, **_k: object) -> dict:
        return {
            "needId": "n-2",
            "status": "to_qualify",
            "transitions": [
                {
                    "id": "t-1",
                    "fromState": None,
                    "toState": "to_qualify",
                    "actorId": None,
                    "proof": None,
                    "occurredAt": "2026-09-18T09:00:00.000Z",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "need_transition_history", _history)
    result = await _run({"need_id": "n-2"})
    assert result["transitions"][0]["actor"] == "non identifié"
    assert result["transitions"][0]["proof"] == "aucune preuve déclarée"


@pytest.mark.asyncio
async def test_no_transition_yet_is_an_empty_list_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _history(*_a: object, **_k: object) -> dict:
        return {"needId": "n-3", "status": "to_qualify", "transitions": []}

    monkeypatch.setattr(bellum_api, "need_transition_history", _history)
    result = await _run({"need_id": "n-3"})
    assert result["transitions"] == []
    assert "error" not in result


@pytest.mark.asyncio
async def test_a_dead_bridge_or_unknown_need_says_so_rather_than_an_empty_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _history(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "need_transition_history", _history)
    result = await _run({"need_id": "n-absent"})
    assert "error" in result
    assert not any(isinstance(value, list) and value for value in result.values())
