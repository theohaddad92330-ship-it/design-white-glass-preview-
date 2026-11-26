"""#4045 (14/10) — Découvrir lit toutes les sources d'offres de l'analyse via le cache
partagé par SIREN : ATS sur toutes les cartes, cache lu avant tout réseau, sources
payantes RETIRÉES (15/10 : zéro appel payant), indicateur de collecte en cours, ligne de mesure."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.routers import discover as discover_router
from app.services.data_sources import job_aggregators
from app.services import provider_cache, public_facts, source_cache

# #3901.p — Découvrir ne retient une offre que si elle recoupe un métier de l'ESN (déclaré ou déduit).
SCOPE_PROFILE = {"placedRoles": ["développeur", "ingénieur", "architecte", "data", "devops", "offre"]}



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
    return ms


def _offer(title: str, url: str, source: str = "x", contract: str | None = "CDI") -> dict:
    return {
        "title": title, "date": "2026-10-10", "contractType": contract, "url": url,
        "source": source, "location": "Paris", "skills": [],
    }


def _wire(monkeypatch: pytest.MonkeyPatch, **overrides: Any) -> dict[str, AsyncMock]:
    mocks = {
        "it_job_signals": AsyncMock(return_value=[]),
        "adzuna_jobs": AsyncMock(return_value=[]),
        "it_job_signals_ats": AsyncMock(return_value=[]),
    }
    mocks.update(overrides)
    for name, mock in mocks.items():
        monkeypatch.setattr(discover_router, name, mock)
    # DISCOVER-OFFRES (15/10) : Découvrir n'appelle JAMAIS une source payante — les trois sont
    # posées sur le module du connecteur et comptées ; chaque test dit qu'elles n'ont pas été appelées.
    for name in ("theirstack_jobs", "fantastic_jobs", "mantiks_jobs"):
        mocks[name] = AsyncMock(return_value=[_offer("Payé", "https://paid/1")])
        monkeypatch.setattr(job_aggregators, name, mocks[name])
    for fn in ("public_tenders", "legal_signals", "press_signals", "funding_signals"):
        monkeypatch.setattr(discover_router, fn, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))
    for key in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "THEIRSTACK_API_KEY", "MANTIKS_API_KEY", "FANTASTIC_JOBS_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    return mocks


async def _run(sirens: list[str]) -> list[dict]:
    candidates = [{"name": f"ACME {s}", "siren": s} for s in sirens]
    tasks = discover_router._start_signal_tasks(candidates, profile_data=SCOPE_PROFILE)
    await discover_router._finish_signal_tasks(tasks, [], time.monotonic() + 10, profile_data=SCOPE_PROFILE, filters={})
    return candidates


def _labels(candidate: dict) -> list[str]:
    return sorted(s["label"] for s in candidate["signals"] if s["type"] == "hiring")


# ── Point 2 — les ATS publics sur TOUTES les cartes ─────────────────────────


@pytest.mark.asyncio
async def test_public_ats_boards_are_searched_for_every_card(monkeypatch: pytest.MonkeyPatch) -> None:
    mocks = _wire(monkeypatch, it_job_signals_ats=AsyncMock(return_value=[_offer("Architecte cloud", "https://gh/1")]))
    cards = await _run(["600000001", "600000002"])
    assert mocks["it_job_signals_ats"].await_count == 2
    assert [_labels(c) for c in cards] == [["Architecte cloud"], ["Architecte cloud"]]


@pytest.mark.asyncio
async def test_a_failing_ats_board_never_degrades_the_card(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(monkeypatch, it_job_signals_ats=AsyncMock(side_effect=RuntimeError("boom")))
    candidate = (await _run(["600000003"]))[0]
    assert candidate["signalsSearched"] is True  # les gratuits ont répondu : vide mesuré


# ── Point 1 — le cache de l'analyse est relu, sans réseau ───────────────────


@pytest.mark.asyncio
async def test_offers_collected_by_the_analysis_are_shown_without_any_network_call(
    monkeypatch: pytest.MonkeyPatch, store: MemoryStore
) -> None:
    mocks = _wire(monkeypatch)
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    # L'analyse d'un autre espace a collecté des offres TheirStack pour ce SIREN.
    key = public_facts.company_fact_key(siren="600000004")
    variant = public_facts.jobs_fact_variant("theirstack", None, False)
    await public_facts.cached_fact("jobs", key, variant, AsyncMock(return_value=[_offer("Data engineer", "https://ts/1")]))
    candidate = (await _run(["600000004"]))[0]
    assert _labels(candidate) == ["Data engineer"]
    mocks["theirstack_jobs"].assert_not_called()


@pytest.mark.asyncio
async def test_internships_in_the_shared_cache_are_never_a_signal(
    monkeypatch: pytest.MonkeyPatch, store: MemoryStore
) -> None:
    _wire(monkeypatch)
    key = public_facts.company_fact_key(siren="600000005")
    variant = public_facts.jobs_fact_variant("jooble", None, False)
    rows = [_offer("Stage développeur", "https://j/1", contract="Stage"), _offer("Développeur Go", "https://j/2")]
    await public_facts.cached_fact("jobs", key, variant, AsyncMock(return_value=rows))
    candidate = (await _run(["600000005"]))[0]
    assert _labels(candidate) == ["Développeur Go"]


# ── Points 4/5 — payant BORNÉ, écrit au cache partagé ───────────────────────


@pytest.mark.asyncio
async def test_with_every_paid_key_set_and_nothing_cached_nothing_paid_is_called(
    monkeypatch: pytest.MonkeyPatch, store: MemoryStore
) -> None:
    mocks = _wire(monkeypatch)
    for key in ("THEIRSTACK_API_KEY", "MANTIKS_API_KEY", "FANTASTIC_JOBS_API_KEY"):
        monkeypatch.setenv(key, "k")
    cards = await _run(["600000300", "600000301"])
    assert all(c["signalsSearched"] for c in cards)
    for name in ("theirstack_jobs", "fantastic_jobs", "mantiks_jobs"):
        mocks[name].assert_not_called()


@pytest.mark.asyncio
async def test_an_existing_empty_cache_entry_is_read_not_refilled(
    monkeypatch: pytest.MonkeyPatch, store: MemoryStore
) -> None:
    mocks = _wire(monkeypatch)
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    key = public_facts.company_fact_key(siren="600000500")
    await public_facts.cached_fact("jobs", key, public_facts.jobs_fact_variant("theirstack", None, False), AsyncMock(return_value=[]))
    await _run(["600000500"])
    mocks["theirstack_jobs"].assert_not_called()


# ── Point 3 — collecte visible ──────────────────────────────────────────────


def test_pending_count_is_the_cards_whose_harvest_is_running() -> None:
    """#4677 (28/10/2026, lot L7) — « en attente » a changé de sens, et c'est voulu : ce n'est plus
    « pas cherchée » mais « moisson en COURS en arrière-plan ». Une source indisponible ou une ligne
    jamais ciblée ne doivent pas faire relire la page pour rien (`_jobs_pending_count`)."""
    pending = discover_router.SIGNALS_STATE_PENDING
    cards = [
        {"siren": "1", "signalsSearched": True},
        {"siren": "2", "signalsSearched": False, "signalsState": pending},
        {"siren": "3", "signalsSearched": False, "signalsState": pending},
        {"name": "sans siren", "signalsSearched": False, "signalsState": pending},  # jamais cherchable
    ]
    assert discover_router._jobs_pending_count(cards) == 2
    assert discover_router._jobs_pending_count([]) == 0


def test_pending_count_says_no_to_what_will_never_resolve() -> None:
    """SAIT DIRE NON : rien d'autre qu'une moisson en cours ne compte. Sans ce test, compter aussi
    `unavailable` ou un état absent ferait relire la page sans fin pour une collecte qui ne viendra pas."""
    cards = [
        {"siren": "4", "signalsSearched": False, "signalsState": discover_router.SIGNALS_STATE_UNAVAILABLE},
        {"siren": "5", "signalsSearched": True, "signalsState": discover_router.SIGNALS_STATE_NONE},
        {"siren": "6", "signalsSearched": False},  # aucun état posé
    ]
    assert discover_router._jobs_pending_count(cards) == 0


# ── Point 7 — la mesure ─────────────────────────────────────────────────────


def test_measure_line_counts_cards_with_offers_searched_empty_and_not_searched() -> None:
    hiring = {"type": "hiring", "label": "Dev", "date": "2026-10-10"}
    cards = [
        {"siren": "1", "signalsSearched": True, "signals": [hiring]},
        {"siren": "2", "signalsSearched": True, "signals": [{"type": "business"}]},
        {"siren": "3", "signalsSearched": True, "signals": []},
        {"siren": "4", "signalsSearched": False},
    ]
    line = discover_router._jobs_measure_line(cards, cache=7, network=3)
    assert line == "Découvrir — offres : 1 cartes avec offres / 2 cherchées vides / 1 non cherchées (cache=7, réseau=3)"


# ── CACHE-SOURCES (15/10) — fait brut rangé, tri du vendeur à la lecture ─────


@pytest.mark.asyncio
async def test_a_second_seller_with_another_trade_reads_the_same_raw_fact_sorted_its_own_way(
    monkeypatch: pytest.MonkeyPatch, store: MemoryStore
) -> None:
    mocks = _wire(monkeypatch)
    rows = [_offer("Développeur Java", "https://ts/1"), _offer("Caissier polyvalent", "https://ts/2")]
    company = public_facts.company_fact_key(siren="600000700")
    await public_facts.cached_fact("jobs", company, public_facts.jobs_fact_variant("theirstack", None, False), AsyncMock(return_value=rows))
    peeked = await discover_router._peek_shared_jobs(company, "esn_it", True)
    it = discover_router._domain_rows(peeked["theirstack"], pack=None, all_roles=False)
    all_roles = discover_router._domain_rows(peeked["theirstack"], pack=None, all_roles=True)
    assert [o["title"] for o in it] == ["Développeur Java"]  # le tri IT du premier vendeur
    assert {o["title"] for o in all_roles} == {"Développeur Java", "Caissier polyvalent"}
    mocks["theirstack_jobs"].assert_not_called()
