"""#2438.3 — chaque outil de chat est borné par un schéma workspace et audité
server-side.

Avant ce lot : `execute_chat_tool` scope à `user_id` mais ne journalise AUCUN
appel — `tool-registry/*` ne couvre que les connecteurs/intégrations, jamais un
cadre d'exécution d'outils agentiques audité (mesure du 22/09 soir). Un
attaquant qui obtient un accès modèle peut donc appeler n'importe quel outil
sans laisser de trace nommant le workspace.

Deux garanties tenues ici :

1. `record_tool_call` écrit une ligne dans `ai_tool_call_audit_log` avec le
   `workspace_id` RE-VÉRIFIÉ serveur (`resolve_workspace_id`, qui re-prouve
   l'appartenance), jamais un identifiant pris tel quel côté modèle.
2. `execute_chat_tool` appelle `record_tool_call` pour CHAQUE dispatch, y
   compris l'outil inconnu — un tool call qui échappe à l'audit est le trou
   qu'on referme.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools, tool_call_audit

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
            return _Res([{"id": "audit-row-1", **self._payload}])
        rows = [
            r
            for r in self._store.get(self._table, [])
            if all(r.get(c) == v for c, v in self._filters.items())
        ]
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


async def test_record_tool_call_writes_the_server_verified_workspace_id():
    client = _Client(_store_with_active_workspace())
    await tool_call_audit.record_tool_call("compare_accounts", user_id=USER, status="done", sb=client)

    assert client.inserts, "aucune ligne d'audit écrite"
    table, row = client.inserts[0]
    assert table == "ai_tool_call_audit_log"
    assert row["tool_name"] == "compare_accounts"
    assert row["user_id"] == USER
    # Le workspace vient de la RÉSOLUTION serveur, jamais d'un paramètre libre.
    assert row["workspace_id"] == WS
    assert row["status"] == "done"


async def test_record_tool_call_never_guesses_a_workspace():
    client = _Client({"workspace_active_selections": [], "workspace_members": [], "workspaces": []})
    await tool_call_audit.record_tool_call("compare_accounts", user_id=USER, status="done", sb=client)

    _, row = client.inserts[0]
    assert row["workspace_id"] is None


async def test_execute_chat_tool_audits_every_dispatch_even_an_unknown_tool(monkeypatch: pytest.MonkeyPatch):
    calls: list[tuple[str, str, str]] = []

    async def _fake_record(name: str, *, user_id: str, status: str, sb=None) -> None:
        calls.append((name, user_id, status))

    monkeypatch.setattr(tool_call_audit, "record_tool_call", _fake_record)
    monkeypatch.setattr(chat_tools, "record_tool_call", _fake_record)

    result = await chat_tools.execute_chat_tool(
        "un_outil_qui_nexiste_pas", {}, user_id=USER, profile_data=None
    )

    assert result == {"error": "Outil inconnu: un_outil_qui_nexiste_pas"}
    assert calls, "execute_chat_tool n'a journalisé aucun appel"
    name, user_id, status = calls[0]
    assert name == "un_outil_qui_nexiste_pas"
    assert user_id == USER
    assert status == "error"
