"""#2338.8 — le DERNIER point ouvert de #2338 : Laura nomme exactement ce qui
manque avant l'action suivante, plutôt que de répondre par un verdict nu.

`MissionStartReadinessPanel` (écran) rend déjà 7 items et leurs états depuis
`GET /delivery/missions/:id/start-readiness` ; ce que ce lot ajoute est le
SEUL chemin qui manquait : que Laura, dans /chat, lise le même calcul et nomme
les manques quand on lui parle de cette mission.

Ce que cette suite verrouille :
  1. l'outil est exposé au modèle, EN FIN de liste (préfixe mis en cache) ;
  2. il refuse sans `mission_id` plutôt que de deviner une cible ;
  3. les manques BLOQUANTS et les RÉSERVES restent deux familles distinctes,
     chacune nommée (clé + libellé), jamais un verdict seul ;
  4. sans pont interne configuré, l'outil le DIT — une liste vide se lirait
     « rien ne manque », une réponse fausse à une question qu'on n'a pas pu
     poser.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "55555555-5555-4555-8555-555555555555"
MISSION = "66666666-6666-4666-8666-666666666666"


def _tool(name: str) -> dict:
    return next(tool for tool in CHAT_TOOLS if tool["name"] == name)


class _ReadOnlyBridge:
    """Le pont interne, réduit à la seule lecture que cet outil a le droit de faire."""

    def __init__(self, payload: dict) -> None:
        self._payload = payload
        self.calls: list[str] = []

    def is_configured(self) -> bool:
        return True

    async def mission_start_readiness(self, user_id: str, mission_id: str):
        self.calls.append(f"mission_start_readiness:{mission_id}")
        return self._payload

    def __getattr__(self, name: str):
        raise AssertionError(
            f"« {name} » n'a rien à faire ici : cet outil ne fait qu'UNE lecture nommée."
        )


def test_the_tool_is_declared_and_added_at_the_end_of_the_list():
    # #1950.4 — la PRÉSENCE, pas la position : un outil ajouté après lui (EN FIN,
    # comme la règle le veut) ne doit pas faire tomber ce test. L'ordre relatif
    # avec son prédécesseur suffit à dire qu'il a été ajouté en fin, pas au milieu.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "get_mission_start_readiness" in names
    assert names.index("get_mission_start_readiness") > names.index("compile_day_closure")


def test_the_tool_requires_a_mission_id():
    schema = _tool("get_mission_start_readiness")["input_schema"]
    assert schema["required"] == ["mission_id"]


@pytest.mark.asyncio
async def test_it_refuses_without_a_mission_id():
    result = await execute_chat_tool("get_mission_start_readiness", {}, user_id=USER, profile_data=None)
    assert "error" in result


@pytest.mark.asyncio
async def test_it_says_it_cannot_when_the_bridge_is_not_configured(monkeypatch):
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await execute_chat_tool(
        "get_mission_start_readiness", {"mission_id": MISSION}, user_id=USER, profile_data=None
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_it_names_blocking_gaps_and_reserves_separately(monkeypatch):
    # #2409.8 a tranché la forme réelle du pont : `missing`/`reserves` sont les
    # CLÉS telles que rendues par le contrat `MissionStartReadiness`
    # (packages/contracts/src/schemas/mission-start-readiness.ts), jamais un
    # objet {key,label} recalculé ici — GA-26, un seul endroit fait le calcul.
    bridge = _ReadOnlyBridge(
        {
            "verdict": "blocked",
            "agreementsPending": True,
            "missing": ["client_agreement", "start_date"],
            "reserves": ["daily_rate"],
            "items": [],
        }
    )
    monkeypatch.setattr("app.services.bellum_api", bridge)

    result = await execute_chat_tool(
        "get_mission_start_readiness", {"mission_id": MISSION}, user_id=USER, profile_data=None
    )

    assert bridge.calls == [f"mission_start_readiness:{MISSION}"]
    assert result["verdict"] == "blocked"
    assert result["agreementsPending"] is True
    assert result["missing"] == ["client_agreement", "start_date"]
    assert result["reserves"] == ["daily_rate"]


@pytest.mark.asyncio
async def test_ready_mission_names_nothing_but_says_so_explicitly(monkeypatch):
    bridge = _ReadOnlyBridge(
        {"verdict": "ready", "agreementsPending": False, "missing": [], "reserves": []}
    )
    monkeypatch.setattr("app.services.bellum_api", bridge)

    result = await execute_chat_tool(
        "get_mission_start_readiness", {"mission_id": MISSION}, user_id=USER, profile_data=None
    )

    assert result["verdict"] == "ready"
    assert result["missing"] == []
    assert result["reserves"] == []


@pytest.mark.asyncio
async def test_it_relays_a_missing_response_honestly(monkeypatch):
    """`bellum_api.mission_start_readiness` rend `None` sur un timeout, un 5xx,
    ou une mission introuvable dans l'espace de l'appelant — l'outil le DIT."""
    bridge = _ReadOnlyBridge({})
    bridge.mission_start_readiness = lambda user_id, mission_id: _none()  # type: ignore[method-assign]
    monkeypatch.setattr("app.services.bellum_api", bridge)

    result = await execute_chat_tool(
        "get_mission_start_readiness", {"mission_id": MISSION}, user_id=USER, profile_data=None
    )
    assert "error" in result


async def _none():
    return None
