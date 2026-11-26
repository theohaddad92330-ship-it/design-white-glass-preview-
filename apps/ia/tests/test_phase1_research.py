from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from instructor.exceptions import InstructorRetryException
from pydantic import ValidationError

from app.models.outputs.research import (
    Angle,
    BudgetSignal,
    Competitor,
    EsnSynergy,
    ItChallenge,
    LinkedinSearchKeywords,
    Pain,
    PersonMentioned,
    RdvScript,
    RecentSignal,
    ResearchFacts,
    ResearchSignals,
    ResearchStrategy,
)
from app.services.claude_service import TokenUsage as ClaudeTokenUsage
from app.services.firecrawl import (
    ERROR_CODE_INSUFFICIENT_CREDITS,
    FirecrawlScrapeError,
)
from app.services.pappers import (
    CompanyProfile,
    Executive,
    HeadquartersAddress,
    RelatedCompany,
)
from app.services.homonym_disambiguation import HomonymResolution
from app.services.research import ResearchBundle, ResearchSource, SourceCategory

MOCK_BRAVE_RESULTS = [
    {
        "title": "SNCF stratégie IT",
        "description": "...",
        "url": "https://example.com/1",
        "query": "SNCF stratégie",
        "category": SourceCategory.PROJECT,
    },
    {
        "title": "SNCF DSI",
        "description": "...",
        "url": "https://example.com/2",
        "query": "SNCF DSI",
        "category": SourceCategory.PRESS,
    },
]

MOCK_BUNDLE_WITH_CONTENT = ResearchBundle(
    sources=[
        ResearchSource(
            url="https://example.com/1",
            title="SNCF stratégie IT",
            category=SourceCategory.PROJECT,
            snippet="...",
            scraped_markdown="# Mock scraped content",
            scrape_status="ok",
        )
    ]
)

MOCK_PROFILE = CompanyProfile(
    siren="552049447",
    legal_name="SNCF",
    legal_form="SA",
    capital=5_000_000_000,
    creation_date="1937-01-01",
    naf_code="4910Z",
    naf_label="Transport ferroviaire",
    activity_label="4910Z - Transport ferroviaire",
    headcount_label="100 000+",
    revenue_latest=35_000_000_000,
    headquarters=HeadquartersAddress(
        address_line_1="2 Place aux Etoiles",
        postal_code="93200",
        city="Saint-Denis",
    ),
    executives=[Executive(last_name="Farandou", first_name="Jean-Pierre", role="PDG")],
    branch_count=0,
)

MOCK_SCRAPED_CONTENT = "# SNCF\nContenu scrapé..."


def _facts() -> tuple[ResearchFacts, dict]:
    return (
        ResearchFacts(
            business_description="Groupe ferroviaire français",
            sector="Transport",
            employees="150 000",
            revenue="33 Md€",
            headquarters="Saint-Denis",
            website="https://sncf.com",
            priority_score=7,
            priority_justification="Grand compte avec besoins IT importants",
        ),
        ClaudeTokenUsage(input_tokens=100, output_tokens=500, model="claude-sonnet-4-6", cost_usd=0.01),
    )


def _signals() -> tuple[ResearchSignals, dict]:
    return (
        ResearchSignals(
            budget_signals=[BudgetSignal(signal="Recrutement data engineers")],
            recent_signals=[RecentSignal(signal="Recrutement data", source="web", type="recrutement", date="2024")],
            competitors=[Competitor(name="Capgemini")],
            esn_synergies=[EsnSynergy(name="Reference RATP", certainty="forte")],
            people_mentioned=[PersonMentioned(name="Jean Farandou", title="PDG")],
            linkedin_search_keywords=LinkedinSearchKeywords(generic=["DSI SNCF"]),
            organigramme_logic="DSI groupe centralisé.",
        ),
        ClaudeTokenUsage(input_tokens=100, output_tokens=500, model="claude-sonnet-4-6", cost_usd=0.01),
    )


def _strategy() -> tuple[ResearchStrategy, dict]:
    return (
        ResearchStrategy(
            it_challenges=[ItChallenge(title="Modernisation SI", description="Legacy à migrer")],
            pains=[Pain(pain="Dette technique")],
            angles=[Angle(title="Data engineering")],
            comment_ouvrir_compte="Approche par la BU Voyageurs.",
            rdv_script=RdvScript(opening="Bonjour, suite à votre nomination..."),
            power_questions=["Comment gérez-vous le legacy?"],
            objections=[],
        ),
        ClaudeTokenUsage(input_tokens=100, output_tokens=500, model="claude-sonnet-4-6", cost_usd=0.01),
    )


def _claude_side_effect(facts_result, signals_result, strategy_result):
    """Dispatch the mocked call_claude based on `prompt_name` kwarg."""

    async def side_effect(*_args, **kwargs):
        prompt_name = kwargs.get("prompt_name")
        if prompt_name == "bellum_facts":
            return facts_result
        if prompt_name == "bellum_signals":
            return signals_result
        if prompt_name == "bellum_strategy":
            return strategy_result
        raise AssertionError(f"unexpected prompt_name: {prompt_name}")

    return side_effect


