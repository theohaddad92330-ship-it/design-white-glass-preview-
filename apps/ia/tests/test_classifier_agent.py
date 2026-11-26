"""Tests for ClassifierAgent (ENG-137).

Covers every AgentStatus the agent can produce. The underlying service is
mocked at ``app.agents.classifier.classify_contacts_and_organigramme`` so
the tests are pure unit-level.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.agents.classifier import ClassifierAgent
from app.models.agent_envelope import AgentStatus
from app.services.claude_service import ClaudeIncompleteOutputError


_CLASSIFIED_HIGH_PRIORITY = {
    "contacts": [
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "entity": "SNCF SA",
            "role": "sponsor",
            "priority": 1,
            "summary": "Décideur principal IT",
            "whyContact": "Sponsor budget IT",
        }
    ],
    "organigramme": [{"entity": "SNCF SA", "level": "groupe", "contacts": ["Jean Dupont"]}],
    "decisionChain": {"description": "DSI seul décide"},
    "uncoveredZones": [],
    "stakeholderMap": [],
    "approach_order": [],
}

_CLASSIFIED_NO_HIGH_PRIORITY = {
    "contacts": [
        {
            "fullName": "Marie Stagiaire",
            "title": "Stagiaire",
            "role": "operational",
            "priority": 5,
            "summary": "Junior",
        }
    ],
    "organigramme": [],
    "decisionChain": {},
    "uncoveredZones": [],
    "stakeholderMap": [],
    "approach_order": [],
}


@pytest.fixture
def mock_service():
    with patch(
        "app.agents.classifier.classify_contacts_and_organigramme",
        new_callable=AsyncMock,
    ) as svc:
        svc.return_value = _CLASSIFIED_HIGH_PRIORITY
        yield svc


# ── success ─────────────────────────────────────────────────────────────────


class TestSuccess:
    @pytest.mark.asyncio
    async def test_priority_1_contact_yields_success(self, mock_service) -> None:
        env = await ClassifierAgent().run(
            "SNCF", {"size": "100"}, {"angles": []}, {"contacts": [{"firstName": "Jean"}]}
        )
        assert env.status == AgentStatus.SUCCESS
        assert env.data is not None
        assert env.data.contacts[0].priority == 1
        assert env.meta.agent_name == "classifier"
        assert env.meta.warnings is None

    @pytest.mark.asyncio
    async def test_priority_2_contact_also_qualifies(self, mock_service) -> None:
        payload = {
            **_CLASSIFIED_HIGH_PRIORITY,
            "contacts": [{**_CLASSIFIED_HIGH_PRIORITY["contacts"][0], "priority": 2}],
        }
        mock_service.return_value = payload
        env = await ClassifierAgent().run("SNCF", {}, {}, {"contacts": [{}]})
        assert env.status == AgentStatus.SUCCESS

    @pytest.mark.asyncio
    async def test_research_data_overrides_profile_for_entities(
        self, mock_service
    ) -> None:
        """Agent must inject `research_data.entitiesExhaustive` into the
        service's expected `profile.entities` slot.
        """
        await ClassifierAgent().run(
            "SNCF",
            {"entities": ["stale"]},
            {"entitiesExhaustive": [{"name": "SNCF SA"}]},
            {"contacts": []},
        )
        request_arg = mock_service.call_args.args[0]
        assert request_arg.profile_data["entities"] == [{"name": "SNCF SA"}]


# ── partial_success ─────────────────────────────────────────────────────────


class TestPartialSuccess:
    @pytest.mark.asyncio
    async def test_no_priority_1_or_2_emits_warning(self, mock_service) -> None:
        mock_service.return_value = _CLASSIFIED_NO_HIGH_PRIORITY
        env = await ClassifierAgent().run("SNCF", {}, {}, {"contacts": [{}]})
        assert env.status == AgentStatus.PARTIAL_SUCCESS
        assert env.data is not None
        assert env.meta.warnings is not None
        codes = [w.code for w in env.meta.warnings]
        assert "CLASSIFIER_NO_PRIORITY_CONTACTS" in codes

    @pytest.mark.asyncio
    async def test_empty_contacts_also_yields_partial(self, mock_service) -> None:
        mock_service.return_value = {
            "contacts": [],
            "organigramme": [],
            "decisionChain": {},
            "uncoveredZones": [],
            "stakeholderMap": [],
            "approach_order": [],
        }
        env = await ClassifierAgent().run("SNCF", {}, {}, {"contacts": []})
        assert env.status == AgentStatus.PARTIAL_SUCCESS
        codes = [w.code for w in env.meta.warnings or []]
        assert "CLASSIFIER_NO_PRIORITY_CONTACTS" in codes


# ── terminal_failure ────────────────────────────────────────────────────────


class TestTerminalFailure:
    @pytest.mark.asyncio
    async def test_claude_terminal_error_propagates(self, mock_service) -> None:
        mock_service.side_effect = ClaudeIncompleteOutputError(
            prompt_name="bellum_contacts", model="claude-haiku-4-5", max_tokens=16000
        )
        env = await ClassifierAgent().run("SNCF", {}, {}, {"contacts": [{}]})
        assert env.status == AgentStatus.TERMINAL_FAILURE
        assert env.data is None
        assert env.error is not None
        assert env.error.code == "CLAUDE_OUTPUT_TRUNCATED"

    @pytest.mark.asyncio
    async def test_unexpected_exception_is_terminal(self, mock_service) -> None:
        mock_service.side_effect = RuntimeError("boom")
        env = await ClassifierAgent().run("SNCF", {}, {}, {"contacts": [{}]})
        assert env.status == AgentStatus.TERMINAL_FAILURE
        assert env.error is not None
        assert env.error.code == "AGENT_INTERNAL"


# ── cancelled ───────────────────────────────────────────────────────────────


class TestCancelled:
    @pytest.mark.asyncio
    async def test_cancelled_during_service_call(self, mock_service) -> None:
        mock_service.side_effect = asyncio.CancelledError()
        env = await ClassifierAgent().run("SNCF", {}, {}, {"contacts": [{}]})
        assert env.status == AgentStatus.CANCELLED
        assert env.data is None
        assert env.error is None
        assert env.meta.duration_ms >= 0


# ── Profile merge logic (helper) ────────────────────────────────────────────


class TestProfileMerge:
    def test_falls_back_to_profile_when_research_empty(self) -> None:
        merged = ClassifierAgent._build_service_profile(
            "SNCF",
            {"angles": [{"title": "from profile"}], "pains": []},
            {},
        )
        assert merged["angles"] == [{"title": "from profile"}]

    def test_company_name_argument_wins(self) -> None:
        merged = ClassifierAgent._build_service_profile(
            "SNCF",
            {"companyName": "other"},
            {"companyName": "another"},
        )
        assert merged["companyName"] == "SNCF"

    def test_falls_back_to_profile_company_name_when_arg_empty(self) -> None:
        merged = ClassifierAgent._build_service_profile(
            "",
            {"companyName": "profile-name"},
            {},
        )
        assert merged["companyName"] == "profile-name"

    def test_out_of_scope_entities_are_filtered_from_organigramme(self) -> None:
        # Théo: SGTM / SG Côte d'Ivoire must not seed the "Contacts par entité"
        # groups. getsPlay=False entities are dropped before the classifier LLM.
        merged = ClassifierAgent._build_service_profile(
            "Société Générale",
            {},
            {
                "entitiesExhaustive": [
                    {"name": "SG Global Banking & Investor Solutions", "getsPlay": True},
                    {"name": "SGTM (Société Générale des Travaux du Maroc)", "getsPlay": False},
                    {"name": "Société Générale Côte d'Ivoire", "getsPlay": False},
                ]
            },
        )
        names = [e["name"] for e in merged["entities"]]
        assert names == ["SG Global Banking & Investor Solutions"]
