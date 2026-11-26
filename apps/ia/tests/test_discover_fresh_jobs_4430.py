"""#4430 (Louis 21/10) — l'APPELANT : Découvrir (et Laura, qui passe par lui) recollecte les offres des
premières cartes au cache périmé, sous les plafonds ; sans espace, rien n'est payé (comportement d'avant)."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.routers import discover as discover_router
from app.services import free_text_facts, fresh_jobs, provider_cache, public_facts, source_cache
from app.services.data_sources import job_aggregators

SCOPE_PROFILE = {"placedRoles": ["développeur", "ingénieur", "architecte", "data", "devops", "offre"]}


class MemoryStore:
    def __init__(self) -> None:
        self.rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    async def get(self, source: str, category: str, key: str):
        row = self.rows.get((source, category, key))
        if row is None or row[1] <= datetime.now(UTC):
            return None
        return row

    async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
        self.rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))


def _offer(title: str, url: str) -> dict:
    return {
        "title": title,
        "url": url,
        "date": datetime.now(UTC).date().isoformat(),
        "contractType": "CDI",
        "company": "ACME",
        "source": "x",
    }


@pytest.fixture
def paid(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    ms = MemoryStore()

    async def _fake_store():
        return ms

    monkeypatch.setattr(source_cache, "_store", _fake_store)
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    fresh_jobs._local_counts.clear()
    for name in ("it_job_signals", "it_job_signals_ats"):
        monkeypatch.setattr(discover_router, name, AsyncMock(return_value=[]))
    for fn in ("public_tenders", "legal_signals", "press_signals", "funding_signals"):
        monkeypatch.setattr(discover_router, fn, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))
    for key in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    for key in ("THEIRSTACK_API_KEY", "MANTIKS_API_KEY", "FANTASTIC_JOBS_API_KEY"):
        monkeypatch.setenv(key, "k")
    monkeypatch.setattr(discover_router, "_ats_for_card", AsyncMock(return_value=[]))  # jamais de réseau en test
    mocks = {
        "fantastic_jobs": AsyncMock(return_value=[_offer("Développeur React", "https://f/1")]),
        "mantiks_jobs": AsyncMock(return_value=[]),
        "theirstack_jobs": AsyncMock(return_value=[]),
        "_theirstack_search": AsyncMock(return_value=[]),  # palier « fenêtre » de la cascade : jamais de réseau en test
    }
    for name, mock in mocks.items():
        monkeypatch.setattr(job_aggregators, name, mock)
    # #4437 — le rattachement du texte libre est testé à part : ici, jamais un appel au modèle.
    monkeypatch.setattr(free_text_facts, "attach_offer_titles", AsyncMock(side_effect=lambda rows, **_: rows))
    return mocks


async def _run(sirens: list[str], *, space_key: str | None) -> list[dict]:
    candidates = [{"name": f"ACME {s}", "siren": s} for s in sirens]
    tasks = discover_router._start_signal_tasks(candidates, profile_data=SCOPE_PROFILE, space_key=space_key)
    await discover_router._finish_signal_tasks(tasks, [], time.monotonic() + 10, profile_data=SCOPE_PROFILE, filters={})
    return candidates


def _hiring(candidate: dict) -> list[str]:
    return sorted(s["label"] for s in candidate.get("signals") or [] if s["type"] == "hiring")


@pytest.mark.asyncio
async def test_a_stale_card_of_a_space_gets_fresh_paid_offers(paid: dict[str, AsyncMock]) -> None:
    windows: list[int] = []

    async def _fantastic(company: str, **_: Any) -> list[dict]:
        windows.append(job_aggregators._window_days(90))  # la fenêtre dans laquelle CET appel regarde
        return [_offer("Développeur React", "https://f/1")]

    paid["fantastic_jobs"].side_effect = _fantastic
    card = (await _run(["710000001"], space_key="ws-1"))[0]
    # CASCADE-PLANCHER-5 (25/10) : 1 offre du métier < plancher 5 ⇒ la cascade élargit — Fantastic relu UNE fois
    # plus loin dans le temps (fenêtre 365 j sous sa propre clé), jamais deux fois la MÊME question.
    assert windows == [90, job_aggregators.CASCADE_WINDOW_DAYS]
    paid["mantiks_jobs"].assert_awaited_once()
    paid["theirstack_jobs"].assert_awaited_once()
    assert _hiring(card) == ["Développeur React"]
    assert "jobsAsOf" not in card  # offres fraîches : pas de date « d'avant » à dire


@pytest.mark.asyncio
async def test_without_a_space_discover_pays_nothing(paid: dict[str, AsyncMock]) -> None:
    await _run(["710000002"], space_key=None)
    for mock in paid.values():
        mock.assert_not_called()


@pytest.mark.asyncio
async def test_a_card_read_from_a_recent_cache_says_the_date_of_its_offers(paid: dict[str, AsyncMock]) -> None:
    key = public_facts.company_fact_key(siren="710000003")
    collected = datetime.now(UTC) - timedelta(days=2)
    await public_facts.share_fact(
        "jobs",
        key,
        public_facts.jobs_fact_variant("fantastic", None, False),
        [_offer("Architecte cloud", "https://c/1")],
        collected_at=collected,
    )
    card = (await _run(["710000003"], space_key="ws-1"))[0]
    for mock in paid.values():
        mock.assert_not_called()
    assert _hiring(card) == ["Architecte cloud"]
    assert card["jobsAsOf"] == collected.date().isoformat()


@pytest.mark.asyncio
async def test_beyond_ten_stale_cards_the_rest_stays_on_the_cache(paid: dict[str, AsyncMock]) -> None:
    await _run([f"7200000{i:02d}" for i in range(12)], space_key="ws-1")
    # Le plafond porte sur les CARTES rafraîchies (10), pas sur les appels : chaque carte peut élargir sa cascade
    # (palier 0 + fenêtre), mais jamais plus de deux appels Fantastic, et jamais pour la 11e carte.
    names = [call.args[0] for call in paid["fantastic_jobs"].await_args_list]
    assert len(set(names)) == fresh_jobs.FRESH_JOBS_MAX_PER_ANSWER
    assert all(names.count(n) <= 2 for n in set(names))


# ── « Va chercher 10 comptes » → 0 : la recherche par compétence se REMPLIT par une collecte fraîche ──


def _registry_row(siren: str, name: str) -> dict:
    return {"siren": siren, "name": name, "department": "59", "city": "LILLE", "nafCode": "62.01Z"}


async def _by_skill(monkeypatch: pytest.MonkeyPatch, *, space_key: str | None, found: list[dict]) -> Any:
    from app.services.discover_skill_offers import SkillAccounts

    monkeypatch.setattr(
        discover_router,
        "find_skill_accounts",
        AsyncMock(return_value=SkillAccounts(accounts=found, info={"emptyCause": None if found else "no_offers"})),
    )
    zone = [_registry_row("730000001", "ALPHA"), _registry_row("730000002", "BETA")]
    monkeypatch.setattr(discover_router, "_collect_for_request", AsyncMock(return_value=zone))

    async def _rank(req, filters, limit, query, shown_query, applied, degraded, companies, deadline, **_):  # noqa: ANN001, ANN202
        return discover_router.DiscoverRegistryResponse(candidates=list(companies), query=shown_query)

    monkeypatch.setattr(discover_router, "_rank_and_angle", _rank)
    req = discover_router.DiscoverRegistryRequest(
        filters=discover_router.DiscoverFilters(keywords=["Java"], department="59"),
        limit=10,
        profile_data=SCOPE_PROFILE,
        spaceKey=space_key,
    )
    return await discover_router._discover_registry_once(req)


@pytest.mark.asyncio
async def test_a_skill_search_at_zero_fills_itself_with_fresh_offers_that_cite_the_skill(
    monkeypatch: pytest.MonkeyPatch, paid: dict[str, AsyncMock]
) -> None:
    async def _fantastic(company: str, **_: Any) -> list[dict]:
        if company == "ALPHA":
            return [_offer("Développeur Java senior", "https://f/alpha")]
        return [_offer("Comptable", "https://f/beta")]

    paid["fantastic_jobs"].side_effect = _fantastic
    response = await _by_skill(monkeypatch, space_key="ws-1", found=[])
    assert [c["siren"] for c in response.candidates] == ["730000001"]  # BETA n'a aucune offre Java : absente
    evidence = response.candidates[0]["skillEvidence"]
    assert evidence["latestOffer"]["title"] == "Développeur Java senior"
    assert response.candidates[0]["skillFreshFill"] is True
    fill = response.query["skillSearch"]["freshFill"]
    assert fill == {"examined": 2, "found": 1}


@pytest.mark.asyncio
async def test_a_skill_search_without_a_space_stays_at_zero_and_pays_nothing(
    monkeypatch: pytest.MonkeyPatch, paid: dict[str, AsyncMock]
) -> None:
    response = await _by_skill(monkeypatch, space_key=None, found=[])
    assert response.candidates == []
    paid["fantastic_jobs"].assert_not_called()


@pytest.mark.asyncio
async def test_a_skill_search_that_already_has_enough_never_fills(
    monkeypatch: pytest.MonkeyPatch, paid: dict[str, AsyncMock]
) -> None:
    found = [
        {**_registry_row(f"74000000{i}", f"GAMMA {i}"), "skillEvidence": {"offerCount": 1, "latestOffer": {}}}
        for i in range(10)
    ]
    response = await _by_skill(monkeypatch, space_key="ws-1", found=found)
    assert len(response.candidates) == 10
    paid["fantastic_jobs"].assert_not_called()
    assert "freshFill" not in response.query["skillSearch"]
