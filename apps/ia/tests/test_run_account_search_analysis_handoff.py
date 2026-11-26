"""#3704.5 — une entreprise TROUVÉE par la recherche rejoint l'analyse avec son
identité (SIREN) et les contraintes de la demande ; la recherche, elle, ne crée
aucun compte (« nouvelle cible » ≠ compte)."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api, chat_tools
from app.services.chat_tools import execute_chat_tool
from tests.test_run_account_search_scope import BIJOUTIER, MAISON_LUXE, _Response, _stub


async def _search(tool_input: dict[str, Any]) -> dict[str, Any]:
    return await execute_chat_tool("run_account_search", tool_input, user_id="u-1", profile_data=None)


@pytest.mark.asyncio
async def test_new_target_carries_identity_and_constraints_toward_the_analysis(monkeypatch):
    _stub(monkeypatch, _Response([MAISON_LUXE]))
    out = await _search({"sectors": ["luxury"], "headcount": "50-249", "department": "75"})
    handoff = out["items"][0]["analysis_handoff"]
    assert handoff["company"] == "MAISON DU CUIR" and handoff["siren"] == "111111111"
    assert handoff["scope"] == {"headcount_min": 50, "headcount_max": 249}
    # La zone et le secteur n'ont pas de champ de cadrage côté analyse : NOMMÉS, jamais promis.
    assert set(handoff["not_transferable"]) == {"department", "sectors"}
    assert "account_id" not in out["items"][0], "aucun compte créé par la recherche"


@pytest.mark.asyncio
async def test_owned_account_has_no_handoff_it_already_has_an_id(monkeypatch):
    _stub(monkeypatch, _Response([MAISON_LUXE, BIJOUTIER]))

    async def _own_first(items: Any, user_id: str) -> None:
        items[0]["account_id"] = "acc-1"

    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _own_first)
    out = await _search({"sectors": ["luxury"]})
    assert "analysis_handoff" not in out["items"][0]
    assert out["items"][1]["analysis_handoff"]["siren"] == "222222222"


@pytest.mark.asyncio
async def test_no_headcount_criterion_means_no_scope_key(monkeypatch):
    _stub(monkeypatch, _Response([MAISON_LUXE]))
    out = await _search({"sectors": ["luxury"]})
    assert "scope" not in out["items"][0]["analysis_handoff"]


@pytest.mark.asyncio
async def test_start_analysis_relays_the_siren_and_ignores_a_malformed_one(monkeypatch):
    sent: list[dict[str, Any]] = []

    async def _start(user_id: str, **kwargs: Any) -> dict[str, Any]:
        sent.append(kwargs)
        return {"launched": True}

    monkeypatch.setattr(bellum_api, "start_account_analysis", _start)
    base = {"company": "MAISON DU CUIR", "plan_token": "tok", "headcount_min": 50, "headcount_max": 249}
    await execute_chat_tool("start_account_analysis", {**base, "siren": "111111111"}, user_id="u-1", profile_data=None)
    await execute_chat_tool("start_account_analysis", {**base, "siren": "12 ab"}, user_id="u-1", profile_data=None)
    assert sent[0]["siren"] == "111111111" and sent[0]["headcount_max"] == 249
    assert sent[1]["siren"] is None, "un SIREN mal formé n'est jamais transmis ni deviné"


def test_start_tool_schema_exposes_siren():
    props = chat_tools.START_ANALYSIS_TOOL["input_schema"]["properties"]
    assert props["siren"]["type"] == "string"
