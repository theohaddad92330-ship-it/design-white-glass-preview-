"""#4430 (Louis 21/10) — offres FRAÎCHES pour les comptes que proposent Laura et Découvrir.

Renverse EN PARTIE « Découvrir sans appel payant » (PR #4230) et « Mantiks jamais dans Découvrir » (14/10) :
les 10 premiers comptes dont le cache COMMUN (clé = entreprise seule, 30 j) a plus de 7 jours sont recollectés
chez les sources payées ; au-delà des plafonds (10 par réponse, 60 par espace et par jour), cache seul.
Chaque test sait dire NON : cache récent, plafond atteint, pas d'espace.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services import free_text_facts, fresh_jobs, provider_cache, public_facts, source_cache
from app.services.data_sources import job_aggregators


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


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> MemoryStore:
    ms = MemoryStore()

    async def _fake_store():
        return ms

    monkeypatch.setattr(source_cache, "_store", _fake_store)
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    fresh_jobs._local_counts.clear()
    return ms


def _offer(title: str, url: str) -> dict:
    return {
        "title": title,
        "url": url,
        "date": datetime.now(UTC).date().isoformat(),
        "contractType": "CDI",
        "company": "ACME",
        "source": "x",
    }


@pytest.fixture
def paid(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    """Les trois sources payées, posées sur le module du connecteur : la cascade réelle les appelle."""
    for key in ("THEIRSTACK_API_KEY", "MANTIKS_API_KEY", "FANTASTIC_JOBS_API_KEY"):
        monkeypatch.setenv(key, "k")
    for key in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    mocks = {
        "fantastic_jobs": AsyncMock(return_value=[_offer("Développeur React", "https://f/1")]),
        "mantiks_jobs": AsyncMock(return_value=[]),
        "theirstack_jobs": AsyncMock(return_value=[]),
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(job_aggregators, name, mock)
    # #4437 — le rattachement du texte libre est testé à part : ici, jamais un appel au modèle.
    monkeypatch.setattr(free_text_facts, "attach_offer_titles", AsyncMock(side_effect=lambda rows, **_: rows))
    return mocks


async def _seed(siren: str, *, age_days: float) -> None:
    """Une collecte payée déjà rangée au cache commun, datée de ``age_days`` jours."""
    key = public_facts.company_fact_key(siren=siren)
    collected = datetime.now(UTC) - timedelta(days=age_days)
    await public_facts.share_fact(
        "jobs",
        key,
        public_facts.jobs_fact_variant("fantastic", None, False),
        [_offer("Ancienne offre", f"https://old/{siren}")],
        collected_at=collected,
    )


def _cards(n: int, start: int = 0) -> list[dict]:
    return [{"name": f"ACME {i}", "siren": f"7000000{i:02d}"} for i in range(start, start + n)]


def test_the_three_ceilings_are_single_constants() -> None:
    assert fresh_jobs.FRESH_JOBS_STALE_AFTER_S == 7 * 24 * 3600
    assert fresh_jobs.FRESH_JOBS_MAX_PER_ANSWER == 10
    assert fresh_jobs.FRESH_JOBS_MAX_PER_SPACE_DAY == 60


@pytest.mark.asyncio
async def test_a_stale_top_ten_card_triggers_a_paid_call_and_lands_in_the_common_cache(
    store: MemoryStore, paid: dict[str, AsyncMock]
) -> None:
    await _seed("700000000", age_days=12)  # périmé (> 7 j) mais encore dans les 30 j du cache
    plan = await fresh_jobs.plan_fresh_collection(_cards(1), space_key="ws-1")
    assert plan.to_collect == ["700000000"]
    rows = await fresh_jobs.collect_fresh_jobs("ACME 0", "700000000", pack=None, all_roles=False)
    paid["fantastic_jobs"].assert_awaited()  # le cache interne de 30 j n'a pas répondu à sa place
    assert [r["title"] for r in rows] == ["Développeur React"]
    key = public_facts.company_fact_key(siren="700000000")
    shared = await public_facts.peek_fact("jobs", key, public_facts.jobs_fact_variant("fantastic", None, False))
    assert [r["title"] for r in shared or []] == ["Développeur React"]
    # La collecte date le cache : la carte suivante n'achète plus rien.
    again = await fresh_jobs.plan_fresh_collection(_cards(1), space_key="ws-1")
    assert again.to_collect == []


@pytest.mark.asyncio
async def test_a_cache_younger_than_seven_days_never_calls(
    store: MemoryStore, paid: dict[str, AsyncMock], caplog: pytest.LogCaptureFixture
) -> None:
    await _seed("700000000", age_days=3)
    with caplog.at_level(logging.INFO, logger="app.services.fresh_jobs"):
        plan = await fresh_jobs.plan_fresh_collection(_cards(1), space_key="ws-1")
    assert plan.to_collect == []
    assert plan.as_of["700000000"] == (datetime.now(UTC) - timedelta(days=3)).date().isoformat()
    assert "jobs_fresh cache=hit" in caplog.text
    for line in caplog.messages:  # aucun nom de fournisseur dans la ligne
        assert not any(p in line.lower() for p in ("fantastic", "mantiks", "theirstack"))
    for mock in paid.values():
        mock.assert_not_called()


@pytest.mark.asyncio
async def test_only_the_first_ten_cards_of_an_answer_are_collected(store: MemoryStore) -> None:
    plan = await fresh_jobs.plan_fresh_collection(_cards(14), space_key="ws-1")
    assert plan.to_collect == [c["siren"] for c in _cards(10)]
    assert plan.capped is True


@pytest.mark.asyncio
async def test_the_daily_space_ceiling_stops_every_paid_call(store: MemoryStore) -> None:
    for _ in range(6):
        await fresh_jobs.plan_fresh_collection(_cards(10), space_key="ws-1")
    plan = await fresh_jobs.plan_fresh_collection(_cards(3, start=20), space_key="ws-1")
    assert plan.to_collect == []
    assert plan.capped is True
    # Un AUTRE espace a son propre plafond.
    other = await fresh_jobs.plan_fresh_collection(_cards(3, start=20), space_key="ws-2")
    assert len(other.to_collect) == 3


@pytest.mark.asyncio
async def test_without_a_space_nothing_is_ever_paid(store: MemoryStore) -> None:
    plan = await fresh_jobs.plan_fresh_collection(_cards(3), space_key=None)
    assert plan.to_collect == []


@pytest.mark.asyncio
async def test_the_space_never_enters_the_common_cache_key(store: MemoryStore) -> None:
    await fresh_jobs.plan_fresh_collection(_cards(1), space_key="ws-secret")
    await fresh_jobs.mark_collected("700000000")
    assert not any("ws-secret" in "|".join(k) for k in store.rows)


@pytest.mark.asyncio
async def test_the_paid_connector_cache_is_bypassed_only_inside_the_fresh_block(store: MemoryStore) -> None:
    calls: list[str] = []

    @provider_cache.cached_by("jobs:theirstack", lambda company, **_: f"e1|name:{company}", ttl=30 * 24 * 3600)
    async def _paid(company: str) -> list[dict]:
        calls.append(company)
        return [_offer("Dev", f"https://p/{len(calls)}")]

    await _paid("acme")
    await _paid("acme")
    assert calls == ["acme"]  # hors du bloc : le cache commun de 30 j répond, rien n'est racheté
    with source_cache.fresh_paid_reads(("jobs:theirstack",)):
        await _paid("acme")
    assert calls == ["acme", "acme"]
    await _paid("acme")
    assert calls == ["acme", "acme"]  # la réponse fraîche a ÉCRASÉ l'entrée commune


@pytest.mark.asyncio
async def test_a_fresh_collection_caches_the_free_text_attachment_with_the_fact(
    store: MemoryStore, paid: dict[str, AsyncMock], monkeypatch: pytest.MonkeyPatch
) -> None:
    # #4437 — le rattachement du texte libre est rangé AVEC l'offre, dans le cache commun.
    async def _attach(rows: list[dict], **_: Any) -> list[dict]:
        return [
            {**row, "attached": {"factType": "hiring", "skill": "React", "family": None, "extract": "React"}}
            for row in rows
        ]

    monkeypatch.setattr(free_text_facts, "attach_offer_titles", _attach)
    await fresh_jobs.collect_fresh_jobs("ACME 0", "700000000", pack=None, all_roles=False)
    key = public_facts.company_fact_key(siren="700000000")
    shared = await public_facts.peek_fact("jobs", key, public_facts.jobs_fact_variant("fantastic", None, False))
    assert shared and shared[0]["attached"]["skill"] == "React"
