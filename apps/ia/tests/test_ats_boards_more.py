"""Workable, SmartRecruiters, Recruitee, Teamtailor, Personio (#3925, partie 2).

Cinq API PUBLIQUES vérifiées en direct le 2026-10-08 ; les fixtures ci-dessous
reprennent la forme OBSERVÉE (champs réels, valeurs raccourcies). Aucun réseau.

La règle est celle d'`ats_boards` : on n'attribue que sur PREUVE — slug issu du
domaine du compte, ou réponse qui NOMME l'entreprise.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import ats_boards_more
from app.services.data_sources.ats_boards import it_job_signals_ats


def _resp(body: object, status: int = 200, *, text: str | None = None) -> httpx.Response:
    req = httpx.Request("GET", "https://x")
    if text is not None:
        return httpx.Response(status, text=text, request=req)
    return httpx.Response(status, json=body, request=req)


def _client(routes: list[tuple[str, httpx.Response]]) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.urls = []

    async def _get(url, *_a, **_k):
        c.urls.append(str(url))
        for substr, resp in routes:
            if substr in str(url):
                return resp
        return _resp({"error": "Not Found"}, 404)

    c.get = AsyncMock(side_effect=_get)
    return c


def _days(n: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=n)


# --- fixtures fidèles ---------------------------------------------------------


def _workable(name: str = "Hugging Face", jobs: list[dict] | None = None) -> dict:
    return {
        "name": name,
        "description": None,
        "jobs": jobs
        if jobs is not None
        else [
            {
                "title": "Senior Python Developer",
                "shortcode": "81B46579FE",
                "employment_type": "Full-time",
                "telecommuting": True,
                "url": "https://apply.workable.com/j/81B46579FE",
                "published_on": _days(4).date().isoformat(),
                "country": "France",
                "city": "Paris",
                "state": "Île-de-France",
            }
        ],
    }


def _smart(name: str = "Ubisoft", ident: str = "Ubisoft2", days: int = 3) -> dict:
    return {
        "offset": 0,
        "limit": 100,
        "totalFound": 2,
        "content": [
            {
                "id": "744000154431779",
                "name": "Lead DevOps Engineer",
                "company": {"identifier": ident, "name": name},
                "releasedDate": _days(days).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "location": {"city": "Montreuil", "country": "fr", "fullLocation": "Montreuil, , France"},
                "typeOfEmployment": {"id": "permanent", "label": "Full-time"},
            },
            {
                "id": "744000154431780",
                "name": "Chef de rang",
                "company": {"identifier": ident, "name": name},
                "releasedDate": _days(days).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "location": {"city": "Lyon", "country": "fr", "fullLocation": "Lyon, France"},
            },
        ],
    }


def _recruitee(company: str = "bunq", days: int = 6) -> dict:
    return {
        "offers": [
            {
                "id": 2771751,
                "title": "Senior Backend Developer",
                "company_name": company,
                "careers_url": "https://careers.bunq.com/o/senior-backend-developer",
                "published_at": _days(days).strftime("%Y-%m-%d %H:%M:%S UTC"),
                "created_at": _days(days).strftime("%Y-%m-%d %H:%M:%S UTC"),
                "location": "Amsterdam, North Holland, Netherlands",
                "city": "Amsterdam",
                "employment_type_code": "fulltime_permanent",
                "status": "published",
            }
        ]
    }


def _teamtailor(title: str = "Storytel", days: int = 2) -> str:
    pub = _days(days).strftime("%a, %d %b %Y %H:%M:%S +0000")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:tt="https://teamtailor.com/locations">
  <channel>
    <title>{title}</title>
    <link>https://storytel.teamtailor.com/jobs</link>
    <item>
      <title>Data Engineer</title>
      <description>&lt;p&gt;texte&lt;/p&gt;</description>
      <pubDate>{pub}</pubDate>
      <link>https://jobs.storytel.com/jobs/8514884-data-engineer</link>
      <guid>de22a64d</guid>
      <tt:locations>
        <tt:location>
          <tt:name>Stockholm</tt:name>
          <tt:city>Stockholm</tt:city>
          <tt:country>Sweden</tt:country>
        </tt:location>
      </tt:locations>
      <tt:department>Tech</tt:department>
    </item>
  </channel>
</rss>"""


