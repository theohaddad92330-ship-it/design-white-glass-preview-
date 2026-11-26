"""SIG-D3 (11/10) — France Travail et APEC : 2e page quand la 1re est saturée.

Contrat relu dans le code existant : France Travail pagine par ``range=a-b``
(``0-149`` aujourd'hui), APEC par ``pagination {range, startIndex}`` (corps
vérifié contre le DTO réel le 16/07/2026). Une page non saturée ne déclenche
JAMAIS la suivante.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.data_sources import apec
from app.services.data_sources import france_travail as ft


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()


def _ft_offer(i: int, company: str = "Acme") -> dict:
    return {
        "id": f"ft{i}",
        "intitule": f"Développeur Python {i}",
        "description": "Python, Django, AWS",
        "dateCreation": _iso(2),
        "entreprise": {"nom": company},
        "lieuTravail": {"libelle": "75 - Paris"},
        "romeCode": "M1805",
    }


@pytest.fixture
def _ft_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")


async def _run_ft(pages: dict[str, list[dict]]) -> tuple[list[dict], list[str]]:
    seen: list[str] = []

    async def fake_search(_http, _token, params):  # noqa: ANN001
        seen.append(f"{params.get('domaine', '-')}|{params['range']}")
        return pages.get(f"{params.get('domaine', '-')}|{params['range']}", [])

    with (
        patch.object(ft, "_token", AsyncMock(return_value="tok")),
        patch.object(ft, "_search", fake_search),
    ):
        out = await ft.it_job_signals("Acme", client=AsyncMock(spec=httpx.AsyncClient))
    return out, seen


async def test_france_travail_reads_second_broad_page_when_saturated(_ft_env: None) -> None:
    n = ft._BROAD_FETCH
    pages = {
        f"-|0-{n - 1}": [_ft_offer(i, "Autre SA") for i in range(n)],
        f"-|{n}-{2 * n - 1}": [_ft_offer(1000 + i) for i in range(3)],
    }
    out, seen = await _run_ft(pages)
    assert f"-|{n}-{2 * n - 1}" in seen
    assert sorted(o["title"] for o in out) == [f"Développeur Python {1000 + i}" for i in range(3)]


async def test_france_travail_no_second_page_when_first_not_saturated(_ft_env: None) -> None:
    n = ft._BROAD_FETCH
    _out, seen = await _run_ft({f"-|0-{n - 1}": [_ft_offer(i) for i in range(5)]})
    assert not any(r.startswith(f"-|{n}-") for r in seen)


def _apec_offer(i: int, employer: str = "Acme") -> dict:
    return {
        "numeroOffre": f"A{i}",
        "intitule": f"Ingénieur DevOps {i}",
        "nomCommercial": employer,
        "lieuTexte": "Lille - 59",
        "texteOffre": "Kubernetes, Terraform, AWS",
        "datePublication": _iso(2),
    }


def _resp(payload: object) -> httpx.Response:
    return httpx.Response(200, json=payload, request=httpx.Request("POST", "https://x"))


async def test_apec_reads_second_page_when_saturated_and_not_enough() -> None:
    fetch = 24  # limit=12 ⇒ max(12 + 12, 20)
    p1 = {"resultats": [_apec_offer(i, "Autre SA") for i in range(fetch)]}
    p2 = {"resultats": [_apec_offer(100, "Acme")]}
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(side_effect=[_resp(p1), _resp(p2)])
    out = await apec.it_job_signals_apec("Acme", client=client)
    starts = [c.kwargs["json"]["pagination"]["startIndex"] for c in client.post.call_args_list]
    assert starts == [0, fetch]
    assert [o["title"] for o in out] == ["Ingénieur DevOps 100"]


async def test_apec_single_page_when_not_saturated() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp({"resultats": [_apec_offer(1)]}))
    await apec.it_job_signals_apec("Acme Single", client=client)
    assert client.post.call_count == 1
