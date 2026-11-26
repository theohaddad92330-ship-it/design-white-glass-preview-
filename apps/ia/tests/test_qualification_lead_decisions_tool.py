"""#3345.2 (LAU-FINAL-255, recette prod 30/09) — Louis observait Laura
reproposer une piste à qualifier déjà écartée par l'écran Opportunités : un
lot antérieur (N06, 29/09) avait annoncé cet outil livré, SHA à l'appui —
mais ni la déclaration, ni le dispatch, ni le pont interne n'existaient sur
`main` au moment où CE lot a lu le dépôt (grep-témoin négatif, trois
fichiers). Ce fichier tient le contrat RÉEL du nouvel outil
`get_qualification_lead_decisions` :

1. il exige un `account_id` — jamais un compte choisi au hasard ;
2. il relaie les décisions TELLES QUE le pont les rend, sans les recalculer
   (GA-26 — MÊME lecture que `QualificationLeadsController.decisions`) ;
3. une liste vide veut dire qu'aucune piste n'a encore été tranchée, jamais
   une erreur ;
4. un pont éteint (`None`, `bellum_api._post` couvre pont éteint et réseau en
   échec) rend une erreur métier lisible.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
ACCOUNT = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict | None = None) -> dict:
    return await execute_chat_tool(
        "get_qualification_lead_decisions", tool_input or {}, user_id=USER, profile_data=None
    )


def test_tool_is_registered_before_push_profile() -> None:
    # `push_profile` doit rester le DERNIER outil du catalogue (voir son
    # commentaire dans `chat_tools.py`) : un outil neuf s'insère juste
    # au-dessus, jamais après.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names.index("get_qualification_lead_decisions") < names.index("push_profile")


def test_requires_an_account_id() -> None:
    import asyncio

    result = asyncio.run(_run({}))
    assert "error" in result
    assert "compte" in result["error"].lower()


@pytest.mark.asyncio
async def test_relays_the_decisions_as_the_bridge_renders_them(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _decisions(user_id: str, *, account_id: str) -> dict:
        assert user_id == USER
        assert account_id == ACCOUNT
        return {
            "decisions": [
                {
                    "lead_key": "l-1",
                    "decision": "dismissed",
                    "reason": "bad_timing",
                    "note": None,
                    "decided_at": "2026-09-29T00:00:00.000Z",
                    "snoozed_until": None,
                }
            ]
        }

    monkeypatch.setattr(bellum_api, "qualification_lead_decisions", _decisions)
    result = await _run({"account_id": ACCOUNT})
    assert result["decisions"] == [
        {
            "lead_key": "l-1",
            "decision": "dismissed",
            "reason": "bad_timing",
            "note": None,
            "decided_at": "2026-09-29T00:00:00.000Z",
            "snoozed_until": None,
        }
    ]


@pytest.mark.asyncio
async def test_no_decision_yet_is_an_empty_list_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _decisions(*_a: object, **_k: object) -> dict:
        return {"decisions": []}

    monkeypatch.setattr(bellum_api, "qualification_lead_decisions", _decisions)
    result = await _run({"account_id": ACCOUNT})
    assert result["decisions"] == []
    assert "error" not in result


@pytest.mark.asyncio
async def test_a_dead_bridge_says_so_rather_than_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _decisions(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "qualification_lead_decisions", _decisions)
    result = await _run({"account_id": ACCOUNT})
    assert "error" in result
