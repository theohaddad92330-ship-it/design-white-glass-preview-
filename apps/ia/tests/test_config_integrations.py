"""GET /config/integrations — real per-provider *configured* flags (env presence).

The API Tool Registry reads this to reflect the TRUE backend config of the
IA-hosted data sources. Contract: booleans only, derived from os.environ, and the
key VALUE is never echoed back (secrets never leave the service)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_ALL_ENV = (
    "APOLLO_API_KEY",
    "FRANCE_TRAVAIL_CLIENT_ID",
    "FRANCE_TRAVAIL_CLIENT_SECRET",
    "BRAVE_API_KEY",
    "FIRECRAWL_API_KEY",
    "PAPPERS_API_KEY",
    "SERPER_API_KEY",
    "TAVILY_API_KEY",
    # Capacités optionnelles qui tournaient en no-op sans que rien ne le dise.
    "SALESQL_API_KEY",
    "EMBEDDING_API_KEY",
    "INSEE_API_KEY",
    "INPI_USERNAME",
    "INPI_PASSWORD",
    "GITHUB_TOKEN",
    "WTTJ_ALGOLIA_APP_ID",
    "WTTJ_ALGOLIA_API_KEY",
    "ZEFIX_API_USER",
    "ZEFIX_API_PASSWORD",
    "API_INTERNAL_URL",
    "INTERNAL_API_SECRET",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in _ALL_ENV:
        monkeypatch.delenv(name, raising=False)
    yield


def test_reports_false_for_every_provider_when_no_key_set(client: TestClient) -> None:
    res = client.get("/config/integrations")
    assert res.status_code == 200
    providers = res.json()["providers"]
    # Every documented provider is present and honestly False (no key = not configured) —
    # EXCEPT `boamp`, which needs no key at all (see the next test).
    assert providers == {
        "apollo": False,
        "france_travail": False,
        "brave": False,
        "firecrawl": False,
        "pappers": False,
        "serper": False,
        "tavily": False,
        "salesql": False,
        "embeddings": False,
        "insee": False,
        "inpi": False,
        "github": False,
        "wttj": False,
        "zefix": False,
        "copilot_bridge": False,
        "boamp": True,
    }


def test_boamp_needs_no_key_ever(client: TestClient) -> None:
    """#2261.30 — BOAMP (marchés publics) est un mirroir public SANS clé
    (`data_sources/public_tenders.py`, docstring « Free, NO key »). Honnête:
    toujours `True`, avec ou sans variable d'environnement posée — le contraire
    inventerait une configuration qui n'existe pas."""
    res = client.get("/config/integrations")
    assert res.json()["providers"]["boamp"] is True


def test_reflects_env_presence_per_provider(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("APOLLO_API_KEY", "ak_secret_value")
    monkeypatch.setenv("BRAVE_API_KEY", "brave_secret")
    res = client.get("/config/integrations")
    providers = res.json()["providers"]
    assert providers["apollo"] is True
    assert providers["brave"] is True
    # Untouched providers stay honestly False.
    assert providers["firecrawl"] is False
    assert providers["serper"] is False


def test_france_travail_needs_both_credentials(client: TestClient, monkeypatch) -> None:
    # A single half of the OAuth pair is not enough to call the API → not configured.
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id-only")
    assert client.get("/config/integrations").json()["providers"]["france_travail"] is False

    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret-too")
    assert client.get("/config/integrations").json()["providers"]["france_travail"] is True


def test_never_leaks_the_key_value(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("APOLLO_API_KEY", "ak_super_secret_do_not_leak")
    body = client.get("/config/integrations").text
    assert "ak_super_secret_do_not_leak" not in body


def test_copilot_bridge_needs_both_url_and_secret(client: TestClient, monkeypatch) -> None:
    """L'absence la plus coûteuse du dépôt, et la plus silencieuse : sans elle,
    les cinq outils du copilote répondent « je n'ai pas accès à ta messagerie »
    alors que la messagerie EST branchée côté API. Une moitié de la paire ne
    suffit pas — un secret sans URL n'appelle rien."""
    monkeypatch.setenv("API_INTERNAL_URL", "https://api.bellum-ai.com")
    assert client.get("/config/integrations").json()["providers"]["copilot_bridge"] is False

    monkeypatch.setenv("INTERNAL_API_SECRET", "shared-secret")
    assert client.get("/config/integrations").json()["providers"]["copilot_bridge"] is True
