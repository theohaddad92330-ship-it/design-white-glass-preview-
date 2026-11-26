"""VEILLE-COMMUNAUTAIRE (Louis 18/10) — la veille quotidienne n'achète pas ; elle réutilise la
collecte publique récente de la communauté.

- VC.1 — une relecture ``watch`` ne lit les sources d'offres payées qu'en CACHE (cache froid →
  source sautée, aucun appel payé, rien d'inventé) ; une analyse humaine achète toujours.
- VC.2 — un vide Mantiks se garde 7 jours.
- VC.3 — une collecte de la même société (SIREN, sinon domaine) par n'importe quel espace dans les
  24 h est réutilisée par la veille ; au-delà, la veille recollecte les sources gratuites. Les
  critères de l'espace qui relit s'appliquent à la LECTURE ; rien de l'espace collecteur ne traverse.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import provider_cache, public_facts, source_cache
from app.services.data_sources import job_aggregators as agg
from app.services.data_sources.france_travail import domain_offers

_SIREN = "552032534"
_KEY = public_facts.company_fact_key(siren=_SIREN)
_NOW = datetime.now(UTC)


class MemoryStore:
    def __init__(self) -> None:
        self.rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    async def get(self, source: str, category: str, key: str):
        row = self.rows.get((source, category, key))
        if row is None or row[1] <= datetime.now(UTC):
            return None
        return row

    async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
        self.rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))

    def age(self, category: str, seconds: int) -> None:
        """Vieillit les tampons ``category`` de ``seconds`` (leur expiration recule d'autant)."""
        for k, (payload, expires) in list(self.rows.items()):
            if k[0] == source_cache.RUN_STAMP_SOURCE and k[1] == category:
                self.rows[k] = (payload, expires - timedelta(seconds=seconds))


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> MemoryStore:
    ms = MemoryStore()

    async def _fake_store():
        return ms

    monkeypatch.setattr(source_cache, "_store", _fake_store)
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    monkeypatch.setenv("MANTIKS_API_KEY", "k")
    monkeypatch.delenv("MANTIKS_MAX_ENTITIES", raising=False)
    monkeypatch.setattr(agg.mantiks_balance, "check_balance", AsyncMock())
    return ms


def _resp(data: object) -> httpx.Response:
    return httpx.Response(200, json=data, request=httpx.Request("GET", "https://x"))


def _mantiks_client() -> AsyncMock:
    async def get(_url: str, params: dict, headers: dict) -> httpx.Response:
        return _resp([{"id": "acme", "name": "Acme"}])

    async def post(url: str, json: dict, headers: dict) -> httpx.Response:
        job = {
            "job_title": "Développeur Java",
            "job_url": "https://j/1",
            "published_date": (_NOW - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "location": {"city": "Lille"},
        }
        return _resp({"jobs": [job]})

    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=get)
    c.post = AsyncMock(side_effect=post)
    return c


def _forbidden_client() -> AsyncMock:
    """Un client qui ÉCHOUE s'il est appelé : la preuve qu'aucun appel (même gratuit) n'est parti."""
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=AssertionError("companies/search appelé pendant la veille"))
    c.post = AsyncMock(side_effect=AssertionError("companies/jobs ACHETÉ pendant la veille"))
    return c


async def _mantiks(client: AsyncMock, *, watch: bool) -> list:
    return await public_facts.shared_jobs(
        "mantiks", _KEY, lambda: agg.mantiks_jobs("Acme", client=client), pack=None, all_roles=False, watch=watch
    )


# ── VC.1 — la veille n'achète plus ───────────────────────────────────────────


async def test_vc1_watch_on_a_cold_cache_buys_nothing_and_invents_nothing(store, caplog) -> None:
    client = _forbidden_client()
    with caplog.at_level(logging.INFO):
        rows = await _mantiks(client, watch=True)
    assert rows == []  # source sautée : aucune ligne inventée
    client.post.assert_not_awaited()
    client.get.assert_not_awaited()
    assert "jobs_source_cache source=mantiks outcome=cache_only_skip" in caplog.text
    # Rien n'est rangé : un saut n'est pas un « cherché, rien trouvé » (il fermerait la porte aux humains).
    assert await public_facts.peek_fact("jobs", _KEY, "mantiks") is None


async def test_vc1_a_human_analysis_still_buys(store) -> None:
    client = _mantiks_client()
    rows = await _mantiks(client, watch=False)
    assert client.post.await_count == 1
    assert [r["title"] for r in rows] == ["Développeur Java"]


