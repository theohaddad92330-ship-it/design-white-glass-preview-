"""DECOUVRIR-COLLECTE (13/10) — CHAQUE entreprise affichée est interrogée.

Retour de Louis (13/10, ``/discover?sectors=fintech,software_tech,automotive&headcount=250-999``) :
« dans la plupart des cas y a 0 signaux / besoin / opportunité ». Mesuré : sur ~12
cartes, une seule portait un signal ; les autres disaient « Non cherché : offres ».

Cause (``discover.py``) : ``SIGNALS_CANDIDATE_LIMIT = 5`` — seules les CINQ
premières lignes d'une page de 24 (``DISCOVER_PAGE_SIZE``, web) étaient
interrogées ; les 19 autres sortaient ``signalsSearched: False``. Et même pour
les cinq, les offres ne venaient que d'UN registre d'offres, sans aucune
actualité.

Décision Louis : chaque entreprise affichée est interrogée au moins sur les
offres d'emploi (hors stages), les actualités récentes et la mémoire interne
(cette dernière : côté API, pour toute la page — ``withSourceAxes`` /
``withRegistryAnnouncements``). La collecte reste BORNÉE en parallèle.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router

# #3901.p — Découvrir ne retient une offre que si elle recoupe un métier de l'ESN (déclaré ou déduit).
SCOPE_PROFILE = {"placedRoles": ["développeur", "ingénieur", "architecte", "data", "devops", "offre"]}



def _row(index: int) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": "62.01Z",
        "sector": "Programmation informatique",
        "city": "PARIS",
        "department": "75",
        "headcountRange": "250 à 499 salariés",
        "headcountTranche": "32",
        "legalCategory": "5710",
    }


@pytest.fixture
def page_of_24(monkeypatch):
    rows = [_row(i) for i in range(24)]

    async def gouv(filters, limit, degraded=None):
        return rows

    async def pappers_unreached(filters, limit, degraded=None):
        raise AssertionError("Pappers ne passe pas devant le chemin gouv.fr")

    monkeypatch.setattr(discover_router, "_registry_search", pappers_unreached)
    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    for name in ("public_tenders", "it_job_signals", "legal_signals", "press_signals"):
        monkeypatch.setattr(discover_router, name, AsyncMock(return_value=[]))
    return rows


def _call(client: TestClient, limit: int = 24) -> dict:
    resp = client.post("/discover/registry", json={"profile_data": SCOPE_PROFILE, "filters": {"department": "75"}, "limit": limit})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_every_displayed_company_of_a_page_is_searched(client: TestClient, page_of_24, monkeypatch) -> None:
    """24 cartes affichées → 24 recherches, 24 ``signalsSearched: True`` — plus
    aucun « Non cherché : offres » dû à la borne des cinq premières."""
    jobs = AsyncMock(return_value=[])
    press = AsyncMock(return_value=[])
    monkeypatch.setattr(discover_router, "it_job_signals", jobs)
    monkeypatch.setattr(discover_router, "press_signals", press)

    body = _call(client)

    assert len(body["candidates"]) == 24
    assert all(c["signalsSearched"] is True for c in body["candidates"])
    assert jobs.await_count == 24
    assert press.await_count == 24
    # La borne vaut la page web (``DISCOVER_PAGE_SIZE = 24``) — valeur EN DUR, pas
    # seulement la constante (qui validerait la mécanique à n'importe quelle valeur).
    assert discover_router.SIGNALS_CANDIDATE_LIMIT >= 24


def test_offers_come_from_both_job_registries_and_internships_are_left_out(
    client: TestClient, page_of_24, monkeypatch
) -> None:
    """Offres = les deux registres d'offres (cadres compris), dédoublonnés par lien ;
    un STAGE n'est pas un besoin (« hors stages », Louis 13/10)."""
    ft = [
        {"title": "Développeur Java H/F", "date": "2026-10-10", "contractType": "CDI", "url": "https://x/1"},
        {"title": "Stage - Data analyst", "date": "2026-10-11", "contractType": "CDD", "url": "https://x/2"},
    ]
    monkeypatch.setattr(discover_router, "it_job_signals", AsyncMock(return_value=ft))

    top = _call(client)["candidates"][0]

    labels = sorted(s["label"] for s in top["signals"] if s["type"] == "hiring")
    # DISCOVER-OFFRES (15/10) : APEC (403 DataDome en prod) est retirée de Découvrir.
    assert labels == ["Développeur Java H/F"]


def test_recent_news_becomes_a_dated_signal_whose_supplier_is_never_named(
    client: TestClient, page_of_24, monkeypatch
) -> None:
    """Une actualité rattachée devient un signal daté avec son lien ; une levée
    garde sa nature (``funding``). Le média/fournisseur ne se nomme pas (#4068)."""
    press = [
        {
            "type": "projet",
            "title": "SOCIETE 000 lance sa migration cloud",
            "url": "https://media.example/a",
            "published_at": "2026-10-07T08:00:00+00:00",
            "source": "media.example",
            "matched_on": "name",
        },
        {
            "type": "levee",
            "title": "SOCIETE 000 lève 40 M€",
            "url": "https://media.example/b",
            "published_at": "2026-10-01T08:00:00+00:00",
            "source": "media.example",
            "matched_on": "name",
        },
    ]
    monkeypatch.setattr(discover_router, "press_signals", AsyncMock(return_value=press))

    signals = _call(client)["candidates"][0]["signals"]

    by_url = {s.get("url"): s for s in signals}
    assert by_url["https://media.example/a"]["type"] == "business"
    assert by_url["https://media.example/a"]["date"] == "2026-10-07"
    assert by_url["https://media.example/b"]["type"] == "funding"
    assert all("media.example" not in (s.get("detail") or "") for s in signals)


