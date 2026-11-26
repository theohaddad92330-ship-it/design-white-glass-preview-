"""Mesure — lot REC #4045/#3901/#3866 (14/10) : PROFONDEUR des recrutements sur
une page `/discover` complète, AVANT/APRÈS la concurrence par fournisseur.

Retour de Louis en prod (14/10, `/discover?sectors=automotive,aerospace,
defense,naval,industrial_equipment`) : « quelques recrutements, et seulement
sur les 2-3 PREMIÈRES cartes ; plus rien du tout ensuite » — bandeau
« offres d'emploi publiques — pas de réponse dans le temps imparti ».

Hypothèse du brief (`briefs/rec-decouvrir-14-10.md`) : `SIGNALS_CONCURRENCY`
(24) laisse les 24 candidats d'une page démarrer EN MÊME TEMPS, mais chacun
appelle ensuite `it_job_signals` (France Travail) et `it_job_signals_apec`
(APEC) qui partagent un seau PAR FOURNISSEUR bien plus étroit
(`rate_limiter._DEFAULTS` : apec 20 rpm / **3 concurrents**, france_travail
60 rpm / **5 concurrents**) — un seau PROCESSUS, pas PAR CANDIDAT. Les
24 candidats font donc la queue derrière 3 (resp. 5) places, et chaque
recherche de candidat est elle-même bornée à `SIGNALS_SOURCE_BUDGET_S` (6 s) :
passé ce délai, la source RESTE EN FILE échoue — ``asyncio.wait_for`` coupe,
la carte garde ses autres signaux mais perd celui-ci (le bandeau « pas de
réponse dans le temps imparti »). Comme les tâches sont créées et font la
queue dans l'ORDRE DE LA PAGE, les cartes de queue de page sont celles qui
perdent.

Mesuré ICI (pas deviné) : `asyncio.Semaphore` + `AsyncLimiter` RÉELS de
`app.services.rate_limiter` (import direct, aucun mock du throttle) ; seules
les requêtes HTTP sont simulées — ce conteneur n'a ni clé France Travail ni
accès sortant vérifié vers apec.fr. Latence par requête : même ordre de
grandeur DÉJÀ mesuré et documenté dans ce dépôt pour ces deux sources
(`mesure_decouvrir_collecte_13_10.py`, 13/10) — apec 0,4 s/requête,
France Travail 0,6 s/requête × 2 requêtes en parallèle (jeton + recherche
M18 + recherche large ⇒ on modélise la paire de recherches, la plus coûteuse
des deux étapes). Angle (modèle Claude) à 4 s — l'ordre de grandeur réel d'un
appel d'angle, pendant lequel les signaux tournent déjà (chemin de prod, pas
le pire cas instantané).

Lancer (réseau coupé, tout est simulé) :

    cd apps/ia && python3.13 tests/perf/mesure_decouvrir_profondeur_14_10.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.routers import discover as d  # noqa: E402
from app.services import provider_cache, rate_limiter  # noqa: E402
from app.services.rate_limiter import throttle  # noqa: E402

PAGE_SIZE = 24


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


def _source(provider: str, latency: float, offer: dict, *, requests: int = 1):
    """Un faux client limité en débit : il ne simule QUE la latence réseau,
    mais paie le VRAI seau par fournisseur (``rate_limiter.throttle``) — même
    semaphore et même ``AsyncLimiter`` que le vrai site d'appel."""

    async def fetch(company: str, *_a: Any, **_kw: Any) -> list[dict]:
        async def one() -> None:
            async with throttle(provider):
                await asyncio.sleep(latency)

        await asyncio.gather(*(one() for _ in range(requests)))
        return [{**offer, "url": f"{offer['url']}/{company}"}]

    return fetch


