"""SIG-D5 (11/10) — Fantastic.jobs : domaine, casse, pagination relus sur la doc et enfin envoyés.

Chaque test tient un paramètre CONFIRMÉ par la documentation officielle du
fournisseur (relue le 11/10/2026) ; un paramètre non confirmé n'est pas testé
ici parce qu'il n'est pas envoyé (voir « Reste » du commentaire #4016).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import job_aggregators as agg

_NOW = datetime.now(UTC)


def _iso(days_ago: int) -> str:
    return (_NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x"))


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("JOOBLE_API_KEY", "JOOBLE_HOST", "FANTASTIC_JOBS_API_KEY", "BRAVE_EXTRA_SNIPPETS"):
        monkeypatch.delenv(k, raising=False)


def _jooble_job(i: int, employer: str = "DECATHLON") -> dict:
    return {"title": f"Dev {i}", "location": "Lille", "company": employer, "updated": _iso(2), "link": f"https://j/{i}"}


# ── D5 — Fantastic.jobs ──────────────────────────────────────────────────────


def _fj(i: int, org: str = "Decathlon") -> dict:
    return {"title": f"Poste {i}", "organization": org, "date_posted": _iso(3), "url": f"https://a/{i}",
            "locations_derived": ["Lille"]}


async def test_fantastic_queries_by_domain_when_known(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", "k")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp([_fj(1)]))
    offers = await agg.fantastic_jobs("Decathlon", domain="https://www.decathlon.fr/x", client=client)
    params = client.get.call_args.kwargs["params"]
    assert params["domain"] == "decathlon.fr"  # doc : filtre `domain`
    assert "organization" not in params
    assert len(offers) == 1


async def test_fantastic_falls_back_to_organization_names(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", "k")
    client = AsyncMock(spec=httpx.AsyncClient)
    # domaine (ATS) : vide ; `decathlon` (graphie tapée, jobboards) : vide ; `Decathlon` (casse usuelle) : 1 offre.
    client.get = AsyncMock(side_effect=[_resp([]), _resp([]), _resp([_fj(1)])])
    offers = await agg.fantastic_jobs("decathlon", domain="decathlon.fr", client=client)
    sent = [c.kwargs["params"] for c in client.get.call_args_list]
    assert [p.get("organization") for p in sent] == [None, "decathlon", "Decathlon"]
    assert len(offers) == 1


async def test_fantastic_without_domain_keeps_the_exact_old_query(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", "k")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp([_fj(1)]))
    await agg.fantastic_jobs("Decathlon", client=client)
    # CACHE-SOURCES (15/10) — une page de `_PAID_PAGE_SIZE` (25) : facturé à l'offre, payé une fois par entreprise.
    # DISCOVER-OFFRES (15/10) : sans domaine, jobboards par organisation, France, hors stage (voir test_offres_15_10_fiche).
    params = client.get.call_args.kwargs["params"]
    assert params["organization"] == "Decathlon" and params["time_frame"] == "6m"
    assert params["limit"] == agg._PAID_PAGE_SIZE and params["location"] == "France"
    assert client.get.call_count == 1


async def test_fantastic_never_paginates_even_when_page_is_full(monkeypatch: pytest.MonkeyPatch) -> None:
    # CACHE-SOURCES (15/10) — plus d'`offset` : une seule page des 25 offres les plus récentes,
    # même pleine (Fantastic facture chaque offre rendue).
    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", "k")
    full = [_fj(i, "Intersport") for i in range(agg._PAID_PAGE_SIZE)]
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=[_resp(full), _resp([_fj(50)])])
    await agg.fantastic_jobs("Decathlon", client=client)
    assert [c.kwargs["params"].get("offset") for c in client.get.call_args_list] == [None]