"""#3916 (recette prod 15/10) — EDF, événement « Modifications diverses » du 12/10 : aucun lien vers l'annonce
BODACC. Chaque annonce légale porte le lien vers son annonce source : quand le jeu de données ne donne pas
`url_complete`, le lien se DÉRIVE de l'identifiant de l'annonce (même gabarit que `url_complete`) ; sans
identifiant non plus, il reste absent — jamais un lien inventé."""

from __future__ import annotations

import copy
import json
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import bodacc as bodacc_module
from app.services.data_sources.bodacc import announcements_between, legal_signals

FIXTURE = json.loads((Path(__file__).parent / "fixtures/bodacc/modifications_reelles_2026-10-11.json").read_text())
ADMIN = next(r for r in FIXTURE["records"] if r["fields"]["id"] == "B2011006735")  # SIREN 512241043
TEMPLATE = "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:"


def _client(record: dict) -> AsyncMock:
    async def _get(_url: str, params: dict | None = None) -> httpx.Response:
        body = {"records": [record] if (params or {}).get("start", "0") == "0" else []}
        return httpx.Response(200, json=body, request=httpx.Request("GET", "https://x"))

    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=_get)
    return c


@pytest.fixture(autouse=True)
def _no_throttle(monkeypatch: pytest.MonkeyPatch):
    @asynccontextmanager
    async def _free(_name: str):
        yield

    monkeypatch.setattr(bodacc_module, "throttle", _free)
    monkeypatch.setattr(bodacc_module.provider_cache, "cached_json", _passthrough)


async def _passthrough(_ns: str, _key: str, producer, **_kw):
    return await producer()


def _without(record: dict, *fields: str) -> dict:
    clone = copy.deepcopy(record)
    for field in fields:
        clone["fields"].pop(field, None)
    return clone


def test_le_gabarit_de_reference_est_celui_de_url_complete():
    assert ADMIN["fields"]["url_complete"] == TEMPLATE + "B2011006735"


@pytest.mark.asyncio
async def test_veille_sans_url_complete_le_lien_est_derive_de_l_identifiant():
    out = await announcements_between(
        "512241043", since="2000-01-01", until="2030-01-01", client=_client(_without(ADMIN, "url_complete"))
    )
    assert out["announcements"][0]["url"] == TEMPLATE + "B2011006735"


@pytest.mark.asyncio
async def test_veille_avec_url_complete_celle_de_la_source_gagne():
    out = await announcements_between("512241043", since="2000-01-01", until="2030-01-01", client=_client(ADMIN))
    assert out["announcements"][0]["url"] == ADMIN["fields"]["url_complete"]


@pytest.mark.asyncio
async def test_analyse_sans_url_complete_le_lien_est_derive_aussi():
    rows = await legal_signals("512241043", client=_client(_without(ADMIN, "url_complete")))
    assert rows[0]["url"] == TEMPLATE + "B2011006735"


@pytest.mark.asyncio
async def test_sans_identifiant_ni_url_aucun_lien_n_est_invente():
    out = await announcements_between(
        "512241043",
        since="2000-01-01",
        until="2030-01-01",
        client=_client(_without(ADMIN, "url_complete", "id")),
    )
    assert out["announcements"][0]["url"] is None
