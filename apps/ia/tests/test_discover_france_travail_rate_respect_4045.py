"""#4045 — Louis en prod (14/10, 10h41-10h45, commit 429335a9c8, `/discover?
sectors=fintech,aerospace&headcount=250-999`) : 1 recrutement sur 25 cartes.

Mesuré dans les logs de `bellum-ia-service` : `rate_limit_backoff
provider=france_travail` + `source_health Source dégradée france_travail —
Client error '429 Too Many Requests'` ×14 PAR recherche. Cause exacte : la
CONCURRENCE France Travail avait été montée 5→20 par le commit fd04306e97 (le
matin même, #4045 initial — pour que la fin d'une page pleine garde son
recrutement, voir `test_discover_hiring_depth_4045.py`), mais ``rpm`` (le
débit MOYEN promis) n'a jamais borné la RAFALE : ``AsyncLimiter`` démarre
plein, donc une concurrence de 20 laisse déjà partir jusqu'à 20 requêtes
quasi simultanées. France Travail refuse la rafale, pas le volume — et le
backoff 1 s + le budget par source (``SIGNALS_SOURCE_BUDGET_S``) font perdre
les cartes au lieu de les montrer dégradées.

Ce test passe par le VRAI chemin (`/discover/registry`, donc
`_start_signal_tasks`/`_finish_signal_tasks`), avec un FAUX serveur France
Travail qui mesure le débit RÉEL reçu et répond 429 au-delà de N appels par
seconde — jamais un mock qui ne prouverait que la forme de l'appel.

SAIT DIRE NON : avant ce lot, `rate_limiter.PUBLIC_RATE_PER_SECOND` ne
portait pas `france_travail` — la concurrence (20) partait en rafale contre
le faux serveur et `fake_client.rejected` aurait été > 0. C'est l'espacement
ajouté à `PUBLIC_RATE_PER_SECOND` (``rate_limiter.py``) qui fait tomber ce
test à 0, pas une assertion qui se contente de relire la config."""

from __future__ import annotations

import time
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services import rate_limiter
from app.services.data_sources import france_travail as ft


