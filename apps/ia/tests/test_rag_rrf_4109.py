"""#4109 — Reciprocal Rank Fusion (k=60) puis reranker FlashRank optionnel.

Score RRF d'un document = somme, sur chaque liste où il figure, de 1 / (60 + rang),
le rang commençant à 1.
"""

from __future__ import annotations

import sys

import pytest

from app.services import rag_service
from app.services.rag_service import HybridSearch, TextSearchFallback, reciprocal_rank_fusion


def _doc(doc_id: str) -> dict:
    return {"id": doc_id, "title": f"doc {doc_id}", "content": "…", "category": None}


async def _coro(value):
    return value


def _ids(docs: list[dict]) -> list[str]:
    return [d["id"] for d in docs]


def test_rrf_fixed_corpus_hand_computed_order():
    # vecteur : a, b, c  | texte : c, d, a
    # a = 1/61 + 1/63 = 0.032266 ; b = 1/62 = 0.016129
    # c = 1/63 + 1/61 = 0.032266 ; d = 1/62 = 0.016129
    # a et c à égalité exacte -> la première apparition (vecteur) gagne : a, c ; puis b, d.
    fused = reciprocal_rank_fusion([[_doc("a"), _doc("b"), _doc("c")], [_doc("c"), _doc("d"), _doc("a")]])
    assert _ids(fused) == ["a", "c", "b", "d"]


def test_rrf_document_in_both_lists_beats_best_of_one_list():
    # x est 1er d'une liste seulement : 1/61 = 0.016393
    # y est 2e des deux : 2/62 = 0.032258 -> y passe devant
    fused = reciprocal_rank_fusion([[_doc("x"), _doc("y")], [_doc("z"), _doc("y")]])
    assert _ids(fused) == ["y", "x", "z"]


def test_rrf_single_list_preserves_order():
    docs = [_doc("c"), _doc("a"), _doc("b")]
    assert _ids(reciprocal_rank_fusion([docs, []])) == ["c", "a", "b"]
    assert _ids(reciprocal_rank_fusion([[], docs])) == ["c", "a", "b"]


def test_rrf_dedupes_by_id():
    fused = reciprocal_rank_fusion([[_doc("a"), _doc("a")], [_doc("a")]])
    assert _ids(fused) == ["a"]


@pytest.mark.asyncio
async def test_hybrid_fuses_both_lists(monkeypatch):
    monkeypatch.delenv("RAG_RERANK_ENABLED", raising=False)
    monkeypatch.setattr(
        rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([_doc("v1"), _doc("both")])
    )
    monkeypatch.setattr(
        TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("both"), _doc("t1")])
    )
    docs = await HybridSearch().query("q", "user-1", top_k=5)
    assert _ids(docs) == ["both", "v1", "t1"]


@pytest.mark.asyncio
async def test_hybrid_truncates_to_top_k(monkeypatch):
    monkeypatch.delenv("RAG_RERANK_ENABLED", raising=False)
    monkeypatch.setattr(
        rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([_doc("a"), _doc("b")])
    )
    monkeypatch.setattr(TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("c")]))
    docs = await HybridSearch().query("q", "user-1", top_k=2)
    assert _ids(docs) == ["a", "c"]


@pytest.mark.asyncio
async def test_hybrid_text_only_when_vector_empty_keeps_text_order(monkeypatch):
    monkeypatch.delenv("RAG_RERANK_ENABLED", raising=False)
    monkeypatch.setattr(rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([]))
    monkeypatch.setattr(
        TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("t2"), _doc("t1"), _doc("t3")])
    )
    docs = await HybridSearch().query("q", "user-1", top_k=5)
    assert _ids(docs) == ["t2", "t1", "t3"]


@pytest.mark.asyncio
async def test_rerank_disabled_never_imports_flashrank(monkeypatch):
    monkeypatch.delenv("RAG_RERANK_ENABLED", raising=False)
    monkeypatch.delitem(sys.modules, "flashrank", raising=False)
    monkeypatch.setattr(rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([_doc("a")]))
    monkeypatch.setattr(TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("b")]))
    await HybridSearch().query("q", "user-1", top_k=5)
    assert "flashrank" not in sys.modules


@pytest.mark.asyncio
async def test_rerank_failure_serves_rrf_order(monkeypatch):
    monkeypatch.setenv("RAG_RERANK_ENABLED", "true")
    monkeypatch.setattr(
        rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([_doc("a"), _doc("b")])
    )
    monkeypatch.setattr(TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("b"), _doc("c")]))

    def _boom(query_text, docs):
        raise RuntimeError("flashrank model missing")

    monkeypatch.setattr(rag_service, "_flashrank_rerank", _boom)
    docs = await HybridSearch().query("q", "user-1", top_k=5)
    assert _ids(docs) == ["b", "a", "c"]


@pytest.mark.asyncio
async def test_rerank_enabled_reorders_with_reranker_output(monkeypatch):
    monkeypatch.setenv("RAG_RERANK_ENABLED", "true")
    monkeypatch.setattr(
        rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([_doc("a"), _doc("b")])
    )
    monkeypatch.setattr(TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("c")]))
    monkeypatch.setattr(
        rag_service, "_flashrank_rerank", lambda q, docs: list(reversed(docs))
    )
    docs = await HybridSearch().query("q", "user-1", top_k=2)
    # RRF : a (1/61), c (1/61), b (1/62) -> [a, c, b] ; inversé [b, c, a] ; top_k=2.
    assert _ids(docs) == ["b", "c"]


def test_flashrank_missing_package_raises_import_error(monkeypatch):
    # Paquet absent : l'import paresseux lève, l'appelant retombe sur l'ordre RRF.
    monkeypatch.setitem(sys.modules, "flashrank", None)
    with pytest.raises(ImportError):
        rag_service._flashrank_rerank("q", [_doc("a")])
