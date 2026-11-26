"""#4677 L7 — les signaux sortent du budget de la LISTE.

La liste répond sur son budget ; la moisson continue sur le sien (déjà un chemin d'arrière-plan : la tâche n'est
pas annulée, elle range ses faits au cache partagé, la relecture du web les lit). Ce qui manquait : le dire.
Trois états de carte, jamais confondus — `pending` (en cours), `none` (cherché, rien), `unavailable` (source
qui n'a pas pu répondre) — et un budget de moisson qui laisse à une source froide le temps de finir.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import pytest

from app.routers import discover as discover_router
from app.services.company_filters import DegradeReason


def _cards(n: int) -> list[dict]:
    return [{"name": f"SOCIETE {i}", "siren": str(100000000 + i)} for i in range(n)]


@pytest.fixture
def quiet(monkeypatch):
    async def feeds() -> dict:
        return {}

    async def volumes(_targets: Any) -> dict:
        return {}

    monkeypatch.setattr(discover_router, "load_press_feeds", feeds)
    monkeypatch.setattr(discover_router, "_page_volumes", volumes)
    monkeypatch.setattr(discover_router, "score_candidate", lambda c, **_: {
        "score": 1, "scoreMax": 2, "unmeasured": [], "factors": [], "dataConfidence": None, "addressability": None,
    })


def test_harvest_budget_outlives_the_list_wait():
    """Le budget de moisson (arrière-plan) est SUPÉRIEUR à ce que la liste attend : 5 s ne ramenaient rien."""
    assert discover_router.SIGNALS_SOURCE_BUDGET_S >= 20.0
    assert discover_router.SIGNALS_SOURCE_BUDGET_S > discover_router.SIGNALS_TIME_BUDGET_S


async def test_list_does_not_wait_and_late_signal_is_kept_not_lost(quiet, monkeypatch):
    release = asyncio.Event()
    arrived: list[str] = []

    async def slow(name, siren, **_kw):
        await release.wait()
        arrived.append(siren)
        return ([{"type": "hiring", "label": "x", "date": "2026-10-01"}], [], None)

    monkeypatch.setattr(discover_router, "_candidate_signals", slow)
    monkeypatch.setattr(discover_router, "SIGNALS_TIME_BUDGET_S", 0.05)
    cards = _cards(2)
    tasks = discover_router._start_signal_tasks(cards, profile_data={})
    degraded: list[dict] = []
    started = time.monotonic()
    await discover_router._finish_signal_tasks(
        tasks, degraded, time.monotonic() + 5.0, profile_data={}, filters={}
    )
    assert time.monotonic() - started < 1.0, "la liste a attendu les signaux"
    assert all(c["signalsState"] == "pending" for c in cards)
    assert all(c["signalsSearched"] is False for c in cards)
    # Le travail n'est PAS jeté : les tâches vivent, finissent, et leur résultat existe.
    assert all(not t.cancelled() for t in tasks)
    release.set()
    await asyncio.gather(*tasks)
    assert sorted(arrived) == sorted(c["siren"] for c in cards)


async def test_three_states_are_distinct(quiet, monkeypatch):
    release = asyncio.Event()

    async def per_card(name, siren, **_kw):
        if name.endswith("0"):
            await release.wait()
            return ([], [], None)
        if name.endswith("1"):
            return ([], [], None)  # cherché, rien
        return ([], [{"source": "france_travail", "reason": DegradeReason.NETWORK_ERROR}], None)

    monkeypatch.setattr(discover_router, "_candidate_signals", per_card)
    monkeypatch.setattr(discover_router, "SIGNALS_TIME_BUDGET_S", 0.05)
    cards = _cards(3)
    tasks = discover_router._start_signal_tasks(cards, profile_data={})
    await discover_router._finish_signal_tasks(
        tasks, [], time.monotonic() + 5.0, profile_data={}, filters={}
    )
    pending, none, unavailable = cards
    assert pending["signalsState"] == "pending"
    assert none["signalsState"] == "none" and none["signalsSearched"] is True
    assert unavailable["signalsState"] == "unavailable" and unavailable["signalsSearched"] is False
    assert len({pending["signalsState"], none["signalsState"], unavailable["signalsState"]}) == 3
    release.set()
    await asyncio.gather(*tasks)


async def test_a_card_with_signals_carries_no_state(quiet, monkeypatch):
    async def found(name, siren, **_kw):
        return ([{"type": "hiring", "label": "x", "date": "2026-10-01"}], [], None)

    monkeypatch.setattr(discover_router, "_candidate_signals", found)
    cards = _cards(1)
    tasks = discover_router._start_signal_tasks(cards, profile_data={})
    await discover_router._finish_signal_tasks(tasks, [], time.monotonic() + 5.0, profile_data={}, filters={})
    assert "signalsState" not in cards[0]
    assert cards[0]["signalsSearched"] is True


def test_only_pending_cards_ask_for_a_reread():
    """`jobsPending` (la relecture du web) ne compte que « en cours » : une source indisponible ou une
    ligne jamais ciblée ne rappellent pas la source pour rien."""
    rows = [
        {"siren": "1", "signalsSearched": False, "signalsState": "pending"},
        {"siren": "2", "signalsSearched": False, "signalsState": "unavailable"},
        {"siren": "3", "signalsSearched": False},
        {"siren": "4", "signalsSearched": True, "signalsState": "none"},
    ]
    assert discover_router._jobs_pending_count(rows) == 1
