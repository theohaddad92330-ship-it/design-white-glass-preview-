"""Tests for the IA internal-secret gate (app/middleware/internal_auth.py)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.middleware.internal_auth import (
    _EXEMPT_PREFIXES,
    INTERNAL_SECRET_HEADER,
    InternalAuthMiddleware,
    _is_exempt,
)
from app.routers.rag import router as rag_router


def _make_client(monkeypatch, secret: str | None, *, environment: str | None = None) -> TestClient:
    if secret is None:
        monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)
    else:
        monkeypatch.setenv("INTERNAL_API_SECRET", secret)

    # Control prod-detection deterministically (default: dev).
    monkeypatch.delenv("SENTRY_ENVIRONMENT", raising=False)
    if environment is None:
        monkeypatch.delenv("ENV", raising=False)
    else:
        monkeypatch.setenv("ENV", environment)

    app = FastAPI()
    app.add_middleware(InternalAuthMiddleware)

    @app.get("/phase/1/research")
    async def protected() -> dict[str, str]:
        return {"ok": "protected"}

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"ok": "health"}

    @app.get("/chat/message")
    async def chat() -> dict[str, str]:
        return {"ok": "chat"}

    return TestClient(app)


def test_noop_when_secret_unset(monkeypatch):
    client = _make_client(monkeypatch, None)
    assert client.get("/phase/1/research").status_code == 200


def test_fail_closed_in_production_when_secret_unset(monkeypatch):
    # Missing secret in prod must NOT silently expose the service.
    client = _make_client(monkeypatch, None, environment="production")
    res = client.get("/phase/1/research")
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "GATE_MISCONFIGURED"
    # Health stays reachable so the platform healthcheck still passes.
    assert client.get("/health").status_code == 200


def test_production_with_secret_enforces_normally(monkeypatch):
    client = _make_client(monkeypatch, "s3cret", environment="production")
    assert client.get("/phase/1/research").status_code == 401
    assert client.get("/phase/1/research", headers={INTERNAL_SECRET_HEADER: "s3cret"}).status_code == 200


def test_rejects_missing_secret_when_configured(monkeypatch):
    client = _make_client(monkeypatch, "s3cret")
    res = client.get("/phase/1/research")
    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "UNAUTHORIZED"


def test_rejects_wrong_secret(monkeypatch):
    client = _make_client(monkeypatch, "s3cret")
    res = client.get("/phase/1/research", headers={INTERNAL_SECRET_HEADER: "nope"})
    assert res.status_code == 401


def test_accepts_correct_secret(monkeypatch):
    client = _make_client(monkeypatch, "s3cret")
    res = client.get("/phase/1/research", headers={INTERNAL_SECRET_HEADER: "s3cret"})
    assert res.status_code == 200
    assert res.json() == {"ok": "protected"}


def test_health_is_exempt_even_when_configured(monkeypatch):
    client = _make_client(monkeypatch, "s3cret")
    assert client.get("/health").status_code == 200


def test_formerly_browser_facing_router_now_requires_secret(monkeypatch):
    # /chat, /discover, /rag are now fronted by the JWT NestJS proxy → protected.
    client = _make_client(monkeypatch, "s3cret")
    assert client.get("/chat/message").status_code == 401
    assert client.get("/chat/message", headers={INTERNAL_SECRET_HEADER: "s3cret"}).status_code == 200


# ── La seconde porte du magasin de connaissance ────────────────────────────
#
# La garde d'INGESTION (carnets d'adresses, fichiers classés « non ingérable »)
# vit côté NestJS, dans `IaClient.ragIngest`. Elle ne protège donc que ce qui
# passe par NestJS. Ce qui ferme l'autre porte — celle de quelqu'un qui connaît
# l'URL publique du service IA et poste directement — est le secret interne, et
# rien d'autre : `rag_service.ingest` n'a qu'UN appelant dans tout le service,
# `POST /rag/ingest`. Fermer la porte vaut mieux que la garder deux fois.
#
# Les tests ci-dessous montent le VRAI routeur `/rag` : un chemin recopié à la
# main resterait vert le jour où quelqu'un renommerait le préfixe du routeur.

_RAG_ROUTES: tuple[tuple[str, str], ...] = (
    ("GET", "/rag/status"),
    ("GET", "/rag/documents"),
    ("POST", "/rag/query"),
    ("POST", "/rag/ingest"),
    ("POST", "/rag/purge"),
)


def _client_with_real_rag_router(monkeypatch, secret: str) -> TestClient:
    monkeypatch.setenv("INTERNAL_API_SECRET", secret)
    monkeypatch.delenv("SENTRY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    app = FastAPI()
    app.add_middleware(InternalAuthMiddleware)
    app.include_router(rag_router)
    return TestClient(app)


@pytest.mark.parametrize(("method", "path"), _RAG_ROUTES)
def test_rag_routes_reject_a_caller_without_the_secret(monkeypatch, method, path):
    """Aucune route du magasin n'est joignable sans le secret.

    `ingest` ÉCRIT dans le magasin vectoriel et `purge` EFFACE ; `query`,
    `documents` et `status` lisent la connaissance de l'espace. Le refus tombe
    dans le middleware, donc AUCUN gestionnaire ne tourne — c'est ce qui rend ce
    test sûr à écrire sur une route destructrice.
    """
    client = _client_with_real_rag_router(monkeypatch, "s3cret")
    res = client.request(method, path)
    assert res.status_code == 401, f"{method} {path} est joignable sans le secret"
    assert res.json()["detail"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize("path", ["/rag/ingest", "/rag/query"])
def test_rag_write_routes_still_accept_the_nestjs_client(monkeypatch, path):
    """L'en-tête que `IaClient` envoie sur CHAQUE appel doit continuer à passer.

    C'est la moitié qui protège l'ingestion réelle : dépôt manuel, page Notion,
    document Drive, extraction de CV passent tous par ce chemin. Corps vide
    VOLONTAIREMENT — la requête s'arrête alors à la validation Pydantic (422),
    ce qui prouve que le gate l'a laissée entrer sans toucher au magasin. Un 401
    ici voudrait dire que l'ingestion est cassée en production.
    """
    client = _client_with_real_rag_router(monkeypatch, "s3cret")
    res = client.post(path, json={}, headers={INTERNAL_SECRET_HEADER: "s3cret"})
    assert res.status_code == 422, res.text


def test_no_mounted_route_is_exempt_beyond_the_health_and_docs_surface():
    """Le corpus est l'arbre de routes RÉEL du service, pas une liste écrite ici.

    C'est la garde qui dit NON à quelqu'un qui remettrait `/rag`, `/chat` ou
    `/discover` dans `_EXEMPT_PREFIXES` — la forme exacte du trou qu'on ferme —
    comme à un routeur neuf monté sous un préfixe exempté. Élargir l'exemption
    reste possible, mais devient un geste délibéré qui casse ce test.
    """
    from app.main import app as real_app

    # FastAPI >= 0.143 n'aplatit plus `app.routes` (routeurs inclus = `_IncludedRouter`).
    try:
        from fastapi.routing import iter_route_contexts
    except ImportError:  # fastapi plus ancien : `app.routes` est déjà plat
        iter_route_contexts = list

    paths = sorted({c.path for c in iter_route_contexts(real_app.routes) if getattr(c, "path", None)})
    # La garde LIT quelque chose : sur un arbre vide elle serait verte pour
    # toujours. On ne compte pas les routes (un total est un argument fragile),
    # on exige la présence de celles dont l'exposition coûterait cher.
    for sensitive in ("/rag/ingest", "/rag/purge", "/chat/message", "/discover/search"):
        assert sensitive in paths, f"{sensitive} a disparu de l'arbre de routes"

    assert sorted(p for p in paths if _is_exempt(p)) == [
        "/docs",
        "/docs/oauth2-redirect",
        "/health",
        "/openapi.json",
        "/redoc",
        "/version",
    ]


def test_exempt_prefixes_never_cover_a_router_that_carries_data():
    """Le même interdit, lu depuis la déclaration plutôt que depuis l'arbre.

    Les deux angles se complètent : celui-ci tombe même si le routeur fautif
    n'est plus monté, et il NOMME le préfixe interdit dans son message d'échec.
    """
    for forbidden in ("/rag", "/chat", "/discover", "/phase", "/cv", "/metrics"):
        assert forbidden not in _EXEMPT_PREFIXES, (
            f"{forbidden} porte de la donnée de client — il ne peut pas être exempté "
            "du secret interne. Tout son trafic passe par un contrôleur NestJS "
            "authentifié qui forwarde `x-internal-secret`."
        )