def _install(monkey: dict, *, angle_s: float, apec_latency: float = 0.4, ft_latency: float = 0.6) -> None:
    rows = [_row(i) for i in range(PAGE_SIZE)]

    async def angle(*_a: Any, **_kw: Any):
        await asyncio.sleep(angle_s)
        return {"angles": []}, None

    async def gouv(filters, limit, degraded=None):
        return rows

    ft_offer = {"title": "Ingénieur méthodes", "date": "2026-10-10", "contractType": "CDI", "url": "https://ft/offre"}
    apec_offer = {"title": "Automaticien", "date": "2026-10-09", "contractType": "CDI", "url": "https://apec/offre"}
    patches = {
        "_fallback_search": gouv,
        "call_claude": angle,
        "public_tenders": AsyncMock(return_value=[]),
        "legal_signals": AsyncMock(return_value=[]),
        "press_signals": AsyncMock(return_value=[]),
        "load_press_feeds": AsyncMock(return_value={}),
        "it_job_signals": _source("france_travail", ft_latency, ft_offer, requests=2),
        "it_job_signals_apec": _source("apec", apec_latency, apec_offer),
    }
    for name, value in patches.items():
        monkey[name] = getattr(d, name)
        setattr(d, name, value)


def _restore(monkey: dict) -> None:
    for name, value in monkey.items():
        setattr(d, name, value)
    monkey.clear()


def _run(client: TestClient) -> dict:
    resp = client.post(
        "/discover/registry",
        json={"filters": {"department": "31"}, "limit": PAGE_SIZE},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _depth(body: dict) -> tuple[int, list[int]]:
    """(cartes avec ≥1 signal de recrutement, rangs des cartes SANS)."""
    cands = body["candidates"]
    with_hiring = [i for i, c in enumerate(cands) if any(s["type"] == "hiring" for s in c.get("signals") or [])]
    missing = [i for i, c in enumerate(cands) if i not in with_hiring]
    return len(with_hiring), missing


def _measure(
    label: str,
    *,
    apec_conc: int,
    ft_conc: int,
    angle_s: float = 4.0,
    apec_latency: float = 0.4,
    ft_latency: float = 0.6,
) -> None:
    os.environ["APEC_CONCURRENCY"] = str(apec_conc)
    os.environ["FRANCE_TRAVAIL_CONCURRENCY"] = str(ft_conc)
    rate_limiter._reset_cache_for_tests()
    client = TestClient(app)
    monkey: dict = {}
    _install(monkey, angle_s=angle_s, apec_latency=apec_latency, ft_latency=ft_latency)
    started = time.monotonic()
    body = _run(client)
    elapsed = time.monotonic() - started
    _restore(monkey)
    rate_limiter._reset_cache_for_tests()
    os.environ.pop("APEC_CONCURRENCY", None)
    os.environ.pop("FRANCE_TRAVAIL_CONCURRENCY", None)
    depth, missing = _depth(body)
    print(
        f"{label:<42} apec_conc={apec_conc:<3} ft_conc={ft_conc:<3} "
        f"{elapsed:5.2f} s  cartes avec recrutement {depth:>2}/{PAGE_SIZE}  "
        f"rangs sans recrutement {missing}"
    )


def main() -> None:
    provider_cache._redis = AsyncMock(return_value=None)  # type: ignore[method-assign]
    print(f"Page de {PAGE_SIZE} candidats, SIGNALS_CONCURRENCY={d.SIGNALS_CONCURRENCY} (gate page, inchangé).\n")
    _measure("AVANT (défauts prod 14/10)", apec_conc=3, ft_conc=5)
    _measure("APRÈS (concurrence par fournisseur ×4)", apec_conc=12, ft_conc=20)
    print(
        "\nMême mesure, latence réseau plus proche de la prod réelle (1,5 s/requête — "
        "variante de nom + aller-retour réel, jamais mesurable depuis ce conteneur) :\n"
    )
    _measure("AVANT, latence 1,5 s", apec_conc=3, ft_conc=5, apec_latency=1.5, ft_latency=1.5)
    _measure("APRÈS, latence 1,5 s", apec_conc=12, ft_conc=20, apec_latency=1.5, ft_latency=1.5)


if __name__ == "__main__":
    main()
