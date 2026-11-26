"""SIG-B (11/10/2026) — les recruteurs NOMMÉS d'une offre gardée deviennent des
contacts CANDIDATS, prouvés par l'offre.

TheirStack rend ``hiring_team`` dans la réponse de ``/v1/jobs/search``, sans
crédit de plus (1 crédit par offre rendue, champ compris). Forme relue sur la doc
officielle (theirstack.com/en/docs/api-reference/jobs/search_jobs_v1) :
``hiring_team[]`` → ``first_name``, ``full_name``, ``image_url``,
``linkedin_url``, ``role``, ``thumbnail_url``.

Ce que ces tests tiennent :
- le recruteur voyage AVEC son offre (nom, rôle tel que donné, LinkedIn si
  présent) — un champ absent n'est jamais fabriqué ;
- une offre ÉCARTÉE (autre employeur, tri métier du vendeur) n'apporte aucun
  recruteur ;
- l'extraction retire les recruteurs des offres (le bloc offres reste
  byte-identique) et rend chaque personne UNE fois, avec la preuve (intitulé,
  URL, date de publication) ;
- la photo n'est jamais reprise (un visage n'est pas une preuve d'emploi).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import job_aggregators as agg
from app.services.data_sources.job_recruiters import split_job_recruiters

_KEYS = (
    "ADZUNA_APP_ID",
    "ADZUNA_APP_KEY",
    "JOOBLE_API_KEY",
    "THEIRSTACK_API_KEY",
    "MANTIKS_API_KEY",
    "FANTASTIC_JOBS_API_KEY",
)


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def _resp(json_data: object) -> httpx.Response:
    return httpx.Response(200, json=json_data, request=httpx.Request("POST", "https://x"))


@pytest.fixture(autouse=True)
def _no_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _KEYS:
        monkeypatch.delenv(k, raising=False)


def _payload() -> dict:
    return {
        "data": [
            {
                "job_title": "Ingénieur DevOps",
                "url": "https://www.linkedin.com/jobs/view/1",
                "final_url": "https://careers.sanofi.com/job/1",
                "date_posted": _iso(3),
                "company": "Sanofi",
                "location": "Paris",
                "hiring_team": [
                    {
                        "first_name": "Claire",
                        "full_name": "Claire Martin",
                        "image_url": "https://media.licdn.com/x.jpg",
                        "linkedin_url": "https://www.linkedin.com/in/claire-martin",
                        "role": "Talent Acquisition Partner",
                        "thumbnail_url": "https://media.licdn.com/t.jpg",
                    },
                    {"first_name": "Paul", "full_name": "Paul Durand"},
                    {"first_name": "", "full_name": "  "},
                ],
            },
            {
                "job_title": "Comptable",
                "url": "https://fr.indeed.com/viewjob?jk=2",
                "date_posted": _iso(5),
                "company": "Autre Employeur SA",
                "location": "Lyon",
                "hiring_team": [{"full_name": "Jean Autre", "role": "Recruiter"}],
            },
        ]
    }


async def test_theirstack_offer_carries_its_named_hiring_team(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp(_payload()))
    out = await agg.theirstack_jobs("Sanofi", client=client)
    assert [o["title"] for o in out] == ["Ingénieur DevOps"]
    assert out[0]["recruiters"] == [
        {
            "fullName": "Claire Martin",
            "role": "Talent Acquisition Partner",
            "linkedinUrl": "https://www.linkedin.com/in/claire-martin",
        },
        # Rôle et LinkedIn absents : aucune clé, jamais une valeur devinée.
        {"fullName": "Paul Durand"},
    ]
    # 1 crédit par offre rendue : le champ ne coûte rien de plus, aucune requête en plus.
    assert client.post.await_count == 1


async def test_offer_without_hiring_team_is_byte_identical(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    payload = _payload()
    for hit in payload["data"]:
        hit.pop("hiring_team")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp(payload))
    out = await agg.theirstack_jobs("Sanofi", client=client)
    assert "recruiters" not in out[0]


def test_split_strips_recruiters_and_keeps_the_proof() -> None:
    offers = [
        {
            "title": "Ingénieur DevOps",
            "url": "https://careers.sanofi.com/job/1",
            "date": "2026-10-08",
            "source": "theirstack",
            "recruiters": [
                {
                    "fullName": "Claire Martin",
                    "role": "TA Partner",
                    "linkedinUrl": "https://www.linkedin.com/in/claire-martin",
                }
            ],
        },
        {
            "title": "Architecte cloud",
            "url": "https://careers.sanofi.com/job/2",
            "date": "2026-10-09",
            "source": "theirstack",
            # La même personne sur une seconde offre : UNE personne, la preuve la plus récente.
            "recruiters": [
                {"fullName": "Claire  MARTIN", "linkedinUrl": "https://linkedin.com/in/claire-martin/"},
                {"fullName": "Paul Durand"},
            ],
        },
        {"title": "Data engineer", "url": None, "date": None, "source": "france_travail"},
    ]
    jobs, recruiters = split_job_recruiters(offers)
    assert all("recruiters" not in j for j in jobs)
    assert [j["title"] for j in jobs] == ["Ingénieur DevOps", "Architecte cloud", "Data engineer"]
    # L'entrée n'est jamais modifiée en place.
    assert "recruiters" in offers[0]
    assert recruiters == [
        {
            "fullName": "Claire Martin",
            "role": "TA Partner",
            "linkedinUrl": "https://www.linkedin.com/in/claire-martin",
            "jobPosting": {
                "title": "Architecte cloud",
                "url": "https://careers.sanofi.com/job/2",
                "postedAt": "2026-10-09",
            },
        },
        {
            "fullName": "Paul Durand",
            "jobPosting": {
                "title": "Architecte cloud",
                "url": "https://careers.sanofi.com/job/2",
                "postedAt": "2026-10-09",
            },
        },
    ]


def test_split_without_any_recruiter_returns_the_same_offers() -> None:
    offers = [{"title": "Dev", "url": "https://x/1", "date": "2026-10-01", "source": "apec"}]
    jobs, recruiters = split_job_recruiters(offers)
    assert jobs == offers
    assert recruiters == []


def test_an_offer_without_url_proves_nothing() -> None:
    """Sans URL d'offre, la preuve ne se vérifie pas : aucun recruteur."""
    offers = [{"title": "Dev", "url": None, "date": "2026-10-01", "recruiters": [{"fullName": "Paul Durand"}]}]
    jobs, recruiters = split_job_recruiters(offers)
    assert recruiters == []
    assert "recruiters" not in jobs[0]
