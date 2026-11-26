"""`POST /discover/registry` — le modèle garde sa part du budget (#2521).

Mesuré en production le 17/09/2026 (recette 11, 12:45) : « Ta cible » avec cinq
secteurs → 201 en 20,6 s, 24 entreprises, bandeau « le modèle d'analyse —
injoignable — délai dépassé ». Le même écran avec UN secteur et une ville rend
en 7,3 s, sans rien de dégradé.

La chaîne était : toutes les sous-requêtes du registre (une par section NAF),
ATTENDUES jusqu'à la dernière, puis l'angle commercial avec ce qui restait du
budget. Une seule sous-requête lente mangeait donc la part du modèle, et le
modèle n'était même pas appelé.

Le correctif : le registre a sa PART du budget. Passée cette part, les
sous-requêtes encore en vol sont abandonnées — si d'autres ont déjà rendu des
lignes — et DITES ; le modèle garde le reste. S'il manque quand même de temps,
la liste reste classée par le score déterministe et le bandeau le dit, avec une
raison qui n'affirme pas une panne.

Et le registre public n'est plus interrogé en rafale : les départs sont espacés
(`test_registry_public_rate.py`), et le nombre de requêtes par recherche reste
borné, quel que soit le nombre de secteurs cochés.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services import rate_limiter
from app.services.company_filters import DegradeReason
from app.services.data_sources import recherche_entreprises as re_src

#: Cinq sections NAF distinctes, comme les cinq secteurs de « Ta cible » :
#: finance (K), industrie (C), défense (O), commerce (G), santé (Q).
_FIVE_SECTIONS = "64.19Z,29.10Z,84.22Z,47.75Z,86.10Z"
_SLOW_CODE = "84.22Z"


def _index_of(codes: str) -> int:
    """Un SIREN distinct par section : dix numéros d'écart entre deux sections."""
    return 10 * _FIVE_SECTIONS.split(",").index(codes.split(",")[0])


def _row(index: int, naf: str) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": naf,
        "sector": "Activité",
        "city": "PARIS",
        "department": "75",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
    }


@pytest.fixture(autouse=True)
def _fresh_throttles(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.fixture
def chain(monkeypatch):
    """Cinq sous-requêtes registre ; celle de la défense est LENTE (2 s)."""
    calls: dict[str, Any] = {"claude": 0}

    async def gouv(filters, limit, degraded=None):
        codes = filters.naf_code or ""
        if _SLOW_CODE in codes:
            await asyncio.sleep(calls.get("slow_delay", 2.0))
        return [_row(_index_of(codes) + i, codes.split(",")[0]) for i in range(3)]

    async def pappers_unreached(filters, limit, degraded=None):
        raise AssertionError("Pappers ne sait pas honorer une liste de codes : il ne passe pas devant")

    async def angles(*args, **kwargs):
        calls["claude"] += 1
        await asyncio.sleep(calls.get("claude_delay", 0.05))
        return {"angles": []}, None

    monkeypatch.setattr("app.routers.discover._registry_search", pappers_unreached)
    monkeypatch.setattr("app.routers.discover._fallback_search", gouv)
    monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(side_effect=angles))
    return calls


def _post(client: TestClient, filters: dict) -> Any:
    return client.post("/discover/registry", json={"filters": filters, "limit": 20})


def _reasons(body: dict, source: str) -> list[str]:
    return [e.get("reason") for e in body["degraded"] if e.get("source") == source]


