"""#2879 (#2442.15, lot V36 28/09/2026) — `record_leak_detected` écrit
`security_events.kind = 'leak_detected'` avec le workspace RE-VÉRIFIÉ serveur,
même discipline que `tool_call_audit.record_tool_call` (voir
`test_chat_tool_call_audit.py`)."""

from __future__ import annotations

from app.services import security_event_reporting

USER = "11111111-1111-4111-8111-111111111111"
WS = "22222222-2222-4222-8222-222222222222"


class _Res:
    def __init__(self, data):
        self.data = data


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
            return _Res([{"id": "security-event-1", **self._payload}])
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
    }


async def test_record_leak_detected_writes_the_server_verified_workspace_id():
    client = _Client(_store_with_active_workspace())
    await security_event_reporting.record_leak_detected("search_market_memory", user_id=USER, sb=client)

    assert client.inserts, "aucune ligne security_events écrite"
    table, row = client.inserts[0]
    assert table == "security_events"
    assert row["kind"] == "leak_detected"
    assert row["status_code"] is None  # jamais une valeur HTTP inventée
    assert row["path"] == "tool:search_market_memory"
    # Le workspace vient de la RÉSOLUTION serveur, jamais d'un paramètre libre.
    assert row["workspace_id"] == WS


async def test_record_leak_detected_never_guesses_a_workspace():
    client = _Client({"workspace_active_selections": [], "workspace_members": [], "workspaces": []})
    await security_event_reporting.record_leak_detected("search_market_memory", user_id=USER, sb=client)

    _, row = client.inserts[0]
    assert row["workspace_id"] is None


async def test_record_leak_detected_never_raises_when_the_write_fails():
    class _BrokenClient:
        def table(self, _name):
            raise RuntimeError("Supabase indisponible")

    # Fail-soft : un échec d'écriture de ce signal ne doit jamais faire
    # planter le tour de chat par ailleurs correct.
    await security_event_reporting.record_leak_detected("search_market_memory", user_id=USER, sb=_BrokenClient())
