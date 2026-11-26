"""#4294.9 — LE FIL : les besoins historiques DU compte atteignent la classification et le plan,
lus dans l'ESPACE de l'analyse. Sans compte rattaché, chaque phase reçoit ce qu'elle recevait."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
from app.graph.builder import run_analysis_graph
from app.models.plan import PlanRequest
from app.routers import phase4_plan
from tests.test_4070_analysis_facts_wiring import KNOWN, phases  # noqa: F401 — fixture partagée

HISTORICAL = {
    "needs": [
        {
            "title": "Consultant SAP FI/CO",
            "status": "GAGNE",
            "status_label": "gagné",
            "date": "2024-03-14",
            "tjm_eur": 720,
            "technologies": ["SAP"],
            "prescriber": {
                "name": "Jeanne Martin",
                "role": "DSI adjointe",
                "freshness": {"kind": "dated", "date": "2026-06-01"},
            },
        },
        {
            "title": "TMA",
            "status": "PERDU",
            "status_label": "perdu",
            "date": "2023-01-10",
            "tjm_eur": None,
            "technologies": [],
            # déjà connu du CRM : ne se double pas
            "prescriber": {"name": "claire martin", "role": "DSI", "freshness": {"kind": "to_revalidate"}},
        },
    ],
    "to_verify": None,
    "source_ids": ["DF-0042"],
}


@pytest.mark.asyncio
async def test_les_prescripteurs_du_compte_atteignent_la_classification(phases, monkeypatch):  # noqa: F811
    spy = AsyncMock(return_value=HISTORICAL)
    monkeypatch.setattr(nodes, "needs_for_owned_account", spy)
    await run_analysis_graph(
        {
            "company_name": "Acme",
            "profile_data": {},
            "account_id": "acc-1",
            "user_id": "u2",
            "workspace_id": "ws-A",
            "known_contacts": KNOWN,
        },
        thread_id="4294-9-classify",
    )
    spy.assert_awaited_with("acc-1", "u2", workspace_id="ws-A")
    known = phases.classifier.run.await_args.kwargs["known_contacts"]
    assert known[0] == KNOWN[0]
    assert [c["name"] for c in known] == ["Claire Martin", "Jeanne Martin"]
    assert known[1]["relation"] == "prescriber"


@pytest.mark.asyncio
async def test_NON_sans_compte_la_classification_recoit_exactement_ce_qu_elle_recevait(phases, monkeypatch):  # noqa: F811
    await run_analysis_graph({"company_name": "TF1", "profile_data": {}}, thread_id="4294-9-none")
    assert phases.classifier.run.await_args.kwargs.get("known_contacts", []) == []


@pytest.mark.asyncio
async def test_le_plan_lit_les_besoins_dans_l_espace_de_l_analyse(monkeypatch):
    spy = AsyncMock(return_value={"needs": [], "to_verify": None, "source_ids": []})
    monkeypatch.setattr("app.services.dataforge_needs.needs_for_owned_account", spy)
    await phase4_plan._account_historical_needs("acc-1", "u2", "ws-A")
    spy.assert_awaited_once_with("acc-1", "u2", workspace_id="ws-A")
    assert PlanRequest(account_id="a").workspace_id in ("", None)
