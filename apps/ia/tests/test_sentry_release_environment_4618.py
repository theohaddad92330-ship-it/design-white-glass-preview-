"""#4618 — l'IA remontait à Sentry sans `release` et en `environment=development` : une erreur de PRODUCTION
était indiscernable d'une erreur de développement. Railway n'injecte pas SENTRY_RELEASE tout seul ; il injecte
`RAILWAY_GIT_COMMIT_SHA` et `RAILWAY_ENVIRONMENT_NAME`. On les lit, comme `/version` lit déjà le SHA."""

from __future__ import annotations

import pytest

from app.sentry_init import sentry_environment, sentry_release

_VARS = (
    "SENTRY_RELEASE",
    "RAILWAY_GIT_COMMIT_SHA",
    "GIT_COMMIT",
    "SENTRY_ENVIRONMENT",
    "RAILWAY_ENVIRONMENT_NAME",
    "ENV",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in _VARS:
        monkeypatch.delenv(name, raising=False)


def test_release_est_le_sha_du_commit_servi_sur_railway(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "38e9fc6e8a")
    assert sentry_release() == "38e9fc6e8a"


def test_release_explicite_gagne_sur_le_sha_de_la_plateforme(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENTRY_RELEASE", "explicite")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "38e9fc6e8a")
    assert sentry_release() == "explicite"


def test_release_absente_reste_absente_jamais_inventee() -> None:
    assert sentry_release() is None


def test_environnement_de_production_lu_sur_railway(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")
    assert sentry_environment() == "production"


def test_environnement_explicite_gagne(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "staging")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")
    assert sentry_environment() == "staging"


def test_sans_aucune_variable_c_est_development() -> None:
    assert sentry_environment() == "development"