def _personio(subcompany: str | None = None, days: int = 9) -> str:
    sub = f"<subcompany>{subcompany}</subcompany>" if subcompany else ""
    created = _days(days).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    return f"""<?xml version="1.0" encoding="UTF-8"?>

<workzag-jobs>

<position>
    <id>2832842</id>
    {sub}
    <office>Frankfurt am Main</office>
    <department>Engineering</department>
    <name>Senior Softwareentwickler:in Java</name>
    <jobDescriptions></jobDescriptions>
    <createdAt>{created}</createdAt>
</position>

</workzag-jobs>"""


# --- Workable -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_workable_domain_slug_is_trusted() -> None:
    http = _client([("apply.workable.com/api/v1/widget/accounts/huggingface", _resp(_workable()))])
    out = await ats_boards_more.workable_jobs("Hugging Face SAS", website="https://huggingface.co", http=http)
    assert [j["title"] for j in out] == ["Senior Python Developer"]
    assert out[0]["url"] == "https://apply.workable.com/j/81B46579FE"
    assert out[0]["source"] == "workable"
    assert out[0]["city"] == "Paris"
    assert out[0]["date"] == _days(4).date().isoformat()


@pytest.mark.asyncio
async def test_workable_name_slug_requires_the_response_to_name_the_company() -> None:
    # Pas de domaine : le slug vient du nom, la réponse nomme un AUTRE compte.
    http = _client([("accounts/renault", _resp(_workable(name="Boulangerie Dupont")))])
    assert await ats_boards_more.workable_jobs("Renault", website=None, http=http) == []
    http = _client([("accounts/renault", _resp(_workable(name="Renault")))])
    assert len(await ats_boards_more.workable_jobs("Renault", website=None, http=http)) == 1


@pytest.mark.asyncio
async def test_workable_homonym_account_is_refused() -> None:
    http = _client([("accounts/acme", _resp(_workable(name="Acme Bakery Ltd")))])
    assert await ats_boards_more.workable_jobs("Acmesoft", website=None, http=http) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("got", ["Renault Trucks", "Renault Retail Group", "Groupe Renault Trucks SAS"])
async def test_name_check_refuses_a_longer_homonym(got: str) -> None:
    # #3915.b — l'inclusion dans les deux sens acceptait « Renault Trucks » pour « Renault ».
    http = _client([("accounts/renault", _resp(_workable(name=got)))])
    assert await ats_boards_more.workable_jobs("Renault", website=None, http=http) == []


@pytest.mark.asyncio
async def test_name_check_refuses_a_shorter_name_too() -> None:
    # #3915.b — sens inverse : le compte « Renault Trucks » ne prend pas le board « Renault ».
    http = _client([("accounts/renault", _resp(_workable(name="Renault")))])
    assert await ats_boards_more.workable_jobs("Renault Trucks", website=None, http=http) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("got", ["RENAULT SAS", "Groupe Renault", "Renault International", "Renault France"])
async def test_name_check_accepts_legal_and_generic_forms(got: str) -> None:
    # #3915.a — même contrôle que France Travail / APEC / WTTJ : employer_match.same_employer.
    http = _client([("accounts/renault", _resp(_workable(name=got)))])
    assert len(await ats_boards_more.workable_jobs("Renault", website=None, http=http)) == 1


# --- SmartRecruiters ----------------------------------------------------------


