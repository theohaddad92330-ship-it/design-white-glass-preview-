"""#3921 — le changement de dirigeant, lu dans BODACC (annonces de modification).

Réponses RÉELLES de l'API BODACC (miroir Opendatasoft), figées le 11/10/2026
(`fixtures/bodacc/modifications_reelles_2026-10-11.json`). Deux faits observés :
- `registre` arrive en CHAÎNE (`"512 241 043,512241043"`), pas en liste : le
  rattachement par SIREN doit la découper, sinon aucune annonce n'est retenue ;
- `modificationsgenerales.descriptif` dit ce qui a changé (« Modification survenue
  sur l'administration », « Changement de gérant »…), daté par `dateparution`.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import bodacc as bodacc_module
from app.services.data_sources.bodacc import announcements_between, classify_announcement_kind, legal_signals

FIXTURE = json.loads((Path(__file__).parent / "fixtures/bodacc/modifications_reelles_2026-10-11.json").read_text())
BY_ID = {r["fields"]["id"]: r for r in FIXTURE["records"]}
ADMIN = BY_ID["B2011006735"]  # SIREN 512241043 — « Modification survenue sur l'administration »
GERANT = BY_ID["B200800011416"]  # SIREN 500196670 — « Changement de gérant »
COMMISSAIRE = BY_ID["B200800011004"]  # SIREN 343151619 — « Changement de commissaire aux comptes »
ADRESSE = BY_ID["B200800011898"]  # SIREN 497835579 — adresse du siège


def _client(record: dict) -> AsyncMock:
    async def _get(_url: str, params: dict | None = None) -> httpx.Response:
        body = {"records": [record] if (params or {}).get("start", "0") == "0" else []}
        return httpx.Response(200, json=body, request=httpx.Request("GET", "https://x"))

    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=_get)
    return c


@pytest.fixture(autouse=True)
def _no_throttle(monkeypatch: pytest.MonkeyPatch):
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _free(_name: str):
        yield

    monkeypatch.setattr(bodacc_module, "throttle", _free)


async def _window(record: dict, siren: str) -> list[dict]:
    out = await announcements_between(siren, since="2000-01-01", until="2030-01-01", client=_client(record))
    assert out["failed"] is False
    return out["announcements"]


@pytest.mark.asyncio
async def test_registre_en_chaine_est_rattache_au_siren():
    rows = await _window(ADMIN, "512241043")
    assert [r["ref"] for r in rows] == ["B2011006735"]


@pytest.mark.asyncio
async def test_registre_en_chaine_ne_rattache_pas_un_autre_siren():
    assert await _window(ADMIN, "403355726") == []


@pytest.mark.asyncio
async def test_administration_devient_un_changement_de_dirigeant_date_par_la_source():
    (row,) = await _window(ADMIN, "512241043")
    assert row["kind"] == "executive_change"
    assert row["type"] == "Changement de dirigeant"
    assert row["date"] == "2011-04-05"  # dateparution, jamais notre date de lecture
    assert row["url"].startswith("https://www.bodacc.fr/")


@pytest.mark.asyncio
async def test_changement_de_gerant_est_un_changement_de_dirigeant():
    (row,) = await _window(GERANT, "500196670")
    assert row["kind"] == "executive_change"


@pytest.mark.asyncio
async def test_commissaire_aux_comptes_nest_pas_un_dirigeant():
    (row,) = await _window(COMMISSAIRE, "343151619")
    assert row["kind"] == "modification"
    assert row["type"] == "Modifications diverses"


@pytest.mark.asyncio
async def test_adresse_du_siege_nest_pas_un_dirigeant():
    (row,) = await _window(ADRESSE, "497835579")
    assert row["kind"] == "modification"


def test_descriptif_illisible_ou_absent_reste_une_modification():
    assert classify_announcement_kind("modification", "Modifications diverses") == "modification"
    assert classify_announcement_kind("modification", "Modifications diverses", "") == "modification"
    assert classify_announcement_kind("modification", "Modifications diverses", "{pas du json") == "modification"


def test_seule_la_famille_modification_porte_un_changement_de_dirigeant():
    descriptif = '{"descriptif": "Changement de gérant"}'
    assert classify_announcement_kind("vente", "Ventes et cessions", descriptif) == "sale"


@pytest.mark.asyncio
async def test_analyse_legal_signals_nomme_le_changement_de_dirigeant(monkeypatch: pytest.MonkeyPatch):
    async def _no_cache(_ns, _key, loader, ttl=None):  # noqa: ARG001
        return await loader()

    monkeypatch.setattr(bodacc_module.provider_cache, "cached_json", _no_cache)
    out = await legal_signals("512241043", client=_client(ADMIN))
    assert [s["type"] for s in out] == ["Changement de dirigeant"]
    assert out[0]["date"] == "2011-04-05"
