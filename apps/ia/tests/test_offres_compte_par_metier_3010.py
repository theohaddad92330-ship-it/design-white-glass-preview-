"""Louis 30/10 — sur un compte, chercher les offres d'un AUTRE métier, puis en afficher plus, 5 par 5, borne 50.

Ce que ces tests tiennent (sans réseau) :
1. la recherche demande « marque + métier » à Adzuna et rend au plus ``ACCOUNT_OFFER_SEARCH_MAX`` offres ;
2. sans métier, la marque seule ;
3. sans clé (ou quota du jour épuisé) : ``searched=False`` — jamais une liste vide qui se lirait « aucune offre » ;
4. une offre de stage n'entre jamais ;
5. la réponse est gardée 30 j : le second appel ne touche pas Adzuna ;
6. la route ``POST /companies/job-offers`` borne le métier et rend ``offers`` + ``searched``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.services import adzuna_budget, provider_cache
from app.services.data_sources import apec, ats_boards, careers_pages, france_travail, wttj
from app.services.data_sources import job_aggregators as agg


@pytest.fixture(autouse=True)
def _isolated(monkeypatch: pytest.MonkeyPatch) -> dict:
    for env in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY"):
        monkeypatch.setenv(env, "k")
    store: dict = {}

    async def _get(namespace: str, key: str):
        return store.get((namespace, key))

    async def _set(namespace: str, key: str, value, ttl=None):
        store[(namespace, key)] = value

    monkeypatch.setattr(provider_cache, "get_json", _get)
    monkeypatch.setattr(provider_cache, "set_json", _set)
    monkeypatch.setattr(adzuna_budget, "analysis_allowed", AsyncMock(return_value=True))
    # France Travail non branché par défaut (None = la source n'a pas pu partir).
    monkeypatch.setattr(france_travail, "account_term_offers", AsyncMock(return_value=None))
    # Les autres sources : muettes par défaut, chaque test branche celle qu'il prouve.
    for module, name in (
        (apec, "it_job_signals_apec"),
        (ats_boards, "it_job_signals_ats"),
        (careers_pages, "it_job_signals_careers"),
        (wttj, "it_job_signals_wttj"),
    ):
        monkeypatch.setattr(module, name, AsyncMock(return_value=[]))
    for name in ("mantiks_jobs", "theirstack_jobs", "fantastic_jobs"):
        monkeypatch.setattr(agg, name, AsyncMock(return_value=[]))
    for env in ("MANTIKS_API_KEY", "THEIRSTACK_API_KEY", "FANTASTIC_JOBS_API_KEY"):
        monkeypatch.delenv(env, raising=False)
    return store


def _offer(n: int, title: str = "Data Scientist") -> dict:
    return {
        "title": f"{title} {n}",
        "company": "DECATHLON",
        "city": "Lille",
        "url": f"https://o/{n}",
        "source": "adzuna",
    }


async def test_searches_brand_and_term_and_caps_at_fifty(monkeypatch: pytest.MonkeyPatch) -> None:
    search = AsyncMock(return_value=[_offer(i) for i in range(70)])
    monkeypatch.setattr(agg, "_adzuna_search", search)
    out = await agg.account_offer_search("DECATHLON", "data engineer")
    assert search.await_args.args[0] == "DECATHLON data engineer"
    assert search.await_args.kwargs["limit"] == agg.ACCOUNT_OFFER_SEARCH_MAX == 50
    assert out["searched"] is True
    assert len(out["offers"]) == 50


async def test_without_term_the_brand_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    search = AsyncMock(return_value=[_offer(1)])
    monkeypatch.setattr(agg, "_adzuna_search", search)
    await agg.account_offer_search("DECATHLON", "  ")
    assert search.await_args.args[0] == "DECATHLON"


async def test_without_key_nothing_is_searched_and_it_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ADZUNA_APP_KEY")
    search = AsyncMock()
    monkeypatch.setattr(agg, "_adzuna_search", search)
    out = await agg.account_offer_search("DECATHLON", "data")
    assert out == {"offers": [], "searched": False}
    assert search.await_count == 0


async def test_daily_quota_spent_and_no_other_source_says_not_searched(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(adzuna_budget, "analysis_allowed", AsyncMock(return_value=False))
    monkeypatch.setattr(agg, "_adzuna_search", AsyncMock(return_value=[_offer(1)]))
    assert (await agg.account_offer_search("DECATHLON", "data"))["searched"] is False


async def test_adzuna_quota_spent_france_travail_still_answers(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prod 30/10 : le quota Adzuna du jour (500 appels) était épuisé à 13 h — la recherche ne partait plus."""
    monkeypatch.setattr(adzuna_budget, "analysis_allowed", AsyncMock(return_value=False))
    adzuna = AsyncMock()
    monkeypatch.setattr(agg, "_adzuna_search", adzuna)
    ft = AsyncMock(return_value=[_offer(7, "Responsable qualité")])
    monkeypatch.setattr(france_travail, "account_term_offers", ft)
    out = await agg.account_offer_search("STILL", "qualité")
    assert adzuna.await_count == 0
    assert ft.await_args.args[:2] == ("STILL", "qualité")
    assert out["searched"] is True
    assert [o["title"] for o in out["offers"]] == ["Responsable qualité 7"]


