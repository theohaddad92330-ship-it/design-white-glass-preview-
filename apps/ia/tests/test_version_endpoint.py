"""Le service IA doit dire quelle révision il exécute.

Sans ça, quand un correctif IA est mergé et que le bug persiste en ligne, rien ne
distingue « déployé mais insuffisant » de « pas encore redéployé » — l'API NestJS
expose `/version`, le service IA ne l'exposait pas, et le diagnostic du bug des
accroches s'est arrêté sur cette ambiguïté.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_version_reports_the_running_commit(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc123")
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")
    body = client.get("/version").json()
    assert body["commit"] == "abc123"
    assert body["environment"] == "production"
    assert body["timestamp"]


def test_version_never_invents_a_commit(client: TestClient, monkeypatch) -> None:
    """Hors plateforme (dev local), on dit « unknown » plutôt qu'un faux SHA."""
    for var in ("SENTRY_RELEASE", "RAILWAY_GIT_COMMIT_SHA", "GIT_COMMIT"):
        monkeypatch.delenv(var, raising=False)
    assert client.get("/version").json()["commit"] == "unknown"
