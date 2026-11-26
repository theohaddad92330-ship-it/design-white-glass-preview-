"""#11 : retrieval FTS (websearch_to_tsquery) pour TextSearchFallback — vrai
recall tokenisé au lieu d'un ILIKE une-sous-chaîne (~0 recall). ILIKE reste en
secours si FTS échoue."""

from __future__ import annotations

from app.services import rag_service
from app.services.rag_service import TextSearchFallback


class _Res:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error


class _FakeQuery:
    """Chainable, enregistre les opérateurs PostgREST utilisés."""

    def __init__(self, calls: list, rows_by_op: dict, fail_op: str | None):
        self._calls = calls
        self._rows_by_op = rows_by_op
        self._fail_op = fail_op
        self._op: str | None = None

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def or_(self, *a, **k):  # #2779 — la visibilité par portée (hors sujet ici)
        return self

    def is_(self, *a, **k):  # #2431.5 — l'exclusion des documents archivés (hors sujet ici)
        return self

    def limit(self, *a, **k):
        return self

    def text_search(self, column, query, **k):
        self._op = f"fts:{column}"
        self._calls.append(self._op)
        return self

    def ilike(self, column, value, **k):
        self._op = f"ilike:{column}"
        self._calls.append(self._op)
        return self

    async def aexecute(self):
        if self._fail_op and self._op == self._fail_op:
            return _Res(None, error="fts config missing")
        return _Res(self._rows_by_op.get(self._op, []))


class _FakeClient:
    def __init__(self, calls, rows_by_op, fail_op=None):
        self._calls = calls
        self._rows_by_op = rows_by_op
        self._fail_op = fail_op

    def table(self, name):
        return _FakeQuery(self._calls, self._rows_by_op, self._fail_op)


async def test_uses_fts_not_ilike(monkeypatch):
    calls: list = []
    rows = {"fts:content": [{"id": "1", "title": "T", "content": "migration cloud SAP"}]}
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _FakeClient(calls, rows))
    docs = await TextSearchFallback().query("migration cloud", "user-1", top_k=5)
    assert [d["id"] for d in docs] == ["1"]
    assert any(c.startswith("fts:") for c in calls)  # FTS emprunté
    assert not any(c.startswith("ilike:") for c in calls)  # pas d'ILIKE quand FTS marche


async def test_empty_query_returns_empty(monkeypatch):
    calls: list = []
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _FakeClient(calls, {}))
    assert await TextSearchFallback().query("   ", "user-1") == []
    assert calls == []  # aucun appel réseau


async def test_falls_back_to_ilike_on_fts_error(monkeypatch):
    calls: list = []
    rows = {"ilike:content": [{"id": "9", "title": "T", "content": "x"}]}
    client = _FakeClient(calls, rows, fail_op="fts:content")
    monkeypatch.setattr(rag_service, "get_supabase", lambda: client)
    docs = await TextSearchFallback().query("q", "user-1")
    assert [d["id"] for d in docs] == ["9"]
    assert "fts:content" in calls  # FTS tenté d'abord
    assert any(c.startswith("ilike:") for c in calls)  # puis repli ILIKE


# ── #13 : l'ingest embed une large fenêtre du corps (pas juste 500 chars) ─────
async def test_ingest_embeds_wide_content_window(monkeypatch):
    # Vecteurs ON dès que la clé d'embedding est présente (zéro-flag).
    monkeypatch.setenv("EMBEDDING_API_KEY", "test-key")
    monkeypatch.setenv("RAG_EMBED_CONTENT_CHARS", "2000")
    captured: dict = {}

    # #3750 — l'ingestion écrit ENSUITE les morceaux du document (leurs propres
    # embeddings, leur propre insertion) : on retient le PREMIER embedding et la
    # PREMIÈRE insertion, ceux de la ligne `rag_documents` que ce test épingle.
    async def _fake_embed(self, text):
        captured.setdefault("text", text)
        return [0.0]

    class _InsertQ:
        def insert(self, data):
            captured.setdefault("inserted", data)
            return self

        async def aexecute(self):
            return _Res([{"id": "x"}])

    monkeypatch.setattr(rag_service.PgVectorSearch, "_get_embedding", _fake_embed)
    monkeypatch.setattr(rag_service, "get_supabase", lambda: type("C", (), {"table": lambda self, n: _InsertQ()})())

    body = "A" * 5000
    await rag_service.ingest("Titre", body, "crm", "user-1")
    # le corps embarqué dépasse largement les 500 chars d'avant (2000 ici)
    assert captured["text"].count("A") == 2000
    # le contenu complet est stocké (seul le VECTEUR est fenêtré)
    assert captured["inserted"]["content"] == body