def test_phase1_research_200_with_pappers_subsidiaries(client: TestClient) -> None:
    """Regression (A1): a company whose Pappers profile carries subsidiaries
    (objects, not strings) must return 200 — not a raw 500 from contract
    validation. Reproduces the bug seen on Société Générale / Decathlon / Doctolib.
    """
    profile = MOCK_PROFILE.model_copy(
        update={
            "subsidiaries": [
                RelatedCompany(id="1", siren="111111111", name="Filiale A"),
                RelatedCompany(id="2", siren="222222222", name="Filiale B"),
            ]
        }
    )
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=profile),
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
    ):
        res = client.post("/phase/1/research", json={"company_name": "Société Générale"})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] in ("success", "partial_success")
    subs = body["data"]["subsidiaries"]
    assert len(subs) == 2
    assert {s["name"] for s in subs} == {"Filiale A", "Filiale B"}


def test_phase1_research_filters_legal_noise_from_subsidiaries(client: TestClient) -> None:
    """The Pappers graph dumps SCI / holdings / GIE noise — the research output
    must surface a `meaningfulSubsidiaries` view + an honest filtered count, so
    SG shows operating entities, not "98 filiales dont des SCI"."""
    profile = MOCK_PROFILE.model_copy(
        update={
            "subsidiaries": [
                RelatedCompany(id="1", siren="351497239", name="BOURSORAMA"),
                RelatedCompany(id="2", siren="472500503", name="SOCIÉTÉ DE BOURSE GILBERT DUPONT"),
                RelatedCompany(id="3", siren="300000001", name="SCI SAINT-PÈRES"),
                RelatedCompany(id="4", siren="300000002", name="SG HOLDING FONCIÈRE"),
                RelatedCompany(id="5", siren="300000003", name="GIE COMMERC C C BOIS ST PERES"),
            ]
        }
    )
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=profile),
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
    ):
        res = client.post("/phase/1/research", json={"company_name": "Société Générale"})

    assert res.status_code == 200, res.text
    data = res.json()["data"]
    # Raw list preserved (legal traceability) but annotated.
    assert len(data["subsidiaries"]) == 5
    # Operating-only view drops the 3 noise vehicles.
    meaningful = {s["name"] for s in data["meaningfulSubsidiaries"]}
    assert meaningful == {"BOURSORAMA", "SOCIÉTÉ DE BOURSE GILBERT DUPONT"}
    assert data["subsidiariesSummary"] == {
        "total": 5,
        "meaningful": 2,
        "filtered": 3,
        "filteredReasons": data["subsidiariesSummary"]["filteredReasons"],
    }
    assert sum(data["subsidiariesSummary"]["filteredReasons"].values()) == 3


def test_phase1_research_meta_carries_summed_cost(client: TestClient) -> None:
    """B1 telemetry: the envelope meta must report the phase's total token cost
    (sum of the 3 parallel Claude calls), so the API worker can accumulate it
    into ``api_cost_euros`` instead of throwing the usage away."""
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
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200
    usage = res.json()["meta"]["token_usage"]
    # 3 calls × (100 in / 500 out / $0.01)
    assert usage["input_tokens"] == 300
    assert usage["output_tokens"] == 1500
    assert usage["cost_usd"] == pytest.approx(0.03)


def test_phase1_research_includes_confidence_score(client: TestClient) -> None:
    """B4: the research data carries a computed confidence block (score, tier,
    objective factors) — derived, never asked to the LLM."""
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
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200
    conf = res.json()["data"]["confidence"]
    assert 0 <= conf["score"] <= 100
    assert conf["tier"] in ("low", "medium", "high")
    # SIREN present + brave + firecrawl → legal grounding + full source coverage.
    assert conf["factors"]["legal_grounding"] == 1.0
    assert conf["factors"]["source_coverage"] == 1.0


def test_phase1_research_includes_source_attribution(client: TestClient) -> None:
    """B3: the research data carries a `sources` block — registry of everything
    consulted + hard Pappers citations on the facts we can legally prove."""
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
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200
    sources = res.json()["data"]["sources"]
    # Pappers SIREN anchors the registry + the firmographic facts.
    assert sources["facts"]["siren"] == ["pappers:552049447"]
    assert sources["facts"]["revenue"] == ["pappers:552049447"]
    assert sources["coverage"]["legal_citations"] >= 1
    assert any(r["provider"] == "pappers" for r in sources["registry"])
    assert sources["coverage"]["registry_size"] >= 1


