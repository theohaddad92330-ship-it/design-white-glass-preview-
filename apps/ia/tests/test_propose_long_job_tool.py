"""#1952.3 / #1952.7 (épopée #2844, lot P07 30/09) — `propose_long_job`.

Le matching massif et la recherche multi-sources avaient leur moteur asynchrone
(files BullMQ, tables de job) mais AUCUN outil de conversation pour les lancer.
Ce test REJOUE le tour — entrée du modèle → outil appelé → réponse — et tient :

1. l'outil est exposé, compté comme écriture, et AVANT `push_profile` ;
2. son exécution rend une PROPOSITION (jamais un effet, aucun crédit) ;
3. un besoin introuvable, étranger ou en trop ne donne AUCUNE carte ;
4. la recherche hors vivier porte sur UN seul besoin.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
NEED_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
NEED_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


@pytest.fixture(autouse=True)
def _bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_need_read(user_id: str, need_id: str):
        if need_id in (NEED_A, NEED_B):
            return {"id": need_id, "title": f"Besoin {need_id[:1]}"}
        return {"error": "need_not_found"}

    monkeypatch.setattr(bellum_api, "need_read", fake_need_read)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("propose_long_job", tool_input, user_id=USER, profile_data=None)


def test_tool_is_registered_before_push_profile_and_counted_as_a_write() -> None:
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names[-1] == "push_profile"
    assert names.index("propose_long_job") < names.index("push_profile")
    assert "propose_long_job" in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_bulk_matching_turn_returns_a_proposal_not_an_effect() -> None:
    result = await _run({"job": "bulk_matching", "need_ids": [NEED_A, NEED_B, NEED_A]})
    proposal = result.get("proposal") or result
    assert proposal["action"] == "propose_long_job"
    assert proposal["job"] == "bulk_matching"
    assert proposal["need_ids"] == [NEED_A, NEED_B]  # dédoublonné, ordre gardé
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_multi_source_search_turn_carries_the_volume() -> None:
    result = await _run({"job": "multi_source_search", "need_ids": [NEED_A], "max_per_source": 5})
    proposal = result.get("proposal") or result
    assert proposal["job"] == "multi_source_search"
    assert proposal["max_per_source"] == 5


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "tool_input",
    [
        {"job": "export_everything", "need_ids": [NEED_A]},
        {"job": "bulk_matching", "need_ids": []},
        {"job": "bulk_matching", "need_ids": [NEED_A, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"]},
        {"job": "multi_source_search", "need_ids": [NEED_A, NEED_B]},
        {"job": "bulk_matching", "need_ids": [f"need-{i}" for i in range(51)]},
    ],
)
async def test_invalid_or_foreign_requests_produce_no_card(tool_input: dict) -> None:
    result = await _run(tool_input)
    assert "error" in result
    assert "action" not in result and "proposal" not in result
