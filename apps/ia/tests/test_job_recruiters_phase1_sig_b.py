"""SIG-B (11/10/2026) — par l'APPELANT réel (``POST /phase/1/research``) :

- les recruteurs nommés n'arrivent que par une offre GARDÉE par le tri métier
  du VENDEUR (les signaux suivent le secteur de l'ESN, jamais une liste IT) ;
- ils sortent dans ``jobRecruiters`` avec la preuve, et les offres
  (``itJobSignals``) ne portent plus aucune personne ;
- sans recruteur, aucune clé neuve (dossier byte-identique).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tests.test_phase1_research import (
    MOCK_BRAVE_RESULTS,
    MOCK_BUNDLE_WITH_CONTENT,
    MOCK_PROFILE,
    _claude_side_effect,
    _facts,
    _signals,
    _strategy,
)

BUREAU_ETUDES = "Projeteur bureau d'études mécanique"
CAISSIER = "Caissier / Caissière"


def _offer(title: str, n: int, recruiter: str | None) -> dict:
    offer = {
        "title": title,
        "location": "Lille",
        "city": "Lille",
        "date": f"2026-10-0{n}",
        "url": f"https://careers.example/{n}",
        "source": "theirstack",
    }
    if recruiter:
        offer["recruiters"] = [{"fullName": recruiter, "role": "Chargée de recrutement"}]
    return offer


def _run(client: TestClient, offers: list[dict]) -> dict:
    async def _aggregators(_company, *, keep_title=None, **_kw):
        return [o for o in offers if keep_title is None or keep_title(o["title"])]

    async def _none(*_a, **_kw):
        return []

    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
        patch("app.routers.phase1_research.it_job_signals", _none),
        patch("app.routers.phase1_research.it_job_signals_apec", _none),
        patch("app.routers.phase1_research.it_job_signals_ats", _none),
        patch("app.routers.phase1_research.it_job_signals_careers", _none),
        patch("app.routers.phase1_research.it_job_signals_wttj", _none),
        patch("app.routers.phase1_research.it_job_signals_aggregators", _aggregators),
    ):
        res = client.post(
            "/phase/1/research",
            json={"company_name": "SNCF", "profile_data": {"offerDomain": "industrial_engineering"}},
        )
    assert res.status_code == 200, res.text
    return res.json()["data"]


def test_recruiter_of_a_kept_offer_becomes_a_candidate_with_its_proof(client: TestClient) -> None:
    data = _run(client, [_offer(BUREAU_ETUDES, 3, "Claire Martin"), _offer(CAISSIER, 4, "Jean Autre")])
    # Le caissier n'est pas un métier placé par cette ESN : son recruteur ne sort pas.
    assert data["jobRecruiters"] == [
        {
            "fullName": "Claire Martin",
            "role": "Chargée de recrutement",
            "jobPosting": {"title": BUREAU_ETUDES, "url": "https://careers.example/3", "postedAt": "2026-10-03"},
        }
    ]
    assert [j["title"] for j in data["itJobSignals"]] == [BUREAU_ETUDES]
    assert all("recruiters" not in j for j in data["itJobSignals"])


def test_no_recruiter_no_new_key(client: TestClient) -> None:
    data = _run(client, [_offer(BUREAU_ETUDES, 3, None)])
    assert "jobRecruiters" not in data
    assert [j["title"] for j in data["itJobSignals"]] == [BUREAU_ETUDES]
