"""Une configuration incomplète doit se VOIR, pas se deviner.

Panne réelle en production (22/07) : `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
n'étaient pas posées sur le service IA. Le service démarrait, la healthcheck
passait au vert, les analyses tournaient (le pipeline écrit via NestJS) — et les
8 routers qui lisent Supabase en direct rendaient un 500 générique. Le seul
endroit où le trou se lisait était une stack trace, à condition de la chercher.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import missing_required_env


def test_health_names_what_is_missing(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    body = client.get("/health").json()
    assert body["status"] == "degraded"
    assert body["missing_env"] == ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]


def test_health_stays_ok_when_configured(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role")
    assert client.get("/health").json() == {"status": "ok"}


def test_health_never_fails_the_deploy_gate(client: TestClient, monkeypatch) -> None:
    """200 même dégradé : un 503 empêcherait Railway de promouvoir le déploiement
    qui corrige justement la configuration."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    assert client.get("/health").status_code == 200


def test_an_empty_value_counts_as_missing(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "k")
    assert missing_required_env() == ["SUPABASE_URL"]
