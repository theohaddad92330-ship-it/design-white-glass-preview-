"""Observabilité RAG + knowledge pour le dashboard-manager : status/config live,
listing des docs (« voir ce qu'il y a dedans »), inventaire des assets métier."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.knowledge import knowledge_assets_summary
from app.services.rag_service import backend_status


def test_backend_status_reads_env(monkeypatch):
    # Zéro-flag : la présence d'EMBEDDING_API_KEY est le seul interrupteur vecteurs.
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    monkeypatch.setenv("RAG_MATCH_THRESHOLD", "0.42")
    s = backend_status()
    assert s["backend"] == "TextSearchFallback"
    assert "full-text search" in s["mode"]
    assert s["use_vectors"] is False
    assert s["embedding_key_set"] is False
    assert s["match_threshold"] == 0.42
    monkeypatch.setenv("EMBEDDING_API_KEY", "test-key")
    s2 = backend_status()
    assert s2["backend"] == "HybridSearch"
    assert s2["use_vectors"] is True and s2["embedding_key_set"] is True


def test_knowledge_assets_summary_inventories_curated_json():
    a = knowledge_assets_summary()
    assert a["competitor_intel"]["count"] == 15
    assert "Capgemini" in a["competitor_intel"]["names"]
    # 20 côté client + 13 côté consultant (item 33 du Recovery Pack).
    assert a["objection_library"]["count"] == 33
    assert a["sector_playbooks"]["count"] == 9
    assert a["sector_playbooks"]["sectors"]  # non-empty


def test_rag_status_endpoint_degrades_when_store_down(client: TestClient, monkeypatch):
    async def _boom():
        raise RuntimeError("supabase down")

    # The router imports the fn by value — patch its reference there, not the module.
    monkeypatch.setattr("app.routers.rag.count_documents", _boom)
    res = client.get("/rag/status")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["backend"] in ("TextSearchFallback", "PgVectorSearch")
    assert data["document_count"] is None  # dégradé, la config reste visible
    assert "store_error" in data


def test_rag_documents_endpoint_returns_previews(client: TestClient, monkeypatch):
    async def _list(limit=50):
        return [{"id": "1", "title": "Playbook", "category": "crm", "content_chars": 999, "content_preview": "abc…"}]

    monkeypatch.setattr("app.routers.rag.list_documents", _list)
    res = client.get("/rag/documents?limit=10")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["count"] == 1
    assert body["data"]["documents"][0]["content_preview"] == "abc…"


def test_knowledge_assets_endpoint(client: TestClient):
    res = client.get("/config/knowledge-assets")
    assert res.status_code == 200
    assets = res.json()["assets"]
    assert assets["competitor_intel"]["count"] == 15
