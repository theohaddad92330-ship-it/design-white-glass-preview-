"""#3885 (lot RAS) — agrégateurs d'offres à API officielle : Adzuna, Jooble,
TheirStack (partenaire qui couvre les offres LinkedIn / Indeed sous contrat).

Ce que ces tests tiennent :
- sans clé = NO-OP STRICT : zéro appel réseau (le test sait dire NON) ;
- la forme de réponse DOCUMENTÉE est lue, rien d'inventé (champ absent → None) ;
- attribution sur preuve : une offre d'un autre employeur est écartée ;
- dédoublonnage : entre agrégateurs, et contre les offres déjà collectées ;
- coût TheirStack enregistré par offre rendue (1 crédit / offre).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import provider_pricing, run_metrics
from app.services.data_sources import job_aggregators as agg

_KEYS = ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY", "THEIRSTACK_API_KEY")


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


def _client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=resp)
    c.post = AsyncMock(return_value=resp)
    return c


@pytest.fixture(autouse=True)
def _no_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _KEYS:
        monkeypatch.delenv(k, raising=False)


# ── NO-OP STRICT sans clé ────────────────────────────────────────────────────


async def test_every_aggregator_is_a_strict_noop_without_keys() -> None:
    client = _client(_resp({"results": [], "jobs": [], "data": []}))
    assert await agg.adzuna_jobs("Sanofi", client=client) == []
    assert await agg.jooble_jobs("Sanofi", client=client) == []
    assert await agg.theirstack_jobs("Sanofi", client=client) == []
    assert await agg.it_job_signals_aggregators("Sanofi", client=client) == []
    client.get.assert_not_called()
    client.post.assert_not_called()


async def test_adzuna_needs_both_id_and_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    client = _client(_resp({"results": []}))
    assert await agg.adzuna_jobs("Sanofi", client=client) == []
    client.get.assert_not_called()


# ── Adzuna ───────────────────────────────────────────────────────────────────


def _adzuna_payload() -> dict:
    """Forme documentée (developer.adzuna.com/docs/search)."""
    return {
        "results": [
            {
                "id": "1",
                "title": "Ingénieur DevOps H/F",
                "company": {"display_name": "Sanofi"},
                "location": {"display_name": "Lyon, Rhône", "area": ["France", "Rhône-Alpes", "Lyon"]},
                "created": _iso(2),
                "redirect_url": "https://www.adzuna.fr/details/1",
                "contract_type": "permanent",
            },
            {
                "id": "2",
                "title": "Data Engineer",
                "company": {"display_name": "Cabinet Recrutement XYZ"},  # autre employeur → écarté
                "location": {"display_name": "Paris"},
                "created": _iso(1),
                "redirect_url": "https://www.adzuna.fr/details/2",
            },
            {
                "id": "3",
                "title": "Chef de projet SI",
                "company": {"display_name": "Sanofi"},
                "location": {"display_name": "Paris"},
                "created": _iso(800),  # trop vieille → écartée
                "redirect_url": "https://www.adzuna.fr/details/3",
            },
        ]
    }


async def test_adzuna_maps_documented_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "key")
    client = _client(_resp(_adzuna_payload()))
    out = await agg.adzuna_jobs("Sanofi", client=client)
    assert [j["title"] for j in out] == ["Ingénieur DevOps H/F"]
    job = out[0]
    assert job["company"] == "Sanofi"
    assert job["city"] == "Lyon, Rhône" and job["location"] == "Lyon, Rhône"
    assert job["url"] == "https://www.adzuna.fr/details/1"
    assert job["contractType"] == "CDI"
    assert job["source"] == "adzuna"
    url = client.get.call_args.args[0]
    assert url.startswith("https://api.adzuna.com/v1/api/jobs/fr/search/1")
    params = client.get.call_args.kwargs["params"]
    assert params["app_id"] == "id" and params["app_key"] == "key" and params["what"] == "Sanofi"


async def test_adzuna_graceful_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "key")
    assert await agg.adzuna_jobs("Sanofi", client=_client(_resp({}, status=401))) == []
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await agg.adzuna_jobs("Sanofi2", client=c) == []


# ── Jooble ───────────────────────────────────────────────────────────────────


async def test_jooble_maps_documented_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JOOBLE_API_KEY", "jk")
    payload = {
        "totalCount": 2,
        "jobs": [
            {
                "id": 9,
                "title": "Architecte Cloud",
                "location": "Toulouse",
                "snippet": "…",
                "type": "CDI",
                "link": "https://fr.jooble.org/desc/9",
                "company": "Airbus",
                "updated": _iso(3),
            },
            {"title": "Comptable", "company": "Autre SA", "link": "https://fr.jooble.org/desc/10", "updated": _iso(1)},
        ],
    }
    client = _client(_resp(payload))
    out = await agg.jooble_jobs("Airbus", client=client)
    assert [j["title"] for j in out] == ["Architecte Cloud"]
    assert out[0]["url"] == "https://fr.jooble.org/desc/9"
    assert out[0]["contractType"] == "CDI"
    assert out[0]["source"] == "jooble"
    assert client.post.call_args.args[0] == "https://jooble.org/api/jk"
    body = client.post.call_args.kwargs["json"]
    assert body["keywords"] == "Airbus" and body["location"] == "France"


# ── TheirStack ───────────────────────────────────────────────────────────────


def _theirstack_payload() -> dict:
    """Forme documentée (theirstack.com/en/docs/api-reference/jobs/search_jobs_v1)."""
    return {
        "metadata": {"total_results": 2},
        "data": [
            {
                "id": 1,
                "job_title": "Ingénieur Cybersécurité",
                "url": "https://www.linkedin.com/jobs/view/1",
                "final_url": "https://careers.sanofi.com/job/1",
                "date_posted": _iso(4)[:10],
                "company": "Sanofi",
                "location": "Paris, Île-de-France, France",
            },
            {
                "id": 2,
                "job_title": "Développeur Java",
                "url": "https://fr.indeed.com/viewjob?jk=2",
                "date_posted": _iso(6)[:10],
                "company": "Sanofi Pasteur",  # filiale, autre employeur → écartée
                "location": "Lyon",
            },
        ],
    }


async def test_theirstack_maps_documented_fields_and_records_cost(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    seen: list[tuple[str, float]] = []
    monkeypatch.setattr(run_metrics, "record_cost", lambda cid, provider, usd: seen.append((provider, usd)))
    client = _client(_resp(_theirstack_payload()))
    out = await agg.theirstack_jobs("Sanofi", client=client)
    assert [j["title"] for j in out] == ["Ingénieur Cybersécurité"]
    # L'URL de l'annonce d'origine (ATS de l'employeur) est préférée à l'agrégateur.
    assert out[0]["url"] == "https://careers.sanofi.com/job/1"
    assert out[0]["source"] == "theirstack"
    assert client.post.call_args.args[0] == "https://api.theirstack.com/v1/jobs/search"
    assert client.post.call_args.kwargs["headers"]["Authorization"] == "Bearer tk"
    body = client.post.call_args.kwargs["json"]
    assert body["company_name_or"] == ["Sanofi"]
    assert body["job_country_code_or"] == ["FR"]
    # SIG-A (A2) — pages de 25 (défaut documenté), bornées à 3.
    assert body["posted_at_max_age_days"] > 0 and body["limit"] == agg._PAID_PAGE_SIZE == 25
    # 1 crédit par offre RENDUE par le fournisseur (2 ici), pas par offre gardée.
    assert seen == [("theirstack", pytest.approx(2 * provider_pricing.unit_cost_per_result_usd("theirstack")))]


def test_theirstack_result_has_a_known_price() -> None:
    assert provider_pricing.unit_cost_per_result_usd("theirstack") > 0
    assert provider_pricing.unit_cost_per_result_usd("adzuna") == 0.0


# ── Agrégation, filtre métier, dédoublonnage ────────────────────────────────


async def test_aggregator_dedups_same_offer_across_providers_and_applies_title_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    same = {"title": "Ingénieur DevOps H/F", "location": "Lyon", "city": "Lyon", "company": "Sanofi"}
    monkeypatch.setattr(
        agg, "adzuna_jobs", AsyncMock(return_value=[{**same, "url": "https://a/1", "source": "adzuna"}])
    )
    monkeypatch.setattr(
        agg,
        "jooble_jobs",
        AsyncMock(
            return_value=[
                {**same, "url": "https://j/1", "source": "jooble"},  # même offre, autre URL
                {**same, "title": "Visiteur médical", "url": "https://j/2", "source": "jooble"},
            ]
        ),
    )
    monkeypatch.setattr(agg, "theirstack_jobs", AsyncMock(return_value=[]))
    # CASCADE-PLANCHER-5 : une source sans clé n'est pas appelée — les trois portent leur clé, aucun réseau.
    for env in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY", "THEIRSTACK_API_KEY"):
        monkeypatch.setenv(env, "k")
    monkeypatch.setattr(agg, "_theirstack_search", AsyncMock(return_value={}))
    out = await agg.it_job_signals_aggregators("Sanofi", keep_title=lambda t: "DevOps" in t)
    assert [(j["title"], j["source"]) for j in out] == [("Ingénieur DevOps H/F", "adzuna")]


def test_drop_known_offers_removes_what_existing_sources_already_have() -> None:
    known = [{"title": "Ingénieur DevOps (H/F)", "location": "Lyon", "url": None}]
    offers = [
        {"title": "Ingénieur DevOps H/F", "location": "Lyon", "url": "https://a/1"},
        {"title": "Ingénieur DevOps H/F", "location": "Paris", "url": "https://a/2"},
    ]
    assert [o["url"] for o in agg.drop_known_offers(offers, known)] == ["https://a/2"]


def test_phase1_research_is_the_caller() -> None:
    """Du code juste que personne n'appelle ne sert à rien : la phase 1 lance
    les agrégateurs ET les dédoublonne contre les sources directes."""
    import inspect

    from app.routers import phase1_research

    source = inspect.getsource(phase1_research)
    assert "it_job_signals_aggregators(" in source
    assert "drop_known_offers(" in source
    assert '_dated(_pre_aggregators, "job_aggregators")' in source