def test_collection_runs_in_parallel_but_bounded(client: TestClient, page_of_24, monkeypatch) -> None:
    """Parallèle BORNÉ : jamais plus de ``SIGNALS_CONCURRENCY`` entreprises en vol
    à la fois — sinon une page de 24 vide d'un coup les seaux des registres
    gratuits partagés avec les analyses."""
    in_flight = 0
    peak = 0

    async def slow_jobs(*_a: Any, **_kw: Any) -> list[dict]:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return []

    monkeypatch.setattr(discover_router, "it_job_signals", slow_jobs)

    body = _call(client)

    assert all(c["signalsSearched"] for c in body["candidates"])
    assert 1 < peak <= discover_router.SIGNALS_CONCURRENCY


def test_the_same_search_from_another_space_makes_no_external_call(client: TestClient, page_of_24, monkeypatch) -> None:
    """Décision Louis 13/10 n°2/4 — la MÊME recherche relancée depuis un AUTRE
    espace (autre profil, aucun lien entre les deux) trouve ses faits publics dans
    le cache partagé : ZÉRO appel externe la seconde fois, mêmes signaux rendus."""
    from datetime import UTC, datetime, timedelta

    from app.services import provider_cache, source_cache

    rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    class MemoryStore:
        async def get(self, source: str, category: str, key: str):
            row = rows.get((source, category, key))
            return row if row and row[1] > datetime.now(UTC) else None

        async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
            rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))

    async def _store() -> MemoryStore:
        return MemoryStore()

    monkeypatch.setattr(source_cache, "_store", _store)
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))

    offer = {"title": "Développeur Java H/F", "date": "2026-10-10", "contractType": "CDI", "url": "https://x/1"}
    news = {"type": "projet", "title": "Migration cloud", "url": "https://m/a", "published_at": "2026-10-07T08:00:00+00:00"}
    tender = {"title": "Tierce maintenance applicative", "publishedDate": "2026-10-02"}
    legal = {"date": "2026-09-30", "type": "Modification", "precision": "changement de dirigeant"}
    mocks = {
        "it_job_signals": AsyncMock(return_value=[offer]),
        "press_signals": AsyncMock(return_value=[news]),
        "public_tenders": AsyncMock(return_value=[tender]),
        "legal_signals": AsyncMock(return_value=[legal]),
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(discover_router, name, mock)

    def search(space_profile: dict) -> list[dict]:
        resp = client.post(
            "/discover/registry",
            json={"filters": {"department": "75"}, "limit": 24, "profile_data": space_profile},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["candidates"]

    first = search({**SCOPE_PROFILE, "companyName": "ESN Alpha"})
    calls_first = {name: mock.await_count for name, mock in mocks.items()}
    second = search({**SCOPE_PROFILE, "companyName": "ESN Beta"})

    assert calls_first["it_job_signals"] == 24
    for name, mock in mocks.items():
        assert mock.await_count == calls_first[name], f"{name} rappelé alors que ses faits sont frais en cache"
    assert [c["signals"] for c in second] == [c["signals"] for c in first]
    assert any(s["type"] == "hiring" for s in second[0]["signals"])
    # Aucune clé rangée ne nomme un espace : la clé est l'ENTREPRISE.
    assert all(key.startswith("siren:") for (_src, _cat, key) in rows if _src == "public_facts")


def test_one_slow_source_is_cut_alone_and_never_blanks_the_card(client: TestClient, page_of_24, monkeypatch) -> None:
    """Le registre d'offres cadres plafonne (20 req/min, partagé avec les analyses) :
    une source lente est coupée À SON PROPRE plafond et DITE dans ``degraded`` —
    la carte garde ses autres signaux et reste « cherchée », jamais « Non cherché »."""

    async def hangs(*_a: Any, **_kw: Any) -> list[dict]:
        await asyncio.sleep(10_000)
        return []

    offer = {"title": "Développeur Java H/F", "date": "2026-10-10", "contractType": "CDI", "url": "https://x/1"}
    monkeypatch.setattr(discover_router, "public_tenders", hangs)
    monkeypatch.setattr(discover_router, "it_job_signals", AsyncMock(return_value=[offer]))
    # #4393 — 0,05 s coupait AUSSI les sources rapides sur un runner CI chargé ; la source lente dort 10 000 s.
    monkeypatch.setattr(discover_router, "SIGNALS_SOURCE_BUDGET_S", 1.0)

    body = _call(client)

    assert all(c["signalsSearched"] for c in body["candidates"])
    assert all(any(s["type"] == "hiring" for s in c["signals"]) for c in body["candidates"])
    assert any(d.get("source") == "boamp" and d.get("reason") == "time_budget" for d in body["degraded"])
