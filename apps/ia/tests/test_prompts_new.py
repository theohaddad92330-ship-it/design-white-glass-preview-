"""Tests for the 7 new BellumAI prompts — validates structure and output format."""
from __future__ import annotations
import pytest
import json


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_PROFILE = {
    "esn_name": "TestESN",
    "archetype": "boutique_expert",
    "core_offers": ["Data & IA", "Cloud AWS", "Cybersécurité"],
    "geography": "Île-de-France",
    "esn_size": "PME",
    "avg_deal_size": "50K-200K€",
    "typical_cycle": "3-6 mois",
    "user_name": "Théo",
}

SAMPLE_RAW_ANALYSIS = {
    "company_name": "SNCF",
    "businessDescription": "Opérateur ferroviaire national, 15000 trains/jour",
    "sector": "Transport",
    "employees": "270000",
    "revenue": "35 Mds€",
    "priority_score": 8.5,
    "priority_justification": "Fort potentiel IT, budget identifié, contacts accessibles",
    "itChallenges": [
        {"title": "Modernisation legacy", "severity": "high"},
        {"title": "Cybersécurité OT", "severity": "high"},
    ],
    "recentSignals": [
        {"signal": "Recrutement 50 data engineers", "date": "Mars 2026"},
    ],
    "angles": [
        {"title": "Data & Analytics", "strategy": "Entrer par e.SNCF Solutions"},
    ],
    "pains": [
        {"pain": "Systèmes legacy coûteux", "businessImpact": "20% du budget IT en maintenance"},
    ],
}

SAMPLE_CONTACTS = [
    {
        "first_name": "Jean-Pierre",
        "last_name": "Dupont",
        "title": "Directeur IT Infrastructure",
        "organization_name": "SNCF",
        "decision_role": "sponsor",
        "linkedin_url": "https://linkedin.com/in/jpdupont",
    }
]

SAMPLE_ANALYSES = [
    {**SAMPLE_RAW_ANALYSIS, "company_name": "SNCF"},
    {**SAMPLE_RAW_ANALYSIS, "company_name": "AXA", "priority_score": 7.2, "sector": "Assurance"},
    {**SAMPLE_RAW_ANALYSIS, "company_name": "Michelin", "priority_score": 6.8, "sector": "Industrie"},
]


# ---------------------------------------------------------------------------
# Tests for bellum_summary
# ---------------------------------------------------------------------------

class TestBellumSummary:
    def test_build_system_prompt_returns_string(self):
        from app.prompts.bellum_summary import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert len(result) > 100
        assert "TestESN" in result

    def test_build_system_prompt_archetype_calibration(self):
        from app.prompts.bellum_summary import build_system_prompt
        for archetype in ["solo_hunter", "boutique_expert", "mid_market_challenger", "scale_up", "enterprise_player"]:
            profile = {**SAMPLE_PROFILE, "archetype": archetype}
            result = build_system_prompt(profile)
            assert isinstance(result, str)
            assert len(result) > 100

    def test_build_user_prompt_returns_string(self):
        from app.prompts.bellum_summary import build_user_prompt
        result = build_user_prompt(
            raw_analysis=SAMPLE_RAW_ANALYSIS,
            profile=SAMPLE_PROFILE,
            company_name="SNCF",
        )
        assert isinstance(result, str)
        assert "SNCF" in result
        assert "summary" in result.lower() or "résumé" in result.lower() or "JSON" in result


# ---------------------------------------------------------------------------
# Tests for bellum_battlecard
# ---------------------------------------------------------------------------

class TestBellumBattlecard:
    def test_build_system_prompt(self):
        from app.prompts.bellum_battlecard import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert len(result) > 100

    def test_build_user_prompt_with_contacts(self):
        from app.prompts.bellum_battlecard import build_user_prompt
        result = build_user_prompt(
            raw_analysis=SAMPLE_RAW_ANALYSIS,
            contacts=SAMPLE_CONTACTS,
            profile=SAMPLE_PROFILE,
            company_name="SNCF",
        )
        assert isinstance(result, str)
        assert "SNCF" in result
        assert "Jean-Pierre" in result

    def test_build_user_prompt_empty_contacts(self):
        from app.prompts.bellum_battlecard import build_user_prompt
        result = build_user_prompt(
            raw_analysis=SAMPLE_RAW_ANALYSIS,
            contacts=[],
            profile=SAMPLE_PROFILE,
            company_name="SNCF",
        )
        assert isinstance(result, str)
        assert len(result) > 100


# ---------------------------------------------------------------------------
# Tests for bellum_scorer
# ---------------------------------------------------------------------------

class TestBellumScorer:
    def test_build_system_prompt(self):
        from app.prompts.bellum_scorer import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert "GO" in result or "score" in result.lower()

    def test_build_user_prompt(self):
        from app.prompts.bellum_scorer import build_user_prompt
        result = build_user_prompt(
            raw_analysis=SAMPLE_RAW_ANALYSIS,
            profile=SAMPLE_PROFILE,
            company_name="SNCF",
        )
        assert isinstance(result, str)
        assert "global_score" in result