def test_phase1_research_runs_three_prompts_in_parallel(client: TestClient) -> None:
    """Phase 1 calls bellum_facts + bellum_signals + bellum_strategy in parallel and merges."""
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
        ) as mock_claude,
    ):
        res = client.post(
            "/phase/1/research",
            json={"company_name": "SNCF", "profile_data": {"companyName": "MyESN", "size": "50"}},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("success", "partial_success")
    data = body["data"]

    # Three Claude calls fired in parallel
    assert mock_claude.call_count == 3
    prompt_names = {call.kwargs.get("prompt_name") for call in mock_claude.call_args_list}
    assert prompt_names == {"bellum_facts", "bellum_signals", "bellum_strategy"}

    # Priority-zone tiering is applied to the entity org map (deck cartography).
    assert "entityTierCounts" in data
    assert set(data["entityTierCounts"]) == {"P1", "P2", "P3"}
    # Influence × accessibility matrix (deck's 4 zones) surfaces alongside tiers.
    assert set(data["entityZones"]) == {
        "attaque_immediate", "influence_a_activer", "quick_win", "longue_traine",
    }

    # Facts merged
    assert data["businessDescription"] == "Groupe ferroviaire français"
    assert data["priorityScore"] == 7

    # Signals merged
    assert data["recentSignals"][0]["signal"] == "Recrutement data"
    assert data["competitors"][0]["name"] == "Capgemini"
    assert data["organigrammeLogic"] == "DSI groupe centralisé."

    # Strategy merged
    assert data["itChallenges"][0]["title"] == "Modernisation SI"
    assert data["angles"][0]["title"] == "Data engineering"

    # Pappers as source of truth — revenue stringified, headquarters rendered
    # as a clean one-liner string (structured fields live in
    # `headquarters_address`), sector from NAF label.
    assert data["revenue"] == "35000000000"
    assert data["employees"] == "100 000+"
    assert data["sector"] == "Transport ferroviaire"
    assert data["siren"] == "552049447"
    assert data["headquarters"] == "2 Place aux Etoiles, 93200, Saint-Denis, France"
    assert data["headquarters_address"]["city"] == "Saint-Denis"
    assert data["headquarters_address"]["postal_code"] == "93200"
    assert data["executives"][0]["last_name"] == "Farandou"
    assert data["legal_form"] == "SA"
    assert data["activity_label"] == "4910Z - Transport ferroviaire"


def test_phase1_research_continues_without_brave(client: TestClient) -> None:
    """Brave failure should not crash the pipeline."""
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch("app.routers.phase1_research.research_firecrawl", new_callable=AsyncMock, return_value=ResearchBundle()),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200


def test_phase1_research_continues_without_pappers(client: TestClient) -> None:
    """Pappers failure should not crash the pipeline. Facts revenue is kept."""
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=None),
        # The SIREN fallback also finds nothing — stub it (no real Brave/Firecrawl).
        patch(
            "app.routers.phase1_research.resolve_pappers_via_web_or_bundle",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch("app.routers.phase1_research.research_firecrawl", new_callable=AsyncMock, return_value=ResearchBundle()),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200
    # Facts revenue not overwritten by Pappers (it failed)
    assert res.json()["data"]["revenue"] == "33 Md€"


def test_phase1_research_names_official_site_source_when_siren_came_from_the_web_fallback(
    client: TestClient,
) -> None:
    """#2284.22 — quand le nom-recherche Pappers échoue mais le repli SIREN
    web/bundle (mentions légales, hôte = nom de l'entreprise) réussit,
    l'entité résolue porte la source ``official_site`` — jamais quand Pappers
    résout directement par nom (voir les autres tests de ce fichier)."""
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=None),
        patch(
            "app.routers.phase1_research.resolve_pappers_via_web_or_bundle",
            new_callable=AsyncMock,
            return_value=MOCK_PROFILE,
        ),
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
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200, res.text
    assert "official_site" in res.json()["data"]["entity_resolution"]["sources"]


def test_phase1_research_degrades_on_firecrawl_terminal_error(client: TestClient) -> None:
    """B5 degraded mode: a terminal Firecrawl error (credits / auth / rate
    limit) no longer kills the analysis. It continues on Brave + Pappers,
    flags firecrawl 'down' with a warning, and returns partial_success —
    never a 402."""
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            side_effect=FirecrawlScrapeError(
                ERROR_CODE_INSUFFICIENT_CREDITS,
                url="https://example.com/page",
                details="Insufficient credits",
            ),
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "partial_success"
    assert body["meta"]["source_health"]["firecrawl"] == "down"
    codes = {w["code"] for w in body["meta"]["warnings"]}
    assert any("FIRECRAWL" in c for c in codes)


def test_phase1_research_returns_502_on_claude_failure(client: TestClient) -> None:
    """Any of the 3 prompts failing should propagate as 502.

    Pappers is stubbed with a real profile so the run has grounding and
    actually REACHES Claude — with all three primary sources empty the
    grounding gate now stops the run first (see the 424 test below), and this
    case would never exercise the Claude path it is here to cover.
    """
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch("app.routers.phase1_research.research_firecrawl", new_callable=AsyncMock, return_value=ResearchBundle()),
        patch("app.routers.phase1_research.call_claude", new_callable=AsyncMock, side_effect=ValueError("Claude API error")),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 502


def test_phase1_research_fails_explicitly_when_no_source_responds(client: TestClient) -> None:
    """Zero grounding must NOT produce a dossier.

    With Brave, Firecrawl and Pappers all empty the prompts would run on a bare
    company name and Claude would answer from training recall. The run stops
    before that, and the error names the dead providers so the user knows a key
    needs recharging.
    """
    claude = AsyncMock()
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=None),
        patch("app.routers.phase1_research.research_firecrawl", new_callable=AsyncMock, return_value=ResearchBundle()),
        patch("app.routers.phase1_research.call_claude", claude),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 424, res.text
    body = res.json()
    assert body["status"] == "recoverable_failure"
    # No dossier is emitted — the envelope carries the error, never partial data.
    assert body.get("data") is None
    assert body["error"]["code"] == "RESEARCH_NO_GROUNDING"
    assert body["error"]["retryable"] is True
    # The message names the NATURE of the dead sources — that is what makes it
    # actionable — never the fournisseur (#4074.2, 13/10 : Brave/Firecrawl
    # oubliés du lot NOMMAGE du 12/10, corrigés ici).
    for nature in ("la recherche web", "le contenu des sites", "le registre légal"):
        assert nature in body["error"]["user_message"]
    for brand in ("Brave", "Firecrawl", "Pappers"):
        assert brand not in body["error"]["user_message"]
    assert body["error"]["context"]["down_sources"] == ["brave", "firecrawl", "pappers"]
    # And we never paid Claude to hallucinate a dossier out of nothing.
    claude.assert_not_awaited()


