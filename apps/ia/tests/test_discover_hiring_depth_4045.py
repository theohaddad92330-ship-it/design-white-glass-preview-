"""#4045 / #3901 / #3866 — profondeur des recrutements sur une page `/discover`
COMPLÈTE (retour Louis en prod, 14/10, `/discover?sectors=automotive,
aerospace,defense,naval,industrial_equipment`) : « quelques recrutements, et
seulement sur les 2-3 PREMIÈRES cartes ; plus rien du tout ensuite » —
bandeau « offres d'emploi publiques — pas de réponse dans le temps imparti ».

Mesuré (`tests/perf/mesure_decouvrir_profondeur_14_10.py`, 14/10) : les 24
candidats d'une page démarrent bien EN MÊME TEMPS (``SIGNALS_CONCURRENCY``),
mais `it_job_signals` (France Travail) et `it_job_signals_apec` (APEC)
partagent un seau PAR PROCESSUS bien plus étroit que la page
(`rate_limiter._DEFAULTS` : apec 3 concurrents, france_travail 5) — les
candidats font la queue dans l'ORDRE DE LA PAGE, chacun borné à
``SIGNALS_SOURCE_BUDGET_S`` (6 s) : ceux qui arrivent en fin de queue
dépassent ce budget et perdent leur signal de recrutement, alors que les
premiers de la page le gardent. Mesuré : à 1,5 s/requête (l'ordre de grandeur
d'un aller-retour réel, jamais mesurable depuis ce conteneur), seules les 9
premières cartes sur 24 gardaient leur recrutement avant ce lot.

Le correctif testé ici n'est PAS le débit promis (``rpm`` — la promesse
publique de `rate_limiter.py` — reste inchangée) : seule la CONCURRENCE monte,
ce qui ne fait qu'exécuter en parallèle ce que le seau de débit autorisait déjà
en rafale (``AsyncLimiter`` démarre plein : un ``rpm=20`` laisse déjà partir 20
requêtes d'un coup, la concurrence décidait seule combien d'entre elles
tournaient VRAIMENT en même temps)."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services import rate_limiter
from app.services.rate_limiter import throttle

# #3901.p — Découvrir ne retient une offre que si elle recoupe un métier de l'ESN (déclaré ou déduit).
SCOPE_PROFILE = {"placedRoles": ["développeur", "ingénieur", "architecte", "data", "devops", "offre"]}



@pytest.fixture(autouse=True)
def _fresh_throttles(monkeypatch: pytest.MonkeyPatch):
    rate_limiter._reset_cache_for_tests()
    # #4045.1 (14/10, après-midi) — l'espacement PAR SECONDE ajouté à
    # `france_travail` (`rate_limiter.PUBLIC_RATE_PER_SECOND`) règle un AUTRE
    # souci (la rafale dépassant le débit publié, 429 en prod) que celui-ci
    # (la queue derrière un sémaphore trop étroit). Ce fichier isole la
    # CONCURRENCE ; `test_discover_france_travail_rate_respect_4045.py`
    # couvre l'espacement. Sans ce débrayage, le `sleep(1.5)` simulé (une
    # LATENCE réseau, jamais un débit) serait lui-même mis en file par
    # l'espacement et ferait échouer ce test pour une raison qu'il ne teste
    # pas.
    monkeypatch.setenv("FRANCE_TRAVAIL_RPS", "1000")
    yield
    rate_limiter._reset_cache_for_tests()


def _row(i: int) -> dict:
    return {
        "name": f"SOCIETE {i:03d} SAS",
        "siren": f"{400000000 + i}",
        "nafCode": "30.30Z",
        "sector": "Construction aéronautique et spatiale",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "250 à 499 salariés",
        "headcountTranche": "32",
        "legalCategory": "5710",
    }


def _throttled_source(provider: str, latency: float, offer: dict, *, requests: int = 1):
    """Un faux client limité en débit : latence réseau simulée, mais le VRAI
    seau par fournisseur (``rate_limiter.throttle``) — même sémaphore que le
    vrai site d'appel dans ``apec.py`` / ``france_travail.py``."""

    async def fetch(company: str, *_a: Any, **_kw: Any) -> list[dict]:
        async def one() -> None:
            async with throttle(provider):
                await asyncio.sleep(latency)

        await asyncio.gather(*(one() for _ in range(requests)))
        return [{**offer, "url": f"{offer['url']}/{company}"}]

    return fetch


@pytest.fixture
def page_of_24_with_real_provider_throttle(monkeypatch):
    """Page pleine (24 candidats), angle modèle réaliste (4 s, pendant lequel
    les signaux tournent déjà), offres France Travail + APEC toutes deux
    attribuables — seul le SEAU PAR FOURNISSEUR décide qui garde son signal."""
    rows = [_row(i) for i in range(24)]

    async def gouv(filters, limit, degraded=None):
        return rows

    async def angle(*_a: Any, **_kw: Any):
        await asyncio.sleep(4.0)
        return {"angles": []}, None

    ft_offer = {"title": "Ingénieur méthodes", "date": "2026-10-10", "contractType": "CDI", "url": "https://ft/offre"}

    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    monkeypatch.setattr(discover_router, "call_claude", angle)
    for name in ("public_tenders", "legal_signals", "press_signals"):

        async def _empty(*_a: Any, **_kw: Any) -> list[dict]:
            return []

        monkeypatch.setattr(discover_router, name, _empty)

    async def _no_feeds() -> dict:
        return {}

    monkeypatch.setattr(discover_router, "load_press_feeds", _no_feeds)
    # 1,5 s/requête — ordre de grandeur d'un aller-retour réel vers un
    # registre public (mesuré pour des sources comparables, `mesure_
    # decouvrir_collecte_13_10.py`) ; les deux requêtes France Travail
    # (M18 + large) tournent en parallèle, d'où ``requests=2``.
    #
    # #4045 (14/10, lot R10) — sous le budget interactif de Découvrir,
    # `it_job_signals` ne lance plus qu'UNE requête (M18) et les offres passent
    # par une file FIFO de `JOBS_QUEUE_WIDTH` appels : la latence simulée est
    # ramenée à 0,5 s (le débit réel, 1 req/s, est couvert par
    # `test_discover_jobs_page_one_first_4045.py`, ce fichier isole la file).
    monkeypatch.setattr(discover_router, "it_job_signals", _throttled_source("france_travail", 0.5, ft_offer))
    return rows


def test_every_card_of_a_full_page_keeps_its_hiring_signal(client: TestClient, page_of_24_with_real_provider_throttle) -> None:
    """#4045.2 — AUCUNE carte d'une page pleine ne doit perdre son recrutement
    au seul motif qu'elle est en fin de page : le seau PAR FOURNISSEUR doit
    laisser passer une page entière dans le budget (``SIGNALS_SOURCE_BUDGET_S``),
    pas seulement ses premiers rangs."""
    resp = client.post("/discover/registry", json={"profile_data": SCOPE_PROFILE, "filters": {"department": "31"}, "limit": 24})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    cands = body["candidates"]
    missing_hiring = [i for i, c in enumerate(cands) if not any(s["type"] == "hiring" for s in c.get("signals") or [])]
    assert missing_hiring == [], (
        f"{len(missing_hiring)}/24 cartes sans recrutement (rangs {missing_hiring}) — "
        "le seau par fournisseur sert les premiers rangs et laisse la fin de page sans réponse."
    )
