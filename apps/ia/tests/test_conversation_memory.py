"""Mémoire continue du chatbot (Théo #7) — persistance + rechargement des tours."""

from __future__ import annotations

from types import SimpleNamespace

import app.services.conversation_service as cs
from app.services import rag_service


class _FakeQuery:
    def __init__(self, store: dict):
        self.store = store

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def insert(self, data: dict):
        self.store.setdefault("inserted", []).append(data)
        return self

    async def aexecute(self):
        return SimpleNamespace(data=self.store.get("rows", []), error=None)


class _FakeSb:
    def __init__(self, store: dict):
        self.store = store

    def table(self, _name: str):
        return _FakeQuery(self.store)


async def test_load_recent_history_is_chronological(monkeypatch):
    # DB returns newest-first (order desc); the loader reverses to oldest-first.
    store = {"rows": [{"role": "assistant", "content": "récent"}, {"role": "user", "content": "avant"}]}
    monkeypatch.setattr(cs, "get_supabase", lambda: _FakeSb(store))
    hist = await cs.load_recent_history("user-1", "acc-1")
    assert [h["content"] for h in hist] == ["avant", "récent"]


async def test_load_degrades_and_skips_without_user(monkeypatch):
    def _boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(cs, "get_supabase", _boom)
    assert await cs.load_recent_history("user-1", "acc-1") == []
    assert await cs.load_recent_history("") == []


async def test_save_turn_inserts_row(monkeypatch):
    store: dict = {}
    monkeypatch.setattr(cs, "get_supabase", lambda: _FakeSb(store))
    await cs.save_turn("user-1", "ws-1", "acc-1", "user", "salut")
    assert store["inserted"][0] == {
        "user_id": "user-1",
        "workspace_id": "ws-1",
        "role": "user",
        "content": "salut",
        "account_id": "acc-1",
    }


async def test_save_turn_stamps_workspace_id(monkeypatch):
    """Bug prod 27/09 — `chat_messages.workspace_id` est NOT NULL côté DB
    (migration 1784800000000) ; sans elle, `save_turn` échouait en 400 (23502)
    à CHAQUE tour. `save_turn` doit refuser d'écrire plutôt que d'envoyer une
    ligne qui violera la contrainte (aucune donnée devinée, GA-43)."""
    store: dict = {}
    monkeypatch.setattr(cs, "get_supabase", lambda: _FakeSb(store))
    await cs.save_turn("user-1", "", "acc-1", "user", "sans espace")  # workspace manquant
    assert "inserted" not in store


async def test_save_turn_is_a_noop_on_bad_input(monkeypatch):
    store: dict = {}
    monkeypatch.setattr(cs, "get_supabase", lambda: _FakeSb(store))
    await cs.save_turn("", "ws-1", "a", "user", "x")  # no user
    await cs.save_turn("u", "ws-1", "a", "system", "x")  # invalid role
    await cs.save_turn("u", "ws-1", "a", "user", "   ")  # empty content
    assert "inserted" not in store


def test_chat_endpoint_persists_turns_and_backfills_history(client, monkeypatch):
    saved: list = []

    # Outils ON par défaut : le chemin nominal est l'orchestrateur.
    async def _call(system, user, **k):
        return ("réponse", [])

    async def _retrieve(*a, **k):
        return []

    async def _load(uid, aid="", limit=10):
        return [{"role": "user", "content": "message d'une session précédente"}]

    async def _save(uid, wid, aid, role, content):
        saved.append((role, content))

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    monkeypatch.setattr(rag_service, "retrieve_knowledge_docs", _retrieve)
    monkeypatch.setattr(cs, "load_recent_history", _load)
    monkeypatch.setattr(cs, "save_turn", _save)

    res = client.post(
        "/chat/message", json={"message": "salut", "user_id": "u", "workspace_id": "ws-1", "account_id": "a"}
    )
    assert res.status_code == 200
    assert ("user", "salut") in saved and ("assistant", "réponse") in saved
