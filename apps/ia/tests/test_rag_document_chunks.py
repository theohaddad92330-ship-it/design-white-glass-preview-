"""#3750 — les morceaux d'un document : écrits à l'ingestion, cherchés,
cités « Titre — unité », bornés, rattrapés.

Points tenus ici :

* 3750.2 — un embedding par morceau ; la recherche rend le morceau, le titre
  du PARENT, son unité et sa similarité ;
* 3750.3 — le budget du prompt (6 morceaux × 1 200 caractères) vit à UN endroit ;
* 3750.4 — le rattrapage ne refait rien une fois passé ;
* 3750.5 — un document court reste UN morceau, sans embedding de plus ;
* 3750.6 — sans ``EMBEDDING_API_KEY`` : plein texte sur les morceaux, ZÉRO réseau ;
* 3750.7 — le nombre d'embeddings par document est borné, et l'écart journalisé ;
* repli : un document sans morceau est rendu par l'ancien chemin, tel quel.
"""

from __future__ import annotations

import logging
from typing import Any

import pytest

from app.services import rag_chunks, rag_service
from app.services.rag_chunking import RAG_MAX_CHUNKS_PER_DOCUMENT

WS = "11111111-1111-1111-1111-111111111111"
USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.error = None


class _Query:
    """Une requête PostgREST factice : chaque appel chaîné rend la requête,
    `aexecute` rend ce que le magasin a préparé pour (table, opération)."""

    def __init__(self, store: _Store, table: str) -> None:
        self._store = store
        self._table = table
        self._op = "select"
        self._payload: Any = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload, *_a, **_k):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload, *_a, **_k):
        self._op = "update"
        self._payload = payload
        return self

    def __getattr__(self, _name):
        return lambda *_a, **_k: self

    async def aexecute(self):
        return self._store.execute(self._table, self._op, self._payload)


class _Rpc:
    def __init__(self, store: _Store, name: str, params: dict) -> None:
        self._store = store
        self._name = name
        self._params = params

    async def aexecute(self):
        self._store.rpc_calls.append((self._name, self._params))
        handler = self._store.rpcs.get(self._name)
        if isinstance(handler, Exception):
            raise handler
        data = handler(self._params) if callable(handler) else handler
        return _Result(data)


class _Store:
    def __init__(self) -> None:
        self.inserts: dict[str, list[Any]] = {}
        self.selects: dict[str, list[dict]] = {}
        self.rpcs: dict[str, Any] = {}
        self.rpc_calls: list[tuple[str, dict]] = []
        self.fail_chunk_insert_for: set[str] = set()

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rpc(self, name: str, params: dict) -> _Rpc:
        return _Rpc(self, name, params)

    def execute(self, table: str, op: str, payload: Any) -> _Result:
        if op == "insert":
            rows = payload if isinstance(payload, list) else [payload]
            if table == "rag_document_chunks" and any(r.get("document_id") in self.fail_chunk_insert_for for r in rows):
                raise RuntimeError("insert refusé")
            self.inserts.setdefault(table, []).extend(rows)
            if table == "rag_documents":
                return _Result([{"id": "doc-1"}])
            return _Result(rows)
        return _Result(self.selects.get(table, []))


@pytest.fixture
def store(monkeypatch):
    s = _Store()
    monkeypatch.setattr(rag_service, "get_supabase", lambda: s)
    monkeypatch.setattr(rag_chunks, "get_supabase", lambda: s)
    return s


@pytest.fixture
def no_network(monkeypatch):
    """Toute ouverture d'un client HTTP fait échouer le test : « zéro réseau »
    se PROUVE, il ne se suppose pas."""
    import httpx

    def _boom(*_a, **_k):
        raise AssertionError("appel réseau interdit sans EMBEDDING_API_KEY")

    monkeypatch.setattr(httpx, "AsyncClient", _boom)
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)


def _sheet(rows: int) -> str:
    return "\n".join(["Objection\tRéponse", *(f"Objection {i}\tRéponse détaillée numéro {i}" for i in range(rows))])


# ─── ingestion ───