def test_free_registry_alone_grounds_the_run(client: TestClient) -> None:
    """#1107/#1108/#1109 — PREVOIR : trois analyses de suite refusées.

    Pappers était à sec (401 sur chaque appel — l'état que ``research_grounding``
    décrit lui-même comme LIVE en production) et la recherche web n'a rien
    rendu. Mais `recherche-entreprises`, libre et sans clé, connaît parfaitement
    « PREVOIR VIE GROUPE PREVOIR » : la désambiguïsation d'homonymes avait
    résolu son SIREN, et le plancher l'ignorait parce qu'il ne lisait que le
    profil Pappers. Une identité légale résolue EST une preuve.
    """
    resolution = HomonymResolution(status="unique", selectedSiren="343286183", confidence=0.9)
    claude = AsyncMock(return_value="{}")
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=None),
        patch(
            "app.routers.phase1_research.resolve_pappers_via_web_or_bundle",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "app.routers.phase1_research.resolve_company_identity",
            new_callable=AsyncMock,
            return_value=resolution,
        ),
        patch("app.routers.phase1_research.research_firecrawl", new_callable=AsyncMock, return_value=ResearchBundle()),
        patch("app.routers.phase1_research.call_claude", claude),
    ):
        res = client.post("/phase/1/research", json={"company_name": "PREVOIR"})

    # Le run n'est plus REFUSÉ. Le dossier est mince — il le dit par ailleurs via
    # ``source_health`` — mais il est fondé sur une identité réellement lue.
    assert res.status_code != 424, res.text
    assert (res.json().get("error") or {}).get("code") != "RESEARCH_NO_GROUNDING"


def test_grounding_refusal_does_not_blame_firecrawl_when_it_had_no_url(client: TestClient) -> None:
    """Sans hit web, Firecrawl n'a AUCUNE URL à lire : le nommer parmi les
    quotas à vérifier envoie chercher une panne dans une clé jamais appelée.
    C'est ce que le testeur a lu — « réseau et/ou lien KO »."""
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=None),
        patch("app.routers.phase1_research.research_firecrawl", new_callable=AsyncMock, return_value=ResearchBundle()),
        patch("app.routers.phase1_research.call_claude", AsyncMock()),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 424, res.text
    message = res.json()["error"]["user_message"]
    assert "aucune URL à lire" in message
    assert "Firecrawl (contenu des sites)" not in message.split("Vérifiez")[-1]


# ── IA v2 Data Gateway wiring (ADDITIVE, always-on) ───────────────────────────


def test_phase1_data_gateway_empty_search_adds_nothing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Always-on but graceful: when the gateway search yields nothing (e.g. no
    search-provider key present), the web block is unchanged — the gateway is
    constructed/queried but appends no extra hit."""
    fake_gateway = AsyncMock()
    fake_gateway.search = AsyncMock(return_value=[])
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
        ) as mock_claude,
        patch("app.routers.phase1_research.get_data_gateway", return_value=fake_gateway) as mock_gw,
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200
    mock_gw.assert_called_once()  # always-on: the gateway is constructed + queried
    fake_gateway.search.assert_awaited_once()
    # No extra hit → the original Brave hits still reach the prompt unchanged.
    user_prompts = " ".join(str(c.args[1]) for c in mock_claude.call_args_list if len(c.args) > 1)
    assert "https://example.com/1" in user_prompts


def test_phase1_data_gateway_enriches_web_block(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Keys present (gateway returns hits): the extra hits are APPENDED to the web
    block fed to the prompts (existing Brave hits preserved)."""
    extra_url = "https://serper.example/extra-hit"
    fake_gateway = AsyncMock()
    fake_gateway.search = AsyncMock(
        return_value=[{"title": "Extra", "url": extra_url, "description": "gw hit", "source": "serper"}]
    )
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch("app.routers.phase1_research.get_data_gateway", return_value=fake_gateway) as mock_gw,
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ) as mock_claude,
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200
    mock_gw.assert_called_once()
    fake_gateway.search.assert_awaited_once()
    # The extra hit reached the prompt (the facts user prompt carries the web block),
    # and the original Brave hits are still there (additive, not replaced).
    user_prompts = " ".join(str(c.args[1]) for c in mock_claude.call_args_list if len(c.args) > 1)
    assert extra_url in user_prompts
    assert "https://example.com/1" in user_prompts


# ── Grounding v2 (always-on) ──────────────────────────────────────────────────


def test_phase1_research_grounding_nothing_to_ground_adds_no_key(client: TestClient, monkeypatch) -> None:
    """Always-on but graceful: when ``ground_facts_v2`` finds nothing to ground it
    returns ``(None, None)`` and NO ``grounding`` key is attached (output
    unchanged). The pass still runs (always-on)."""
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
        patch(
            "app.routers.phase1_research.ground_facts_v2",
            new_callable=AsyncMock,
            return_value=(None, None),
        ) as mock_ground,
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200
    data = res.json()["data"]
    mock_ground.assert_awaited_once()  # always-on: the grounding pass runs
    assert "grounding" not in data  # nothing to ground → no key added
    # The existing derived confidence + sources blocks are unaffected.
    assert "confidence" in data
    assert "sources" in data


