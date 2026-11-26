"""#3391 — la raison des outils survit au tour : `reasoning_trace.tools_detail`.

Les CLÉS d'entrée seulement, jamais une valeur (#2442.3)."""

from __future__ import annotations

from app.services.chat_orchestrator import tools_detail_from_actions


def test_detail_carries_keys_never_values() -> None:
    actions = [{"tool": "find_accounts", "input": {"query": "ESN banque Lyon", "limit": 5}, "status": "done"}]
    detail = tools_detail_from_actions(actions)
    assert detail == [{"tool": "find_accounts", "mode": "write", "input_keys": ["limit", "query"], "silent": False}]
    assert "ESN banque Lyon" not in repr(detail)


def test_one_entry_per_action_in_order_and_junk_is_skipped() -> None:
    actions = [
        {"tool": "find_accounts", "input": {}},
        "pas un dict",
        {"input": {"a": 1}},  # sans nom d'outil : rien d'inventé
        {"tool": "get_pipeline", "input": None},
    ]
    assert [d["tool"] for d in tools_detail_from_actions(actions)] == ["find_accounts", "get_pipeline"]


def test_empty_actions_give_empty_list() -> None:
    assert tools_detail_from_actions([]) == []
