from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


def test_rag_query_returns_200(client: TestClient) -> None:
    with patch("app.routers.rag.rag_query") as mock_query:
        mock_query.return_value = [{"id": "1", "title": "Template", "content": "Hello"}]
        res = client.post("/rag/query", json={"query": "test", "user_id": "u1"})
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_rag_ingest_returns_200(client: TestClient) -> None:
    with patch("app.routers.rag.rag_ingest") as mock_ingest:
        mock_ingest.return_value = {"id": "new-1", "title": "Doc", "category": "template"}
        res = client.post("/rag/ingest", json={"title": "Doc", "content": "Hello", "user_id": "u1"})
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_rag_ingest_defaults_scope_to_workspace_when_omitted(client: TestClient) -> None:
    """#1954.7 — un caller qui omet `scope` (tout le produit, aujourd'hui)
    obtient le comportement d'avant cette décision, au bit près."""
    with patch("app.routers.rag.rag_ingest") as mock_ingest:
        mock_ingest.return_value = {"id": "new-1", "title": "Doc", "category": "template"}
        client.post("/rag/ingest", json={"title": "Doc", "content": "Hello", "user_id": "u1"})
    _, kwargs = mock_ingest.call_args
    assert kwargs["scope"] == "workspace"
    assert kwargs["conversation_id"] is None


def test_rag_ingest_forwards_conversation_scope(client: TestClient) -> None:
    """#1954.7 — un document `conversation` transporte son fil jusqu'à
    `rag_service.ingest`."""
    with patch("app.routers.rag.rag_ingest") as mock_ingest:
        mock_ingest.return_value = {"id": "new-1", "title": "CV", "category": ""}
        res = client.post(
            "/rag/ingest",
            json={
                "title": "CV",
                "content": "Hello",
                "user_id": "u1",
                "scope": "conversation",
                "conversation_id": "thread-42",
            },
        )
    assert res.status_code == 200
    _, kwargs = mock_ingest.call_args
    assert kwargs["scope"] == "conversation"
    assert kwargs["conversation_id"] == "thread-42"


def test_rag_ingest_rejects_conversation_scope_without_a_thread(client: TestClient) -> None:
    """#1954.7 — le refus PRÉALABLE de `rag_service.ingest` (`ValueError`)
    devient un 422, pas un 500 : c'est une entrée invalide, pas une panne."""
    with patch("app.routers.rag.rag_ingest") as mock_ingest:
        mock_ingest.side_effect = ValueError("scope='conversation' nécessite conversation_id")
        res = client.post(
            "/rag/ingest",
            json={"title": "CV", "content": "Hello", "user_id": "u1", "scope": "conversation"},
        )
    assert res.status_code == 422


def test_rag_ingest_keeps_the_destination_of_before_for_the_body_open_chat_tabs_send(client: TestClient) -> None:
    """Compatibilité des onglets ouverts — le lot 2b envoie la portée. D'ici là,
    l'écran du chat (`Chat.tsx::fileToIngestInput`) dépose sans portée ni fil, et
    `IaClient.ragIngest` rend EXACTEMENT ce corps-là (mesuré en production le
    12/09 : 4 ingestions 201). Il doit passer (200) et partir dans la base de
    l'espace, comme avant 2a — jamais un refus, jamais un document de fil."""
    with patch("app.routers.rag.rag_ingest") as mock_ingest:
        mock_ingest.return_value = {"id": "new-1", "title": "notes.txt", "category": "chat"}
        res = client.post(
            "/rag/ingest",
            json={
                "user_id": "u1",
                "workspace_id": "ws-1",
                "title": "notes.txt",
                "content": "Bonjour",
                "category": "chat",
                "file_b64": None,
                "filename": None,
            },
        )
    assert res.status_code == 200
    _, kwargs = mock_ingest.call_args
    assert kwargs["scope"] == "workspace"
    assert kwargs["conversation_id"] is None