def test_phase1_research_grounding_attaches_refs_kpi_and_cost(client: TestClient, monkeypatch) -> None:
    """When grounding produces refs: the additive ``grounding`` block (per-fact
    sourceRefs + the '<5% facts non-sourced' KPI) is attached, and its Anthropic
    cost folds into the phase token usage on the envelope meta. Confidence stays
    present."""
    canned = {
        "flag": "GROUNDING_V2",
        "sourceRefs": {"revenue": [{"citedText": "CA 300M€", "documentTitle": "src", "documentIndex": 0}]},
        "citations": [{"citedText": "CA 300M€", "documentTitle": "src", "documentIndex": 0}],
        "kpi": {
            "factsConsidered": 4,
            "factsSourced": 4,
            "factsNonSourced": 0,
            "nonSourcedRatio": 0.0,
            "targetMaxNonSourcedRatio": 0.05,
            "kpiMet": True,
        },
    }
    g_usage = ClaudeTokenUsage(input_tokens=50, output_tokens=20, model="claude-sonnet-4-6", cost_usd=0.005)
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
        patch(
            "app.routers.phase1_research.ground_facts_v2",
            new_callable=AsyncMock,
            return_value=(canned, g_usage),
        ),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200
    data = res.json()["data"]
    assert data["grounding"]["kpi"]["kpiMet"] is True
    assert data["grounding"]["kpi"]["nonSourcedRatio"] == 0.0
    assert data["grounding"]["sourceRefs"]["revenue"][0]["citedText"] == "CA 300M€"
    # Grounding is purely additive — the derived confidence block is still there.
    assert "confidence" in data
    # Cost folds in: 3×(100 in / 500 out / $0.01) + (50 / 20 / $0.005).
    usage = res.json()["meta"]["token_usage"]
    assert usage["input_tokens"] == 350
    assert usage["output_tokens"] == 1520
    assert usage["cost_usd"] == pytest.approx(0.035)


# ── Kanban → relationship state (annexe méthodo p6) ───────────────────────────


def _research_with(client: TestClient, body: dict) -> dict:
    """Run the phase-1 endpoint with every paid source mocked, return `data`."""
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
    ):
        res = client.post("/phase/1/research", json=body)
    assert res.status_code == 200
    return res.json()["data"]


def test_kanban_status_reaches_the_relationship_state(client: TestClient) -> None:
    """A compte the rep moved to « Client » in the kanban must NOT be read as
    cold by the opening movement, the action selector and the board guard. The
    mapping existed and was tested; nothing passed the status to phase 1."""
    data = _research_with(client, {"company_name": "SNCF", "commercial_status": "customer"})

    relationship = data["salesContext"]["relationship"]
    assert relationship["state"] == "client_actif"
    assert relationship["derivation"] == "inferred"
    assert relationship["evidence"]  # cites the kanban column it came from


def test_kanban_watching_is_a_known_account(client: TestClient) -> None:
    data = _research_with(client, {"company_name": "SNCF", "commercial_status": "watching"})
    assert data["salesContext"]["relationship"]["state"] == "connu"


def test_no_kanban_status_keeps_the_cold_default(client: TestClient) -> None:
    """Byte-identity guard: absent (and `inbox`, the default column) leave the
    SalesContext exactly as it was before this wiring."""
    without = _research_with(client, {"company_name": "SNCF"})["salesContext"]
    inbox = _research_with(client, {"company_name": "SNCF", "commercial_status": "inbox"})["salesContext"]

    assert without["relationship"]["state"] == "froid"
    assert without["relationship"]["derivation"] == "default"
    assert inbox == without


def test_declared_context_still_outranks_the_kanban(client: TestClient) -> None:
    """The rep's own declaration is certain (100) ; the kanban is only inferred —
    a declared « ancien client » is not overwritten by an `inbox` column."""
    data = _research_with(
        client,
        {
            "company_name": "SNCF",
            "commercial_status": "inbox",
            "user_context": {"preset": "known-account", "commercialStatus": "former"},
        },
    )
    relationship = data["salesContext"]["relationship"]
    assert relationship["state"] == "ancien_client"
    assert relationship["derivation"] == "user_declared"


# ── #2625.1 — l'archétype compte réemploie la catégorie INSEE de Découvrir ────


