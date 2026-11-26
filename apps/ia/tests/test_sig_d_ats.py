"""SIG-D6 (11/10) — boards ATS : ce que la doc publique permet sans coût.

- Greenhouse (docs.greenhouse.io/job-board, relue le 11/10/2026) : `content=true`
  ajoute `content` (la description) à chaque offre — elle nourrit les technologies
  (`derive_technologies`) et rattrape un intitulé maison sans mot IT.
- SmartRecruiters (reference/v1listpostings, relue le 11/10/2026) : `limit` ≤ 100,
  `offset`, `totalFound` — page suivante tant qu'il en reste.
404 = silence normal (inchangé, couvert par test_ats_boards*.py).
"""

from __future__ import annotations

import html
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx

from app.services.data_sources import ats_boards_more
from app.services.data_sources.ats_boards import it_job_signals_ats


def _resp(body: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=body, request=httpx.Request("GET", "https://x"))


def _gh(title: str, content: str | None, jid: int = 1) -> dict:
    when = (datetime.now(UTC) - timedelta(days=3)).isoformat()
    job = {
        "id": jid,
        "title": title,
        "absolute_url": f"https://job-boards.greenhouse.io/acme/jobs/{jid}",
        "location": {"name": "Paris"},
        "updated_at": when,
        "first_published": when,
        "company_name": "Acme",
    }
    if content is not None:
        job["content"] = content
    return job


async def test_greenhouse_asks_for_content_and_derives_technologies() -> None:
    desc = html.escape("<p>Stack : Python, Kubernetes et AWS.</p>")  # Greenhouse échappe le HTML
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp({"jobs": [_gh("Senior Backend Engineer", desc)]}))
    out = await it_job_signals_ats("Acme", website="https://acme.com", client=client)
    assert client.get.call_args.kwargs["params"] == {"content": "true"}
    assert {"Python", "Kubernetes", "AWS"} <= set(out[0]["skills"])
    assert "content" not in out[0]  # la description ne voyage pas, seules les technologies


async def test_greenhouse_description_rescues_a_house_title_only_with_two_technologies() -> None:
    rich = "Vous travaillerez avec Python, Docker et Terraform au quotidien."
    poor = "Vous accueillerez les clients et tiendrez la caisse."
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(
        return_value=_resp({"jobs": [_gh("Bâtisseur de plateforme", rich, 1), _gh("Hôte de caisse", poor, 2)]})
    )
    out = await it_job_signals_ats("Acme Rescue", website="https://acme-rescue.com", client=client)
    assert [j["title"] for j in out] == ["Bâtisseur de plateforme"]


async def test_greenhouse_without_content_keeps_the_old_behaviour() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp({"jobs": [_gh("Hôte de caisse", None)]}))
    assert await it_job_signals_ats("Acme Old", website="https://acme-old.com", client=client) == []


def _sr_page(start: int, n: int, total: int) -> dict:
    when = (datetime.now(UTC) - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return {
        "offset": start,
        "limit": 100,
        "totalFound": total,
        "content": [
            {
                "id": f"7{start + i}",
                "name": f"Lead DevOps Engineer {start + i}",
                "company": {"identifier": "acme", "name": "Acme"},
                "releasedDate": when,
                "location": {"city": "Paris", "fullLocation": "Paris, France"},
            }
            for i in range(n)
        ],
    }


async def test_smartrecruiters_reads_next_page_with_offset_while_more_remain() -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    http.get = AsyncMock(side_effect=[_resp(_sr_page(0, 100, 130)), _resp(_sr_page(100, 30, 130))])
    out = await ats_boards_more.smartrecruiters_jobs("Acme", website="https://acme.com", http=http)
    params = [c.kwargs["params"] for c in http.get.call_args_list]
    assert params == [{"limit": "100"}, {"limit": "100", "offset": "100"}]
    assert len(out) > 12  # au-delà de la 1re page


async def test_smartrecruiters_single_page_when_everything_fits() -> None:
    http = AsyncMock(spec=httpx.AsyncClient)
    http.get = AsyncMock(return_value=_resp(_sr_page(0, 5, 5)))
    await ats_boards_more.smartrecruiters_jobs("Acme", website="https://acme.com", http=http)
    assert http.get.call_count == 1
