"""Tests for the ProfilerAgent.

The agent was refactored to an async ``run(answers)`` returning an
``AgentEnvelope[ProfileContext]``; Claude is reached through the sync
``call_claude_sync`` helper (offloaded to a thread). These tests mock that
helper so they run deterministically without API keys or network, and patch
``asyncio.sleep`` so the agent's progress pacing doesn't block.
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

from app.agents.profiler import ProfilerAgent, _coaching_message
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
from app.services.claude_service import TokenUsage

SOLO_HUNTER_ANSWERS = {
    "company_name": "DataCraft",
    "size": "1-10",
    "offers": ["Data", "IA"],
    "sectors": ["Banque", "Assurance"],
    "personas": ["DSI", "CDO"],
    "sales_cycle": "3-6 mois",
    "sales_team_size": "Solo",
    "avg_tjm": "600-900€",
    "main_challenge": "Trouver de nouveaux comptes qualifiés dans la finance",
    "geo_zone": "Île-de-France",
    "current_tools": ["LinkedIn"],
    "goal": "Identifier mes 10 meilleurs comptes cibles chaque mois",
}

ENTERPRISE_ANSWERS = {
    "company_name": "CloudScale",
    "size": "200-500",
    "offers": ["Cloud", "DevOps", "Infra"],
    "sectors": ["Industrie", "Énergie", "Transport"],
    "personas": ["DSI", "CTO", "VP Engineering"],
    "sales_cycle": "6-12 mois",
    "sales_team_size": "15+",
    "avg_tjm": "400-600€",
    "main_challenge": "Se différencier sur les appels d'offres grands comptes",
    "geo_zone": "National",
    "current_tools": ["LinkedIn SN", "Salesforce", "Apollo"],
    "goal": "Gagner 3 nouveaux grands comptes cette année",
}

_USAGE = TokenUsage(input_tokens=100, output_tokens=500, model="claude-haiku-4-5", cost_usd=0.0)


def _profile(
    *,
    archetype: EsnArchetype = EsnArchetype.BOUTIQUE_EXPERT,
    posture: SellingPosture = SellingPosture.EXPERTISE_RARE,
    contacts_target: int = 30,
    analysis_depth: str = "standard",
    brave_queries_count: int = 10,
) -> ProfileContext:
    """Build a valid ProfileContext using the current (camelCase) enum values."""
    return ProfileContext(
        esn_archetype=archetype,
        selling_posture=posture,
        ideal_account_profile=IdealAccountProfile(
            size="eti",
            sectors_priority=["Banque", "Assurance"],
            decision_level="director",
            entry_strategy="bottomUp",
        ),
        analysis_parameters=AnalysisParameters(
            brave_queries_count=brave_queries_count,
            firecrawl_pages_count=5,
            contacts_target=contacts_target,
            analysis_depth=analysis_depth,
            max_tokens_research=12000,
            focus_areas=["data team", "CDO", "data projects", "modern data stack"],
        ),
        messaging_style=MessagingStyle(
            tone="directExpert",
            message_length="standard",
            value_proposition_angle="expertise rare en Data et IA pour la finance",
            differentiation_points=[
                "spécialisation sectorielle banque/assurance",
                "expertise data end-to-end",
                "agilité d'une équipe resserrée",
            ],
            avoid=["mobiliser 50 consultants", "offre globale"],
        ),
        coaching_insights=CoachingInsights(
            main_weakness="prospection irrégulière et manque de volume de contacts",
            key_advice=(
                "Concentre-toi sur 5 comptes par semaine — la régularité bat l'intensité. "
                "Ton expertise vaut cher : ne sous-évalue pas ton TJM."
            ),
            cadence_recommendation=CadenceRecommendation(
                analyses_per_week=5, messages_per_day=10, follow_ups_per_week=20
            ),
            kpi_targets=KpiTargets(
                accounts_per_month=15, rdv_per_month=4, conversion_rate_target="20%"
            ),
        ),
        bellum_phrases=BellumPhrases(
            welcome=(
                "Bienvenue ! En tant qu'ESN data spécialisée, chaque analyse BellumAI est "
                "conçue pour identifier les décideurs data."
            ),
            first_analysis_cta=(
                "Commence par analyser un ETI dans la banque ou l'assurance — "
                "c'est ton terrain de jeu naturel."
            ),
            weekly_summary_intro=(
                "Cette semaine, focalise-toi sur tes ETI finance."
            ),
            empty_state=(
                "Ton pipeline est vide. En tant qu'expert data, je te recommande "
                "de cibler 3 ETI cette semaine dans la banque."
            ),
            score_context=(
                "Un score > 7 signifie que le compte a des besoins data actifs."
            ),
        ),
        welcome_summary=WelcomeSummary(
            profile_recap="Tu es une ESN data spécialisée banque et assurance.",
            searches_personalization="Les recherches cibleront en priorité la data.",
            contacts_personalization="Les contacts identifiés seront des DSI et CDO.",
            messages_personalization="Les messages seront rédigés sur un ton expert direct.",
            scoring_personalization="Le scoring évaluera la maturité data du compte.",
            first_analysis_suggestions=[
                FirstAnalysisSuggestion(company_name="Société Générale", sector="Banque", reason="Migration data en cours."),
                FirstAnalysisSuggestion(company_name="BNP Paribas", sector="Banque", reason="Modernisation SI."),
                FirstAnalysisSuggestion(company_name="AXA", sector="Assurance", reason="Projets data actifs."),
            ],
        ),
    )


def _run(agent: ProfilerAgent, answers: dict, context: ProfileContext):
    """Drive ProfilerAgent.run with Claude mocked and progress pacing skipped."""
    with (
        patch("app.agents.profiler.call_claude_sync", return_value=(context, _USAGE)),
        patch("app.agents.profiler.asyncio.sleep"),
    ):
        return asyncio.run(agent.run(answers))


def test_solo_hunter_profile_is_valid() -> None:
    """A small data ESN produces a valid ProfileContext with correct archetype."""
    envelope = _run(ProfilerAgent(), SOLO_HUNTER_ANSWERS, _profile())

    assert envelope.status == AgentStatus.SUCCESS
    context = envelope.data
    assert isinstance(context, ProfileContext)
    assert context.esn_archetype in (EsnArchetype.BOUTIQUE_EXPERT, EsnArchetype.SOLO_HUNTER)
    assert context.selling_posture == SellingPosture.EXPERTISE_RARE


def test_enterprise_profile_has_high_contacts_target() -> None:
    """A large ESN targeting grands comptes should have more contacts to find."""
    profile = _profile(
        archetype=EsnArchetype.ENTERPRISE_PLAYER,
        posture=SellingPosture.STRATEGIC_CONSULTING,
        contacts_target=80,
        analysis_depth="deep",
        brave_queries_count=18,
    )
    envelope = _run(ProfilerAgent(), ENTERPRISE_ANSWERS, profile)

    assert envelope.status == AgentStatus.SUCCESS
    context = envelope.data
    assert context.analysis_parameters.contacts_target >= 60
    assert context.analysis_parameters.analysis_depth == "deep"


def test_all_required_fields_present() -> None:
    """ProfileContext must have all required top-level fields."""
    context = _run(ProfilerAgent(), SOLO_HUNTER_ANSWERS, _profile()).data

    assert context.esn_archetype is not None
    assert context.selling_posture is not None
    assert context.ideal_account_profile is not None
    assert context.analysis_parameters is not None
    assert context.messaging_style is not None
    assert context.coaching_insights is not None
    assert context.bellum_phrases is not None
    assert context.welcome_summary is not None


def test_analysis_params_coherent_with_archetype() -> None:
    """For a boutique_expert, contacts_target should be in the 10-60 range."""
    context = _run(ProfilerAgent(), SOLO_HUNTER_ANSWERS, _profile()).data

    assert 10 <= context.analysis_parameters.contacts_target <= 60
    assert context.analysis_parameters.brave_queries_count >= 5


def test_bellum_phrases_are_french_and_personalized() -> None:
    """BellumPhrases must be non-empty strings in French."""
    context = _run(ProfilerAgent(), SOLO_HUNTER_ANSWERS, _profile()).data

    phrases = context.bellum_phrases
    for field_name, value in phrases.model_dump().items():
        assert isinstance(value, str) and len(value) > 10, f"Empty phrase: {field_name}"
        # Must not be English
        english_starters = ("Welcome", "Start", "This week", "Your pipeline", "A score")
        assert not any(value.startswith(e) for e in english_starters), (
            f"Not French: {field_name} = {value}"
        )


def test_coaching_message_unchanged_when_user_role_absent() -> None:
    """#2007 — additif seulement : sans `user_role`, la phrase reste identique
    à l'octet près à celle d'avant ce lot."""
    message = _coaching_message({"main_sales_pain": "Trouver les bons comptes", "positioning": "Généraliste"})

    assert message == (
        'Je formule un point de vigilance sur "Trouver les bons comptes", un conseil direct '
        'adapté à "Généraliste", et des objectifs réalistes (cadence hebdo, KPI mensuels).'
    )


def test_coaching_message_personalizes_with_user_role_when_present() -> None:
    """#2007 — `user_role` (profil progressif §21-30) est maintenant LU, pas
    seulement transporté jusqu'à ce dict."""
    message = _coaching_message(
        {
            "main_sales_pain": "Trouver les bons comptes",
            "positioning": "Généraliste",
            "user_role": "Business Manager",
        }
    )

    assert "pensé pour ton rôle de Business Manager" in message


def test_claude_failure_yields_terminal_failure_envelope() -> None:
    """If the Claude call fails, run() surfaces a TERMINAL_FAILURE envelope
    instead of raising — the envelope is the contract boundary now."""
    agent = ProfilerAgent()
    with (
        patch(
            "app.agents.profiler.call_claude_sync",
            side_effect=ValueError("I cannot generate that profile."),
        ),
        patch("app.agents.profiler.asyncio.sleep"),
    ):
        envelope = asyncio.run(agent.run(SOLO_HUNTER_ANSWERS))

    assert envelope.status == AgentStatus.TERMINAL_FAILURE
    assert envelope.data is None
    assert envelope.error is not None