def test_a_slow_sector_no_longer_eats_the_model_share(client: TestClient, chain, monkeypatch) -> None:
    # Flaky mesuré le 02/11/2026 (3 PR rouges, runners chargés) : avec un budget
    # de 1,0 s, la part du modèle ne faisait que ~0,33 s — un tour de boucle
    # ralenti par le runner suffisait à la manger, et le modèle sortait
    # « dégradé ». Les proportions sont gardées (le registre a 2/3 du budget, la
    # sous-requête lente dépasse largement sa part) ; seule l'échelle grandit,
    # pour que le modèle ait ~1 s réelle au lieu de ~0,33 s.
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 3.0)
    chain["slow_delay"] = 6.0

    started = time.monotonic()
    response = _post(client, {"nafCode": _FIVE_SECTIONS})
    elapsed = time.monotonic() - started

    assert response.status_code == 200, response.text
    body = response.json()
    assert chain["claude"] == 1, "le modèle n'a pas été appelé : sa part a été mangée"
    assert "claude" not in {e.get("source") for e in body["degraded"]}
    assert len(body["candidates"]) == 12  # quatre sections × trois lignes — la lente est abandonnée
    assert DegradeReason.TIME_BUDGET in _reasons(body, "recherche-entreprises")
    # Flaky mesuré le 27/09/2026 (intégration cloud) : un seuil d'horloge murale
    # collé au budget (`elapsed < 1.0`) dépendait de la vitesse du runner — mesuré
    # à 1.01s sous charge partagée, 1 % au-dessus. Ce qu'on veut prouver, ce n'est
    # pas un chrono précis mais que la sous-requête LENTE (6.0s) est abandonnée
    # plutôt qu'attendue jusqu'au bout — marge portée à mi-chemin du budget et de
    # la lenteur réelle, encore loin des 6.0s qu'un attentisme complet donnerait.
    assert elapsed < 4.5, f"{elapsed:.2f}s — la sous-requête lente a été attendue jusqu'au bout"


def test_every_sector_is_kept_when_all_answer_in_time(client: TestClient, chain, monkeypatch) -> None:
    """Témoin : un budget large ne coupe rien — la garde n'abandonne que ce qui
    déborde de la part du registre."""
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 6.0)

    body = _post(client, {"nafCode": _FIVE_SECTIONS}).json()

    assert len(body["candidates"]) == 15
    assert DegradeReason.TIME_BUDGET not in _reasons(body, "recherche-entreprises")


def test_the_list_is_awaited_when_nothing_has_answered_yet(client: TestClient, monkeypatch) -> None:
    """La part du registre n'arrête jamais la LISTE : si aucune sous-requête n'a
    encore rendu de ligne, on les attend (jusqu'au budget entier)."""
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 1.0)

    # Une PORTE commune, ouverte une seule fois à 0,6 s (au-delà de la part du
    # registre, sous le budget entier) : les cinq sous-requêtes rendent dans le
    # MÊME tour de boucle. Avec un `sleep(0.6)` par sous-requête, un runner de
    # CI chargé les réveillait à quelques millisecondes d'écart — la première
    # rendue, les suivantes encore en vol étaient abandonnées (c'est le
    # comportement voulu), et le test lisait 4 au lieu de 5 (CI #2534, deux
    # runners, 17/09/2026). Ce test porte sur « rien en main → on attend », pas
    # sur l'ordre d'arrivée des retardataires.
    gate = asyncio.Event()
    armed: list[bool] = []

    async def all_slowish(filters, limit, degraded=None):
        if not armed:
            armed.append(True)
            asyncio.get_running_loop().call_later(0.6, gate.set)
        await gate.wait()
        codes = filters.naf_code or ""
        return [_row(_index_of(codes), codes.split(",")[0])]

    monkeypatch.setattr("app.routers.discover._registry_search", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover._fallback_search", all_slowish)
    monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))

    body = _post(client, {"nafCode": _FIVE_SECTIONS}).json()

    assert len(body["candidates"]) == 5