def test_2625_size_class_reclassifies_account_once_the_registry_resolves(client: TestClient) -> None:
    """Sous 5000 salariés déclarés (le seuil brut du step 4), l'analyse ne
    déclarait jamais le compte trop gros. Une fois le registre résolu,
    `_access_company["sizeClass"]` porte déjà la catégorie INSEE officielle
    (elle croise effectif/CA/bilan) — l'archétype doit la RÉEMPLOYER."""
    low_headcount_profile = CompanyProfile(
        siren="123456789",
        legal_name="Conseil Générique",
        legal_form="SAS",
        capital=1_000_000,
        creation_date="2000-01-01",
        naf_code="7022Z",  # conseil pour les affaires — ne matche aucun archétype NAF
        naf_label="Conseil pour les affaires",
        activity_label="7022Z - Conseil pour les affaires",
        headcount_label="3 000",
        revenue_latest=1_000_000_000,
        headquarters=HeadquartersAddress(address_line_1="1 rue X", postal_code="75001", city="Paris"),
        executives=[],
        branch_count=0,
    )
    low_headcount_facts = (
        ResearchFacts(
            business_description="Société de conseil",
            sector="Conseil",
            employees="3 000",
            revenue="1 Md€",
            headquarters="Paris",
            website="https://example.com",
            priority_score=5,
            priority_justification="x",
        ),
        ClaudeTokenUsage(input_tokens=100, output_tokens=500, model="claude-sonnet-4-6", cost_usd=0.01),
    )
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch(
            "app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=low_headcount_profile
        ),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(low_headcount_facts, _signals(), _strategy()),
        ),
        patch(
            "app.routers.phase1_research.fetch_company",
            new_callable=AsyncMock,
            return_value={"category": "GE", "nafCode": "7022Z"},
        ),
    ):
        res = client.post("/phase/1/research", json={"company_name": "Conseil Générique"})
    assert res.status_code == 200
    account = res.json()["data"]["salesContext"]["account"]
    assert account["archetype"] == "grand_groupe"
    # #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : aucune source ne se nomme.
    assert any("catégorie officielle" in e for e in account["evidence"])


def test_2625_no_registry_category_leaves_the_archetype_unchanged(client: TestClient) -> None:
    """Byte-identity guard : sans catégorie INSEE résolue (`fetch_company` non
    mocké ici — no-op en sandbox), le comportement historique est inchangé —
    aucune reclassification muette. SNCF résout « industrie » par son code
    NAF (4910Z, transport), qui prime de toute façon sur la catégorie INSEE."""
    data = _research_with(client, {"company_name": "SNCF"})
    account = data["salesContext"]["account"]
    assert account["archetype"] == "industrie"


# ── Annuaire officiel : la seconde source de rattachement (audit §1.1) ────────


_GOVERNANCE_BUNDLE = ResearchBundle(
    sources=[
        ResearchSource(
            url="https://sncf.com/groupe/gouvernance",
            title="Gouvernance",
            category=SourceCategory.OFFICIAL,
            snippet="La direction du groupe",
            scraped_markdown="### Nadia Ben Salah\nDirectrice des Systèmes d'Information\n",
            scrape_status="ok",
        ),
        ResearchSource(
            url="https://presse-eco.fr/sncf/gouvernance",
            title="Qui dirige la SNCF",
            category=SourceCategory.PRESS,
            snippet="...",
            scraped_markdown="### Faux Profil\nDirecteur Général\n",
            scrape_status="ok",
        ),
    ]
)


def _run_research(client: TestClient, bundle: ResearchBundle) -> dict:
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch("app.routers.phase1_research.research_firecrawl", new_callable=AsyncMock, return_value=bundle),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})
    assert res.status_code == 200, res.text
    return res.json()["data"]


def test_phase1_collects_the_official_directory_from_the_account_own_site(client: TestClient) -> None:
    """Les pages du site du compte déjà scrapées rendent leurs dirigeants nommés,
    avec l'URL exacte et la date de collecte — la page de presse, non."""
    data = _run_research(client, _GOVERNANCE_BUNDLE)

    directory = data["officialDirectory"]
    assert [p["fullName"] for p in directory] == ["Nadia Ben Salah"]
    assert directory[0]["title"] == "Directrice des Systèmes d'Information"
    assert directory[0]["url"] == "https://sncf.com/groupe/gouvernance"
    assert directory[0]["collectedAt"]  # datée : sans date, pas de fraîcheur p14


def test_phase1_without_a_team_page_produces_an_empty_directory(client: TestClient) -> None:
    """Additif : un compte sans page équipe rend exactement le dossier d'avant."""
    data = _run_research(client, MOCK_BUNDLE_WITH_CONTENT)
    assert data["officialDirectory"] == []


# #3095 — crédit de site fusionné dans `esnPresence`, à côté de ce que le LLM détecte.
_SITE_CREDIT_BUNDLE = ResearchBundle(
    sources=[
        ResearchSource(
            url="https://sncf.com",
            title="SNCF",
            category=SourceCategory.OFFICIAL,
            snippet="...",
            scraped_markdown="# SNCF\n© 2026 SNCF — Site conçu par Alten\n",
            scrape_status="ok",
        ),
    ]
)


def test_phase1_adds_a_site_credited_esn_the_llm_did_not_name(client: TestClient) -> None:
    """`_facts`/`_signals` ne détectent que Capgemini : Alten, présente en crédit
    de pied de page, s'ajoute comme une entrée supplémentaire d'`esnPresence`."""
    data = _run_research(client, _SITE_CREDIT_BUNDLE)
    names = [e["name"] for e in data["esnPresence"]]
    assert "Alten" in names
    alten = next(e for e in data["esnPresence"] if e["name"] == "Alten")
    assert "https://sncf.com" in alten["evidence"]


def test_phase1_merges_a_site_credit_into_the_same_llm_detected_esn(client: TestClient) -> None:
    """Capgemini est à la fois détectée par le LLM (`_facts`) et créditée en pied
    de page : UNE seule entrée, sa preuve s'étend, elle ne se duplique jamais."""
    capgemini_credit_bundle = ResearchBundle(
        sources=[
            ResearchSource(
                url="https://sncf.com",
                title="SNCF",
                category=SourceCategory.OFFICIAL,
                snippet="...",
                scraped_markdown="Site conçu par Capgemini",
                scrape_status="ok",
            ),
        ]
    )
    data = _run_research(client, capgemini_credit_bundle)
    entries = [e for e in data["esnPresence"] if e["name"] == "Capgemini"]
    assert len(entries) == 1
    assert "https://sncf.com" in entries[0]["evidence"]


