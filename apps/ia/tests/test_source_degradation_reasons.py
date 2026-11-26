"""Every swallowed source must say WHY it went quiet.

The data-source modules are deliberately fault-tolerant — they log and return
``[]`` / ``None`` so one dead provider never kills an analysis. But because the
exception died inside the module, the run could only ever report "aucun
résultat", which reads identically to a company that genuinely has no IT job
posting, no BODACC event, no public tender. "France Travail's OAuth call was
refused" and "cette entreprise ne recrute pas" are opposite facts and the user
was shown neither.

These tests pin the seam: each module records the REAL cause into the run's
source-health registry before degrading, and every source name it can emit has a
French user-facing template on the other end (a name without one is dropped by
``_warnings_from_health`` — recorded and then silently thrown away).
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.middleware.correlation_id import _correlation_id as correlation_id_var
from app.services import source_health as registry

CID = "cid-degradation-reasons"


@pytest.fixture(autouse=True)
def _run_scope():
    """Each test runs inside its own "run": a correlation id (the modules read it
    off the ContextVar, exactly as in a request) and an empty registry."""
    registry.clear_degradations(CID)
    token = correlation_id_var.set(CID)
    yield
    correlation_id_var.reset(token)
    registry.clear_degradations(CID)


def _reasons(source: str) -> list[str]:
    return [e["reason"] for e in registry.get_degradations(CID) if e["source"] == source]


def _codes(source: str) -> list[str]:
    return [e.get("code", "") for e in registry.get_degradations(CID) if e["source"] == source]


def _raising_client(exc: Exception | None = None) -> AsyncMock:
    boom = exc or httpx.ConnectError("connection refused")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=boom)
    c.post = AsyncMock(side_effect=boom)
    return c


def _status_client(status: int, *, method: str = "get") -> AsyncMock:
    resp = httpx.Response(status, json={}, request=httpx.Request(method.upper(), "https://x"))
    c = AsyncMock(spec=httpx.AsyncClient)
    setattr(c, method, AsyncMock(return_value=resp))
    return c


# ── Phase 1 research steps ───────────────────────────────────────────────────


async def test_brave_records_the_real_error_not_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    """A missing BRAVE_API_KEY used to surface as "0 hit" — indistinguishable
    from a company nobody writes about."""
    from app.services.research import brave

    monkeypatch.setattr(brave, "brave_search", AsyncMock(side_effect=RuntimeError("BRAVE_API_KEY manquante")))

    assert await brave.research_brave("Doctolib", {}) == []
    assert any("BRAVE_API_KEY" in r for r in _reasons("brave"))


async def test_brave_quota_exhausted_402_is_classed_apart(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2528/#2529 — a 402 (quota épuisé) must NOT read as "0 hit" the way a
    company nobody writes about does: it is classed under
    ``DegradeReason.QUOTA_EXCEEDED``, the same vocabulary Pappers already uses
    for its own 402, and collapses to ONE entry per run (every query 402s)."""
    import app.services.brave_search as brave_search_module
    from app.services.company_filters import DegradeReason

    monkeypatch.setenv("BRAVE_API_KEY", "k")
    client = _status_client(402)

    hits = await brave_search_module.search("Quota Épuisé SA", {}, http_client=client)

    assert hits == []
    assert _codes("brave") == [DegradeReason.QUOTA_EXCEEDED]
    assert len(_reasons("brave")) == 1  # collapsed, not one line per query


async def test_pappers_name_search_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.research import pappers

    monkeypatch.setattr(pappers, "search_company", AsyncMock(side_effect=RuntimeError("503 Pappers")))

    assert await pappers.research_pappers("Doctolib") is None
    assert any("503" in r for r in _reasons("pappers"))


async def test_pappers_scope_lock_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    """The user pinned a SIREN and we still lost it — worth naming separately
    from a name-search miss."""
    from app.services.research import pappers

    monkeypatch.setattr(pappers, "get_company", AsyncMock(side_effect=RuntimeError("402 credits")))
    monkeypatch.setattr(pappers, "search_company", AsyncMock(side_effect=RuntimeError("503")))

    assert await pappers.research_pappers("Doctolib", siren="123456789") is None
    assert any("402 credits" in r for r in _reasons("pappers"))


async def test_pappers_fallback_get_company_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.research import pappers

    monkeypatch.setattr(pappers, "find_siren_in_bundle", lambda *_: "123456789")
    monkeypatch.setattr(pappers, "get_company", AsyncMock(side_effect=RuntimeError("timeout")))

    assert await pappers.resolve_pappers_via_web_or_bundle("Doctolib", []) is None
    assert any("timeout" in r for r in _reasons("pappers"))


