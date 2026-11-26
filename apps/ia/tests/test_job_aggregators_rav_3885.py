"""#3885 (lot RAV, 10/10) — Mantiks et Fantastic.jobs, deux sources d'offres à
API officielle documentée, dans le module des agrégateurs (lot RAS).

Ce que ces tests tiennent :
- sans clé = NO-OP STRICT : zéro appel réseau ;
- forme de réponse DOCUMENTÉE (mantiks-api.readme.io, developer.fantastic.jobs) ;
- Mantiks : la société est retrouvée PAR PREUVE (nom) avant de payer le crédit ;
- coût enregistré (1 crédit par appel Mantiks, offres rendues chez Fantastic.jobs).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import provider_pricing, run_metrics
from app.services.data_sources import job_aggregators as agg

_KEYS = ("MANTIKS_API_KEY", "FANTASTIC_JOBS_API_KEY")


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


@pytest.fixture(autouse=True)
def _no_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _KEYS:
        monkeypatch.delenv(k, raising=False)


def _client(get: object = None, post: object = None) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=get) if not isinstance(get, list) else AsyncMock(side_effect=get)
    c.post = AsyncMock(return_value=post) if not isinstance(post, list) else AsyncMock(side_effect=post)
    return c


async def test_noop_strict_without_keys() -> None:
    client = _client(_resp([]), _resp({}))
    assert await agg.mantiks_jobs("Sanofi", client=client) == []
    assert await agg.fantastic_jobs("Sanofi", client=client) == []
    client.get.assert_not_called()
    client.post.assert_not_called()


# ── Mantiks ──────────────────────────────────────────────────────────────────


def _mantiks_jobs_payload() -> dict:
    return {
        "total": 2,
        "active": 2,
        "returned": 2,
        "jobs": [
            {
                "id": "job_1",
                "job_title": "Architecte Cloud",
                "published_date": _iso(3),
                "is_expired": False,
                "is_reposting": False,
                "job_board": "linkedin",
                "job_url": "https://www.linkedin.com/jobs/view/1",
                "description": "…",
                "location": {"city": "Lyon", "full_name": "Lyon, Auvergne-Rhône-Alpes, France"},
            },
            {
                "id": "job_2",
                "job_title": "Développeur Java",
                "published_date": _iso(900),  # trop vieille → écartée
                "is_expired": True,
                "is_reposting": False,
                "job_board": "indeed",
                "job_url": "https://fr.indeed.com/viewjob?jk=2",
                "description": "…",
                "location": None,
            },
        ],
    }


async def test_mantiks_resolves_company_then_maps_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "mk")
    seen: list[tuple[str, float]] = []
    monkeypatch.setattr(run_metrics, "record_cost", lambda cid, provider, usd: seen.append((provider, usd)))
    client = _client(
        get=_resp([{"id": "cmp_9", "name": "Sanofi Pasteur"}, {"id": "cmp_1", "name": "Sanofi"}]),
        post=_resp(_mantiks_jobs_payload()),
    )
    monkeypatch.setattr(agg.mantiks_balance, "check_balance", AsyncMock())  # tenu par test_mantiks_balance_15_10
    out = await agg.mantiks_jobs("Sanofi", client=client)
    assert [j["title"] for j in out] == ["Architecte Cloud"]
    job = out[0]
    assert job["url"] == "https://www.linkedin.com/jobs/view/1"
    assert job["city"] == "Lyon" and job["company"] == "Sanofi"
    assert job["contractType"] is None and job["source"] == "mantiks"  # contract_types absent de la fixture
    # Recherche de société (0 crédit) : GET /companies/search?query=…, clé en X-API-KEY.
    assert client.get.call_args.args[0] == "https://dashboard.mantiks.io/api/v2/companies/search"
    assert client.get.call_args.kwargs["params"] == {"query": "Sanofi"}
    assert client.get.call_args.kwargs["headers"]["X-API-KEY"] == "mk"
    # La société retenue est celle dont le NOM prouve l'employeur (pas la filiale).
    assert client.post.call_args.args[0] == "https://dashboard.mantiks.io/api/v2/companies/cmp_1/jobs"
    body = client.post.call_args.kwargs["json"]
    assert body["published_date_window_days"] in (1, 7, 15, 30, 90, 180, 360)
    assert {"locations", "job_title_include", "volume", "is_reposting"} <= set(body)
    # 1 crédit pour l'appel d'offres, rien pour la recherche de société.
    assert seen == [("mantiks", pytest.approx(provider_pricing.unit_cost_per_result_usd("mantiks")))]


async def test_mantiks_no_proven_company_means_no_paid_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "mk")
    client = _client(get=_resp([{"id": "cmp_9", "name": "Sanofi Pasteur"}]), post=_resp(_mantiks_jobs_payload()))
    assert await agg.mantiks_jobs("Sanofi", client=client) == []
    client.post.assert_not_called()


async def test_mantiks_graceful_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "mk")
    assert await agg.mantiks_jobs("Sanofi", client=_client(get=_resp({"error": "x"}, status=401))) == []
    assert await agg.mantiks_jobs("Sanofi2", client=_client(get=_resp([{"id": "c", "name": "Sanofi2"}]), post=_resp({}, 402))) == []


# ── Fantastic.jobs ───────────────────────────────────────────────────────────


async def test_fantastic_maps_documented_fields_and_records_cost(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", "fk")
    seen: list[tuple[str, float]] = []
    monkeypatch.setattr(run_metrics, "record_cost", lambda cid, provider, usd: seen.append((provider, usd)))
    payload = [
        {
            "title": "Ingénieur Cybersécurité",
            "url": "https://careers.sanofi.com/job/1",
            "organization": "Sanofi",
            "date_posted": _iso(2),
            "locations_derived": ["Paris, Île-de-France, France"],
        },
        {"title": "Autre", "url": "https://x/2", "organization": "Sanofi Pasteur", "date_posted": _iso(2)},
    ]
    client = _client(get=_resp(payload))
    out = await agg.fantastic_jobs("Sanofi", client=client)
    assert [j["title"] for j in out] == ["Ingénieur Cybersécurité"]
    assert out[0]["city"] == "Paris, Île-de-France, France" and out[0]["source"] == "fantastic_jobs"
    # DISCOVER-OFFRES (15/10) : sans domaine connu, la recherche passe par les jobboards, par organisation.
    assert client.get.call_args.args[0] == "https://data.fantastic.jobs/v1/active-jb"
    assert client.get.call_args.kwargs["headers"]["Authorization"] == "Bearer fk"
    params = client.get.call_args.kwargs["params"]
    assert params["organization"] == "Sanofi" and params["time_frame"] == "6m" and params["limit"] == agg._PAID_PAGE_SIZE == 25
    assert seen == [("fantastic_jobs", pytest.approx(2 * provider_pricing.unit_cost_per_result_usd("fantastic_jobs")))]


async def test_fantastic_non_list_payload_is_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", "fk")
    assert await agg.fantastic_jobs("Sanofi", client=_client(get=_resp({"error": "x"}))) == []


def test_prices_are_known() -> None:
    assert provider_pricing.unit_cost_per_result_usd("mantiks") > 0
    assert provider_pricing.unit_cost_per_result_usd("fantastic_jobs") > 0


async def test_aggregator_includes_new_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("adzuna_jobs", "jooble_jobs", "theirstack_jobs", "fantastic_jobs"):
        monkeypatch.setattr(agg, name, AsyncMock(return_value=[]))
    row = {"title": "Architecte Cloud", "city": "Lyon", "location": "Lyon", "url": "https://m/1", "source": "mantiks"}
    monkeypatch.setattr(agg, "mantiks_jobs", AsyncMock(return_value=[row]))
    # CASCADE-PLANCHER-5 : une source sans clé n'est pas appelée.
    monkeypatch.setenv("MANTIKS_API_KEY", "k")
    assert await agg.it_job_signals_aggregators("Sanofi") == [row]
