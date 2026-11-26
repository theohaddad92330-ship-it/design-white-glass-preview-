"""Greenhouse et Lever — les offres que France Travail ne voit pas (tome 2 §13).

Deux API PUBLIQUES et DOCUMENTÉES, vérifiées en direct le 22/08/2026 :

    GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs  → {"jobs": [...]}
    GET https://api.lever.co/v0/postings/{company}?mode=json     → [ ... ]

Sans authentification, sans quota déclaré. Un board qui n'existe pas répond 404
— c'est la NON-DÉTECTION, pas une panne.

La règle qui porte ce module est celle de l'attribution : un board porte le nom
d'un slug, et un slug se devine. Attribuer à Renault les offres du board
« renault » de quelqu'un d'autre produirait un signal de recrutement faux sur un
compte réel. On n'attribue donc que sur PREUVE : le slug vient du domaine de
l'entreprise, ou la réponse la nomme.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.ats_boards import it_job_signals_ats


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


def _routes(routes: list[tuple[str, httpx.Response]]) -> AsyncMock:
    """Client dont le .get() répond selon l'URL — 404 pour tout le reste, comme
    un board inexistant."""
    c = AsyncMock(spec=httpx.AsyncClient)

    async def _get(url, *_args, **_kwargs):
        for substr, resp in routes:
            if substr in str(url):
                return resp
        return _resp({"ok": False, "error": "Document not found"}, status=404)

    c.get = AsyncMock(side_effect=_get)
    return c


def _gh_job(title: str, *, days_ago: int = 5, company: str = "Doctolib", jid: int = 1) -> dict:
    updated = (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()
    return {
        "id": jid,
        "title": title,
        "absolute_url": f"https://job-boards.greenhouse.io/doctolib/jobs/{jid}",
        "location": {"name": "Paris, France"},
        "updated_at": updated,
        "first_published": updated,
        "company_name": company,
    }


def _lever_post(title: str, *, days_ago: int = 5, pid: str = "abc") -> dict:
    created = int((datetime.now(UTC) - timedelta(days=days_ago)).timestamp() * 1000)
    return {
        "id": pid,
        "text": title,
        "hostedUrl": f"https://jobs.lever.co/qonto/{pid}",
        "createdAt": created,
        "categories": {"commitment": "Full-time", "department": "Tech", "location": "Paris"},
        "country": "FR",
        "workplaceType": "hybrid",
    }


@pytest.mark.asyncio
async def test_greenhouse_board_returns_it_offers_in_the_shared_shape() -> None:
    client = _routes(
        [("boards-api.greenhouse.io", _resp({"jobs": [_gh_job("Senior Backend Engineer (Java)")]}))]
    )
    out = await it_job_signals_ats("Doctolib", website="https://www.doctolib.fr", client=client)
    assert len(out) == 1
    job = out[0]
    assert job["title"].startswith("Senior Backend")
    assert job["source"] == "greenhouse"
    assert job["url"].startswith("https://job-boards.greenhouse.io/")
    assert job["location"] == "Paris, France"
    assert job["date"]


@pytest.mark.asyncio
async def test_non_it_offers_are_dropped() -> None:
    """Une offre de comptable n'est pas un signal de budget IT — même règle que
    France Travail, et la même fonction de jugement."""
    client = _routes(
        [(
            "boards-api.greenhouse.io",
            _resp({"jobs": [_gh_job("Comptable fournisseurs", jid=2), _gh_job("Data Engineer", jid=3)]}),
        )]
    )
    out = await it_job_signals_ats("Doctolib", website="doctolib.fr", client=client)
    assert [j["title"] for j in out] == ["Data Engineer"]


@pytest.mark.asyncio
async def test_a_board_that_does_not_exist_is_a_non_detection_not_an_error() -> None:
    out = await it_job_signals_ats("Une PME sans ATS", website="pme-sans-ats.fr", client=_routes([]))
    assert out == []


@pytest.mark.asyncio
async def test_lever_is_only_trusted_when_the_slug_comes_from_the_domain() -> None:
    """Lever ne nomme l'entreprise nulle part dans sa réponse. Un slug deviné
    depuis le NOM pourrait tomber sur le board d'un homonyme — et on écrirait un
    signal de recrutement faux sur un compte réel."""
    lever = _resp([_lever_post("Site Reliability Engineer")])
    with_domain = await it_job_signals_ats("Qonto", website="https://qonto.com", client=_routes([("api.lever.co", lever)]))
    assert len(with_domain) == 1
    assert with_domain[0]["source"] == "lever"

    without_domain = await it_job_signals_ats("Qonto", client=_routes([("api.lever.co", lever)]))
    assert without_domain == []


@pytest.mark.asyncio
async def test_greenhouse_is_trusted_from_the_name_only_when_it_names_the_company() -> None:
    """Greenhouse, lui, RENVOIE `company_name` : c'est la preuve qui manque à
    Lever, et elle suffit à attribuer sans domaine."""
    named = _resp({"jobs": [_gh_job("Cloud Engineer", company="Doctolib")]})
    ok = await it_job_signals_ats("Doctolib", client=_routes([("greenhouse", named)]))
    assert len(ok) == 1

    someone_else = _resp({"jobs": [_gh_job("Cloud Engineer", company="Doctopus Ltd")]})
    # Nom DIFFÉRENT pour ne pas retomber sur la réponse mise en cache du premier
    # appel : la clé de cache est (entreprise, site, limite).
    assert await it_job_signals_ats("Sopra Steria", client=_routes([("greenhouse", someone_else)])) == []


@pytest.mark.asyncio
async def test_lever_epoch_milliseconds_become_a_real_date() -> None:
    out = await it_job_signals_ats("Qonto", website="qonto.com", client=_routes([("api.lever.co", _resp([_lever_post("DevOps Engineer")]))]))
    assert out[0]["date"].startswith(str(datetime.now(UTC).year))


@pytest.mark.asyncio
async def test_offers_older_than_a_year_are_kept_stamped_historical_and_the_rest_is_recent_first() -> None:
    client = _routes(
        [(
            "greenhouse",
            _resp(
                {
                    "jobs": [
                        _gh_job("Data Engineer", days_ago=400, jid=10),
                        _gh_job("Backend Engineer", days_ago=200, jid=11),
                        _gh_job("DevOps Engineer", days_ago=3, jid=12),
                    ]
                }
            ),
        )]
    )
    out = await it_job_signals_ats("Doctolib", website="doctolib.fr", client=client)
    # #4754 — plus d'un an : gardée, estampillée, classée en dernier (jamais jetée).
    assert [j["title"] for j in out] == ["DevOps Engineer", "Backend Engineer", "Data Engineer"]
    assert out[2]["historical"] is True


@pytest.mark.asyncio
async def test_3817_retries_the_slug_of_the_brand_when_the_full_name_404s() -> None:
    """#3817.1 — JCDecaux France : le board publie sous la seule marque
    (« jcdecaux »), jamais sous la raison sociale complète (« jcdecaux-france »,
    404). Sans domaine connu, le slug réduit est tenté ENSUITE — jamais en
    premier (une marque devinée pourrait tomber sur le board d'un homonyme)."""
    requested: list[str] = []

    async def _get(url, *_args, **_kwargs):
        requested.append(str(url))
        if "jcdecaux-france" in str(url):
            return _resp({"ok": False, "error": "Document not found"}, status=404)
        if "jcdecaux" in str(url):
            return _resp({"jobs": [_gh_job("Technicien de maintenance informatique", company="JCDecaux")]})
        return _resp({"ok": False, "error": "Document not found"}, status=404)

    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=_get)

    out = await it_job_signals_ats("JCDecaux France", client=client)
    assert [j["title"] for j in out] == ["Technicien de maintenance informatique"]
    # Le nom complet est tenté EN PREMIER (404), la marque réduite ENSUITE.
    assert len(requested) == 2
    assert "jcdecaux-france" in requested[0]
    assert "jcdecaux/jobs" in requested[1]


@pytest.mark.asyncio
async def test_no_company_no_network() -> None:
    client = _routes([])
    assert await it_job_signals_ats("", website="x.fr", client=client) == []
    client.get.assert_not_called()