async def test_vc1_watch_on_a_warm_cache_uses_it_without_any_call(store) -> None:
    await _mantiks(_mantiks_client(), watch=False)
    client = _forbidden_client()
    rows = await _mantiks(client, watch=True)
    assert [r["title"] for r in rows] == ["Développeur Java"]
    client.post.assert_not_awaited()


async def test_vc1_every_paid_source_of_the_single_setting_is_cache_only_in_watch(store) -> None:
    for source in ("theirstack", "mantiks", "fantastic", "jooble"):
        assert source in public_facts.CACHE_ONLY_JOB_SOURCES
        fetch = AsyncMock(return_value=[{"title": "Dev"}])
        assert await public_facts.shared_jobs(source, _KEY, fetch, pack=None, all_roles=False, watch=True) == []
        fetch.assert_not_awaited()


async def test_vc1_a_free_source_is_still_collected_by_the_watch(store) -> None:
    assert "adzuna" not in public_facts.CACHE_ONLY_JOB_SOURCES
    fetch = AsyncMock(return_value=[{"title": "Dev"}])
    rows = await public_facts.shared_jobs("adzuna", _KEY, fetch, pack=None, all_roles=False, watch=True)
    assert rows == [{"title": "Dev"}]
    fetch.assert_awaited_once()


def test_vc1_one_setting_shared_with_discover_and_the_watch_flag_reaches_the_aggregators() -> None:
    from app.routers import discover

    assert discover._CACHE_ONLY_JOB_SOURCES is public_facts.CACHE_ONLY_JOB_SOURCES  # GA-26 : un seul réglage
    source = (Path(__file__).parent.parent / "app" / "routers" / "phase1_research.py").read_text(encoding="utf-8")
    assert "watch=req.watch_refresh" in source
    assert "watch=req.watch_refresh" in source.split("async def _aggregator_share", 1)[1].split("async def _aggregator_jobs", 1)[0]


# ── VC.2 — le vide d'une source payée se garde 7 jours ─────────────────────────


def test_vc2_an_empty_mantiks_answer_is_kept_seven_days_free_sources_unchanged() -> None:
    assert provider_cache.TTL_EMPTY_MANTIKS == 7 * 24 * 3600
    assert provider_cache.empty_ttl_of(agg._mantiks_entity_jobs) == provider_cache.TTL_EMPTY_MANTIKS
    assert provider_cache.empty_ttl_of(agg.adzuna_jobs) == provider_cache.TTL_EMPTY_JOBS == 24 * 3600


# ── VC.3 — la veille se sert de la communauté ─────────────────────────────────


async def _run(account_id: str, *, watch: bool, company_key: str | None = _KEY) -> None:
    await source_cache.begin_run(account_id=account_id, company="Acme", company_key=company_key, watch=watch)
    await source_cache.mark_collected(company_key)


async def _ft(pack: str | None, fetch: AsyncMock) -> list:
    return await public_facts.shared_jobs("france_travail", _KEY, fetch, pack=pack, all_roles=False)


async def test_vc3_a_collection_of_space_a_within_24h_is_reused_by_the_watch_of_b(store, caplog) -> None:
    await _run("acc-A", watch=False)
    fetch_a = AsyncMock(return_value=[{"title": "Développeur Java"}])
    await _ft("esn_it", fetch_a)
    with caplog.at_level(logging.INFO):
        await _run("acc-B", watch=True)
    assert source_cache.community_reused() is True
    assert source_cache.reads_bypassed() is False
    assert "watch_community outcome=reuse" in caplog.text
    fetch_b = AsyncMock(side_effect=AssertionError("la veille de B a recollecté"))
    assert await _ft("esn_it", fetch_b) == [{"title": "Développeur Java"}]


async def test_vc3_even_right_after_a_human_run_the_watch_reuses_instead_of_bypassing(store) -> None:
    """Le contournement « relance < 1 h » est le geste d'un humain qui veut du frais ; la veille
    d'un autre espace, juste derrière, n'en hérite pas — elle réutilise."""
    await _run("acc-A", watch=False)
    await _run("acc-B", watch=True)
    assert source_cache.reads_bypassed() is False


