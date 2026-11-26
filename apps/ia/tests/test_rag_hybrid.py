"""La recherche hybride : le vecteur AJOUTE du rappel, il n'en retire jamais.

L'embedding d'un document est calculé à l'ingestion. Poser ``EMBEDDING_API_KEY``
faisait basculer la recherche en mode vectoriel pour tout le monde, et chaque
document déjà en base — dépourvu de vecteur — devenait introuvable. La base de
connaissance se vidait à l'écran, sans erreur, à la suite d'un geste dont on
attend l'inverse.

Ces tests verrouillent les quatre situations qui comptent.
"""

from __future__ import annotations

import pytest

from app.services import rag_service
from app.services.rag_service import HybridSearch, TextSearchFallback, _get_search_backend


def _doc(doc_id: str) -> dict:
    return {"id": doc_id, "title": f"doc {doc_id}", "content": "…", "category": None}


async def _coro(value):
    return value


@pytest.mark.asyncio
async def test_completes_vector_results_with_text_search(monkeypatch):
    # Deux documents vectorisés, deux autres qui n'ont QUE du texte : les quatre
    # doivent ressortir. C'est le cas d'une base ingérée avant la clé.
    monkeypatch.setattr(
        rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([_doc("v1"), _doc("v2")])
    )
    monkeypatch.setattr(
        TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("t1"), _doc("t2")])
    )

    docs = await HybridSearch().query("migration cloud", "user-1", top_k=5)

    # #4109 — RRF : rangs égaux alternent (v1, t1 à 1/61 ; v2, t2 à 1/62), rien ne se perd.
    assert [d["id"] for d in docs] == ["v1", "t1", "v2", "t2"]


@pytest.mark.asyncio
async def test_never_returns_the_same_document_twice(monkeypatch):
    monkeypatch.setattr(rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([_doc("a")]))
    monkeypatch.setattr(TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("a"), _doc("b")]))

    docs = await HybridSearch().query("q", "user-1", top_k=5)

    assert [d["id"] for d in docs] == ["a", "b"]


@pytest.mark.asyncio
async def test_page_is_capped_at_top_k_after_fusion(monkeypatch):
    # #4109 — RRF a besoin des DEUX listes : le plein texte est toujours interrogé
    # (le court-circuit « vecteur plein » est retiré), la page reste bornée à top_k.
    monkeypatch.setattr(
        rag_service.PgVectorSearch, "query", lambda self, *a, **k: _coro([_doc("a"), _doc("b")])
    )
    monkeypatch.setattr(TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("c")]))

    docs = await HybridSearch().query("q", "user-1", top_k=2)

    assert [d["id"] for d in docs] == ["a", "c"]


@pytest.mark.asyncio
async def test_a_broken_vector_backend_does_not_empty_the_knowledge_base(monkeypatch):
    # Clé révoquée, quota OpenAI dépassé, RPC absente : la recherche doit
    # continuer de rendre les documents, pas une page vide.
    def _boom(self, *a, **k):
        raise RuntimeError("Embedding API error: 401")

    monkeypatch.setattr(rag_service.PgVectorSearch, "query", _boom)
    monkeypatch.setattr(TextSearchFallback, "query", lambda self, *a, **k: _coro([_doc("t1")]))

    docs = await HybridSearch().query("q", "user-1", top_k=5)

    assert [d["id"] for d in docs] == ["t1"]


def test_the_key_is_the_only_switch(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    assert isinstance(_get_search_backend(), TextSearchFallback)

    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")
    assert isinstance(_get_search_backend(), HybridSearch)
