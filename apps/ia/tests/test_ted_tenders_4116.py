"""#4116 — appels d'offres UE (API TED) en plus de BOAMP.

Contrat vérifié le 13/10/2026 sur l'API réelle : POST /v3/notices/search, sans clé,
corps {query, fields, page, limit, scope}, réponse {notices, totalNoticeCount}.
Réseau mocké ; la fixture est une réponse réelle élaguée, dates recalées sur
« aujourd'hui » (un test daté en dur d'un objet qui expire est une bombe).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import source_health
from app.services.data_sources import public_tenders as pt
from app.services.data_sources import ted

_FIXTURE = Path(__file__).parent / "fixtures" / "ted_search_ville_de_paris.json"


def _payload() -> dict:
    data = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    now = datetime.now(UTC)
    ages = {"655703-2024": 20, "647934-2024": 40, "806-2026": 10, "900001-2025": 15}
    for n in data["notices"]:
        n["publication-date"] = (now - timedelta(days=ages[n["publication-number"]])).strftime("%Y-%m-%d+01:00")
        if "deadline-receipt-tender-date-lot" in n:
            n["deadline-receipt-tender-date-lot"] = [(now + timedelta(days=15)).strftime("%Y-%m-%d+02:00")]
    return data


def _resp(body: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=body, request=httpx.Request("POST", "https://api.ted.europa.eu"))


def _client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=resp)
    return c


@pytest.mark.asyncio
async def test_parsing_same_fields_as_boamp() -> None:
    out = await ted.ted_tenders("Ville de Paris", client=_client(_resp(_payload())))
    assert [i["url"] for i in out] == [
        "https://ted.europa.eu/fr/notice/-/detail/655703-2024",
        "https://ted.europa.eu/fr/notice/-/detail/647934-2024",
    ]
    first = out[0]
    # Mêmes clés que `public_tenders` (BOAMP).
    assert set(first) == {"title", "buyer", "location", "department", "publishedDate", "deadline", "cpv", "url"}
    assert first["buyer"] == "Ville de Paris"
    assert first["cpv"] == "72267100"
    assert first["title"].startswith("Accord-cadre")  # préfixe « France – CPV – » retiré
    assert len(first["publishedDate"]) == 10
    assert len(first["deadline"]) == 10
    assert first["department"] is None  # jamais deviné


def test_old_notice_title_place_prefix_stripped() -> None:
    assert ted._clean_title("France-Paris-La-Défense: Services informatiques") == "Services informatiques"


@pytest.mark.asyncio
async def test_cpv_filter_and_buyer_check() -> None:
    out = await ted.ted_tenders("Ville de Paris", client=_client(_resp(_payload())))
    urls = " ".join(i["url"] for i in out)
    assert "806-2026" not in urls  # CPV 45 : travaux, pas IT
    assert "900001-2025" not in urls  # acheteur homonyme (Parisot), pas le compte


@pytest.mark.asyncio
async def test_request_contract() -> None:
    client = _client(_resp(_payload()))
    await ted.ted_tenders("Ville de Paris", client=client)
    args, kwargs = client.post.call_args
    assert args[0] == "https://api.ted.europa.eu/v3/notices/search"
    body = kwargs["json"]
    assert 'buyer-name="Ville de Paris*"' in body["query"]
    assert "buyer-country=FRA" in body["query"]
    assert "classification-cpv=72*" in body["query"]
    # Lot 762 : aucune borne de date côté requête (source gratuite, « pas de limite »).
    assert "publication-date" not in body["query"]
    assert "publication-number" in body["fields"] and "links" in body["fields"]
    assert "Authorization" not in (kwargs.get("headers") or {})


@pytest.mark.asyncio
async def test_http_error_raises_clear_error_not_empty() -> None:
    with pytest.raises(ted.TedUnavailable):
        await ted.ted_tenders("Ville de Paris", client=_client(_resp({}, status=500)))


def test_merge_dedupes_boamp_ted_same_notice() -> None:
    boamp = [{"title": "Maintien en condition opérationnelle et évolution du socle Cloud Privé et DevOps",
              "buyer": "VILLE DE PARIS", "location": "Paris", "department": "75",
              "publishedDate": "2026-09-01", "deadline": None, "cpv": "72267100", "url": "https://www.boamp.fr/avis/detail/1"}]
    ted_items = [
        {"title": "Maintien en condition opérationnelle et évolution du socle Cloud Privé et DevOps",
         "buyer": "Ville de Paris", "location": None, "department": None,
         "publishedDate": "2026-09-02", "deadline": "2026-10-01", "cpv": "72267100", "url": "https://ted.europa.eu/x"},
        {"title": "Autre marché logiciel", "buyer": "Ville de Paris", "location": None, "department": None,
         "publishedDate": "2026-09-05", "deadline": None, "cpv": "48000000", "url": "https://ted.europa.eu/y"},
    ]
    merged = ted.merge_tenders(boamp, ted_items)
    assert [m["url"] for m in merged] == ["https://ted.europa.eu/y", "https://www.boamp.fr/avis/detail/1"]
    # BOAMP gagne (porte le département) ; l'échéance TED comble le vide.
    dup = merged[1]
    assert dup["department"] == "75"
    assert dup["deadline"] == "2026-10-01"


@pytest.mark.asyncio
async def test_public_tenders_ted_down_keeps_boamp_and_flags_degraded(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(UTC).strftime("%Y-%m-%d")
    boamp_payload = {"results": [{
        "objet": "Infogérance du SI", "nomacheteur": "Ville de Paris", "dateparution": now,
        "code_cpv": ["72000000"], "url_avis": "https://www.boamp.fr/avis/detail/9",
    }]}
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=httpx.Response(200, json=boamp_payload, request=httpx.Request("GET", "https://x")))
    c.post = AsyncMock(return_value=_resp({}, status=503))
    cid = "test-4116-degraded"
    monkeypatch.setattr(pt, "get_correlation_id", lambda: cid)
    out = await pt.public_tenders("Ville de Paris", client=c)
    assert [i["url"] for i in out] == ["https://www.boamp.fr/avis/detail/9"]
    sources = [d["source"] for d in source_health.get_degradations(cid)]
    assert "ted" in sources
    assert [d["source"] for d in source_health.get_public_degradations(cid) if d["source"] != "boamp"] == ["eu_tenders"]


@pytest.mark.asyncio
async def test_public_tenders_merges_ted_with_boamp() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=httpx.Response(200, json={"results": []}, request=httpx.Request("GET", "https://x")))
    c.post = AsyncMock(return_value=_resp(_payload()))
    out = await pt.public_tenders("Ville de Paris", client=c)
    assert any("ted.europa.eu" in i["url"] for i in out)
