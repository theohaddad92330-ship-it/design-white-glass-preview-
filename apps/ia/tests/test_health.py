from fastapi.testclient import TestClient


def test_health(client: TestClient, monkeypatch) -> None:
    # La suite tourne volontairement sans identifiants (politique d'hermétisme) :
    # on pose donc la config le temps du test, sinon la healthcheck rend à juste
    # titre « degraded » — c'est tout l'intérêt du garde-fou.
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role")
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
