"""#1950.17 — le plafond de coût AGRÉGÉ d'une réponse de Laura.

Décision du 12/09/2026 : formaliser les cartes indépendantes que Laura propose
déjà, avec un plafond de coût agrégé par réponse. Au-delà, Laura propose moins
d'étapes et le DIT. Aucune exécution enchaînée : le plafond ne lance rien, il
refuse seulement de mettre une carte de plus sur la table.

Ce que ces tests tiennent :

1. **Sans plafond (`None`), rien ne change** — un appelant qui ne le connaît pas
   (la route MCP, une API pas encore redéployée) garde le comportement d'avant.
2. **Le plafond se calcule sur les coûts ANNONCÉS par les propositions**
   (`cost_credits`), jamais sur un chiffre deviné.
3. **Une carte refusée ne part pas à l'écran, et le modèle en est prévenu** avec
   une consigne qui lui fait dire « je me suis arrêtée au plafond ».
4. **Le plafond vaut pour la RÉPONSE entière**, pas pour un seul tour d'outils.
"""

from __future__ import annotations

import asyncio
import json

from app.models.chat import ChatRequest
from app.services import chat_orchestrator
from app.services.chat_orchestrator import _ReplyCostBudget, _run_tool_round, _ToolCall


def _enrich_proposal(contact_id: str, cost: int | None) -> dict:
    proposal: dict = {"action": "enrich_contact", "contact_id": contact_id, "contact_name": contact_id}
    if cost is not None:
        proposal["cost_credits"] = cost
    return {"status": "pending_confirmation", "message": "préparée", "proposal": proposal}


def _patch_tools(monkeypatch, costs: dict[str, int | None]) -> None:
    async def _fake(name, tool_input, **_kwargs):
        contact_id = str(tool_input["contact_id"])
        return _enrich_proposal(contact_id, costs[contact_id])

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake)


async def _noop(_event: dict) -> None:
    return None


def _round(calls: list[_ToolCall], budget: _ReplyCostBudget | None):
    return asyncio.run(
        _run_tool_round(
            calls,
            user_id="u1",
            profile_data=None,
            crm_connected=False,
            crm_provider="",
            emit=_noop,
            cost_budget=budget,
        )
    )


def _calls(*contact_ids: str) -> list[_ToolCall]:
    return [_ToolCall(id=f"t-{cid}", name="enrich_contact", input={"contact_id": cid}) for cid in contact_ids]


def test_without_a_ceiling_every_proposal_reaches_the_screen(monkeypatch):
    _patch_tools(monkeypatch, {"a": 1, "b": 1, "c": 1})
    actions, results, stop = _round(_calls("a", "b", "c"), None)
    assert stop is None
    assert [a.get("proposal", {}).get("contact_id") for a in actions] == ["a", "b", "c"]
    assert all(not is_error for _call, _out, is_error in results)


def test_the_proposal_that_would_cross_the_ceiling_is_refused_and_said(monkeypatch):
    _patch_tools(monkeypatch, {"a": 1, "b": 1, "c": 1})
    actions, results, _stop = _round(_calls("a", "b", "c"), _ReplyCostBudget(ceiling=2))

    kept = [a["proposal"]["contact_id"] for a in actions if a.get("proposal")]
    assert kept == ["a", "b"]
    refused = actions[2]
    assert "proposal" not in refused
    assert refused["status"] == "error"

    _call, output, is_error = results[2]
    assert is_error is True
    # Le modèle lit ce texte : il doit proposer MOINS d'étapes et le DIRE.
    assert "moins d'étapes" in output["error"]
    assert "plafond" in output["error"]
    assert not any(ch.isdigit() for ch in output["error"])  # #4464 — aucun chiffre vers le modèle


def test_a_free_or_unannounced_step_never_counts_against_the_ceiling(monkeypatch):
    # « Non annoncé » n'est pas « 0 » à l'écran — mais il n'est pas non plus un
    # coût que le plafond peut additionner : il n'a rien à borner.
    _patch_tools(monkeypatch, {"a": 2, "b": 0, "c": None})
    actions, _results, _stop = _round(_calls("a", "b", "c"), _ReplyCostBudget(ceiling=2))
    assert [a["proposal"]["contact_id"] for a in actions if a.get("proposal")] == ["a", "b", "c"]


def test_the_ceiling_holds_across_tool_rounds_of_the_same_reply(monkeypatch):
    _patch_tools(monkeypatch, {"a": 1, "b": 1})
    budget = _ReplyCostBudget(ceiling=1)
    first, _r1, _s1 = _round(_calls("a"), budget)
    second, _r2, _s2 = _round(_calls("b"), budget)
    assert first[0].get("proposal")
    assert "proposal" not in second[0]


def test_run_chat_with_tools_forwards_the_ceiling_to_the_loop(monkeypatch):
    captured: dict = {}

    async def _fake(*_args, **kwargs):
        captured.update(kwargs)
        return "ok", []

    monkeypatch.setattr(chat_orchestrator, "_run_chat_with_tools", _fake)
    asyncio.run(
        chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None, reply_cost_ceiling=8)
    )
    assert captured["reply_cost_ceiling"] == 8


def test_chat_request_defaults_to_no_ceiling():
    assert ChatRequest(message="Bonjour", user_id="u1").reply_cost_ceiling is None
    assert ChatRequest(message="Bonjour", user_id="u1", reply_cost_ceiling=8).reply_cost_ceiling == 8


def test_the_router_forwards_the_ceiling_it_received(client, monkeypatch):
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured.update(kwargs)
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1", "reply_cost_ceiling": 8})
    assert res.status_code == 200
    last = [b for b in res.text.strip().split("\n\n") if b.strip().startswith("data:")][-1]
    assert json.loads(last.strip()[len("data:") :].strip())["data"]["reply"] == "réponse"
    assert captured["reply_cost_ceiling"] == 8