async def test_siren_web_search_failure_is_recorded() -> None:
    """Losing the SIREN drops legalSignals / registryAnnuaire / beneficialOwners
    wholesale — the single most expensive silent loss in phase 1."""
    from app.services.research.siren_finder import find_siren_via_web

    async def search_fn(_query: str) -> list[str]:
        raise RuntimeError("Brave 429")

    async def scrape_fn(_url: str) -> str | None:
        return None

    assert await find_siren_via_web("Doctolib", search_fn=search_fn, scrape_fn=scrape_fn) is None
    assert any("429" in r for r in _reasons("pappers"))


async def test_siren_scrape_failure_is_recorded() -> None:
    from app.services.research.siren_finder import find_siren_via_web

    async def search_fn(_query: str) -> list[str]:
        return ["https://www.doctolib.fr/mentions-legales"]

    async def scrape_fn(_url: str) -> str | None:
        raise RuntimeError("Firecrawl 402")

    assert await find_siren_via_web("Doctolib", search_fn=search_fn, scrape_fn=scrape_fn) is None
    assert any("402" in r for r in _reasons("pappers"))


# ── Data Gateway ─────────────────────────────────────────────────────────────


async def test_gateway_waterfall_names_the_provider_that_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    """The per-provider ``continue`` made phase 1's instrumented handler
    unreachable: the gateway never raised, so nothing was ever recorded."""
    from app.services import data_gateway

    monkeypatch.setenv("SERPER_API_KEY", "k")
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    monkeypatch.setattr(data_gateway, "serper_search", AsyncMock(side_effect=RuntimeError("401 unauthorized")))

    assert await data_gateway.DataGateway().search("Doctolib") == []
    reasons = _reasons("data_gateway")
    assert any("serper" in r and "401" in r for r in reasons)


async def test_serper_status_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    """Serper swallows its own non-2xx, so the gateway sees an empty list, not an
    error — the module itself has to speak up."""
    from app.services.data_sources.serper import serper_search

    monkeypatch.setenv("SERPER_API_KEY", "k")

    assert await serper_search("Doctolib", client=_status_client(403, method="post")) == []
    assert any("403" in r for r in _reasons("data_gateway"))


async def test_tavily_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.data_sources.tavily import tavily_search

    monkeypatch.setenv("TAVILY_API_KEY", "k")

    assert await tavily_search("Doctolib", client=_raising_client()) == []
    assert any("tavily" in r.lower() for r in _reasons("data_gateway"))


async def test_gateway_fr_signals_name_each_failed_source(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import data_gateway

    monkeypatch.setattr(data_gateway, "fetch_company", AsyncMock(side_effect=RuntimeError("registre HS")))
    monkeypatch.setattr(data_gateway, "public_tenders", AsyncMock(side_effect=RuntimeError("BOAMP HS")))
    monkeypatch.setattr(data_gateway, "it_job_signals", AsyncMock(side_effect=RuntimeError("FT HS")))
    monkeypatch.setattr(data_gateway, "it_job_signals_apec", AsyncMock(return_value=[]))
    monkeypatch.setattr(data_gateway, "it_job_signals_wttj", AsyncMock(return_value=[]))
    monkeypatch.setattr(data_gateway, "legal_signals", AsyncMock(side_effect=RuntimeError("BODACC HS")))

    out = await data_gateway.DataGateway().collect_fr_signals("Doctolib", siren="123456789")

    assert out["registry"] is None and out["tenders"] == [] and out["legalSignals"] == []
    assert any("registre HS" in r for r in _reasons("recherche_entreprises"))
    assert any("BOAMP HS" in r for r in _reasons("boamp"))
    assert any("FT HS" in r for r in _reasons("france_travail"))
    assert any("BODACC HS" in r for r in _reasons("bodacc"))


# ── Dated-signal sources ─────────────────────────────────────────────────────


async def test_france_travail_token_failure_is_distinguishable(monkeypatch: pytest.MonkeyPatch) -> None:
    """"L'OAuth France Travail a été refusé" vs "cette entreprise ne recrute
    pas" — the whole point of the exercise."""
    from app.services.data_sources.france_travail import it_job_signals

    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")

    assert await it_job_signals("Doctolib", client=_raising_client()) == []
    reasons = _reasons("france_travail")
    assert any("token" in r.lower() or "oauth" in r.lower() for r in reasons)


async def test_apec_status_failure_is_recorded() -> None:
    from app.services.data_sources.apec import it_job_signals_apec

    assert await it_job_signals_apec("Doctolib", client=_status_client(500, method="post")) == []
    assert any("500" in r for r in _reasons("apec"))


async def test_wttj_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.data_sources.wttj import it_job_signals_wttj

    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "app")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "key")

    assert await it_job_signals_wttj("Doctolib", client=_raising_client()) == []
    assert _reasons("welcome_to_the_jungle")


async def test_brave_news_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.data_sources.brave_news import recent_news

    monkeypatch.setenv("BRAVE_API_KEY", "k")

    assert await recent_news("Doctolib", client=_raising_client()) == []
    assert _reasons("brave_news")


