"""#4045.2 (14/10) — un 429 France Travail reçu sous le budget d'un appelant
INTERACTIF (Découvrir, `wait_deadline` posé) vaut UNE nouvelle tentative, pas
un abandon immédiat : la rafale mesurée en prod (429335a9c8) est TRANSITOIRE
dans son principe même (`rate_limiter.back_off`, le refroidissement, est fait
pour se lever) — avant ce lot, `_search`/`_token` lisaient le 429 au seul
effet d'alimenter le refroidissement du PROCHAIN appelant, et abandonnaient
tout de suite la requête COURANTE.

Hors budget (collecte de fond, sans `wait_deadline`), le chemin est
INCHANGÉ : un 429 est dit, pas retenté — `test_france_travail_token_failure_
is_distinguishable` (`test_source_degradation_reasons.py`) le couvre déjà
pour `_token` ; ce fichier ajoute le cas budgété."""

from __future__ import annotations

import time

import httpx
import pytest

from app.services import rate_limiter
from app.services.data_sources import france_travail as ft
from app.services.rate_limiter import wait_deadline


@pytest.fixture(autouse=True)
def _fresh_throttles():
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.fixture(autouse=True)
def _creds(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    # Débit test-friendly : seul le RETRY est sous test ici, pas l'espacement
    # (`test_discover_france_travail_rate_respect_4045.py` le couvre).
    monkeypatch.setenv("FRANCE_TRAVAIL_RPS", "50")


class _OnceThen200:
    """Le token réussit toujours. La première recherche (la seule M18 sous budget
    Découvrir, #4045) tombe en 429 une fois,
    puis réussissent à la tentative suivante — exactement la rafale
    transitoire mesurée en prod."""

    def __init__(self) -> None:
        self.get_calls = 0

    async def post(self, url: str, **_kwargs: object) -> httpx.Response:
        return httpx.Response(200, request=httpx.Request("POST", url), json={"access_token": "tok"})

    async def get(self, url: str, **_kwargs: object) -> httpx.Response:
        self.get_calls += 1
        request = httpx.Request("GET", url)
        if self.get_calls <= 1:
            return httpx.Response(429, request=request, headers={"retry-after": "0.05"})
        return httpx.Response(
            200,
            request=request,
            json={
                "resultats": [
                    {
                        "id": "offre-1",
                        "intitule": "Développeur backend",
                        "dateCreation": "2026-10-10T08:00:00Z",
                        "typeContrat": "CDI",
                        "typeContratLibelle": "CDI",
                        "entreprise": {"nom": "ACME"},
                        "lieuTravail": {"libelle": "75 - PARIS"},
                    }
                ]
            },
        )


@pytest.mark.asyncio
async def test_transient_429_is_retried_within_budget_and_offers_are_kept() -> None:
    client = _OnceThen200()

    with wait_deadline(time.monotonic() + 5.0):
        offers = await ft.it_job_signals("ACME", client=client)

    assert offers, (
        "un 429 transitoire sous budget a fait perdre la carte — il aurait dû "
        "être retenté (Retry-After, dans ce qui reste du budget)"
    )
        # 1 appel en 429 + 1 retenté (200) : sous budget Découvrir, UNE seule
    # requête M18 par entreprise (#4045, 1 req/s) ; jamais une 3e tentative.
    assert client.get_calls == 2


@pytest.mark.asyncio
async def test_sustained_429_outside_budget_is_not_retried_in_a_loop() -> None:
    """Hors budget interactif (pas de `wait_deadline`), le patron reste celui
    d'avant ce lot : une seule tentative, jamais une boucle de retry pour une
    collecte de fond."""

    class _Always429:
        def __init__(self) -> None:
            self.get_calls = 0

        async def post(self, url: str, **_kwargs: object) -> httpx.Response:
            return httpx.Response(200, request=httpx.Request("POST", url), json={"access_token": "tok"})

        async def get(self, url: str, **_kwargs: object) -> httpx.Response:
            self.get_calls += 1
            return httpx.Response(
                429, request=httpx.Request("GET", url), headers={"retry-after": "0.01"}
            )

    client = _Always429()
    offers = await ft.it_job_signals("ACME", client=client)

    assert offers == []
    # Une tentative par requête (M18 + large), jamais deux — pas de retry hors budget.
    assert client.get_calls == 2
