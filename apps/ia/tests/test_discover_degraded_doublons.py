"""`degraded[]` de Découvrir — une panne de source se dit UNE fois, jamais une fois par carte.

Mesuré en production le 14/10/2026 (`/discover`, cinq secteurs) : le bandeau
« Résultats partiels » répétait des dizaines de fois « Les offres d'emploi
publiques — pas de réponse dans le temps imparti ». `_finish_signal_tasks`
ajoutait les pannes LOCALES de chaque candidat (`degraded.extend`) sans passer
par `_merge_degraded`, qui existait déjà pour exactement ce cas.
"""

from __future__ import annotations

import asyncio
import time

from app.routers import discover
from app.services.company_filters import DegradeReason


def _done(result):
    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    fut.set_result(result)
    return fut


def test_une_meme_panne_sur_plusieurs_cartes_ne_fait_quune_ligne() -> None:
    async def run() -> list[dict]:
        panne = [{"source": "france_travail", "reason": DegradeReason.TIME_BUDGET}]
        candidates = [{"name": f"SOCIETE {i}", "siren": f"10000000{i}"} for i in range(5)]
        tasks = {_done(([], list(panne), None)): c for c in candidates}
        degraded: list[dict] = []
        await discover._finish_signal_tasks(
            tasks, degraded, time.monotonic() + 30, profile_data={}, filters={}
        )
        return degraded

    degraded = asyncio.run(run())
    lignes = [e for e in degraded if e.get("source") == "france_travail"]
    assert len(lignes) == 1


def test_deux_pannes_differentes_restent_deux_lignes() -> None:
    async def run() -> list[dict]:
        tasks = {
            _done(([], [{"source": "france_travail", "reason": DegradeReason.TIME_BUDGET}], None)): {
                "name": "A",
                "siren": "100000001",
            },
            _done(([], [{"source": "apec", "reason": DegradeReason.NETWORK_ERROR}], None)): {
                "name": "B",
                "siren": "100000002",
            },
        }
        degraded: list[dict] = []
        await discover._finish_signal_tasks(
            tasks, degraded, time.monotonic() + 30, profile_data={}, filters={}
        )
        return degraded

    sources = sorted(e["source"] for e in asyncio.run(run()))
    assert sources == ["apec", "france_travail"]
