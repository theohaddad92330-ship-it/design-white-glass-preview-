"""CACHE-LLM (15/10) — le préfixe STABLE d'un appel de classe B est identique,
octet pour octet, entre deux utilisateurs.

Le cache de prompt du fournisseur porte sur un PRÉFIXE, dans l'ordre
outils → system → messages. Laura envoie ~150 outils (~80 k jetons) AVANT son
system : un seul outil retiré au milieu de la liste (une connexion absente,
``ask_clarification`` retiré pour une question explicite, la recherche web
retirée en mode rapide) faisait rater TOUT le préfixe, outils et system
compris. Les outils variables passent désormais EN FIN de liste, et une coupure
de cache est posée sur le dernier outil stable.
"""

from __future__ import annotations

import json

from app.prompts import bellum_advisor
from app.services import prompt_cache_layout
from app.services.chat_tools import CHAT_TOOLS, TOOL_REQUIRED_FAMILIES, tools_for
from app.services.claude_service import _cached_system


def _prefix(tools: list[dict]) -> str:
    """Le préfixe d'outils mis en cache : jusqu'à la coupure incluse."""
    ordered = prompt_cache_layout.cache_ordered_tools(tools)
    marks = [i for i, tool in enumerate(ordered) if "cache_control" in tool]
    assert len(marks) == 1, "une seule coupure de cache dans les outils"
    return json.dumps(ordered[: marks[0] + 1], ensure_ascii=False, sort_keys=True)


def test_two_users_with_different_connections_share_the_tool_prefix() -> None:
    families = sorted({family for fams in TOOL_REQUIRED_FAMILIES.values() for family in fams})
    everything = tools_for(None)
    nothing_connected = tools_for([])
    half = tools_for(families[: len(families) // 2])
    assert len(everything) != len(nothing_connected), "le test doit comparer deux listes différentes"
    assert _prefix(everything) == _prefix(nothing_connected) == _prefix(half)


def test_removing_the_clarification_or_web_search_keeps_the_prefix() -> None:
    tools = tools_for(None)
    explicit = [tool for tool in tools if tool["name"] not in {"ask_clarification", "web_search"}]
    assert _prefix(tools) == _prefix(explicit)


def test_the_volatile_tools_go_last_and_nothing_is_lost() -> None:
    tools = tools_for(None)
    ordered = prompt_cache_layout.cache_ordered_tools(tools)
    assert sorted(t["name"] for t in ordered) == sorted(t["name"] for t in tools)
    volatile = prompt_cache_layout.volatile_tool_names()
    first_volatile = next(i for i, t in enumerate(ordered) if t["name"] in volatile)
    assert all(t["name"] in volatile for t in ordered[first_volatile:])


def test_the_shared_catalogue_is_never_mutated() -> None:
    before = json.dumps(CHAT_TOOLS, sort_keys=True)
    prompt_cache_layout.cache_ordered_tools(tools_for(None))
    assert json.dumps(CHAT_TOOLS, sort_keys=True) == before
    assert not any("cache_control" in tool for tool in CHAT_TOOLS)


def test_a_list_with_no_stable_tool_gets_no_breakpoint() -> None:
    only_volatile = [t for t in tools_for(None) if t["name"] in prompt_cache_layout.volatile_tool_names()]
    assert not any("cache_control" in t for t in prompt_cache_layout.cache_ordered_tools(only_volatile))
    assert prompt_cache_layout.cache_ordered_tools([]) == []


def test_the_volatile_set_reads_every_source_of_removal() -> None:
    volatile = prompt_cache_layout.volatile_tool_names()
    assert set(TOOL_REQUIRED_FAMILIES) <= volatile
    assert {"ask_clarification", "web_search"} <= volatile
    assert "search_workspace_accounts" in volatile  # couche « workspace » d'un SourcePlan


def test_the_invariant_head_of_laura_is_byte_identical_between_two_users() -> None:
    def system(profile: dict, account: dict, first_name: str) -> list:
        text = bellum_advisor.build_system_prompt(profile, account, "contacts", "plan", first_name=first_name)
        blocks = _cached_system(text)
        assert isinstance(blocks, list) and "cache_control" in blocks[0]
        return blocks

    a = system({"esn_name": "ESN A"}, {"company_name": "ACME"}, "Jeanne")
    b = system({"esn_name": "ESN B", "sectors": ["Banque"]}, {"company_name": "Globex"}, "Karim")
    assert a[0]["text"] == b[0]["text"], "le segment invariant de Laura ne porte rien d'un utilisateur"
    assert a[1]["text"] != b[1]["text"], "le segment de profil, lui, est propre à chacun"


# ── sur le fil : le transport de Laura envoie l'ordre caché ──────────────────

import pytest  # noqa: E402

from app.services import chat_orchestrator  # noqa: E402
from tests.test_chat_orchestrator import (  # noqa: E402,F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
)


async def _first_call_tools(monkeypatch, message: str) -> list[dict]:
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools("sys", message, user_id="u1", profile_data=None, user_message=message)
    return fake.messages.calls[0]["tools"]


@pytest.mark.asyncio
async def test_laura_sends_the_stable_tools_first_with_one_breakpoint(monkeypatch) -> None:
    sent = await _first_call_tools(monkeypatch, "Analyse Decathlon")
    marks = [i for i, tool in enumerate(sent) if "cache_control" in tool]
    assert len(marks) == 1
    volatile = prompt_cache_layout.volatile_tool_names()
    assert sent[marks[0]]["name"] not in volatile
    assert all(tool["name"] in volatile for tool in sent[marks[0] + 1 :])


@pytest.mark.asyncio
async def test_an_explicit_question_reads_the_same_tool_prefix(monkeypatch) -> None:
    """« Qui est le DSI de X ? » retire ``ask_clarification`` : le préfixe d'outils
    mis en cache reste celui de « Analyse Decathlon », à l'octet."""
    plain = await _first_call_tools(monkeypatch, "Analyse Decathlon")
    explicit = await _first_call_tools(monkeypatch, "Qui est le DSI de Société Générale ?")

    def head(tools: list[dict]) -> str:
        cut = next(i for i, tool in enumerate(tools) if "cache_control" in tool)
        return json.dumps(tools[: cut + 1], ensure_ascii=False, sort_keys=True)

    assert {t["name"] for t in plain} != {t["name"] for t in explicit}
    assert head(plain) == head(explicit)