async def test_both_sources_are_merged_without_duplicates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agg, "_adzuna_search", AsyncMock(return_value=[_offer(1), _offer(2)]))
    monkeypatch.setattr(france_travail, "account_term_offers", AsyncMock(return_value=[_offer(2), _offer(3)]))
    out = await agg.account_offer_search("DECATHLON", "data")
    assert sorted(o["title"] for o in out["offers"]) == ["Data Scientist 1", "Data Scientist 2", "Data Scientist 3"]


async def test_internships_never_enter(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_offer(1), _offer(2, "Stage Data Scientist")]
    monkeypatch.setattr(agg, "_adzuna_search", AsyncMock(return_value=rows))
    out = await agg.account_offer_search("DECATHLON", "data")
    assert [o["title"] for o in out["offers"]] == ["Data Scientist 1"]


async def test_second_call_is_served_from_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    search = AsyncMock(return_value=[_offer(1)])
    monkeypatch.setattr(agg, "_adzuna_search", search)
    await agg.account_offer_search("DECATHLON", "Data")
    again = await agg.account_offer_search("DECATHLON", "data")
    assert search.await_count == 1
    assert again["offers"][0]["title"] == "Data Scientist 1"


def test_route_returns_offers_and_searched(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agg, "_adzuna_search", AsyncMock(return_value=[_offer(1)]))
    res = client.post("/companies/job-offers", json={"company": "DECATHLON", "term": "data"})
    assert res.status_code == 200
    body = res.json()
    assert body["searched"] is True
    assert body["offers"][0]["title"] == "Data Scientist 1"


def test_route_refuses_a_term_too_long(client: TestClient) -> None:
    res = client.post("/companies/job-offers", json={"company": "DECATHLON", "term": "x" * 81})
    assert res.status_code == 422


# ── Louis 30/10 — « toutes nos autres sources s'il faut » ─────────────────────────────────────


async def test_free_company_sources_are_filtered_by_the_term(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agg, "_adzuna_search", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        apec, "it_job_signals_apec", AsyncMock(return_value=[_offer(1, "Ingénieur qualité"), _offer(2, "Vendeur")])
    )
    ats = AsyncMock(return_value=[_offer(3, "Responsable Qualité")])
    monkeypatch.setattr(ats_boards, "it_job_signals_ats", ats)
    monkeypatch.setattr(wttj, "it_job_signals_wttj", AsyncMock(return_value=[_offer(4, "Comptable")]))
    out = await agg.account_offer_search("STILL", "qualité", website="https://www.still.fr", siren="123456789")
    assert sorted(o["title"] for o in out["offers"]) == ["Ingénieur qualité 1", "Responsable Qualité 3"]
    assert ats.await_args.kwargs["website"] == "https://www.still.fr"
    assert out["searched"] is True


async def test_paid_sources_are_called_only_below_five(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "k")
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    monkeypatch.setattr(agg, "_adzuna_search", AsyncMock(return_value=[_offer(i) for i in range(5)]))
    mantiks = AsyncMock(return_value=[_offer(9)])
    monkeypatch.setattr(agg, "mantiks_jobs", mantiks)
    await agg.account_offer_search("DECATHLON", "data")
    assert mantiks.await_count == 0


async def test_paid_sources_fill_in_and_are_bought_once_per_company(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "k")
    monkeypatch.setattr(agg, "_adzuna_search", AsyncMock(return_value=[_offer(1)]))
    mantiks = AsyncMock(return_value=[_offer(8), _offer(9, "Chef de rayon")])
    monkeypatch.setattr(agg, "mantiks_jobs", mantiks)
    out = await agg.account_offer_search("DECATHLON", "data")
    assert sorted(o["title"] for o in out["offers"]) == ["Data Scientist 1", "Data Scientist 8"]
    await agg.account_offer_search("DECATHLON", "machine learning")
    assert mantiks.await_count == 1  # la réponse ENTREPRISE est gardée 30 j : un autre métier ne rachète rien


async def test_a_paid_source_without_key_is_never_called(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agg, "_adzuna_search", AsyncMock(return_value=[]))
    theirstack = AsyncMock(return_value=[_offer(1)])
    monkeypatch.setattr(agg, "theirstack_jobs", theirstack)
    await agg.account_offer_search("DECATHLON", "data")
    assert theirstack.await_count == 0
