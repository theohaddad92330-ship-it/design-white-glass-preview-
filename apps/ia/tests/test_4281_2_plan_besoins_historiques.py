"""#4281.2 — le plan d'un compte cite SES besoins historiques (base commune), datés, et ne les invente pas."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.models.plan import PlanRequest
from app.routers import phase4_plan

NEED = {
    "company": "Acme",
    "title": "Consultant SAP FI/CO",
    "status": "GAGNE",
    "status_label": "gagné",
    "date": "2024-03-14",
    "tjm_eur": 720,
    "location": None,
    "technologies": ["SAP"],
    "prescriber": {
        "name": "Jeanne Martin",
        "role": "DSI adjointe",
        "freshness": {"kind": "dated", "date": "2026-06-01"},
    },
}


async def _systems(monkeypatch, historical: dict) -> tuple[list[str], AsyncMock]:
    systems: list[str] = []

    async def fake_call_claude(system, user, **kwargs):
        systems.append(system)
        if str(kwargs.get("prompt_name", "")) == "bellum_messages":
            return {"messages": []}, None
        return {}, None

    sector = AsyncMock(return_value=[])
    monkeypatch.setattr(phase4_plan, "call_claude", fake_call_claude)
    monkeypatch.setattr(phase4_plan.rag_service, "retrieve_knowledge_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan.rag_knowledge, "retrieve_reranked_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan, "measure_self_consistency", AsyncMock(return_value=(None, [])))
    monkeypatch.setattr(phase4_plan, "_account_has_positive_rex", AsyncMock(return_value=False))
    monkeypatch.setattr(phase4_plan, "_sector_referential_chunks", sector)
    monkeypatch.setattr(phase4_plan, "_account_historical_needs", AsyncMock(return_value=historical))
    req = PlanRequest(
        account_id="acc-1",
        user_id="u1",
        account_data={"sector": "Industrie", "angles": [{"angle": "Migration S/4"}]},
        contacts=[{"fullName": "Jean Dupont", "title": "DSI"}],
        profile_data={"companyName": "MonESN", "offers": ["SAP"]},
    )
    await phase4_plan._plan(req)
    return systems, sector


@pytest.mark.asyncio
async def test_le_plan_cite_les_besoins_dates_et_scope_les_reperes_au_compte(monkeypatch):
    systems, sector = await _systems(monkeypatch, {"needs": [NEED], "to_verify": None, "source_ids": ["DF-0042"]})
    joined = "\n".join(systems)
    assert "BESOINS HISTORIQUES OBSERVÉS SUR CE COMPTE" in joined
    assert "Consultant SAP FI/CO · gagné · 2024-03-14 · TJM observé 720 €" in joined
    assert sector.await_args.args[1] == "DF-0042"


@pytest.mark.asyncio
async def test_NON_sans_historique_le_prompt_est_byte_identique_et_les_reperes_restent_globaux(monkeypatch):
    empty, sector = await _systems(monkeypatch, {"needs": [], "to_verify": None, "source_ids": []})
    assert all("BESOINS HISTORIQUES" not in s for s in empty)
    assert sector.await_args.args[1] is None
    # deux rattachements : on ne choisit pas
    _, sector2 = await _systems(monkeypatch, {"needs": [NEED], "to_verify": None, "source_ids": ["DF-1", "DF-2"]})
    assert sector2.await_args.args[1] is None
