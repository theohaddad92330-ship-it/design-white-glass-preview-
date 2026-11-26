"""`POST /discover/signals` — la MOISSON tient aussi son budget (#2521, suite).

Le lot précédent (#2521, `test_discover_signals_bound.py`) a borné la
RÉSOLUTION des groupes de signaux (``MAX_RESOLUTIONS`` / ``RESOLUTION_BUDGET_S``).
Mais la MOISSON qui la précède — en particulier DECP, qui nomme ses titulaires
(les concurrents en place, jusqu'à ``per_source`` ≈ 50-100 SIREN par
:func:`app.services.data_sources.registry_lookup.names_by_siren`) — n'avait
AUCUN budget de temps : elle tourne sur le MÊME bucket ``recherche_entreprises``
que la résolution qui suit, sans aucune borne. Sous un registre CONTENTIEUX
(le bucket déjà entamé, une réplique voisine, ou simplement un fournisseur
lent), cette étape pouvait à elle seule dépasser les 45 s du proxy NestJS
(``DISCOVER_CALL_OPTS = { maxAttempts: 1, timeoutMs: 45_000 }``) — AVANT même
que la résolution des candidats ne commence.

Le correctif : ``HARVEST_BUDGET_S`` pose un ``wait_deadline`` autour de la
moisson, exactement comme ``RESOLUTION_BUDGET_S`` en pose un autour de la
résolution (le même mécanisme, déjà éprouvé côté ``/discover/registry``,
#2521) : toute attente d'un jeton ``recherche_entreprises`` — la nomination des
titulaires PENDANT la moisson comme la résolution des candidats après — échoue
vite plutôt que de dormir au-delà du budget.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta

import pytest

from app.routers import discover_signals as mod
from app.services import rate_limiter


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat()


def _award_row(name: str, index: int) -> dict:
    return {
        "name": name,
        "siren": None,
        "department": "69",
        "city": None,
        "signal": {
            "type": "award",
            "label": "marché attribué",
            "date": _iso(index % 30),
            "url": None,
            "detail": None,
        },
    }


@pytest.fixture(autouse=True)
def _fresh_throttles(monkeypatch, virtual_clock):
    # Horloge simulée : le budget de moisson se mesure en secondes virtuelles, pas au mur
    # d'horloge d'un runner chargé (CI annulée #4253 / #4254).
    monkeypatch.delenv("REDIS_URL", raising=False)
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.fixture
def stub_other_sources(monkeypatch):
    async def _empty(*a, **kw):
        return []

    monkeypatch.setattr(mod, "list_tender_buyers", _empty)
    monkeypatch.setattr(mod, "list_hiring_companies", _empty)
    # #2616.1 — sans ce stub, `hiring` déclenche aussi un VRAI appel réseau
    # vers apec.fr (APEC s'ajoute désormais EN PARALLÈLE à France Travail).
    monkeypatch.setattr(mod, "list_hiring_companies_apec", _empty)
    # #2616.1 (corroboration) — même raison pour ATS (Greenhouse/Lever, sans
    # clé requise) une fois un candidat `hiring` résolu.
    monkeypatch.setattr(mod, "it_job_signals_wttj", _empty)
    monkeypatch.setattr(mod, "it_job_signals_ats", _empty)

    # La résolution des candidats qui suit la moisson n'est PAS ce qu'on mesure : sans ce
    # stub elle tentait un vrai appel HTTP (coupé par le garde-réseau dans un fil, en temps
    # RÉEL), seule source de temps non simulable de ces tests.
    async def _unreachable(name: str):
        raise RuntimeError("registre non joignable (stub)")

    monkeypatch.setattr(mod, "resolve_company_identity", _unreachable)


def _coverage(resp) -> dict:
    cov = resp.coverage
    return cov.model_dump() if hasattr(cov, "model_dump") else dict(cov)


def test_fifty_titulaires_with_a_contended_registry_stay_under_the_harvest_budget(
    stub_other_sources, monkeypatch
):
    """DECP nomme 50 titulaires (`names_by_siren`) — sous l'espacement RÉEL du
    registre public (3 req/s par processus, #2521, `PUBLIC_RATE_PER_SECOND`) :
    sans budget, 50 noms prennent ~16,7 s, bien au-delà des 45 s du proxy une
    fois cumulés avec la résolution des candidats qui suit."""
    monkeypatch.setattr(mod, "HARVEST_BUDGET_S", 1.0)
    monkeypatch.setattr(mod, "RESOLUTION_BUDGET_S", 5.0)  # pas la borne sous test ici

    calls = {"n": 0}

    async def _slow_award(dept, days, lim, **_kw):  # #4796 : offset= / page_stats= / name_vendors=
        for i in range(50):
            try:
                async with rate_limiter.throttle("recherche_entreprises"):
                    calls["n"] += 1
            except rate_limiter.RateLimitTimeout:
                break
        return [_award_row(f"Entreprise {i}", i) for i in range(3)]

    monkeypatch.setattr(mod, "list_award_buyers", _slow_award)

    started = time.monotonic()
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))
    elapsed = time.monotonic() - started

    # Marge au-delà de HARVEST_BUDGET_S (1.0s) : l'espacement RÉEL du registre
    # public (#2521, suite — 2/s par processus) peut faire dépasser un peu le
    # couperet le temps qu'une attente en cours se déclare hors budget ; ce qui
    # compte ici est que ce soit borné, pas 50 × l'espacement (≈ 25 s à 2/s).
    assert elapsed < 4.0, f"{elapsed:.2f}s — la moisson n'a pas respecté son budget de temps"
    assert calls["n"] < 50, "le budget doit couper avant que tous les titulaires soient interrogés"
    assert calls["n"] > 0, "le début de la moisson doit avoir eu lieu — sinon le test ne prouve rien"
    # La moisson reste utilisable malgré la coupe : les lignes déjà obtenues sont rendues.
    cov = _coverage(resp)
    assert cov["candidatesFound"] == 3


def test_witness_the_harvest_is_not_cut_when_the_registry_is_not_contended(stub_other_sources, monkeypatch):
    """Témoin : sans l'espacement par seconde (un registre qui répond tout de
    suite), la même moisson de 50 titulaires va au bout — la borne ne mord que
    sous charge, jamais par défaut."""
    monkeypatch.setenv("RECHERCHE_ENTREPRISES_RPS", "100000")
    monkeypatch.setenv("RECHERCHE_ENTREPRISES_RPM", "100000")
    monkeypatch.setattr(mod, "HARVEST_BUDGET_S", 2.0)
    monkeypatch.setattr(mod, "RESOLUTION_BUDGET_S", 5.0)

    calls = {"n": 0}

    async def _fast_award(dept, days, lim, **_kw):  # #4796 : offset= / page_stats= / name_vendors=
        for _ in range(50):
            async with rate_limiter.throttle("recherche_entreprises"):
                calls["n"] += 1
        return [_award_row(f"Entreprise {i}", i) for i in range(3)]

    monkeypatch.setattr(mod, "list_award_buyers", _fast_award)

    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25)))

    assert calls["n"] == 50
    assert _coverage(resp)["candidatesFound"] == 3