class TestIngestWritesChunks:
    async def test_a_long_document_writes_one_chunk_per_unit_without_key(self, store, no_network):
        units = [("01 · Positionnement", "p" * 1000), ("07 · Objections", "o" * 1000)]
        await rag_service.ingest(
            "Brand Messaging", "p" * 1000 + "\n" + "o" * 1000, "methode", USER, WS, origin="uploaded", units=units
        )
        chunks = store.inserts["rag_document_chunks"]
        assert [c["unit_label"] for c in chunks] == ["01 · Positionnement", "07 · Objections"]
        assert [c["chunk_index"] for c in chunks] == [0, 1]
        assert all(c["document_id"] == "doc-1" for c in chunks)
        assert all(c["workspace_id"] == WS and c["user_id"] == USER for c in chunks)
        # 3750.6 — sans clé : aucun embedding, aucun appel (le fixture le prouve).
        assert all("embedding" not in c for c in chunks)
        # La ligne parente est écrite comme avant (compat).
        assert store.inserts["rag_documents"][0]["content"].startswith("p")

    async def test_a_short_document_is_one_chunk_and_costs_no_extra_embedding(self, store, monkeypatch):
        monkeypatch.setenv("EMBEDDING_API_KEY", "test-key")
        calls: list[str] = []

        async def fake_embedding(self, text: str) -> list[float]:
            calls.append(text)
            return [0.1, 0.2]

        monkeypatch.setattr(rag_service.PgVectorSearch, "_get_embedding", fake_embedding)

        async def no_batch(_texts):
            raise AssertionError("un document court ne relance pas d'embedding")

        monkeypatch.setattr(rag_chunks, "_get_embeddings", no_batch)
        await rag_service.ingest("Référence", "Migration cloud bancaire en six mois.", "ref", USER, WS)
        chunks = store.inserts["rag_document_chunks"]
        assert len(chunks) == 1
        assert chunks[0]["unit_label"] == ""
        assert chunks[0]["content"] == "Migration cloud bancaire en six mois."
        # Le vecteur du document est réutilisé : UN seul appel, comme avant ce lot.
        assert chunks[0]["embedding"] == [0.1, 0.2]
        assert len(calls) == 1

    async def test_with_a_key_each_chunk_gets_its_own_embedding(self, store, monkeypatch):
        monkeypatch.setenv("EMBEDDING_API_KEY", "test-key")

        async def fake_embedding(self, text: str) -> list[float]:
            return [9.0]

        async def fake_batch(texts: list[str]) -> list[list[float]]:
            return [[float(i)] for i, _ in enumerate(texts)]

        monkeypatch.setattr(rag_service.PgVectorSearch, "_get_embedding", fake_embedding)
        monkeypatch.setattr(rag_chunks, "_get_embeddings", fake_batch)
        units = [("Slide 1", "a" * 1000), ("Slide 13", "b" * 1000)]
        await rag_service.ingest("Deck", "a" * 1000 + "\n" + "b" * 1000, "deck", USER, WS, units=units)
        chunks = store.inserts["rag_document_chunks"]
        assert [c["embedding"] for c in chunks] == [[0.0], [1.0]]

    async def test_the_embedding_count_is_bounded_and_the_overflow_logged(self, store, no_network, caplog):
        total = RAG_MAX_CHUNKS_PER_DOCUMENT + 50
        units = [(f"S{i}", "z" * 1000) for i in range(total)]
        with caplog.at_level(logging.WARNING):
            await rag_service.ingest("Gros classeur", "z" * 2000, "x", USER, WS, units=units)
        assert len(store.inserts["rag_document_chunks"]) == RAG_MAX_CHUNKS_PER_DOCUMENT
        assert any(str(total) in r.getMessage() and "tronqu" in r.getMessage() for r in caplog.records)

    async def test_a_chunk_write_failure_never_fails_the_ingestion(self, store, no_network):
        store.fail_chunk_insert_for = {"doc-1"}
        result = await rag_service.ingest("Doc", "x" * 3000, "x", USER, WS)
        assert result["id"] == "doc-1"
        assert "rag_document_chunks" not in store.inserts

    async def test_a_conversation_attachment_is_not_chunked(self, store, no_network):
        await rag_service.ingest("CV", "x" * 3000, "cv", USER, WS, scope="conversation", conversation_id="general")
        assert "rag_document_chunks" not in store.inserts


