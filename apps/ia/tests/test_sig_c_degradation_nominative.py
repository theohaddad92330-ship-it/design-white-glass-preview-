"""SIG-C (11/10) C3 — dégradation NOMINATIVE des agrégateurs d'offres.

Une seule clé ``job_aggregators`` pour cinq fournisseurs : un 403 Jooble et un
429 TheirStack étaient indiscernables (« HTTP 403 », sans fournisseur). Chaque
fournisseur s'inscrit désormais sous SON nom, raison = statut HTTP ou type
d'erreur, code machine partagé. Ce qui part vers l'ÉCRAN (``source_health`` et
avertissements de la phase 1) reste l'agrégat ``job_aggregators`` : le
fournisseur n'est jamais nommé côté client.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.models.agent_envelope import SourceHealth
from app.routers import phase1_research
from app.services import source_health
from app.services.data_sources import job_aggregators as agg

_CID = "run-sigc-c3"
_PROVIDERS = ("adzuna", "jooble", "theirstack", "mantiks", "fantastic_jobs")


@pytest.fixture(autouse=True)
def _run(monkeypatch: pytest.MonkeyPatch):
    source_health.clear_degradations(_CID)
    monkeypatch.setattr(agg, "get_correlation_id", lambda: _CID)
    for k, v in {
        "ADZUNA_APP_ID": "id",
        "ADZUNA_APP_KEY": "k",
        "JOOBLE_API_KEY": "SECRETJOOBLEKEY",
        "THEIRSTACK_API_KEY": "k",
    }.items():
        monkeypatch.setenv(k, v)
    yield
    source_health.clear_degradations(_CID)


def _client(*, get=None, post=None) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=get) if isinstance(get, BaseException) else AsyncMock(return_value=get)
    c.post = AsyncMock(side_effect=post) if isinstance(post, BaseException) else AsyncMock(return_value=post)
    return c


def _resp(status: int) -> httpx.Response:
    return httpx.Response(status, json={}, request=httpx.Request("GET", "https://x"))


async def test_un_http_403_est_inscrit_sous_le_nom_du_fournisseur() -> None:
    await agg.adzuna_jobs("Sigc C3 SA", client=_client(get=_resp(403)))
    assert source_health.get_degradations(_CID) == [{"source": "adzuna", "reason": "HTTP 403", "code": "unauthorized"}]


async def test_deux_fournisseurs_en_panne_sont_discernables() -> None:
    await agg.adzuna_jobs("Sigc C3 SA", client=_client(get=_resp(500)))
    await agg.theirstack_jobs("Sigc C3 SA", client=_client(post=_resp(429)))
    by_source = {e["source"]: e for e in source_health.get_degradations(_CID)}
    assert by_source["adzuna"]["reason"] == "HTTP 500"
    assert by_source["theirstack"] == {"source": "theirstack", "reason": "HTTP 429", "code": "rate_limited"}


async def test_une_exception_donne_son_type_jamais_l_url_ni_la_cle() -> None:
    boom = httpx.ConnectError("https://jooble.org/api/SECRETJOOBLEKEY unreachable")
    await agg.jooble_jobs("Sigc C3 SA", client=_client(post=boom))
    (entry,) = source_health.get_degradations(_CID)
    assert entry == {"source": "jooble", "reason": "ConnectError", "code": "network_error"}
    assert "SECRETJOOBLEKEY" not in str(entry)


def test_plus_de_cle_de_degradation_unique() -> None:
    assert not hasattr(agg, "_DEGRADATION_SOURCE")


@pytest.mark.parametrize("provider", _PROVIDERS)
def test_chaque_fournisseur_se_replie_en_agregat_pour_l_ecran(provider: str) -> None:
    assert source_health.public_source(provider) == "job_aggregators"


def test_les_autres_sources_gardent_leur_nom() -> None:
    assert source_health.public_source("france_travail") == "france_travail"
    assert source_health.public_source("job_aggregators") == "job_aggregators"


def test_l_ecran_ne_nomme_jamais_le_fournisseur() -> None:
    source_health.record_degradation(_CID, source="theirstack", reason="HTTP 429", code="rate_limited")
    source_health.record_degradation(_CID, source="jooble", reason="HTTP 403", code="unauthorized")
    health = phase1_research._derive_source_health({}, _CID)
    assert health["job_aggregators"] == SourceHealth.DOWN
    assert not set(health) & set(_PROVIDERS)
    warnings = phase1_research._warnings_from_health(health, _CID)
    agg_warnings = [w for w in warnings if (w.context or {}).get("source") == "job_aggregators"]
    assert len(agg_warnings) == 1
    rendered = " ".join(f"{w.code} {w.message} {w.context}" for w in warnings).lower()
    for provider in _PROVIDERS:
        assert provider not in rendered


def test_le_resume_interne_reste_nominatif() -> None:
    """``degraded_sources`` (supervision admin, `analysis_runs.source_health`)
    garde le fournisseur : c'est là qu'un opérateur doit le lire."""
    source_health.record_degradation(_CID, source="mantiks", reason="HTTP 401", code="unauthorized")
    assert source_health.get_degradations(_CID)[0]["source"] == "mantiks"
    assert source_health.get_public_degradations(_CID)[0]["source"] == "job_aggregators"