# ---------------------------------------------------------------------------
# Tests for bellum_icebreaker
# ---------------------------------------------------------------------------

class TestBellumIcebreaker:
    def test_build_system_prompt(self):
        from app.prompts.bellum_icebreaker import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert len(result) > 100

    def test_build_user_prompt(self):
        from app.prompts.bellum_icebreaker import build_user_prompt
        contact = SAMPLE_CONTACTS[0]
        result = build_user_prompt(
            contact=contact,
            raw_analysis=SAMPLE_RAW_ANALYSIS,
            profile=SAMPLE_PROFILE,
            recent_signals=[{"signal": "Recrutement data", "date": "Mars 2026"}],
        )
        assert isinstance(result, str)
        assert "Jean-Pierre" in result

    def test_build_user_prompt_no_signals(self):
        from app.prompts.bellum_icebreaker import build_user_prompt
        result = build_user_prompt(
            contact=SAMPLE_CONTACTS[0],
            raw_analysis=SAMPLE_RAW_ANALYSIS,
            profile=SAMPLE_PROFILE,
        )
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# Tests for bellum_activity
# ---------------------------------------------------------------------------

class TestBellumActivity:
    def test_build_system_prompt(self):
        from app.prompts.bellum_activity import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert len(result) > 100

    def test_build_user_prompt(self):
        from app.prompts.bellum_activity import build_user_prompt
        result = build_user_prompt(
            raw_analysis=SAMPLE_RAW_ANALYSIS,
            company_name="SNCF",
        )
        assert isinstance(result, str)
        assert "SNCF" in result
        assert "concrete_activity" in result


# ---------------------------------------------------------------------------
# Tests for bellum_compare
# ---------------------------------------------------------------------------

class TestBellumCompare:
    def test_build_system_prompt(self):
        from app.prompts.bellum_compare import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert "priorisation" in result.lower() or "comparer" in result.lower() or "priorit" in result.lower()

    def test_build_user_prompt_multiple_accounts(self):
        from app.prompts.bellum_compare import build_user_prompt
        result = build_user_prompt(
            analyses=SAMPLE_ANALYSES,
            profile=SAMPLE_PROFILE,
        )
        assert isinstance(result, str)
        assert "SNCF" in result
        assert "AXA" in result
        assert "Michelin" in result

    def test_build_user_prompt_two_accounts(self):
        from app.prompts.bellum_compare import build_user_prompt
        result = build_user_prompt(
            analyses=SAMPLE_ANALYSES[:2],
            profile=SAMPLE_PROFILE,
        )
        assert isinstance(result, str)
        assert len(result) > 200


# ---------------------------------------------------------------------------
# Tests for bellum_weekly
# ---------------------------------------------------------------------------

class TestBellumWeekly:
    def test_build_system_prompt(self):
        from app.prompts.bellum_weekly import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert len(result) > 100

    def test_build_user_prompt(self):
        from app.prompts.bellum_weekly import build_user_prompt
        accounts = [
            {"company_name": "SNCF", "priority_score": 8.5, "status": "completed", "recent_signals": []},
            {"company_name": "AXA", "priority_score": 7.2, "status": "completed", "recent_signals": []},
        ]
        pending_actions = [
            {"action": "Contacter Jean-Pierre", "company": "SNCF", "overdue": True},
        ]
        weekly_stats = {"messages_sent": 3, "responses": 1}
        result = build_user_prompt(
            accounts=accounts,
            pending_actions=pending_actions,
            weekly_stats=weekly_stats,
            profile=SAMPLE_PROFILE,
        )
        assert isinstance(result, str)
        assert "Théo" in result or "briefing" in result.lower() or "SNCF" in result


# ---------------------------------------------------------------------------
# Tests for improved existing prompts
# ---------------------------------------------------------------------------

class TestImprovedResearch:
    # The monolithic BELLUM-RESEARCH prompt (bellum_research.py) was removed —
    # the live pipeline uses the split bellum_facts / bellum_signals /
    # bellum_strategy prompts (see phase1_research._research). Covered by their
    # own tests + the phase1 integration tests.
    def test_split_research_prompts_build(self):
        from app.prompts import bellum_facts, bellum_signals, bellum_strategy

        for mod in (bellum_facts, bellum_signals, bellum_strategy):
            result = mod.build_system_prompt(SAMPLE_PROFILE)
            assert isinstance(result, str)
            assert len(result) > 200


class TestImprovedContacts:
    def test_build_system_prompt(self):
        from app.prompts.bellum_contacts import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert len(result) > 200


class TestImprovedPlan:
    def test_build_system_prompt(self):
        from app.prompts.bellum_plan import build_system_prompt
        result = build_system_prompt(SAMPLE_PROFILE)
        assert isinstance(result, str)
        assert len(result) > 200
