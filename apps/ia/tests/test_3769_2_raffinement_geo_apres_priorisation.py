"""#3769.2 (lot M06) — après « priorise mes comptes », « seulement en Occitanie »
se RÉSOUT : la zone est lue sans réseau (`read_request`), l'outil de
clarification est retiré et la consigne nomme l'appel exact à faire
(`get_portfolio_priorities` avec `region`). Sans priorisation juste avant, ou
sans zone lisible, rien ne change.
"""

from __future__ import annotations

from app.services.chat_thread_state import cited_objects
from app.services.portfolio_geo_refine import portfolio_geo_refine_note, portfolio_geo_refinement


def test_occitanie_after_priorities_resolves_to_the_region_code() -> None:
    assert portfolio_geo_refinement("seulement en Occitanie", "get_portfolio_priorities") == {"region": "76"}


def test_a_department_number_after_priorities() -> None:
    assert portfolio_geo_refinement("que dans le 34", "get_portfolio_priorities") == {"departments": ["34"]}


def test_without_priorities_just_before_nothing_is_routed() -> None:
    assert portfolio_geo_refinement("seulement en Occitanie", "run_account_search") is None
    assert portfolio_geo_refinement("seulement en Occitanie", "") is None


def test_without_a_readable_zone_nothing_is_routed() -> None:
    assert portfolio_geo_refinement("et le premier, qui contacter ?", "get_portfolio_priorities") is None


def test_the_note_names_the_call_and_forbids_asking_again() -> None:
    note = portfolio_geo_refine_note({"region": "76"})
    assert "get_portfolio_priorities" in note
    assert '"region": "76"' in note
    assert "Occitanie" in note
    assert "ne redemande pas" in note


def test_priorities_output_becomes_the_last_list_of_the_thread() -> None:
    output = {
        "now": [{"id": "a-1", "companyName": "ACME"}],
        "toVerify": [],
        "toWatch": [{"id": "a-2", "companyName": "Latecoere"}],
        "notNow": [{"id": "a-3", "companyName": "Zeta"}],
    }
    objects, is_list = cited_objects("get_portfolio_priorities", output)
    assert is_list
    assert [obj.label for obj in objects] == ["ACME", "Latecoere", "Zeta"]


# ── Le tour rejoué : catalogue vu par le modèle ──────────────────────────────

import pytest  # noqa: E402

from app.services import chat_orchestrator  # noqa: E402
from app.services.chat_thread_state import ThreadState, ThreadStateCollector  # noqa: E402
from tests.test_chat_orchestrator import (  # noqa: E402, F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
)


def _thread(last_list_tool: str) -> ThreadStateCollector:
    return ThreadStateCollector(ThreadState(last_list_tool=last_list_tool))


@pytest.mark.asyncio
async def test_replayed_turn_occitanie_after_priorities_is_routed_not_clarified(monkeypatch) -> None:
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "seulement en Occitanie",
        user_id="u1",
        profile_data=None,
        user_message="seulement en Occitanie",
        thread=_thread("get_portfolio_priorities"),
    )
    first_call = fake.messages.calls[0]
    assert "ask_clarification" not in {tool["name"] for tool in first_call["tools"]}
    assert '"region": "76"' in str(first_call["system"])


@pytest.mark.asyncio
async def test_replayed_turn_without_priorities_keeps_the_clarification_tool(monkeypatch) -> None:
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "seulement en Occitanie",
        user_id="u1",
        profile_data=None,
        user_message="seulement en Occitanie",
        thread=_thread("find_needs"),
    )
    first_call = fake.messages.calls[0]
    assert "ask_clarification" in {tool["name"] for tool in first_call["tools"]}
    assert "get_portfolio_priorities` avec" not in str(first_call["system"])
