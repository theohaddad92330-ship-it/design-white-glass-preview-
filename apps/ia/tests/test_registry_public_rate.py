"""Le registre public des entreprises limite le débit PAR ADRESSE IP (#2521).

Mesuré en production le 17/09/2026 (12:34) : « Ta cible » (5 secteurs) →
Découvrir répond en 36 s, bandeau « le registre public des entreprises — trop de
requêtes » ET « le modèle d'analyse — injoignable — délai dépassé ». Au même
moment, une sonde extérieure obtenait un 200 en 0,2 s : c'est NOTRE rafale qui
déclenchait le 429.

La limite publique est écrite dans la documentation de l'API
(`https://recherche-entreprises.api.gouv.fr/openapi.json`, lue le 17/09/2026) :
« L'API accepte au maximum 7 requêtes par seconde par adresse IP. »

Le seau par minute (50 jetons, rafale de 50) ne l'empêchait pas : il laisse
partir 50 requêtes d'un coup, bornées par la seule concurrence (5 en vol, 0,2 s
chacune → ~25 requêtes/s). Et un 429 posait 30 s de silence, que chaque
sous-requête de Découvrir attendait EN ENTIER — c'est la moitié des 36 s.

Ce fichier tient les trois réponses :

* les départs sont ESPACÉS (jamais plus de ``rps`` par seconde, par processus) ;
* une attente se borne au budget de l'appelant (``wait_deadline``) — un
  refroidissement plus long que le budget lève tout de suite, il ne dort pas ;
* un 429 sous budget → UNE nouvelle tentative, puis la dégradation dite.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path

import pytest

from app.services import rate_limiter
from app.services.company_filters import CompanyDiscoveryFilters, DegradeReason
from app.services.data_sources import recherche_entreprises as re_src
from app.services.rate_limiter import RateLimitTimeout, get_throttle, throttle, wait_deadline

#: La limite publique documentée (voir la docstring) — la seule source de ce
#: nombre. Le code ne la devine pas, il se règle en dessous.
PUBLIC_LIMIT_PER_IP = 7


@pytest.fixture(autouse=True)
def _clean_throttles(monkeypatch):
    monkeypatch.delenv("RECHERCHE_ENTREPRISES_RPS", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


async def _starts(provider: str, count: int) -> list[float]:
    stamps: list[float] = []

    async def one() -> None:
        async with throttle(provider):
            stamps.append(time.monotonic())

    await asyncio.gather(*(one() for _ in range(count)))
    return sorted(stamps)


# ── Espacement ──────────────────────────────────────────────────────────────


async def test_registry_calls_leave_spaced_never_in_a_burst(monkeypatch) -> None:
    monkeypatch.setenv("RECHERCHE_ENTREPRISES_RPS", "20")  # 50 ms entre deux départs
    stamps = await _starts("recherche_entreprises", 6)
    gaps = [b - a for a, b in zip(stamps, stamps[1:], strict=False)]
    # Flaky mesuré le 27/09/2026 (intégration cloud, CPU partagée) : une marge
    # collée au nominal (`>= 0.045` pour un espacement de 0.05s) dépendait de la
    # vitesse du runner — 30 tirages mesurés ici sous charge partagée descendent
    # jusqu'à 0.032s. Ce qu'on veut prouver, ce n'est pas un chrono précis mais
    # l'ABSENCE de rafale — le témoin sans espacement (`test_a_provider_without_
    # a_public_rate_is_not_spaced`) montre un étalement total sous 0.04s pour 5
    # appels, donc des départs quasi simultanés (≈0s) : 0.02s reste loin au-dessus
    # de ce bruit et loin en dessous du pire tirage mesuré.
    assert min(gaps) >= 0.02, f"départs groupés : {gaps}"


async def test_a_provider_without_a_public_rate_is_not_spaced() -> None:
    """Témoin : l'espacement ne touche que les sources qui publient une limite
    par seconde. Sans lui, toutes les autres prendraient une latence gratuite."""
    stamps = await _starts("bodacc", 5)
    assert stamps[-1] - stamps[0] < 0.04


def test_the_default_rate_stays_under_the_public_limit_on_every_replica() -> None:
    """La limite est par IP ; le limiteur est par PROCESSUS. Tous les processus
    du service partagent l'adresse de sortie, donc le débit réel est
    ``rps × répliques × travailleurs``. Monter les répliques dans
    `railway.json` sans baisser le débit ferait revenir le 429 — ce test le dit."""
    railway = json.loads((Path(__file__).resolve().parents[1] / "railway.json").read_text())
    regions = railway["deploy"].get("multiRegionConfig") or {}
    replicas = sum(int(cfg.get("numReplicas", 1)) for cfg in regions.values()) or 1
    start = railway["deploy"]["startCommand"]
    workers = int(start.split("--workers", 1)[1].split()[0]) if "--workers" in start else 1
    workers = max(workers, int(os.environ.get("WEB_CONCURRENCY") or 1))

    rps = rate_limiter.PUBLIC_RATE_PER_SECOND["recherche_entreprises"]
    assert replicas >= 1 and rps > 0  # le corpus est lu
    assert rps * replicas * workers < PUBLIC_LIMIT_PER_IP, (
        f"{rps}/s × {replicas} répliques × {workers} travailleur(s) ≥ {PUBLIC_LIMIT_PER_IP}/s par IP"
    )


#: (#2521, suite) — Mesuré en production le 17/09/2026 (recette 13, ~13:30) :
#: une recherche SIMPLE (un secteur + une ville) a quand même reçu un 429 avec
#: UNE requête de marge (3/s × 2 répliques = 6/s, sous 7/s). L'adresse de
#: sortie est PARTAGÉE par d'autres appelants du même processus (préremplissage,
#: `/discover/signals`, d'autres utilisateurs en même temps) que ce limiteur ne
#: voit pas — la marge doit leur laisser de la place, pas seulement tenir sous
#: le plafond publié.
SHARED_IP_MARGIN = 3


def test_the_default_rate_leaves_room_for_other_callers_sharing_the_ip() -> None:
    """La marge d'UNE requête (mesurée insuffisante en prod) ne suffit plus :
    au moins `SHARED_IP_MARGIN` doivent rester disponibles pour les appelants
    voisins qui partagent la même adresse de sortie."""
    railway = json.loads((Path(__file__).resolve().parents[1] / "railway.json").read_text())
    regions = railway["deploy"].get("multiRegionConfig") or {}
    replicas = sum(int(cfg.get("numReplicas", 1)) for cfg in regions.values()) or 1
    start = railway["deploy"]["startCommand"]
    workers = int(start.split("--workers", 1)[1].split()[0]) if "--workers" in start else 1
    workers = max(workers, int(os.environ.get("WEB_CONCURRENCY") or 1))

    rps = rate_limiter.PUBLIC_RATE_PER_SECOND["recherche_entreprises"]
    used = rps * replicas * workers
    assert used <= PUBLIC_LIMIT_PER_IP - SHARED_IP_MARGIN, (
        f"{rps}/s × {replicas} répliques × {workers} travailleur(s) = {used}/s — "
        f"moins de {SHARED_IP_MARGIN}/s de marge sur {PUBLIC_LIMIT_PER_IP}/s par IP"
    )


def test_the_shared_ip_margin_guard_says_no() -> None:
    """Témoin : l'ancienne valeur (3/s, 1 requête de marge) est bien celle que
    la mesure de production a prise en défaut."""
    old_rps = 3.0
    assert not old_rps * 2 * 1 <= PUBLIC_LIMIT_PER_IP - SHARED_IP_MARGIN


def test_the_replica_guard_says_no() -> None:
    """La garde sait dire NON : 4/s sur les deux répliques déclarées dépasse 7."""
    assert not PUBLIC_LIMIT_PER_IP > 4 * 2 * 1


# ── Attente bornée par le budget de l'appelant ─────────────────────────────


async def test_a_cooldown_longer_than_the_budget_fails_at_once() -> None:
    get_throttle("recherche_entreprises").back_off(30)
    started = time.monotonic()
    with wait_deadline(time.monotonic() + 0.3), pytest.raises(RateLimitTimeout):
        async with throttle("recherche_entreprises"):
            pass
    assert time.monotonic() - started < 0.1, "l'appel a dormi au lieu de rendre la main"


async def test_without_a_budget_the_cooldown_is_still_waited() -> None:
    """Témoin : hors budget (remplissages de fond), le refroidissement reste
    attendu — c'est son rôle, et le chemin est inchangé."""
    get_throttle("recherche_entreprises").back_off(0.15)
    started = time.monotonic()
    async with throttle("recherche_entreprises"):
        pass
    assert time.monotonic() - started >= 0.14