# ─── recherche ───


def _chunk_row(doc: str, label: str, content: str, similarity: float | None = None) -> dict:
    return {
        "chunk_id": f"{doc}-{label}",
        "document_id": doc,
        "title": f"Titre {doc}",
        "category": "methode",
        "origin": "uploaded",
        "created_at": None,
        "unit_label": label,
        "chunk_index": 0,
        "content": content,
        "similarity": similarity,
    }


class TestQueryOnChunks:
    async def test_chunks_come_first_grouped_by_parent_then_unchunked_documents(self, store, no_network, monkeypatch):
        store.rpcs["search_rag_document_chunks"] = [
            _chunk_row("A", "07 · Objections", "Trop cher : TCO"),
            _chunk_row("B", "Slide 2", "Preuve"),
            _chunk_row("A", "08 · Preuves", "Cas client"),
        ]

        async def legacy(self, *_a, **_k):
            return [
                {"id": "A", "title": "Titre A", "content": "tout le classeur"},
                {"id": "C", "title": "Vieux doc", "content": "jamais découpé"},
            ]

        monkeypatch.setattr(rag_service.TextSearchFallback, "query", legacy)
        results = await rag_service.query("objection prix", USER, 5, WS)
        assert [(r["id"], r.get("unit_label")) for r in results] == [
            ("A", "07 · Objections"),
            ("A", "08 · Preuves"),
            ("B", "Slide 2"),
            ("C", None),
        ]
        first = results[0]
        assert first["title"] == "Titre A" and first["content"] == "Trop cher : TCO" and "similarity" in first

    async def test_without_key_the_rpc_searches_full_text_with_no_vector(self, store, no_network, monkeypatch):
        store.rpcs["search_rag_document_chunks"] = []

        async def legacy(self, *_a, **_k):
            return []

        monkeypatch.setattr(rag_service.TextSearchFallback, "query", legacy)
        await rag_service.query("objection", USER, 5, WS)
        name, params = store.rpc_calls[0]
        assert name == "search_rag_document_chunks"
        assert params["query_embedding"] is None
        assert params["query_text"] == "objection"
        assert params["filter_workspace_id"] == WS

    async def test_without_any_chunk_the_old_path_is_returned_unchanged(self, store, no_network, monkeypatch):
        store.rpcs["search_rag_document_chunks"] = RuntimeError("relation does not exist")
        legacy_docs = [{"id": "C", "title": "Vieux doc", "content": "jamais découpé", "category": "ref"}]

        async def legacy(self, *_a, **_k):
            return [dict(d) for d in legacy_docs]

        monkeypatch.setattr(rag_service.TextSearchFallback, "query", legacy)
        assert await rag_service.query("doc", USER, 5, WS) == legacy_docs


# ─── budget du prompt ───


