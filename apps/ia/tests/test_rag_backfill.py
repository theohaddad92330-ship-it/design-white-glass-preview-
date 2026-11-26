"""Le rattrapage des embeddings manquants.

Il existe parce que l'embedding se calcule à l'ingestion : tout document déposé
avant que la clé existe n'a pas de vecteur. Ces tests verrouillent les trois
propriétés qui rendent un rattrapage relançable sans crainte.
"""

from __future__ import annotations

import pytest

from app.services import rag_service
from app.services.rag_service import backfill_embeddings


class _FakeTable:
    """Table Supabase en double, réduite à ce que le rattrapage utilise."""

    def __init__(self, store: dict):
        self._store = store
        self._null_only = False
        self._limit = None
        self._update: dict | None = None
        self._eq_id: str | None = None

    def select(self, _cols):
        return self

    def is_(self, column, value):
        self._null_only = column == "embedding" and value == "null"
        return self

    def limit(self, n):
        self._limit = n
        return self

    def update(self, patch):
        self._update = patch
        return self

    def eq(self, _column, value):
        self._eq_id = value
        return self

    async def aexecute(self):
        if self._update is not None:
            self._store[self._eq_id]["embedding"] = self._update["embedding"]
            return type("R", (), {"data": [], "error": None})()
        rows = [dict(r) for r in self._store.values() if r.get("embedding") is None]
        return type("R", (), {"data": rows[: self._limit], "error": None})()


def _supabase(store: dict):
    return type("SB", (), {"table": lambda self, _name: _FakeTable(store)})()


@pytest.fixture
def store(monkeypatch):
    data = {
        "a": {"id": "a", "title": "Contrat TMA", "content": "…", "embedding": None},
        "b": {"id": "b", "title": "Playbook", "content": "…", "embedding": None},
        "c": {"id": "c", "title": "Déjà vectorisé", "content": "…", "embedding": [0.1]},
    }
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _supabase(data))
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")
    return data


@pytest.mark.asyncio
async def test_ne_touche_que_les_documents_sans_vecteur(store, monkeypatch):
    async def _embed(_title, _content):
        return [0.42]

    monkeypatch.setattr(rag_service, "_maybe_generate_embedding", _embed)

    result = await backfill_embeddings()

    assert result == {"embedded": 2, "failed": 0, "scanned": 2}
    assert store["a"]["embedding"] == [0.42]
    assert store["b"]["embedding"] == [0.42]
    # Un document déjà vectorisé n'est pas ré-embeddé : ce serait payer deux fois.
    assert store["c"]["embedding"] == [0.1]


@pytest.mark.asyncio
async def test_un_echec_ne_fait_pas_tomber_le_lot(store, monkeypatch):
    async def _embed(title, _content):
        return None if title == "Contrat TMA" else [0.42]

    monkeypatch.setattr(rag_service, "_maybe_generate_embedding", _embed)

    result = await backfill_embeddings()

    assert result["embedded"] == 1
    assert result["failed"] == 1
    # La ligne en échec reste à NULL — elle repassera au prochain lancement
    # plutôt que d'être marquée traitée à tort.
    assert store["a"]["embedding"] is None


@pytest.mark.asyncio
async def test_la_borne_permet_de_mesurer_le_cout_avant_de_tout_lancer(store, monkeypatch):
    async def _embed(_title, _content):
        return [0.42]

    monkeypatch.setattr(rag_service, "_maybe_generate_embedding", _embed)

    result = await backfill_embeddings(max_documents=1)

    assert result["embedded"] == 1
    assert result["scanned"] == 1


@pytest.mark.asyncio
async def test_sans_cle_le_rattrapage_ne_touche_a_rien(store, monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)

    result = await backfill_embeddings()

    assert result["embedded"] == 0
    assert "EMBEDDING_API_KEY" in result["skipped"]
    assert store["a"]["embedding"] is None
