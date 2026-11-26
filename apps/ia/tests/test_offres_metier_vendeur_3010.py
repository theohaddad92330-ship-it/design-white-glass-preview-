"""DECATHLON 30/10 — les offres du MÉTIER du vendeur se CHERCHENT, elles ne se comptent pas dans le bruit.

Mesuré en prod (run 5d1fc3dd, espace Aquila Data Enabler, ESN Data/IA qui place aussi en CDI) : Adzuna rend
10 offres DECATHLON (vente, logistique) sur des centaines, le tri d'un placeur garde tout, le plancher de 5 est
« atteint » par du bruit, la cascade s'arrête — et AUCUNE offre data/IA n'est jamais cherchée. L'onglet
« Signaux & besoins » finit avec 4 offres, toutes hors métier.

Ce que ces tests tiennent (déterministes, sans réseau, chacun sait dire NON) :
1. les métiers du vendeur — déclarés, sinon déduits — sont UNE fonction (``placed_role_terms``), reprise par le tri ;
2. le plancher compte les offres DU MÉTIER (``counts``), pas tout ce que le tri garde : 10 offres de vente
   n'arrêtent plus la cascade ;
3. le palier « termes » cherche l'employeur AVEC chaque métier du vendeur (« DECATHLON data ») ;
4. sans métier, rien ne change (aucun appel en plus) ;
5. le raccourci « déjà assez d'offres connues » compte aussi les offres du métier.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services import adzuna_budget, offers_cascade_tiers, provider_cache
from app.services import offers_cascade as oc
from app.services.data_sources import job_aggregators as agg
from app.services.domain_job_filters import placed_role_terms, rank_offers_by_placed_roles, trade_offer_count

_KEYS = (
    "ADZUNA_APP_ID",
    "ADZUNA_APP_KEY",
    "JOOBLE_API_KEY",
    "THEIRSTACK_API_KEY",
    "MANTIKS_API_KEY",
    "FANTASTIC_JOBS_API_KEY",
)

_JULIEN = {
    "offerDomain": "ia",
    "recruitsForClients": True,
    "inferredPlacedRoles": [
        {"role": "Data / IA", "terms": ["data", "machine learning", "intelligence artificielle", "power bi"]}
    ],
}


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _KEYS:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(agg, "_theirstack_search", AsyncMock(return_value={}))
    monkeypatch.setattr(provider_cache, "get_json", AsyncMock(return_value=None))
    monkeypatch.setattr(provider_cache, "set_json", AsyncMock(return_value=None))
    monkeypatch.setattr(adzuna_budget, "analysis_allowed", AsyncMock(return_value=True))


def _shop(n: int) -> dict:
    return {"title": f"Conseiller Vente {n}", "city": f"V{n}", "location": f"V{n}", "source": "adzuna", "url": f"https://s/{n}"}


def _data(n: int) -> dict:
    return {
        "title": f"Data Scientist {n}",
        "company": "DECATHLON",
        "city": "Lille",
        "location": "Lille",
        "source": "adzuna",
        "url": f"https://d/{n}",
    }


def _keep_all(_title: str) -> bool:
    return True


# ── 1. les métiers du vendeur ──────────────────────────────────────────────────────────────────


def test_placed_role_terms_reads_inferred_roles_when_none_is_declared() -> None:
    assert placed_role_terms(_JULIEN)[:2] == ("data", "machine learning")


def test_placed_role_terms_declared_wins_over_inferred() -> None:
    assert placed_role_terms({**_JULIEN, "placedRoles": ["Data Engineer"]}) == ("data engineer",)


def test_placed_role_terms_empty_without_any_role() -> None:
    assert placed_role_terms({"offerDomain": "ia"}) == ()
    assert placed_role_terms(None) == ()


def test_ranking_still_puts_the_trade_first() -> None:
    ranked = rank_offers_by_placed_roles([_shop(1), _data(1)], _JULIEN)
    assert ranked[0]["title"] == "Data Scientist 1"


def test_trade_offer_count_counts_only_the_trade_and_everything_without_terms() -> None:
    offers = [_shop(1), _shop(2), _data(1)]
    assert trade_offer_count(offers, ("data",)) == 1
    assert trade_offer_count(offers, ()) == 3


# ── 2. le plancher compte le métier ────────────────────────────────────────────────────────────


async def test_noise_kept_by_a_placer_no_longer_meets_the_floor() -> None:
    calls: list[str] = []

    def tier(name: str, rows: list[dict]):
        async def fetch(_budget: oc.PaidBudget) -> list[dict]:
            calls.append(name)
            return rows

        return fetch

    tiers = {"sources": tier("sources", []), "terms": tier("terms", [_data(i) for i in range(5)])}
    base = [_shop(i) for i in range(10)]
    without = await oc.run_cascade(base, tiers, keep=_keep_all)
    assert calls == []  # l'ancien comportement : 10 offres de vente « atteignent » le plancher
    out = await oc.run_cascade(base, tiers, keep=_keep_all, counts=lambda o: "Data" in o["title"])
    assert calls == ["sources", "terms"]
    assert sum("Data" in o["title"] for o in out.offers) == 5
    assert not out.below_floor
    assert len(without.offers) == 10


async def test_counts_below_floor_says_so() -> None:
    out = await oc.run_cascade([_shop(i) for i in range(10)], {}, keep=_keep_all, counts=lambda o: False)
    assert out.below_floor
    assert out.reason == oc.REASON_SHORT


# ── 3. le palier « termes » cherche l'employeur AVEC le métier ─────────────────────────────────


async def test_terms_tier_searches_the_employer_with_each_trade_term(monkeypatch: pytest.MonkeyPatch) -> None:
    for env in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY"):
        monkeypatch.setenv(env, "k")
    search = AsyncMock(return_value=[_data(1)])
    monkeypatch.setattr(agg, "adzuna_employer_term_offers", search)
    scope = agg._scope("DECATHLON", None)
    fetch = offers_cascade_tiers.terms_tier("DECATHLON", scope, (), trade_terms=("data", "machine learning"))
    assert fetch is not None
    rows = await fetch(oc.PaidBudget())
    assert [c.args[1] for c in search.await_args_list] == ["data", "machine learning"]
    assert rows and rows[0]["title"] == "Data Scientist 1"


def test_terms_tier_stays_absent_without_term_nor_trade() -> None:
    assert offers_cascade_tiers.terms_tier("DECATHLON", agg._scope("DECATHLON", None), ()) is None


async def test_adzuna_employer_term_search_is_a_strict_noop_without_keys() -> None:
    assert await agg.adzuna_employer_term_offers("DECATHLON", "data") == []


async def test_adzuna_employer_term_search_asks_brand_and_term(monkeypatch: pytest.MonkeyPatch) -> None:
    for env in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY"):
        monkeypatch.setenv(env, "k")
    search = AsyncMock(return_value=[_data(1)])
    monkeypatch.setattr(agg, "_adzuna_search", search)
    out = await agg.adzuna_employer_term_offers("DECATHLON", "machine learning")
    assert search.await_args.args[0] == "DECATHLON machine learning"
    assert out == [_data(1)]


# ── bout à bout : le cas DECATHLON ─────────────────────────────────────────────────────────────


def _patch_sources(monkeypatch: pytest.MonkeyPatch, **rows: list[dict]) -> dict[str, AsyncMock]:
    mocks = {}
    for name in ("adzuna_jobs", "jooble_jobs", "fantastic_jobs", "mantiks_jobs", "theirstack_jobs"):
        mocks[name] = AsyncMock(return_value=rows.get(name, []))
        monkeypatch.setattr(agg, name, mocks[name])
    return mocks


async def test_decathlon_placer_gets_the_data_offers(monkeypatch: pytest.MonkeyPatch) -> None:
    for env in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY"):
        monkeypatch.setenv(env, "k")
    _patch_sources(monkeypatch, adzuna_jobs=[_shop(i) for i in range(10)])
    term_search = AsyncMock(side_effect=lambda company, term, **_: [_data(hash(term) % 1000)])
    monkeypatch.setattr(agg, "adzuna_employer_term_offers", term_search)
    out = await agg.it_job_signals_aggregators(
        "DECATHLON", keep_title=_keep_all, trade_terms=placed_role_terms(_JULIEN)
    )
    assert term_search.await_count >= 1
    assert any(o["title"].startswith("Data Scientist") for o in out)


async def test_without_trade_terms_nothing_more_is_searched(monkeypatch: pytest.MonkeyPatch) -> None:
    for env in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY"):
        monkeypatch.setenv(env, "k")
    _patch_sources(monkeypatch, adzuna_jobs=[_shop(i) for i in range(10)])
    term_search = AsyncMock(return_value=[_data(1)])
    monkeypatch.setattr(agg, "adzuna_employer_term_offers", term_search)
    out = await agg.it_job_signals_aggregators("DECATHLON", keep_title=_keep_all)
    assert term_search.await_count == 0
    assert len(out) == 10