async def test_a_spacing_slot_beyond_the_budget_fails_instead_of_waiting(monkeypatch) -> None:
    monkeypatch.setenv("RECHERCHE_ENTREPRISES_RPS", "2")  # 500 ms entre deux départs
    async with throttle("recherche_entreprises"):
        pass
    with wait_deadline(time.monotonic() + 0.1), pytest.raises(RateLimitTimeout):
        async with throttle("recherche_entreprises"):
            pass
    # Le créneau refusé n'est pas réservé : la semaphore est libre, rien ne fuit.
    assert get_throttle("recherche_entreprises").semaphore._value == get_throttle("recherche_entreprises").concurrency


async def test_the_deadline_does_not_leak_out_of_its_block() -> None:
    with wait_deadline(time.monotonic() - 1):
        pass
    get_throttle("recherche_entreprises").back_off(0.05)
    async with throttle("recherche_entreprises"):  # ne lève pas : plus de budget actif
        pass


# ── 429 : une seule nouvelle tentative, sous budget ─────────────────────────


class _Resp:
    def __init__(self, status: int, headers: dict | None = None, rows: list | None = None) -> None:
        self.status_code = status
        self.headers = headers or {}
        self.is_success = 200 <= status < 300
        self._rows = rows or []

    def json(self) -> dict:
        return {"results": self._rows}