async def test_brave_news_quota_exhausted_402_is_classed_apart(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2528/#2529 — same classification as the web-search lane: a 402 here is
    a quota, never confused with "cette entreprise n'a pas d'actualité"."""
    from app.services.company_filters import DegradeReason
    from app.services.data_sources.brave_news import recent_news

    monkeypatch.setenv("BRAVE_API_KEY", "k")
    req = httpx.Request("GET", "https://api.search.brave.com/res/v1/news/search")
    resp = httpx.Response(402, request=req)
    exc = httpx.HTTPStatusError("402 Payment Required", request=req, response=resp)

    assert await recent_news("Quota Épuisé News SA", client=_raising_client(exc)) == []
    assert _codes("brave_news") == [DegradeReason.QUOTA_EXCEEDED]


async def test_bodacc_failure_is_recorded() -> None:
    from app.services.data_sources.bodacc import legal_signals

    assert await legal_signals("123456789", client=_raising_client()) == []
    assert _reasons("bodacc")


async def test_boamp_failure_is_recorded() -> None:
    from app.services.data_sources.public_tenders import public_tenders

    assert await public_tenders("Doctolib", client=_raising_client()) == []
    assert _reasons("boamp")


async def test_decp_failure_is_recorded() -> None:
    from app.services.data_sources.decp import awarded_it_contracts

    assert await awarded_it_contracts("Doctolib", client=_raising_client()) == []
    assert _reasons("decp")


# ── Registry / tech sources ──────────────────────────────────────────────────


async def test_recherche_entreprises_failure_is_recorded() -> None:
    from app.services.data_sources.recherche_entreprises import fetch_company

    assert await fetch_company("Doctolib", client=_raising_client()) is None
    assert _reasons("recherche_entreprises")


async def test_inpi_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.data_sources.inpi_rne import beneficial_owners

    monkeypatch.setenv("INPI_USERNAME", "u")
    monkeypatch.setenv("INPI_PASSWORD", "p")

    assert await beneficial_owners("123456789", client=_raising_client()) == []
    assert _reasons("inpi")


async def test_github_rate_limit_is_recorded() -> None:
    """403 is the anon-quota wall, not "cette société n'a pas de GitHub"."""
    from app.services.data_sources.github_org import org_tech_signals

    assert await org_tech_signals("Doctolib", client=_status_client(403)) is None
    assert any("403" in r for r in _reasons("github"))


async def test_tech_detect_failure_is_recorded() -> None:
    from app.services.data_sources.tech_detect import detect_stack

    assert await detect_stack("https://www.doctolib.fr", client=_raising_client()) == []
    assert _reasons("tech_detect")


async def test_insee_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.insee_sirene import search_unites_legales

    monkeypatch.setenv("INSEE_API_KEY", "k")

    assert await search_unites_legales("Doctolib", client=_raising_client()) == []
    assert _reasons("insee")


# ── Contacts & knowledge ─────────────────────────────────────────────────────


async def test_apollo_plan_error_is_structural_not_transient(monkeypatch: pytest.MonkeyPatch) -> None:
    """A plan that can't People-Match at all is a subscription problem the user
    must act on — it deserves its own message, not "réessayez"."""
    import app.services.contact_enrich as ce
    from app.services.apollo import ApolloPlanError

    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=ApolloPlanError("no plan")))

    await ce.enrich_top_deciders([{"fullName": "Alice", "priority": 1}], "Doctolib")

    assert _reasons("apollo_plan")
    assert _reasons("apollo_enrich") == []


async def test_apollo_transient_error_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.contact_enrich as ce

    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=RuntimeError("502 bad gateway")))

    await ce.enrich_top_deciders([{"fullName": "Alice", "priority": 1}], "Doctolib")

    assert any("502" in r for r in _reasons("apollo_enrich"))
    assert _reasons("apollo_plan") == []


async def test_rag_retrieval_failure_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    """The user's OWN uploaded documents vanishing from the plan, silently, is
    the least defensible degradation of the lot."""
    from app.services import rag_service

    monkeypatch.setattr(rag_service, "query", AsyncMock(side_effect=RuntimeError("pgvector down")))

    assert await rag_service.retrieve_knowledge_docs("offre data", "user-1") == []
    assert any("pgvector" in r for r in _reasons("rag_documents"))


# ── The other half of the contract ───────────────────────────────────────────


def test_every_instrumented_source_has_a_user_facing_template() -> None:
    """``_warnings_from_health`` drops any source with no template, so an
    instrumented module without one is recorded and then thrown away — the exact
    silence this whole change exists to remove."""
    from app.routers.phase1_research import _WARNING_TEMPLATES

    instrumented = {
        "brave", "firecrawl", "pappers", "brave_news", "france_travail", "apec",
        "welcome_to_the_jungle", "bodacc", "boamp", "decp", "data_gateway",
        "recherche_entreprises", "inpi", "github", "tech_detect", "insee",
        "apollo_enrich", "apollo_plan", "rag_documents",
    }
    assert instrumented <= set(_WARNING_TEMPLATES)
