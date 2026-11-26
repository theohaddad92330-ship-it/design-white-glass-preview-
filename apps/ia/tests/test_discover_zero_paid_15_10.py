"""DISCOVER-OFFRES (15/10, point A + F) — Découvrir (et Laura, qui passe par lui) n'appelle AUCUNE source payante.

Seules la fiche et l'analyse achètent des offres (Fantastic → Mantiks → TheirStack) ; Découvrir RELIT leur cache
commun et n'interroge que des sources gratuites (France Travail, Adzuna sous réserve). Le volume par carte
vient d'un aperçu à 0 crédit. Ces tests échouent dès qu'un chemin payant revient (chacun sait dire NON).

⚠️ #4430 (Louis 21/10) RENVERSE EN PARTIE ce lot (``c125_offres_fraiches_laura_decouvrir``) : avec l'ESPACE
de la personne (``spaceKey``), les 10 premières cartes au cache commun de plus de 7 jours sont recollectées
par ``fresh_jobs`` (plafonds 10/réponse, 60/espace/jour — ``test_discover_fresh_jobs_4430.py``). Ce qui
reste vrai et tenu ICI : SANS espace, aucun appel payant, et ce routeur ne nomme toujours aucun connecteur.
"""

from __future__ import annotations

import inspect
import re
import time
from unittest.mock import AsyncMock

import pytest

from app.routers import discover as discover_router
from app.services import chat_tools
from app.services.data_sources import job_aggregators

_PAID = ("theirstack_jobs", "fantastic_jobs", "mantiks_jobs")
_FORBIDDEN = re.compile(
    r"theirstack_jobs|fantastic_jobs|mantiks_jobs|_paid_offers|_PaidBudget|DISCOVER_THEIRSTACK|it_job_signals_apec"
)


def test_discover_source_names_no_paid_connector_and_no_apec() -> None:
    source = inspect.getsource(discover_router)
    code = "\n".join(line for line in source.splitlines() if not line.lstrip().startswith("#"))
    assert _FORBIDDEN.findall(code) == []


def test_laura_account_search_reaches_discover_only_through_the_free_registry() -> None:
    source = inspect.getsource(chat_tools)
    assert not re.search(r"theirstack_jobs|fantastic_jobs|mantiks_jobs|_paid_offers", source)


@pytest.mark.asyncio
async def test_no_paid_client_is_called_from_the_discover_path(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*_a: object, **_k: object) -> None:
        raise AssertionError("Découvrir a appelé une source payante")

    for name in _PAID:
        monkeypatch.setattr(job_aggregators, name, AsyncMock(side_effect=boom))
    monkeypatch.setattr(job_aggregators, "_theirstack_search", AsyncMock(side_effect=boom))
    for key in ("THEIRSTACK_API_KEY", "MANTIKS_API_KEY", "FANTASTIC_JOBS_API_KEY"):
        monkeypatch.setenv(key, "k")
    for name in ("it_job_signals", "it_job_signals_ats", "adzuna_jobs"):
        monkeypatch.setattr(discover_router, name, AsyncMock(return_value=[]))
    for fn in ("public_tenders", "legal_signals", "press_signals", "funding_signals"):
        monkeypatch.setattr(discover_router, fn, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))
    candidates = [{"name": f"ACME {i}", "siren": f"61000000{i}"} for i in range(6)]
    tasks = discover_router._start_signal_tasks(candidates, profile_data={})
    degraded: list[dict] = []
    await discover_router._finish_signal_tasks(tasks, degraded, time.monotonic() + 10, profile_data={}, filters={})
    assert all(c["signalsSearched"] for c in candidates)
    assert degraded == []