class TestContextBudget:
    def test_the_citation_names_the_parent_and_the_unit(self):
        block = rag_service.format_knowledge_context(
            [{"id": "A", "title": "Brand Messaging", "unit_label": "07 · Objections", "content": "Trop cher : TCO"}]
        )
        assert "- Brand Messaging — 07 · Objections : Trop cher : TCO" in block

    def test_the_default_budget_is_ten_chunks_of_1200_chars(self, monkeypatch):
        # #4016 L7 (décision Louis 11/10/2026) — RAG élargi : 6 → 10 morceaux.
        # 10 × (1 200 + 160) ≈ 13 600 caractères ≈ 3 400 jetons d'entrée : sans
        # effet mesurable sur le budget du tour (`CHAT_TURN_BUDGET_S` 90 s).
        monkeypatch.delenv("RAG_KNOWLEDGE_TOP_K", raising=False)
        assert rag_service.RAG_CONTEXT_MAX_CHUNKS == 10
        assert rag_service.RAG_CONTEXT_CHUNK_CHARS == 1200
        docs = [
            {
                "id": f"D{i}",
                "title": f"T{i}",
                "unit_label": "U",
                "content": f"{i}" + "x" * 3000,
                "similarity": 1 - i / 20,
            }
            for i in range(14)
        ]
        block, used = rag_service.format_knowledge_context_with_sources(docs)
        lines = [line for line in block.splitlines() if line.startswith("- ")]
        assert len(lines) == 10
        assert all(len(line.split(" : ", 1)[1]) == 1200 for line in lines)
        assert [u["docId"] for u in used] == [f"D{i}" for i in range(10)]

    def test_the_wider_budget_stays_under_the_rerank_pool(self, monkeypatch):
        # Le rerank tire `RAG_KNOWLEDGE_CANDIDATES` (12) candidats AVANT de garder
        # `context_max_chunks()` : élargir l'injection au-delà du bassin ne
        # rendrait rien de plus.
        from app.services import rag_knowledge

        monkeypatch.delenv("RAG_KNOWLEDGE_TOP_K", raising=False)
        monkeypatch.delenv("RAG_KNOWLEDGE_CANDIDATES", raising=False)
        assert rag_knowledge._inject_k() == 10
        assert rag_knowledge._candidate_k() >= rag_knowledge._inject_k()

    def test_two_chunks_of_one_document_count_it_once_as_a_source(self):
        docs = [
            {"id": "A", "title": "Brand", "unit_label": "07", "content": "objections"},
            {"id": "A", "title": "Brand", "unit_label": "08", "content": "preuves"},
        ]
        block, used = rag_service.format_knowledge_context_with_sources(docs)
        assert block.count("- Brand — ") == 2
        assert [u["docId"] for u in used] == ["A"]


# ─── rattrapage ───


class TestBackfill:
    async def test_pending_documents_are_chunked_and_a_rerun_does_nothing(self, store, no_network):
        long_doc = {"id": "L", "title": "Long", "content": "# Offre\n" + "a" * 1600 + "\n# Objections\n" + "b" * 1600}
        store.rpcs["rag_documents_pending_chunks"] = lambda _p: [
            {**long_doc, "user_id": USER, "workspace_id": WS}
        ]
        first = await rag_chunks.backfill_document_chunks(batch_size=5)
        assert first["documents"] == 1
        labels = [c["unit_label"] for c in store.inserts["rag_document_chunks"]]
        assert labels[0] == "Offre" and labels[-1] == "Objections"

        # Le document a désormais ses morceaux : la base ne le rend plus.
        store.rpcs["rag_documents_pending_chunks"] = []
        written_before = len(store.inserts["rag_document_chunks"])
        second = await rag_chunks.backfill_document_chunks(batch_size=5)
        assert second["documents"] == 0
        assert len(store.inserts["rag_document_chunks"]) == written_before
        assert store.rpc_calls[0][1] == {"min_chars": 2000, "batch_size": 5}

    async def test_one_failing_document_does_not_stop_the_batch(self, store, no_network):
        store.fail_chunk_insert_for = {"KO"}
        store.rpcs["rag_documents_pending_chunks"] = [
            {"id": "KO", "title": "Cassé", "content": "k" * 2500, "user_id": USER, "workspace_id": WS},
            {"id": "OK", "title": "Sain", "content": "s" * 2500, "user_id": USER, "workspace_id": WS},
        ]
        result = await rag_chunks.backfill_document_chunks(batch_size=5)
        assert result == {"documents": 1, "failed": 1, "chunks": len(store.inserts["rag_document_chunks"])}
        assert {c["document_id"] for c in store.inserts["rag_document_chunks"]} == {"OK"}


# ─── transparence : la source nomme les unités lues ───


class TestTransparencySources:
    def test_one_source_per_document_naming_the_units_read(self):
        from app.prompts.context_transparency import _sources_from_docs

        sources = _sources_from_docs(
            [
                {"id": "A", "title": "Brand Messaging", "unit_label": "07 · Objections", "content": "prix"},
                {"id": "A", "title": "Brand Messaging", "unit_label": "08 · Preuves", "content": "cas"},
                {"id": "C", "title": "Vieux doc", "content": "entier"},
            ]
        )
        assert [s["label"] for s in sources] == ["Brand Messaging — 07 · Objections, 08 · Preuves", "Vieux doc"]