class _Client:
    def __init__(self, *responses: _Resp) -> None:
        self._responses = list(responses)
        self.calls = 0

    async def get(self, _url, params=None):
        self.calls += 1
        return self._responses[min(self.calls, len(self._responses)) - 1]


_ROW = {"siren": "552100554", "nom_complet": "SOCIETE TEST", "siege": {"code_postal": "31000"}}
_FILTERS = CompanyDiscoveryFilters(naf_section="C")


async def test_a_429_then_200_returns_the_full_page_within_the_budget() -> None:
    client = _Client(_Resp(429, {"retry-after": "0.05"}), _Resp(200, rows=[_ROW]))
    degraded: list[dict] = []
    with wait_deadline(time.monotonic() + 2):
        rows = await re_src.list_companies(_FILTERS, 25, degraded=degraded, client=client)
    assert client.calls == 2
    assert [r["siren"] for r in rows] == ["552100554"]
    assert not [d for d in degraded if d["reason"] == DegradeReason.RATE_LIMITED]


async def test_a_persistent_429_degrades_without_waiting_past_the_budget() -> None:
    client = _Client(_Resp(429, {"retry-after": "30"}))
    degraded: list[dict] = []
    started = time.monotonic()
    with wait_deadline(time.monotonic() + 0.5):
        rows = await re_src.list_companies(_FILTERS, 25, degraded=degraded, client=client)
    assert rows == []
    assert time.monotonic() - started < 0.3
    assert client.calls == 1  # 30 s d'attente ne tiennent pas dans 0,5 s : pas de seconde tentative
    assert {"source": re_src.SOURCE_NAME, "reason": DegradeReason.RATE_LIMITED} in degraded


async def test_a_second_429_is_said_not_retried_again() -> None:
    client = _Client(_Resp(429, {"retry-after": "0.05"}))
    degraded: list[dict] = []
    with wait_deadline(time.monotonic() + 2):
        rows = await re_src.list_companies(_FILTERS, 25, degraded=degraded, client=client)
    assert rows == []
    assert client.calls == 2  # une seule nouvelle tentative, jamais une boucle
    assert {"source": re_src.SOURCE_NAME, "reason": DegradeReason.RATE_LIMITED} in degraded


async def test_without_a_budget_a_429_with_a_long_cooldown_is_not_retried() -> None:
    """Témoin : sans budget, un refroidissement LONG (> 10 s) n'est pas attendu en ligne — le 429 devient
    une entrée dite, sans nouvelle tentative. (#4617 : un refroidissement court, lui, est réessayé une fois.)"""
    client = _Client(_Resp(429, {"retry-after": "120"}), _Resp(200, rows=[_ROW]))
    degraded: list[dict] = []
    rows = await re_src.list_companies(_FILTERS, 25, degraded=degraded, client=client)
    assert rows == [] and client.calls == 1