@pytest.mark.asyncio
async def test_smartrecruiters_builds_the_public_url_and_filters_non_it() -> None:
    http = _client([("companies/ubisoft/postings", _resp(_smart(ident="ubisoft")))])
    out = await ats_boards_more.smartrecruiters_jobs("Ubisoft", website="https://www.ubisoft.com", http=http)
    assert [j["title"] for j in out] == ["Lead DevOps Engineer"]
    assert out[0]["url"] == "https://jobs.smartrecruiters.com/ubisoft/744000154431779"
    assert out[0]["location"] == "Montreuil, , France" or "Montreuil" in out[0]["location"]
    assert out[0]["source"] == "smartrecruiters"


@pytest.mark.asyncio
async def test_smartrecruiters_name_slug_refused_when_company_differs() -> None:
    http = _client([("companies/ubisoft/postings", _resp(_smart(name="Café du Port")))])
    assert await ats_boards_more.smartrecruiters_jobs("Ubisoft", website=None, http=http) == []


@pytest.mark.asyncio
async def test_smartrecruiters_unknown_company_returns_empty_content() -> None:
    http = _client([("postings", _resp({"offset": 0, "limit": 100, "totalFound": 0, "content": []}))])
    assert await ats_boards_more.smartrecruiters_jobs("Qonto", website="https://qonto.com", http=http) == []


# --- Recruitee ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_recruitee_uses_careers_url_and_published_at() -> None:
    http = _client([("bunq.recruitee.com/api/offers", _resp(_recruitee()))])
    out = await ats_boards_more.recruitee_jobs("bunq", website="https://www.bunq.com", http=http)
    assert len(out) == 1
    assert out[0]["url"] == "https://careers.bunq.com/o/senior-backend-developer"
    assert out[0]["date"] == _days(6).date().isoformat()
    assert out[0]["source"] == "recruitee"
    assert out[0]["city"] == "Amsterdam"


@pytest.mark.asyncio
async def test_recruitee_name_slug_needs_matching_company_name() -> None:
    http = _client([("bunq.recruitee.com", _resp(_recruitee(company="Bunker Hill Pub")))])
    assert await ats_boards_more.recruitee_jobs("bunq", website=None, http=http) == []


# --- Teamtailor ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_teamtailor_rss_item_becomes_a_signal() -> None:
    http = _client([("storytel.teamtailor.com/jobs.rss", _resp(None, text=_teamtailor()))])
    out = await ats_boards_more.teamtailor_jobs("Storytel", website="https://www.storytel.com", http=http)
    assert len(out) == 1
    assert out[0]["url"] == "https://jobs.storytel.com/jobs/8514884-data-engineer"
    assert out[0]["location"] == "Stockholm, Sweden"
    assert out[0]["source"] == "teamtailor"
    assert out[0]["date"] == _days(2).date().isoformat()


@pytest.mark.asyncio
async def test_teamtailor_channel_title_must_name_the_company_without_domain() -> None:
    http = _client([("storytel.teamtailor.com", _resp(None, text=_teamtailor(title="Radio Nova")))])
    assert await ats_boards_more.teamtailor_jobs("Storytel", website=None, http=http) == []


@pytest.mark.asyncio
async def test_teamtailor_refuses_doctype_entities() -> None:
    bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><rss><channel><title>&a;</title></channel></rss>'
    http = _client([("teamtailor.com", _resp(None, text=bomb))])
    assert await ats_boards_more.teamtailor_jobs("Storytel", website="https://storytel.com", http=http) == []


# --- Personio -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_personio_domain_slug_builds_job_url() -> None:
    http = _client([("mobimeo.jobs.personio.de/xml", _resp(None, text=_personio()))])
    out = await ats_boards_more.personio_jobs("Mobimeo", website="https://mobimeo.com", http=http)
    assert len(out) == 1
    assert out[0]["url"] == "https://mobimeo.jobs.personio.de/job/2832842"
    assert out[0]["location"] == "Frankfurt am Main"
    assert out[0]["date"] == _days(9).date().isoformat()
    assert out[0]["source"] == "personio"


