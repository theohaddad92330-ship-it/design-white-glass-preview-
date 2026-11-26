"""#2445.6 (#2442.16, #2766) — le producteur de donnée du bac à sable de
rejeu : `record_tool_call_snapshot` (écriture) et `load_replay_sandbox`
(lecture), plus le branchement dans `execute_chat_tool` via
`chat_turn_context`.

Avant ce lot, `ReplaySandboxExecutor` (`chat_replay_sandbox.py`) existait,
testé, sans aucun appelant réel (constat du lot T01, 29/09/2026). Cette suite
prouve les DEUX bouts : un appel d'outil réel pendant un tour écrit une ligne
masquée, et cette ligne redevient un `ReplaySandboxExecutor` qui rejoue
exactement ce résultat — jamais un vrai appel, jamais un résultat inventé
pour un outil absent.
"""

from __future__ import annotations

import pytest

from app.services import chat_tool_call_recording, chat_tools, chat_turn_context
from app.services.chat_replay_sandbox import REPLAY_UNAVAILABLE

USER = "11111111-1111-4111-8111-111111111111"
WS = "22222222-2222-4222-8222-222222222222"
TURN = "33333333-3333-4333-8333-333333333333"


class _Res:
    def __init__(self, data):
        self.data = data
        self.error = None


class _Query:
    def __init__(self, table: str, store: dict, inserts: list[tuple[str, dict]]):
        self._table = table
        self._store = store
        self._inserts = inserts
        self._filters: dict = {}
        self._payload: dict | None = None

    def select(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def insert(self, payload: dict):
        self._payload = dict(payload)
        return self

    async def aexecute(self):
        if self._payload is not None:
            self._inserts.append((self._table, self._payload))
            return _Res([{"id": "recording-row-1", **self._payload}])
        rows = [r for r in self._store.get(self._table, []) if all(r.get(c) == v for c, v in self._filters.items())]
        return _Res(rows)


class _Client:
    def __init__(self, store: dict):
        self._store = store
        self.inserts: list[tuple[str, dict]] = []

    def table(self, name):
        return _Query(name, self._store, self.inserts)


def _store_with_active_workspace() -> dict:
    return {
        "workspace_active_selections": [{"user_id": USER, "workspace_id": WS}],
        "workspace_members": [{"user_id": USER, "workspace_id": WS}],
        "workspaces": [],
        "chat_tool_call_recordings": [],
    }


@pytest.fixture(autouse=True)
def _reset_turn_context():
    chat_turn_context.set_current_turn_id(None)
    yield
    chat_turn_context.set_current_turn_id(None)


async def test_record_tool_call_snapshot_writes_the_masked_result_scoped_to_the_workspace():
    client = _Client(_store_with_active_workspace())
    await chat_tool_call_recording.record_tool_call_snapshot(
        TURN, "get_revenue", {"revenue": 42, "token": "sk-secretvalue1234567890"}, user_id=USER, sb=client
    )

    assert client.inserts, "aucune ligne de rejeu écrite"
    table, row = client.inserts[0]
    assert table == "chat_tool_call_recordings"
    assert row["turn_id"] == TURN
    assert row["tool_name"] == "get_revenue"
    # Le workspace vient de la résolution SERVEUR, jamais d'un paramètre libre.
    assert row["workspace_id"] == WS
    # `mask_tool_result` masque les secrets MACHINE — jamais la donnée métier.
    assert row["masked_result"]["revenue"] == 42
    assert row["masked_result"]["token"] != "sk-secretvalue1234567890"


async def test_record_tool_call_snapshot_never_guesses_a_workspace():
    client = _Client({"workspace_active_selections": [], "workspace_members": [], "workspaces": [], "chat_tool_call_recordings": []})
    await chat_tool_call_recording.record_tool_call_snapshot(TURN, "get_revenue", {"revenue": 1}, user_id=USER, sb=client)

    _, row = client.inserts[0]
    assert row["workspace_id"] is None


async def test_record_tool_call_snapshot_is_fail_soft(monkeypatch: pytest.MonkeyPatch):
    """Un tour de chat par ailleurs correct ne doit jamais planter parce que
    l'enregistrement du rejeu a échoué."""

    class _BrokenClient:
        def table(self, name):
            raise RuntimeError("Supabase indisponible")

    # Ne doit lever aucune exception.
    await chat_tool_call_recording.record_tool_call_snapshot(TURN, "get_revenue", {"revenue": 1}, user_id=USER, sb=_BrokenClient())


async def test_load_replay_sandbox_replays_a_recorded_tool_the_last_write_wins():
    store = _store_with_active_workspace()
    store["chat_tool_call_recordings"] = [
        {"turn_id": TURN, "tool_name": "get_revenue", "masked_result": {"revenue": 1}, "created_at": "2026-09-30T10:00:00Z"},
        {"turn_id": TURN, "tool_name": "get_revenue", "masked_result": {"revenue": 2}, "created_at": "2026-09-30T10:00:05Z"},
        # Un autre tour : `.eq("turn_id", ...)` doit l'exclure du snapshot.
        {"turn_id": "autre-tour", "tool_name": "get_revenue", "masked_result": {"revenue": 999}, "created_at": "2026-09-30T10:00:06Z"},
    ]
    client = _Client(store)
    sandbox = await chat_tool_call_recording.load_replay_sandbox(TURN, sb=client)

    assert sandbox.execute("get_revenue") == {"revenue": 2}
    assert sandbox.execute("un_outil_jamais_enregistre") == REPLAY_UNAVAILABLE


async def test_load_replay_sandbox_with_nothing_recorded_is_all_unavailable():
    client = _Client(_store_with_active_workspace())
    sandbox = await chat_tool_call_recording.load_replay_sandbox(TURN, sb=client)

    assert sandbox.execute("get_revenue") == REPLAY_UNAVAILABLE


async def test_execute_chat_tool_records_a_snapshot_when_a_turn_is_bound(monkeypatch: pytest.MonkeyPatch):
    recorded: list[tuple[str, str, object]] = []

    async def _fake_record(turn_id, tool_name, result, *, user_id, sb=None):
        recorded.append((turn_id, tool_name, result))

    monkeypatch.setattr(chat_tools, "record_tool_call_snapshot", _fake_record)
    monkeypatch.setattr(chat_tools, "record_tool_call", lambda *a, **k: _noop())

    chat_turn_context.set_current_turn_id(TURN)
    await chat_tools.execute_chat_tool("un_outil_qui_nexiste_pas", {}, user_id=USER, profile_data=None)

    assert recorded, "aucun enregistrement alors qu'un tour était lié"
    turn_id, tool_name, _result = recorded[0]
    assert turn_id == TURN
    assert tool_name == "un_outil_qui_nexiste_pas"


async def test_execute_chat_tool_records_nothing_outside_a_bound_turn(monkeypatch: pytest.MonkeyPatch):
    recorded: list[tuple] = []

    async def _fake_record(*a, **k):
        recorded.append((a, k))

    monkeypatch.setattr(chat_tools, "record_tool_call_snapshot", _fake_record)
    monkeypatch.setattr(chat_tools, "record_tool_call", lambda *a, **k: _noop())

    # Aucun `set_current_turn_id` posé — comportement byte-identique à avant
    # ce lot (tests directs, autres appelants).
    await chat_tools.execute_chat_tool("un_outil_qui_nexiste_pas", {}, user_id=USER, profile_data=None)

    assert recorded == []


async def _noop():
    return None