# ── Le refus de schéma vu depuis la PHASE ─────────────────────────────────────
#
# Le schéma de `ResearchStrategy` refuse désormais une sortie qui ne dit rien
# (voir `tests/test_strategy_schema_refuses_empty.py` pour la contrainte
# elle-même). Ce qui se joue ICI, c'est ce que la phase en FAIT :
#
# - elle ne meurt pas — faits, signaux, contacts et plan ont abouti, et les jeter
#   reviendrait à punir l'utilisateur d'un défaut de forme ;
# - elle ne relance pas une TROISIÈME fois à l'aveugle : `instructor` a déjà
#   renvoyé au modèle le message qui NOMME les sections vides ;
# - le filet historique reste en place pour la sortie vide qui arriverait par un
#   autre chemin.


def _strategy_refusal() -> InstructorRetryException:
    """L'exception exacte qu'`instructor` lève quand ses reasks sont épuisés."""
    with pytest.raises(ValidationError) as caught:
        ResearchStrategy.model_validate({})
    return InstructorRetryException(caught.value, last_completion=None, n_attempts=2, total_usage=0)


def _run_with_strategy(client: TestClient, strategy_result: object) -> tuple[dict, list[str]]:
    """Lance la phase 1 avec `bellum_strategy` remplacé par `strategy_result`
    (une valeur de retour, ou une exception à lever).

    Rend (corps de la réponse, appels `bellum_strategy` réellement passés) — le
    COMPTE est le sujet de deux des tests ci-dessous.
    """
    calls: list[str] = []

    async def side_effect(*_args, **kwargs):
        prompt_name = kwargs.get("prompt_name")
        calls.append(prompt_name)
        if prompt_name == "bellum_facts":
            return _facts()
        if prompt_name == "bellum_signals":
            return _signals()
        if prompt_name == "bellum_strategy":
            if isinstance(strategy_result, BaseException):
                raise strategy_result
            return strategy_result
        raise AssertionError(f"unexpected prompt_name: {prompt_name}")

    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch("app.routers.phase1_research.call_claude", new_callable=AsyncMock, side_effect=side_effect),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})
    assert res.status_code == 200, res.text
    return res.json(), [c for c in calls if c == "bellum_strategy"]


def test_un_refus_de_schema_ne_tue_pas_le_dossier(client: TestClient) -> None:
    """Faits, signaux, contacts et plan ont abouti : le dossier PART, avec son
    avertissement — il ne devient pas un 502."""
    body, _ = _run_with_strategy(client, _strategy_refusal())

    assert body["status"] == "partial_success"
    # Les faits sont bien là (le secteur vient du registre, pas du prompt).
    assert body["data"]["sector"] == "Transport ferroviaire"
    assert body["data"]["businessDescription"] == "Groupe ferroviaire français"
    assert body["data"]["angles"] == []
    assert "STRATEGY_SECTIONS_EMPTY" in {w["code"] for w in body["meta"]["warnings"]}


def test_un_dossier_normal_ne_porte_pas_l_avertissement(client: TestClient) -> None:
    """Le pendant obligatoire du test ci-dessus, et il garde un vrai risque :
    l'avertissement se calcule sur le dossier FUSIONNÉ, après le classement des
    angles. Si une étape aval renommait `title`, le dossier le plus riche du
    monde se mettrait à crier « aucune section stratégique »."""
    body, strategy_calls = _run_with_strategy(client, _strategy())

    assert strategy_calls == ["bellum_strategy"]
    assert "STRATEGY_SECTIONS_EMPTY" not in {w["code"] for w in (body["meta"]["warnings"] or [])}


def test_un_refus_de_schema_ne_declenche_pas_une_relance_aveugle(client: TestClient) -> None:
    """LE gain mesurable. `instructor` a déjà relancé en renvoyant au modèle le
    message qui NOMME les sections vides. Retirer le même prompt à l'identique
    une fois de plus est un appel payant qui n'apporte rien que les précédents
    n'aient déjà tenté — avec moins d'information."""
    _, strategy_calls = _run_with_strategy(client, _strategy_refusal())
    assert strategy_calls == ["bellum_strategy"]


def test_une_sortie_vide_arrivee_autrement_declenche_toujours_la_relance(client: TestClient) -> None:
    """Le filet historique reste : on ne retire pas un garde-fou parce qu'un
    autre couvre le cas qu'on a en tête aujourd'hui."""
    _, strategy_calls = _run_with_strategy(
        client,
        (
            ResearchStrategy.empty(),
            ClaudeTokenUsage(input_tokens=1, output_tokens=1, model="m", cost_usd=0.0),
        ),
    )
    assert strategy_calls == ["bellum_strategy", "bellum_strategy"]


def test_un_echec_claude_qui_n_est_pas_un_refus_reste_un_echec(client: TestClient) -> None:
    """Une garde doit savoir dire NON : une panne réelle ne doit pas se déguiser
    en dossier dégradé."""

    async def side_effect(*_args, **kwargs):
        prompt_name = kwargs.get("prompt_name")
        if prompt_name == "bellum_facts":
            return _facts()
        if prompt_name == "bellum_signals":
            return _signals()
        raise RuntimeError("Anthropic 529 overloaded")

    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch("app.routers.phase1_research.call_claude", new_callable=AsyncMock, side_effect=side_effect),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code >= 400


