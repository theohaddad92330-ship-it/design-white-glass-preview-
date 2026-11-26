"""#4284.5 (#3901.12) — parité WTTJ (index Algolia) / recherche publique `site:` sur un même lexique.

Les deux sources du bucket ``hiring`` doivent juger LA MÊME offre de la même façon : un stage « cybersécurité »
n'est un signal ni chez l'une ni chez l'autre (décision Louis 12/10, #4044), une offre cyber CDI l'est chez les deux.
Avant : `list_hiring_companies_wttj` filtrait les stages sur des clés (`title`/`contractType`) que ses lignes ne
portent pas — le filtre ne lisait rien, le stage passait.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.job_search import list_hiring_companies_search
from app.services.data_sources.wttj import list_hiring_companies_wttj

_TITLES_KEPT = "Ingénieur cybersécurité SOC F/H"
_TITLE_INTERNSHIP = "Stage — Analyste cybersécurité"


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()


def _wttj_client() -> AsyncMock:
    payload = {
        "hits": [
            {
                "name": title,
                "slug": f"s{i}",
                "published_at": _iso(2),
                "contract_type": {"fr": "CDI"},
                "organization": {"name": f"Societe {i}", "slug": f"soc{i}"},
            }
            for i, title in enumerate((_TITLES_KEPT, _TITLE_INTERNSHIP))
        ]
    }
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=httpx.Response(200, json=payload, request=httpx.Request("POST", "https://x")))
    return c


async def _wttj_titles(monkeypatch: pytest.MonkeyPatch) -> set[str]:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    rows = await list_hiring_companies_wttj(keywords=["cybersécurité"], client=_wttj_client())
    return {str(r["signal"]["label"]).removeprefix("Recrutement — ") for r in rows}


async def _search_titles(monkeypatch: pytest.MonkeyPatch) -> set[str]:
    monkeypatch.setenv("SERPER_API_KEY", "k")
    hits = [
        {"url": f"https://jobs.lever.co/soc{i}/abc{i}", "title": title, "date": _iso(2)[:10]}
        for i, title in enumerate((_TITLES_KEPT, _TITLE_INTERNSHIP))
    ]
    gateway = AsyncMock()
    gateway.search = AsyncMock(return_value=hits)
    monkeypatch.setattr("app.services.data_sources.job_search.DataGateway", lambda client=None: gateway)
    rows = await list_hiring_companies_search(keywords=["cybersécurité"])
    return {str(r["signal"]["label"]).removeprefix("Recrutement — ") for r in rows}


async def test_wttj_drops_internship_like_search(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _TITLE_INTERNSHIP not in await _wttj_titles(monkeypatch)
    assert _TITLES_KEPT in await _wttj_titles(monkeypatch)


async def test_both_sources_keep_the_same_cyber_titles(monkeypatch: pytest.MonkeyPatch) -> None:
    assert await _wttj_titles(monkeypatch) == await _search_titles(monkeypatch) == {_TITLES_KEPT}
