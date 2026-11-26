"""Country / market propagation through the analysis graph.

The workspace's target market travels API → IA as ``country`` on
``/graph/analyze``, lands in the graph state, and ``research_node`` forwards it
into the ``ResearchRequest`` that ``_research`` (and therefore
``get_active_pack`` / ``collect_country_signals``) reads. ``FR`` is the
strictly-unchanged default: an absent ``country`` resolves to ``"FR"`` → no pack
activates, the French pipeline is byte-identical.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
from app.models.research import ResearchResponse
from app.routers.graph_analyze import GraphAnalyzeRequest


@pytest.mark.asyncio
async def test_research_node_forwards_non_fr_country_to_the_research_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    research = AsyncMock(return_value=ResearchResponse(data={}))
    monkeypatch.setattr(nodes, "_research", research)

    await nodes.research_node({"company_name": "Nestlé", "country": "CH"})

    research.assert_awaited_once()
    req = research.call_args.args[0]
    assert req.country == "CH"


@pytest.mark.asyncio
async def test_research_node_defaults_country_to_fr_when_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    research = AsyncMock(return_value=ResearchResponse(data={}))
    monkeypatch.setattr(nodes, "_research", research)

    # No country in the (resumed / legacy) state → the French default.
    await nodes.research_node({"company_name": "SNCF"})

    req = research.call_args.args[0]
    assert req.country == "FR"


def test_graph_analyze_request_defaults_country_to_fr() -> None:
    # Absent on the wire → FR default (the strictly-unchanged French path).
    assert GraphAnalyzeRequest(company_name="SNCF").country == "FR"
    # Present → carried verbatim into the graph inputs.
    assert GraphAnalyzeRequest(company_name="Nestlé", country="CH").country == "CH"