# ── Le plan de recherche décide RÉELLEMENT les sources interrogées (#2289.1/.2) ──
# Avant le 26/09, `build_research_plan` était construit puis seulement LOGGÉ :
# `tenders_task`/`awarded_task` ne dépendaient que de l'archétype
# (`_collection_plan.run_public_tenders`), jamais de la sélection du plan. Ces
# deux tests changent la SEULE variable qui doit faire la différence — la
# sélection de familles que `OBJECT_TO_FAMILIES` retient pour l'objet "appel
# d'offre" — et observent l'effet réel sur les appels réseau, sans mocker le
# plan lui-même : c'est la vraie fonction, avec sa vraie table, qui décide.


def test_research_plan_still_queries_boamp_and_decp_by_default(client: TestClient) -> None:
    """Non-régression : l'objet "appel d'offre" retient BOAMP + DECP par défaut
    (`OBJECT_TO_FAMILIES` inchangée) — le gate du plan ne retire rien qui
    tournait déjà quand l'archétype les autorise."""
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
        patch("app.routers.phase1_research.public_tenders", new_callable=AsyncMock, return_value=[]) as mock_tenders,
        patch(
            "app.routers.phase1_research.awarded_it_contracts", new_callable=AsyncMock, return_value=[]
        ) as mock_awarded,
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200, res.text
    mock_tenders.assert_awaited_once()
    mock_awarded.assert_awaited_once()


def test_research_plan_selection_is_what_actually_stops_the_query(client: TestClient, monkeypatch) -> None:
    """Rétire "marchés attribués" (DECP) de ce que le plan retient pour l'objet
    "appel d'offre" — même archétype (rien ne change côté `_collection_plan`,
    toujours `run_public_tenders=True` pour un compte FR par défaut) — et
    observe que SEUL DECP s'arrête. C'est la preuve que le plan choisit
    effectivement les sources interrogées, pas seulement l'archétype."""
    from app.services.source_engine import OBJECT_TO_FAMILIES

    monkeypatch.setitem(OBJECT_TO_FAMILIES, "appel d'offre", ("appels d'offres en cours",))

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
        patch("app.routers.phase1_research.public_tenders", new_callable=AsyncMock, return_value=[]) as mock_tenders,
        patch(
            "app.routers.phase1_research.awarded_it_contracts", new_callable=AsyncMock, return_value=[]
        ) as mock_awarded,
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200, res.text
    mock_tenders.assert_awaited_once()  # toujours retenue → toujours interrogée
    mock_awarded.assert_not_awaited()  # retirée du plan → plus jamais interrogée


# ── #2265.14 (épopée #2851) — même badge « intermédiaire » persisté sur le compte ──


def test_2265_14_client_final_carries_no_intermediary_flag(client: TestClient) -> None:
    """SNCF (NAF 4910Z, transport) n'est ni un cabinet de recrutement ni une
    plateforme de mise en relation — le compte ne porte jamais un badge deviné."""
    data = _research_with(client, {"company_name": "SNCF"})
    assert data["isIntermediary"] is False
    assert data["actorType"]


def test_2265_14_recruitment_naf_flags_the_account_as_intermediary(client: TestClient) -> None:
    """Même jugement que /discover (`classify_actor_type`), sur le NAF que
    `AccountsService.applyResearch` persistera ensuite sur `accounts.actor_type`
    / `accounts.is_intermediary`."""
    recruitment_profile = CompanyProfile(
        siren="300000001",
        legal_name="ACME RECRUTEMENT",
        legal_form="SAS",
        capital=10_000,
        creation_date="2010-01-01",
        naf_code="78.10Z",
        naf_label="Activités des agences de placement de main-d'œuvre",
        activity_label="78.10Z - Activités des agences de placement de main-d'œuvre",
        headcount_label="10 à 19",
        revenue_latest=None,
        headquarters=HeadquartersAddress(address_line_1="1 rue X", postal_code="75001", city="Paris"),
        executives=[],
        branch_count=0,
    )
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=recruitment_profile),
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
    ):
        res = client.post("/phase/1/research", json={"company_name": "ACME RECRUTEMENT"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["isIntermediary"] is True
    assert data["actorType"] == "cabinet de recrutement"


def test_phase1_research_names_current_and_thematic_research_steps(client: TestClient) -> None:
    """#2164.5 / #2164.6 — la recherche web du moment et les sources thématiques
    (offres, marchés publics) se disent chacune comme leur PROPRE étape, dans
    l'ordre réel du pipeline : current_research → crosscheck → thematic_research
    → account_sheet."""
    steps: list[str] = []

    async def _record(_cb, _phase, step, *_a, **_k):
        steps.append(step)

    with (
        patch("app.routers.phase1_research.emit_progress", side_effect=_record),
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
    ):
        res = client.post("/phase/1/research", json={"company_name": "Société Générale"})

    assert res.status_code == 200, res.text
    assert steps.count("current_research") == 1
    assert steps.count("thematic_research") == 1
    assert steps.index("current_research") < steps.index("crosscheck") < steps.index("thematic_research")
    assert steps.index("thematic_research") < steps.index("account_sheet")
