"""`POST /internal/chat-replay/{turn_id}/execute` (#2445.6, #2442.16, #2766) —
le PREMIER appelant réel de `ReplaySandboxExecutor` (voir son docstring et
celui de `internal_chat_replay.py` : jusqu'à ce lot, l'exécuteur existait,
testé, sans aucun appelant).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.routers import internal_chat_replay
from app.services.chat_replay_sandbox import REPLAY_UNAVAILABLE, ReplaySandboxExecutor

client = TestClient(app)

TURN = "33333333-3333-4333-8333-333333333333"


def test_execute_replays_a_recorded_tool_call(monkeypatch) -> None:
    async def _fake_load(turn_id, *, sb=None):
        assert turn_id == TURN
        return ReplaySandboxExecutor(snapshot={"get_revenue": {"revenue": 42}})

    monkeypatch.setattr(internal_chat_replay, "load_replay_sandbox", _fake_load)

    res = client.post(f"/internal/chat-replay/{TURN}/execute", json={"tool_name": "get_revenue"})

    assert res.status_code == 200
    assert res.json() == {"turnId": TURN, "result": {"revenue": 42}}


def test_execute_never_invents_a_result_for_an_unrecorded_tool(monkeypatch) -> None:
    async def _fake_load(turn_id, *, sb=None):
        return ReplaySandboxExecutor(snapshot={})

    monkeypatch.setattr(internal_chat_replay, "load_replay_sandbox", _fake_load)

    res = client.post(f"/internal/chat-replay/{TURN}/execute", json={"tool_name": "get_revenue"})

    assert res.status_code == 200
    assert res.json() == {"turnId": TURN, "result": REPLAY_UNAVAILABLE}
