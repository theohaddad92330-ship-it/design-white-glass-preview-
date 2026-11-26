"""#4518.15 / #4518.16 (lot récolte 24/10) — le registre ne rend plus l'écran vide.

Mesure prod du 24/10 (journaux IA, 13 min) : 16 échecs du registre, TOUS des délais de 8 s sans statut HTTP
(``str(ReadTimeout) == ''``), groupés par 2-3 à la même seconde quand plusieurs recherches tournent ; 0 réponse 429 du
registre. Chaque délai devenait un employeur « injoignable », jamais retenté. Désormais, sous un budget de recherche :
une 429 est réessayée UNE fois après le refroidissement (s'il tient dans le budget), un délai réseau UNE fois si le
budget restant couvre un second appel. Hors budget (analyse), le chemin est inchangé.
"""

from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from app.services.data_sources import recherche_entreprises as registre
from app.services.rate_limiter import RateLimitTimeout, get_throttle, wait_deadline

_ROW = {"siren": "552100554", "nom_complet": "DECATHLON", "siege": {"departement": "59"}, "etat_administratif": "A"}


def _client(responses: list) -> tuple[httpx.AsyncClient, list[int]]:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        item = responses[min(len(calls) - 1, len(responses) - 1)]
        if isinstance(item, Exception):
            raise item
        return item

    return httpx.AsyncClient(transport=httpx.MockTransport(handler)), calls


def _fresh_cooldown() -> None:
    get_throttle("recherche_entreprises")._cooldown_until = 0.0


def _page(http: httpx.AsyncClient) -> list[dict]:
    async def run() -> list[dict]:
        _fresh_cooldown()
        return await registre._search_page(http, "decathlon", per_page=5)

    return asyncio.run(run())


def _page_under_budget(http: httpx.AsyncClient, seconds: float) -> list[dict]:
    async def run() -> list[dict]:
        _fresh_cooldown()
        with wait_deadline(time.monotonic() + seconds):
            return await registre._search_page(http, "decathlon", per_page=5)

    return asyncio.run(run())


def test_un_delai_reseau_est_retente_une_fois_sous_budget() -> None:
    http, calls = _client([httpx.ReadTimeout(""), httpx.Response(200, json={"results": [_ROW]})])
    rows = _page_under_budget(http, 20.0)
    assert len(calls) == 2
    assert [r["siren"] for r in rows] == ["552100554"]


def test_un_delai_n_est_pas_retente_quand_le_budget_ne_couvre_pas_un_second_appel() -> None:
    http, calls = _client([httpx.ReadTimeout(""), httpx.Response(200, json={"results": [_ROW]})])
    with pytest.raises(httpx.ReadTimeout):
        _page_under_budget(http, 2.0)
    assert len(calls) == 1


def test_deux_delais_de_suite_remontent_l_echec() -> None:
    # La garde dit NON : un seul nouvel essai, jamais une boucle.
    http, calls = _client([httpx.ReadTimeout(""), httpx.ReadTimeout(""), httpx.Response(200, json={"results": []})])
    with pytest.raises(httpx.ReadTimeout):
        _page_under_budget(http, 30.0)
    assert len(calls) == 2


def test_une_429_est_retentee_apres_le_refroidissement_dans_le_budget() -> None:
    http, calls = _client(
        [httpx.Response(429, headers={"retry-after": "1"}), httpx.Response(200, json={"results": [_ROW]})]
    )
    started = time.monotonic()
    rows = _page_under_budget(http, 10.0)
    assert len(calls) == 2
    assert time.monotonic() - started >= 0.9  # le refroidissement annoncé est ATTENDU (débit respecté)
    assert [r["siren"] for r in rows] == ["552100554"]


def test_une_429_dont_l_attente_depasse_le_budget_n_est_pas_retentee() -> None:
    http, calls = _client(
        [httpx.Response(429, headers={"retry-after": "30"}), httpx.Response(200, json={"results": [_ROW]})]
    )
    with pytest.raises(RateLimitTimeout):
        _page_under_budget(http, 3.0)
    assert len(calls) == 1


def test_hors_budget_le_chemin_est_inchange() -> None:
    http, calls = _client([httpx.ReadTimeout(""), httpx.Response(200, json={"results": [_ROW]})])
    with pytest.raises(httpx.ReadTimeout):
        _page(http)
    assert len(calls) == 1


def test_le_cache_30_jours_est_servi_quand_le_registre_refuse(monkeypatch) -> None:
    from app.services import provider_cache

    store: dict[tuple[str, str], object] = {}

    async def _get(namespace: str, key: str):
        return store.get((namespace, key))

    async def _set(namespace: str, key: str, value, _ttl=None) -> None:
        store[(namespace, key)] = value

    monkeypatch.setattr(provider_cache, "get_json", _get)
    monkeypatch.setattr(provider_cache, "set_json", _set)

    # #4518.16 — un nom déjà résolu (cache du registre, ``TTL_FIRMO``) est servi même si la source refuse ensuite.
    async def run() -> tuple[list[dict], list[int]]:
        _fresh_cooldown()
        ok, _ = _client([httpx.Response(200, json={"results": [_ROW]})])
        first = await registre.search_companies("decathlon-4518", client=ok, strict=True)
        refusing, calls = _client([httpx.Response(429, headers={"retry-after": "30"})])
        with wait_deadline(time.monotonic() + 3.0):
            again = await registre.search_companies("decathlon-4518", client=refusing, strict=True)
        assert [r["siren"] for r in first] == ["552100554"]
        return again, calls

    again, calls = asyncio.run(run())
    assert [r["siren"] for r in again] == ["552100554"]
    assert calls == []  # servi du cache : la source n'est pas même sollicitée


def test_sans_cache_le_refus_est_dit_jamais_une_liste_vide() -> None:
    # La garde dit NON : sans cache, un refus reste un ÉCHEC (strict), jamais « aucune entité ».
    from app.services.data_sources.signal_errors import SignalSourceUnavailable

    async def run() -> None:
        _fresh_cooldown()
        refusing, _ = _client([httpx.Response(429, headers={"retry-after": "30"})])
        with wait_deadline(time.monotonic() + 3.0):
            await registre.search_companies("inconnue-4518-sans-cache", client=refusing, strict=True)

    with pytest.raises(SignalSourceUnavailable):
        asyncio.run(run())