@pytest.fixture(autouse=True)
def _fresh_throttles():
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.fixture(autouse=True)
def _creds(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")


def _row(i: int) -> dict:
    return {
        "name": f"SOCIETE {i:03d} SAS",
        "siren": f"{500000000 + i}",
        "nafCode": "62.01Z",
        "sector": "Programmation informatique",
        "city": "PARIS",
        "department": "75",
        "headcountRange": "250 à 499 salariés",
        "headcountTranche": "32",
        "legalCategory": "5710",
    }


class _RateLimitedFTServer:
    """Faux serveur France Travail : fenêtre glissante de 1 s, refuse (429) tout
    appel au-delà de ``limit_per_second`` — le comportement RÉEL mesuré en
    production (429335a9c8), jamais une limite devinée côté test."""

    def __init__(self, limit_per_second: int) -> None:
        self.limit = limit_per_second
        self._timestamps: list[float] = []
        self.accepted = 0
        self.rejected = 0

    def _admit(self) -> bool:
        now = time.monotonic()
        self._timestamps = [t for t in self._timestamps if now - t < 1.0]
        if len(self._timestamps) >= self.limit:
            self.rejected += 1
            return False
        self._timestamps.append(now)
        self.accepted += 1
        return True

    async def post(self, url: str, **_kwargs: Any) -> httpx.Response:
        request = httpx.Request("POST", url)
        if not self._admit():
            return httpx.Response(429, request=request, headers={"retry-after": "0.05"})
        return httpx.Response(200, request=request, json={"access_token": "tok"})

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        request = httpx.Request("GET", url)
        if not self._admit():
            return httpx.Response(429, request=request, headers={"retry-after": "0.05"})
        company = str((kwargs.get("params") or {}).get("motsCles") or "")
        return httpx.Response(
            200,
            request=request,
            json={
                "resultats": [
                    {
                        "id": f"offre-{company}",
                        "intitule": "Ingénieur logiciel",
                        "dateCreation": "2026-10-10T08:00:00Z",
                        "typeContrat": "CDI",
                        "typeContratLibelle": "CDI",
                        "entreprise": {"nom": company},
                        "lieuTravail": {"libelle": "75 - PARIS"},
                    }
                ]
            },
        )


@pytest.fixture
def full_page_against_fake_ft_server(monkeypatch: pytest.MonkeyPatch):
    """8 candidats (3 appels France Travail chacun : 1 token + M18 + large) —
    le faux serveur n'accepte que 6 appels/s, le DOUBLE du débit configuré
    (`FRANCE_TRAVAIL_RPS=3`) : marge délibérée (même raisonnement que
    `recherche_entreprises` dans `rate_limiter.py`, PUBLIC_RATE_PER_SECOND) —
    une borne exacte à zéro marge est fragile à la jitter réelle de
    l'ordonnanceur asyncio (``asyncio.sleep`` n'est jamais précis à la
    microseconde), et ce test mesure le RESPECT du débit, pas une course."""
    rows = [_row(i) for i in range(8)]

    async def gouv(filters: Any, limit: int, degraded: list[dict] | None = None) -> list[dict]:
        return rows

    async def angle(*_a: Any, **_kw: Any) -> tuple[dict, None]:
        return {"angles": []}, None

    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    monkeypatch.setattr(discover_router, "call_claude", angle)
    for name in ("public_tenders", "legal_signals", "press_signals"):
        async def _empty(*_a: Any, **_kw: Any) -> list[dict]:
            return []

        monkeypatch.setattr(discover_router, name, _empty)

    async def _no_feeds() -> dict:
        return {}

    monkeypatch.setattr(discover_router, "load_press_feeds", _no_feeds)

    # Budget large à dessein : ce test mesure le RESPECT du débit publié, pas
    # la vitesse — `test_discover_hiring_depth_4045.py` couvre déjà la
    # profondeur de page sous le budget par défaut.
    monkeypatch.setattr(discover_router, "SIGNALS_SOURCE_BUDGET_S", 20.0)
    monkeypatch.setattr(discover_router, "SIGNALS_TIME_BUDGET_S", 20.0)

    server = _RateLimitedFTServer(limit_per_second=6)
    monkeypatch.setattr(ft, "get_shared_client", lambda *_a, **_kw: server)
    monkeypatch.setenv("FRANCE_TRAVAIL_RPS", "3")

    return rows, server


def test_full_page_never_bursts_past_the_published_france_travail_rate(
    client: TestClient, full_page_against_fake_ft_server
) -> None:
    """#4045.1 — une page Découvrir pleine ne doit JAMAIS envoyer de rafale
    au-delà du débit publié vers France Travail : 0 429 reçu, et chaque carte
    est soit servie dans le budget global, soit sa part non servie est DITE
    (`degraded`), jamais silencieusement vide."""
    _rows, server = full_page_against_fake_ft_server

    resp = client.post("/discover/registry", json={"filters": {"department": "75"}, "limit": 8})
    assert resp.status_code == 200, resp.text

    assert server.rejected == 0, (
        f"{server.rejected} réponse(s) 429 du faux serveur (sur {server.accepted} acceptées) — "
        "la concurrence envoie une rafale au-delà du débit publié vers France Travail"
    )
    assert server.accepted > 0, "aucun appel n'est parti — le test ne prouve rien"

    body = resp.json()
    candidates = body["candidates"]
    assert len(candidates) == 8

    missing_hiring = [
        i
        for i, c in enumerate(candidates)
        if not any(s.get("type") == "hiring" for s in c.get("signals") or [])
    ]
    assert missing_hiring == [] or body["degraded"], (
        f"{len(missing_hiring)}/8 cartes sans recrutement sans qu'aucune panne ne soit "
        "dite dans `degraded[]` — une absence silencieuse, jamais une absence dite"
    )
