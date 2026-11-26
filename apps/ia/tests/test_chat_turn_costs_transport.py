"""#2442.12 (épopée #2879, lot M10 09/10) — LE COÛT D'UN TOUR DE CHAT ATTEINT ENFIN L'API.

Le registre d'une requête repart dans l'en-tête `x-bellum-costs`
(`CostLedgerMiddleware`) — mais un tour de chat est un FLUX : l'en-tête part
avec le premier octet, avant tout appel d'outil ou de modèle. Mesuré : il
partait VIDE, et `provider_costs` ne recevait rien du chat. Le registre du tour
voyage donc dans le `done` (`data.turn_costs`), que l'API retire avant le
navigateur (D19 : un client ne voit jamais nos coûts).
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from app.services import cost_ledger


def _done_event(body: str) -> dict:
    frames = [line[len("data: ") :] for line in body.splitlines() if line.startswith("data: ")]
    events = [json.loads(frame) for frame in frames]
    done = [event for event in events if event.get("type") == "done"]
    assert len(done) == 1, events
    return done[0]


def _post(client, fake_orchestrator):
    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new=fake_orchestrator),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch("app.services.conversation_service.load_recent_history", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post(
            "/chat/message",
            json={"message": "Bonjour", "user_id": "u-1", "workspace_id": "w-1", "conversation_id": "c-1"},
        )
    assert res.status_code == 200
    return _done_event(res.text)


def test_the_done_event_carries_the_turn_costs_tool_by_tool(client):
    async def _fake_orchestrator(*_a, emit=None, **_kw):
        with cost_ledger.bind_tool("web_search"):
            cost_ledger.record("brave", "search", units=1, cost_usd=0.005)
        cost_ledger.record("anthropic", "bellum_chat", units=120, cost_usd=0.01)
        return "Bonjour !", []

    done = _done_event_from(client, _fake_orchestrator)
    rows = done["data"]["turn_costs"]
    assert {"provider": "brave", "operation": "search", "calls": 1, "units": 1, "cost_usd": 0.005, "tool": "web_search"} in rows
    # La génération du tour lui-même : AUCUN outil — la ligne n'en invente pas.
    llm = next(row for row in rows if row["provider"] == "anthropic")
    assert "tool" not in llm


def test_a_turn_that_consumed_nothing_carries_no_cost_key(client):
    """Rien mesuré ⇒ aucune clé — jamais une liste vide qui se lirait « gratuit »."""

    async def _fake_orchestrator(*_a, emit=None, **_kw):
        return "Bonjour !", []

    done = _done_event_from(client, _fake_orchestrator)
    assert "turn_costs" not in done["data"]


def _done_event_from(client, fake_orchestrator) -> dict:
    return _post(client, fake_orchestrator)
