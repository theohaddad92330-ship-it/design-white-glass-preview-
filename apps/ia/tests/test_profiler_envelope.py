"""Tests for ProfilerAgent.run() — the AgentEnvelope path (ENG-122).

Pins the envelope contract: shape, statuses, meta, error mapping. The agent
generates a ProfileContext via the async ``_generate`` helper (which offloads
``call_claude_sync`` to a thread); these tests patch ``_generate`` so they run
deterministically without API keys or network.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.agents.profiler import ProfilerAgent
from app.models.agent_envelope import AgentStatus
from app.models.profile_context import (
    AnalysisParameters,
    BellumPhrases,
    CadenceRecommendation,
    CoachingInsights,
    EsnArchetype,
    FirstAnalysisSuggestion,
    IdealAccountProfile,
    KpiTargets,
    MessagingStyle,
    ProfileContext,
    SellingPosture,
    WelcomeSummary,
)
from app.services.claude_service import ClaudeIncompleteOutputError
from app.services.welcome_account_suggestions import RealAccountsRead

FAKE_ENV = {
    "ANTHROPIC_API_KEY": "test-key",
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "test-sb-key",
}


SOLO_HUNTER_ANSWERS = {
    "company_name": "DataCraft",
    "size": "1-10",
    "offers": ["Data", "IA"],
    "sectors": ["Banque"],
    "personas": ["DSI"],
    "sales_cycle": "3-6 mois",
    "sales_team_size": "Solo",
    "avg_tjm": "600-900€",
    "main_challenge": "Trouver des comptes",
    "geo_zone": "Île-de-France",
    "current_tools": ["LinkedIn"],
    "goal": "10 comptes/mois",
}


def _valid_profile() -> ProfileContext:
    """A minimal-but-valid ProfileContext (current camelCase enum values)."""
    return ProfileContext(
        esn_archetype=EsnArchetype.BOUTIQUE_EXPERT,
        selling_posture=SellingPosture.EXPERTISE_RARE,
        ideal_account_profile=IdealAccountProfile(
            size="eti",
            sectors_priority=["Banque"],
            decision_level="director",
            entry_strategy="bottomUp",
        ),
        analysis_parameters=AnalysisParameters(
            brave_queries_count=10,
            firecrawl_pages_count=5,
            contacts_target=30,
            analysis_depth="standard",
            max_tokens_research=12000,
            focus_areas=["data"],
        ),
        messaging_style=MessagingStyle(
            tone="directExpert",
            message_length="standard",
            value_proposition_angle="expertise data",
            differentiation_points=["spécialisation", "data end-to-end", "agilité"],
            avoid=["volume"],
        ),
        coaching_insights=CoachingInsights(
            main_weakness="prospection irrégulière",
            key_advice="régularité bat intensité",
            cadence_recommendation=CadenceRecommendation(
                analyses_per_week=5,
                messages_per_day=10,
                follow_ups_per_week=20,
            ),
            kpi_targets=KpiTargets(
                accounts_per_month=15,
                rdv_per_month=4,
                conversion_rate_target="20%",
            ),
        ),
        bellum_phrases=BellumPhrases(
            welcome="Bienvenue !",
            first_analysis_cta="Commencez ici",
            weekly_summary_intro="Cette semaine",
            empty_state="Pipeline vide",
            score_context="Score > 7",
        ),
        welcome_summary=WelcomeSummary(
            profile_recap="Tu es une ESN data.",
            searches_personalization="Les recherches cibleront la data.",
            contacts_personalization="Les contacts identifiés seront des DSI.",
            messages_personalization="Les messages seront rédigés ton expert.",
            scoring_personalization="Le scoring évaluera la maturité data.",
            first_analysis_suggestions=[
                FirstAnalysisSuggestion(company_name="Société Générale", sector="Banque", reason="Migration data."),
                FirstAnalysisSuggestion(company_name="BNP Paribas", sector="Banque", reason="Modernisation SI."),
                FirstAnalysisSuggestion(company_name="AXA", sector="Assurance", reason="Projets data."),
            ],
        ),
    )


def _valid_generate_result() -> tuple[ProfileContext, RealAccountsRead]:
    """`_generate` rend le profil ET la lecture de la mémoire marché (#2012.12,
    épopée #2776) — `status="ok"` ici : ces tests ne portent pas sur la
    dégradation de cette source, qui a son propre fichier
    (`test_welcome_account_suggestions.py`)."""
    return _valid_profile(), RealAccountsRead(status="ok")


@pytest.fixture
def agent_with_env():
    """ProfilerAgent built under a fake env."""
    with patch.dict("os.environ", FAKE_ENV):
        yield ProfilerAgent()


# ── success ─────────────────────────────────────────────────────────────────


class TestSuccess:
    @pytest.mark.asyncio
    async def test_returns_envelope_with_profile_context(self, agent_with_env) -> None:
        with patch.object(
            agent_with_env, "_generate", new=AsyncMock(return_value=_valid_generate_result())
        ):
            envelope = await agent_with_env.run(SOLO_HUNTER_ANSWERS)

        assert envelope.status == AgentStatus.SUCCESS
        assert envelope.error is None
        assert envelope.data is not None
        assert isinstance(envelope.data, ProfileContext)
        assert envelope.data.esn_archetype == EsnArchetype.BOUTIQUE_EXPERT

    @pytest.mark.asyncio
    async def test_meta_carries_agent_identity(self, agent_with_env) -> None:
        with patch.object(
            agent_with_env, "_generate", new=AsyncMock(return_value=_valid_generate_result())
        ):
            envelope = await agent_with_env.run(SOLO_HUNTER_ANSWERS)

        assert envelope.meta.agent_name == "profiler"
        assert envelope.meta.agent_version == "3.3.0"
        assert envelope.meta.prompt_name == "bellum_profiler"
        # The profiler runs on Haiku (cheap structured extraction).
        assert envelope.meta.model is not None
        assert "haiku" in envelope.meta.model.lower()
        assert envelope.meta.duration_ms >= 0


# ── precondition ────────────────────────────────────────────────────────────


class TestPrecondition:
    @pytest.mark.asyncio
    async def test_empty_answers_yields_precondition_failure(self, agent_with_env) -> None:
        with patch.object(agent_with_env, "_generate", new=AsyncMock()) as mock_gen:
            envelope = await agent_with_env.run({})
            mock_gen.assert_not_called()
        assert envelope.status == AgentStatus.TERMINAL_FAILURE
        assert envelope.error is not None
        assert envelope.error.code == "AGENT_PRECONDITION_FAILED"


# ── terminal_failure: Claude error ──────────────────────────────────────────


class TestTerminalFailure:
    @pytest.mark.asyncio
    async def test_claude_truncated_is_terminal(self, agent_with_env) -> None:
        with patch.object(
            agent_with_env,
            "_generate",
            new=AsyncMock(
                side_effect=ClaudeIncompleteOutputError(
                    prompt_name="bellum_profiler",
                    model="claude-haiku-4-5",
                    max_tokens=4096,
                )
            ),
        ):
            envelope = await agent_with_env.run(SOLO_HUNTER_ANSWERS)
        assert envelope.status == AgentStatus.TERMINAL_FAILURE
        assert envelope.error is not None
        assert envelope.error.code == "CLAUDE_OUTPUT_TRUNCATED"
        assert envelope.error.retryable is False

    @pytest.mark.asyncio
    async def test_unexpected_exception_is_terminal(self, agent_with_env) -> None:
        with patch.object(
            agent_with_env,
            "_generate",
            new=AsyncMock(side_effect=ValueError("bad JSON")),
        ):
            envelope = await agent_with_env.run(SOLO_HUNTER_ANSWERS)
        assert envelope.status == AgentStatus.TERMINAL_FAILURE
        assert envelope.error is not None
        assert envelope.error.code == "AGENT_INTERNAL"


# ── cancelled ───────────────────────────────────────────────────────────────


class TestCancelled:
    @pytest.mark.asyncio
    async def test_cancelled_during_generation(self, agent_with_env) -> None:
        with patch.object(
            agent_with_env,
            "_generate",
            new=AsyncMock(side_effect=asyncio.CancelledError()),
        ):
            envelope = await agent_with_env.run(SOLO_HUNTER_ANSWERS)
        assert envelope.status == AgentStatus.CANCELLED
        assert envelope.data is None
        assert envelope.error is None


# ── Consumable by downstream agents (DoD §3) ────────────────────────────────


class TestConsumable:
    """Pins the DoD requirement: the output must be consumable by other agents.

    Concretely: the envelope's data field is a typed ProfileContext that can
    be `.model_dump()`-ed into the dict shape the Researcher / Strategist /
    Messenger feed into their prompts via ``profile_data``.
    """

    @pytest.mark.asyncio
    async def test_data_dumps_to_a_dict_other_agents_can_consume(self, agent_with_env) -> None:
        with patch.object(
            agent_with_env, "_generate", new=AsyncMock(return_value=_valid_generate_result())
        ):
            envelope = await agent_with_env.run(SOLO_HUNTER_ANSWERS)

        assert envelope.data is not None
        dumped = envelope.data.model_dump()
        # Keys downstream agents actually read from profile_data:
        for required in (
            "esn_archetype",
            "selling_posture",
            "ideal_account_profile",
            "analysis_parameters",
            "messaging_style",
            "coaching_insights",
            "bellum_phrases",
        ):
            assert required in dumped, f"Missing key consumed downstream: {required}"
        # Spot-check the nested shapes downstream agents rely on.
        assert "contacts_target" in dumped["analysis_parameters"]
        assert "sectors_priority" in dumped["ideal_account_profile"]
