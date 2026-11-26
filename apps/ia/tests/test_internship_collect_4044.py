"""#4044 — les collecteurs d'offres écartent les STAGES avant tout stockage.

Décision Louis 12/10 : « pas d'offres de stages dans tous les signaux ». L'alternance
n'est pas tranchée : elle passe (test `test_alternance_passe`)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.apec import it_job_signals_apec
from app.services.data_sources.ats_boards import it_job_signals_ats
from app.services.data_sources.france_travail import it_job_signals
from app.services.data_sources.wttj import it_job_signals_wttj


def _resp(json_data: object, status: int = 200, method: str = "GET") -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request(method, "https://x"))


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()


@pytest.mark.asyncio
async def test_france_travail_ecarte_les_stages(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = (datetime.now(UTC) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    ent = {"nom": "X"}
    offers = [
        {"id": "A", "intitule": "Ingénieur DevOps", "entreprise": ent, "romeCode": "M1805", "dateCreation": recent},
        {
            "id": "B",
            "intitule": "CS27 - Bac 5 - Stage Data Engineer H/F",
            "entreprise": ent,
            "romeCode": "M1805",
            "dateCreation": recent,
        },
        {
            "id": "D",
            "intitule": "Développeur Java",
            "entreprise": ent,
            "romeCode": "M1805",
            "dateCreation": recent,
            "typeContratLibelle": "Stage",
        },
        {
            "id": "E",
            "intitule": "Alternance développeur",
            "entreprise": ent,
            "romeCode": "M1805",
            "dateCreation": recent,
        },
    ]
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}, method="POST"))
    c.get = AsyncMock(return_value=_resp({"resultats": offers}))
    out = await it_job_signals("X", client=c)
    assert sorted(o["title"] for o in out) == ["Alternance développeur", "Ingénieur DevOps"]


@pytest.mark.asyncio
async def test_apec_ecarte_les_stages() -> None:
    payload = {
        "resultats": [
            {
                "numeroOffre": "1W",
                "intitule": "Ingénieur DevOps F/H",
                "nomCommercial": "SNCF",
                "lieuTexte": "Lille - 59",
                "texteOffre": "Kubernetes, Terraform",
                "datePublication": _iso(3),
            },
            {
                "numeroOffre": "2W",
                "intitule": "Stage Ingénieur DevOps F/H",
                "nomCommercial": "SNCF",
                "lieuTexte": "Lille - 59",
                "texteOffre": "Kubernetes, Terraform",
                "datePublication": _iso(2),
            },
        ]
    }
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp(payload, method="POST"))
    out = await it_job_signals_apec("SNCF", client=c)
    assert [j["title"] for j in out] == ["Ingénieur DevOps F/H"]


@pytest.mark.asyncio
async def test_wttj_ecarte_les_stages(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    org = {"name": "Doctolib", "slug": "doctolib"}
    payload = {
        "hits": [
            {"name": "Data Engineer", "slug": "de", "published_at": _iso(5), "organization": org},
            {"name": "Data Engineer Internship", "slug": "dei", "published_at": _iso(4), "organization": org},
            {
                "name": "Data Analyst",
                "slug": "da",
                "published_at": _iso(4),
                "organization": org,
                "contract_type": {"fr": "Stage"},
            },
        ]
    }
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp(payload, method="POST"))
    out = await it_job_signals_wttj("Doctolib", client=c)
    assert [j["title"] for j in out] == ["Data Engineer"]


@pytest.mark.asyncio
async def test_ats_ecarte_les_stages() -> None:
    def gh(title: str, jid: int) -> dict:
        updated = _iso(5)
        return {
            "id": jid,
            "title": title,
            "absolute_url": f"https://job-boards.greenhouse.io/doctolib/jobs/{jid}",
            "location": {"name": "Paris, France"},
            "updated_at": updated,
            "first_published": updated,
            "company_name": "Doctolib",
        }

    c = AsyncMock(spec=httpx.AsyncClient)

    async def _get(url, *_a, **_k):
        if "boards-api.greenhouse.io" in str(url):
            return _resp({"jobs": [gh("Data Engineer", 3), gh("Stage Data Engineer", 4)]})
        return _resp({"ok": False}, status=404)

    c.get = AsyncMock(side_effect=_get)
    out = await it_job_signals_ats("Doctolib", website="doctolib.fr", client=c)
    assert [j["title"] for j in out] == ["Data Engineer"]
