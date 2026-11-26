"""#4285.1 (recette prod 22/10) — l'augmentation de capital d'une carte ne se perd pas au budget de la carte.

Cause : la lecture BODACC par SIREN (`capital_increase_signals`) partage le seau `bodacc` avec la lecture
« légale » de chaque carte. Sur une page de 10-25 cartes, la file dépasse le budget d'une source d'appoint
(`SIGNALS_SOURCE_BUDGET_S`) ; `_quiet_rows` ANNULAIT alors l'appel, qui n'était donc jamais rangé au cache :
chaque nouvelle recherche repartait de zéro et aucune carte ne portait le fait daté. Comme pour la collecte
fraîche (#4430), la lecture finit en arrière-plan (et se range) au-delà du budget.
"""

from __future__ import annotations

import asyncio

import pytest

from app.routers import discover

ROW = {"type": "business", "label": "Augmentation de capital", "date": "2026-10-01", "url": "https://bodacc.test/x"}


@pytest.mark.asyncio
async def test_capital_fact_within_budget_is_returned(monkeypatch):
    async def fast(siren, **_):
        return [ROW]

    monkeypatch.setattr(discover, "capital_increase_signals", fast)
    assert await discover._capital_rows("123456789") == [ROW]


@pytest.mark.asyncio
async def test_capital_read_past_the_card_budget_finishes_in_background(monkeypatch):
    monkeypatch.setattr(discover, "SIGNALS_SOURCE_BUDGET_S", 0.01)
    finished: list[str] = []

    async def slow(siren, **_):
        await asyncio.sleep(0.05)
        finished.append(siren)  # le fait est rangé au cache par la vraie fonction
        return [ROW]

    monkeypatch.setattr(discover, "capital_increase_signals", slow)

    # La carte ne l'attend pas au-delà de son budget : pas de fait inventé, pas de bandeau.
    assert await discover._capital_rows("123456789") == []
    # …mais la lecture n'est PAS annulée : elle finit et se range pour la recherche suivante.
    await asyncio.sleep(0.12)
    assert finished == ["123456789"]


@pytest.mark.asyncio
async def test_capital_failure_stays_silent(monkeypatch):
    async def boom(siren, **_):
        raise RuntimeError("source down")

    monkeypatch.setattr(discover, "capital_increase_signals", boom)
    assert await discover._capital_rows("123456789") == []
    await asyncio.sleep(0.02)  # l'erreur est consommée, jamais « exception jamais récupérée »