def test_a_slow_model_leaves_the_score_ordered_list_and_says_so(client: TestClient, chain, monkeypatch) -> None:
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 0.6)
    chain["claude_delay"] = 3.0
    # Les signaux REJOUENT le score après le tri (#3089) et leur arrivée dépend de la
    # vitesse du runner : sans ce bouchon, l'ordre comparé ici variait d'un run à
    # l'autre (03/11, PR #5204). Ce test parle du modèle lent, pas des signaux.
    monkeypatch.setattr(discover_router, "_start_signal_tasks", lambda *a, **k: {})

    started = time.monotonic()
    body = _post(client, {"nafCode": "29.10Z"}).json()

    assert time.monotonic() - started < 1.0
    candidates = body["candidates"]
    assert candidates and all(c["angle"] is None for c in candidates)
    assert candidates == sorted(candidates, key=discover_router._rank_key, reverse=True)
    # « Délai dépassé » d'un modèle qu'on a cessé d'attendre n'est pas une panne
    # « injoignable » : la raison le dit sans l'affirmer.
    assert _reasons(body, "claude") == [DegradeReason.TIME_BUDGET]


# ── Nombre de requêtes et espacement, au niveau HTTP ───────────────────────


class _Resp:
    status_code = 200
    is_success = True
    headers: dict = {}

    def __init__(self, section: str) -> None:
        self._section = section

    def json(self) -> dict:
        return {
            "results": [
                {
                    "siren": f"{700000000 + ord(self._section[0])}",
                    "nom_complet": f"SOCIETE {self._section}",
                    "siege": {},
                }
            ]
        }


class _CountingClient:
    def __init__(self) -> None:
        self.starts: list[float] = []

    async def get(self, _url, params=None):
        self.starts.append(time.monotonic())
        return _Resp((params or {}).get("activite_principale") or "?")

    async def aclose(self) -> None:
        return None


@pytest.fixture
def http(monkeypatch):
    monkeypatch.setenv("RECHERCHE_ENTREPRISES_RPS", "50")
    fake = _CountingClient()

    async def gouv(filters, limit, degraded=None):
        return await re_src.list_companies(filters, limit, degraded=degraded, client=fake)

    async def gouv_page(filters, limit, degraded=None, *, page=1):
        return await re_src.list_companies(filters, limit, degraded=degraded, client=fake, page=page)

    monkeypatch.setattr("app.routers.discover._registry_search", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover._fallback_search", gouv)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", gouv_page)
    monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))
    return fake


_TEN_SECTIONS = "01.11Z,05.10Z,10.11Z,35.11Z,41.10A,47.75Z,49.10Z,64.19Z,84.22Z,86.10Z"


def test_the_registry_is_asked_a_bounded_number_of_times(client: TestClient, http) -> None:
    _post(client, {"nafCode": _FIVE_SECTIONS, "department": "75"})
    five = len(http.starts)
    _post(client, {"nafCode": _TEN_SECTIONS, "department": "75"})
    ten = len(http.starts) - five

    assert five == 5  # une requête par section, et pas de rappel de page 2 (5 × 2 > 6)
    assert ten <= discover_router.MAX_CROSSED_SECTORS


def test_the_request_bound_says_no(client: TestClient, http, monkeypatch) -> None:
    """La garde compte vraiment : sans la borne, dix sections font dix requêtes."""
    monkeypatch.setattr(discover_router, "MAX_CROSSED_SECTORS", 99)
    _post(client, {"nafCode": _TEN_SECTIONS})
    assert len(http.starts) == 10


def test_the_sector_requests_leave_spaced(client: TestClient, http, monkeypatch) -> None:
    # 200 ms entre deux départs : l'horloge est réelle (aiolimiter lit celle de la boucle), donc la
    # gigue d'ordonnancement (mesurée à 5 ms sur le runner CI : 44,8 ms au lieu de 50) doit rester
    # petite devant l'écart. À 50 ms d'écart le seuil 45 ms cassait au hasard ; à 200 ms, 10 % de
    # tolérance = 20 ms, quatre fois la gigue mesurée.
    monkeypatch.setenv("RECHERCHE_ENTREPRISES_RPS", "5")
    _post(client, {"nafCode": _FIVE_SECTIONS})

    gaps = [b - a for a, b in zip(http.starts, http.starts[1:], strict=False)]
    assert len(http.starts) == 5
    assert min(gaps) >= 0.18, f"rafale vers le registre public : {gaps}"