async def test_vc3_the_watch_of_b_applies_b_criteria_on_the_shared_raw_collection(store) -> None:
    raw = [
        {"title": "Développeur Java"},
        {"title": "Ingénieur calcul de structures"},
        {"title": "Technicien de maintenance industrielle"},
    ]
    await _run("acc-A", watch=False)
    fetch_a = AsyncMock(return_value=raw)
    seen_a = domain_offers(
        await public_facts.shared_jobs("mantiks", _KEY, fetch_a, pack="esn_it", all_roles=False), pack="esn_it"
    )
    await _run("acc-B", watch=True)
    shared = await public_facts.shared_jobs(
        "mantiks", _KEY, AsyncMock(side_effect=AssertionError("acheté")), pack="industrial_engineering",
        all_roles=False, watch=True,
    )
    seen_b = domain_offers(shared, pack="industrial_engineering")
    assert [r["title"] for r in seen_a] == ["Développeur Java"]
    assert [r["title"] for r in seen_b] == ["Ingénieur calcul de structures", "Technicien de maintenance industrielle"]


async def test_vc3_a_source_asked_with_other_criteria_is_recollected_for_b(store) -> None:
    """France Travail est INTERROGÉ avec le pack de l'espace : une empreinte différente n'est pas réutilisée."""
    await _run("acc-A", watch=False)
    await _ft("esn_it", AsyncMock(return_value=[{"title": "Développeur Java"}]))
    await _run("acc-B", watch=True)
    fetch_b = AsyncMock(return_value=[{"title": "Ingénieur calcul de structures"}])
    assert await _ft("industrial_engineering", fetch_b) == [{"title": "Ingénieur calcul de structures"}]
    fetch_b.assert_awaited_once()


async def test_vc3_a_collection_older_than_24h_is_recollected_by_the_watch(store, caplog) -> None:
    await _run("acc-A", watch=False)
    await _ft("esn_it", AsyncMock(return_value=[{"title": "Développeur Java"}]))
    store.age(source_cache.COLLECTED_STAMP_CATEGORY, source_cache.WATCH_COMMUNITY_REUSE_S + 60)
    with caplog.at_level(logging.INFO):
        await _run("acc-B", watch=True)
    assert source_cache.community_reused() is False
    assert "watch_community outcome=recollect" in caplog.text
    fetch_b = AsyncMock(return_value=[{"title": "Développeur Python"}])
    assert await _ft("esn_it", fetch_b) == [{"title": "Développeur Python"}]
    fetch_b.assert_awaited_once()
    # Et la collecte fraîche profite aux suivants (écrite pour tous).
    assert await public_facts.peek_fact("jobs", _KEY, "ft:esn_it:it") == [{"title": "Développeur Python"}]


async def test_vc3_the_watch_recollecting_still_never_buys(store) -> None:
    await _run("acc-B", watch=True)  # aucune collecte récente → recollecte… des sources GRATUITES seulement
    assert source_cache.reads_bypassed_for("jobs:mantiks") is False
    client = _forbidden_client()
    assert await _mantiks(client, watch=True) == []


async def test_vc3_without_a_company_key_there_is_no_community_and_no_stamp(store) -> None:
    await _run("acc-A", watch=False, company_key=None)
    await _run("acc-B", watch=True, company_key=None)
    assert source_cache.community_reused() is False
    assert not [k for k in store.rows if k[1] == source_cache.COLLECTED_STAMP_CATEGORY]
    # Jamais une raison sociale comme clé de communauté : elle vaut « pas de clé ».
    await _run("acc-A", watch=False, company_key="Acme SA")
    assert not [k for k in store.rows if k[1] == source_cache.COLLECTED_STAMP_CATEGORY]


async def test_vc3_nothing_of_space_a_crosses(store) -> None:
    await _run("acc-A", watch=False)
    stamps = {k: v for k, v in store.rows.items() if k[1] == source_cache.COLLECTED_STAMP_CATEGORY}
    assert list(stamps) == [(source_cache.RUN_STAMP_SOURCE, source_cache.COLLECTED_STAMP_CATEGORY, _KEY)]
    assert all(payload == {} for payload, _ in stamps.values())  # ni espace, ni compte, ni coût
    assert "acc-A" not in repr(stamps)
    # Une ligne qui porte un marqueur d'espace n'est jamais partagée.
    private = [{"title": "Dev", "workspaceId": "ws-A", "notes": "privé"}]
    await public_facts.shared_jobs("mantiks", _KEY, AsyncMock(return_value=private), pack=None, all_roles=False)
    await _run("acc-B", watch=True)
    assert await public_facts.shared_jobs(
        "mantiks", _KEY, AsyncMock(side_effect=AssertionError), pack=None, all_roles=False, watch=True
    ) == []
