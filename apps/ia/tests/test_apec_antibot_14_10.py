"""14/10/2026 — APEC répond 403 à toute recherche (jusque depuis le conteneur IA) :
le webservice est derrière DataDome (en-tête ``x-datadome: protected``, défi anti-bot).
On ne contourne PAS une protection anti-robot : la source se coupe EXPLICITEMENT
(log clair, une seule fois), puis ne refait AUCUN appel réseau pendant la pause."""

from __future__ import annotations

import logging

import httpx
import pytest

from app.services.data_sources import apec


def _blocked_client(calls: list[httpx.Request]):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(403, headers={"x-datadome": "protected"}, json={"url": "https://geo.captcha-delivery.com/x"})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def _reset():
    apec._reset_antibot_for_tests()
    yield
    apec._reset_antibot_for_tests()


@pytest.mark.asyncio
async def test_403_datadome_coupe_la_source_et_ne_refait_aucun_appel(caplog):
    calls: list[httpx.Request] = []
    async with _blocked_client(calls) as client:
        with caplog.at_level(logging.WARNING):
            first = await apec.list_hiring_companies_apec(keywords=["python"], client=client)
            second = await apec.list_hiring_companies_apec(keywords=["python"], client=client)
            third = await apec.it_job_signals_apec("Orange Telecom 14-10", client=client)
    assert first == second == third == []
    assert len(calls) == 1, "après le 403 DataDome, plus aucun appel pendant la pause"
    assert any("DataDome" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_un_403_sans_datadome_ne_coupe_pas_la_source():
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(403, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await apec.list_hiring_companies_apec(keywords=["python"], client=client)
        await apec.list_hiring_companies_apec(keywords=["python"], client=client)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_forme_de_requete_figee():
    """La requête (quand la source est ouverte) : POST JSON, UA honnête, corps vérifié."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"resultats": [], "totalCount": 0})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await apec.list_hiring_companies_apec(keywords=["python"], client=client)
    req = seen[0]
    assert req.method == "POST"
    assert str(req.url) == "https://www.apec.fr/cms/webservices/rechercheOffre"
    assert req.headers["accept"] == "application/json"
    assert req.headers["user-agent"] == apec._USER_AGENT
