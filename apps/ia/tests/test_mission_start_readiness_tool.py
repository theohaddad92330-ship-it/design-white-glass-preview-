"""#2409.8 — Laura annonce le démarrage d'une mission AVEC ses réserves.

Mesuré le 23/09/2026 (registre `.claude/notes/registre-2026-09-20-chat-lot2.md`,
#2409.8/.9) : la checklist de démarrage (`MissionStartReadinessService`,
verdict + réserves NOMMÉES) n'était branchée sur AUCUN outil `/chat` —
`apps/ia` n'était pas touché. Ce fichier tient le contrat du nouvel outil
`get_mission_start_readiness` :

1. il exige un `mission_id` — jamais une mission choisie au hasard ;
2. il relaie le verdict et les prérequis TELS QUE le pont les rend, sans
   inventer ni recalculer une seconde fois (GA-26) ;
3. un pont éteint ou une mission introuvable (`None`, `bellum_api._post`
   couvre les trois cas) rend une erreur métier lisible, jamais une checklist
   vide qui se lirait « tout est prêt ».
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
    return await execute_chat_tool(
        "get_mission_start_readiness", tool_input or {}, user_id=USER, profile_data=None
    )


def test_tool_is_registered_at_the_end_of_chat_tools() -> None:
    # #2721/#2392 et tous leurs voisins : un outil neuf s'ajoute EN FIN, sinon
    # il invalide le préfixe d'outils mis en cache pour tous les tours suivants.
    # ⚠️ Il n'est plus le DERNIER — #2423.9 a suivi le même jour, et #1950.4
    # (`describe_plan`) a suivi à son tour depuis la vague 28 (23/09/2026). Ce
    # qui se garde est un ORDRE (rien inséré au milieu), pas un rang : vérifier
    # une queue EXACTE casse à chaque outil ajouté après lui, ce qui est
    # justement la règle qu'on autorise.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names[names.index("get_mission_start_readiness") :][:5] == [
        "get_mission_start_readiness",
        "propose_mission_amendment",
        # #1950.4 (24/09/2026, fusion vague 30) — le résumé du plan, posé EN
        # FIN de liste juste avant #2391 (rebased pendant l'intégration).
        "describe_plan",
        # #2391 — le plan de journée (« focus plan »), posé EN FIN.
        "propose_focus_plan",
        "propose_opportunity_update",  # #2324.39 — ajouté EN FIN
    ]


def test_requires_a_mission_id() -> None:
    import asyncio

    result = asyncio.run(_run({}))
    assert "error" in result
    assert "mission" in result["error"].lower()


@pytest.mark.asyncio
async def test_relays_the_verdict_and_named_reserves_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _readiness(user_id: str, mission_id: str) -> dict:
        assert user_id == USER
        assert mission_id == "m-1"
        return {
            "verdict": "ready_with_reserves",
            "agreementsPending": False,
            "missing": [],
            "reserves": ["daily_rate", "site_access"],
            "items": [{"key": "daily_rate", "kind": "derived", "blocking": False, "state": "missing"}],
        }

    monkeypatch.setattr(bellum_api, "mission_start_readiness", _readiness)
    result = await _run({"mission_id": "m-1"})
    assert result["verdict"] == "ready_with_reserves"
    assert result["reserves"] == ["daily_rate", "site_access"]
    assert result["missing"] == []


@pytest.mark.asyncio
async def test_names_each_blocking_item_on_a_blocked_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _readiness(*_a: object, **_k: object) -> dict:
        return {
            "verdict": "blocked",
            "agreementsPending": True,
            "missing": ["client_agreement", "contract_signed"],
            "reserves": [],
            "items": [],
        }

    monkeypatch.setattr(bellum_api, "mission_start_readiness", _readiness)
    result = await _run({"mission_id": "m-2"})
    assert result["verdict"] == "blocked"
    assert result["missing"] == ["client_agreement", "contract_signed"]


@pytest.mark.asyncio
async def test_a_dead_bridge_or_unknown_mission_says_so_rather_than_an_empty_checklist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _readiness(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "mission_start_readiness", _readiness)
    result = await _run({"mission_id": "m-absente"})
    assert "error" in result
    assert not any(isinstance(value, list) and value for value in result.values())