@pytest.mark.asyncio
async def test_personio_without_domain_needs_subcompany_naming_the_company() -> None:
    http = _client([("mobimeo.jobs.personio.de", _resp(None, text=_personio()))])
    assert await ats_boards_more.personio_jobs("Mobimeo", website=None, http=http) == []
    http = _client([("mobimeo.jobs.personio.de", _resp(None, text=_personio(subcompany="Mobimeo GmbH")))])
    assert len(await ats_boards_more.personio_jobs("Mobimeo", website=None, http=http)) == 1
    http = _client([("mobimeo.jobs.personio.de", _resp(None, text=_personio(subcompany="Autre SA")))])
    assert await ats_boards_more.personio_jobs("Mobimeo", website=None, http=http) == []


# --- transverse ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_offer_older_than_12_months_is_kept_lot762() -> None:
    # Lot 762 (Louis 31/10 « pas de limite ») : une offre ancienne est STOCKÉE, jamais jetée ;
    # l'estampille ``historical`` est posée par ats_boards d'après la date.
    http = _client([("bunq.recruitee.com", _resp(_recruitee(days=400)))])
    assert len(await ats_boards_more.recruitee_jobs("bunq", website="https://bunq.com", http=http)) == 1


@pytest.mark.asyncio
async def test_429_stops_this_slug_and_records_degradation(monkeypatch: pytest.MonkeyPatch) -> None:
    recorded: list[dict] = []
    backed: list[str] = []
    monkeypatch.setattr(ats_boards_more, "record_degradation", lambda *a, **k: recorded.append(k))
    monkeypatch.setattr(ats_boards_more, "back_off_provider", lambda name, *_a: backed.append(name))
    http = _client([("recruitee.com", _resp({"error": "slow down"}, 429))])
    assert await ats_boards_more.recruitee_jobs("bunq", website="https://bunq.com", http=http) == []
    assert backed == ["recruitee"]
    assert recorded and recorded[0]["source"] == "recruitee"
    # 429 : on N'INSISTE PAS avec les autres slugs deviné du même compte.
    assert len(http.urls) == 1


@pytest.mark.asyncio
async def test_403_also_stops_and_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    recorded: list[dict] = []
    monkeypatch.setattr(ats_boards_more, "record_degradation", lambda *a, **k: recorded.append(k))
    http = _client([("workable.com", _resp({}, 403))])
    assert await ats_boards_more.workable_jobs("Hugging Face", website="https://huggingface.co", http=http) == []
    assert recorded and recorded[0]["source"] == "workable"
    assert len(http.urls) == 1


@pytest.mark.asyncio
async def test_absent_slug_makes_no_call() -> None:
    http = _client([])
    assert await ats_boards_more.workable_jobs("", website=None, http=http) == []
    assert http.urls == []


@pytest.mark.asyncio
async def test_at_most_four_attempts_per_ats() -> None:
    http = _client([])
    await ats_boards_more.recruitee_jobs(
        "Groupe Alpha Beta Gamma Delta Services France SAS", website="https://www.alpha-beta.com", http=http
    )
    assert 1 <= len(http.urls) <= 4


# --- câblage dans it_job_signals_ats -------------------------------------------


@pytest.mark.asyncio
async def test_it_job_signals_ats_falls_through_to_extra_ats() -> None:
    http = _client([("bunq.recruitee.com/api/offers", _resp(_recruitee()))])
    out = await it_job_signals_ats("bunq", website="https://www.bunq.com", client=http)
    assert [j["source"] for j in out] == ["recruitee"]


@pytest.mark.asyncio
async def test_extra_ats_can_be_switched_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ATS_EXTRA_ENABLED", "false")
    http = _client([("bunq.recruitee.com/api/offers", _resp(_recruitee()))])
    assert await it_job_signals_ats("bunq-off", website="https://www.bunq.com", client=http) == []
    assert not any("recruitee" in u for u in http.urls)
