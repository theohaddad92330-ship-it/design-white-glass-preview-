"""#2431.5 (reste, épopée #2886) — un document RAG remplacé (« Remplacer /
actualiser », `archived_at` posé par `RagService.replaceDocument`) ne grounde
plus la DÉCOUVERTE générale du copilote.

`listForWorkspace` (NestJS, écran Connaissances) excluait déjà l'archivé de
l'affichage — mais la récupération qui alimente une réponse
(`_scope_retrieval`, ce fichier) l'ignorait : un document remplacé pouvait
continuer à grounder une analyse, en silence, exactement le trou nommé par
l'épopée (« Non touché, nommé plutôt que deviné »).

`fetch_documents_by_ids` reste volontairement DIFFÉRENT : un document JOINT
explicitement par son identifiant (pièce jointe de conversation) reste lisible
même archivé — la doctrine « on archive, on ne supprime pas » vaut aussi pour
une citation déjà rendue ou une question suivante du même fil.
"""

from __future__ import annotations

from app.services import rag_service
from app.services.rag_service import TextSearchFallback
from tests.rag_visibility_fake import is_visibility_filter, visibility_predicate

WS_A = "11111111-1111-1111-1111-111111111111"
ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

ROWS = [
    {
        "id": "active-doc",
        "user_id": ALICE,
        "workspace_id": WS_A,
        "scope": "workspace",
        "title": "Grille de tarification",
        "content": "migration cloud tarifs",
        "category": "ref",
        "archived_at": None,
    },
    {
        "id": "archived-doc",
        "user_id": ALICE,
        "workspace_id": WS_A,
        "scope": "workspace",
        "title": "Grille de tarification (v1)",
        "content": "migration cloud tarifs v1",
        "category": "ref",
        "archived_at": "2026-09-26T01:00:00Z",
        "replaced_by_id": "active-doc",
    },
]


class _Res:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error


class _FakeQuery:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._preds: list = []
        self._limit = 100

    def select(self, *a, **k):
        return self

    def limit(self, n, *a, **k):
        self._limit = n
        return self

    def eq(self, column, value):
        self._preds.append(lambda r: r.get(column) == value)
        return self

    def in_(self, column, values):
        self._preds.append(lambda r: r.get(column) in values)
        return self

    def or_(self, expression: str):
        if is_visibility_filter(expression):
            self._preds.append(visibility_predicate(expression))
            return self
        ws = expression.split("workspace_id.eq.", 1)[1].split(",", 1)[0]
        uid = expression.split("user_id.eq.", 1)[1].rstrip(")")
        self._preds.append(
            lambda r: r.get("workspace_id") == ws or (r.get("workspace_id") is None and r.get("user_id") == uid)
        )
        return self

    def is_(self, column, value):
        if value == "null":
            self._preds.append(lambda r: r.get(column) is None)
        else:
            self._preds.append(lambda r: r.get(column) == value)
        return self

    def text_search(self, column, query, **k):
        tokens = query.lower().split()
        self._preds.append(lambda r: any(t in str(r.get(column) or "").lower() for t in tokens))
        return self

    def ilike(self, column, value, **k):
        needle = value.strip("%").lower()
        self._preds.append(lambda r: needle in str(r.get(column) or "").lower())
        return self

    async def aexecute(self):
        out = [r for r in self._rows if all(p(r) for p in self._preds)]
        return _Res(out[: self._limit])


class _FakeClient:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        return _FakeQuery(self._rows)


def _install(monkeypatch):
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _FakeClient(ROWS))


async def test_fts_excludes_a_replaced_document(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch)
    docs = await TextSearchFallback().query("migration cloud tarifs", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "active-doc" in ids
    assert "archived-doc" not in ids


async def test_ilike_degradation_also_excludes_a_replaced_document(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch)
    docs = await TextSearchFallback()._ilike("migration cloud tarifs", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "active-doc" in ids
    assert "archived-doc" not in ids


async def test_retrieve_knowledge_docs_excludes_a_replaced_document(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch)
    docs = await rag_service.retrieve_knowledge_docs("migration cloud tarifs", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "active-doc" in ids
    assert "archived-doc" not in ids


async def test_fetch_documents_by_ids_still_reads_an_archived_document_by_id(monkeypatch):
    """Une pièce jointe de conversation reste lisible même archivée — seule la
    DÉCOUVERTE générale l'exclut, jamais la lecture par identifiant."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch)
    docs = await rag_service.fetch_documents_by_ids(["archived-doc"], ALICE, workspace_id=WS_A)
    assert {d["id"] for d in docs} == {"archived-doc"}
