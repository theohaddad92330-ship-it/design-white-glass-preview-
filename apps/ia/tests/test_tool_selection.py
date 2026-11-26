"""#4112 — sélection d'outils pour Laura : noyau stable + `chercher_un_outil`."""

from __future__ import annotations

import asyncio

import pytest

from app.services import chat_orchestrator
from app.services.chat_tools import CHAT_TOOLS, tools_for
from app.services.tool_selection import (
    CORE_TOOL_NAMES,
    SEARCH_TOOL_NAME,
    ToolSelection,
    search_tools,
    tool_selection_enabled,
)

USER = "11111111-1111-4111-8111-111111111111"


def _names(tools: list[dict]) -> list[str]:
    return [str(t["name"]) for t in tools]


def test_flag_is_off_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LAURA_TOOL_SELECTION_ENABLED", raising=False)
    assert tool_selection_enabled() is False
    # Éteint : `tools_for` n'est pas touché — la liste est celle d'avant, octet pour octet.
    assert tools_for(None) == list(CHAT_TOOLS)
    assert SEARCH_TOOL_NAME not in _names(tools_for(None))


@pytest.mark.parametrize("value,expected", [("1", True), ("true", True), ("off", False), ("", False)])
def test_flag_parsing(monkeypatch: pytest.MonkeyPatch, value: str, expected: bool) -> None:
    monkeypatch.setenv("LAURA_TOOL_SELECTION_ENABLED", value)
    assert tool_selection_enabled() is expected


def test_core_is_stable_across_turns_and_reduces_the_list() -> None:
    first = ToolSelection(tools_for(None)).current()
    second = ToolSelection(tools_for(None)).current()
    assert _names(first) == _names(second)
    assert SEARCH_TOOL_NAME in _names(first)
    assert len(first) < len(CHAT_TOOLS) // 3
    core_in_order = [n for n in _names(first) if n in CORE_TOOL_NAMES]
    assert core_in_order == [n for n in CORE_TOOL_NAMES if n in set(_names(CHAT_TOOLS))]


def test_core_names_exist_in_the_catalog() -> None:
    catalog = set(_names(CHAT_TOOLS))
    assert [n for n in CORE_TOOL_NAMES if n not in catalog] == []


# #4058.1 / #3889.1 (recette prod 14/10, FAIL le lendemain du merge de #4112) — ces deux
# gestes de recherche (interlocuteurs, projets documentés) retombaient en texte libre : ni
# `propose_people_search` ni `search_document_projects` n'étaient dans le noyau stable, donc
# invisibles du modèle tant que l'allumage (`LAURA_TOOL_SELECTION_ENABLED`) est actif, sans
# que rien dans leur propre prompt ne dise au modèle de les chercher par nom via
# `chercher_un_outil`. Le noyau est la seule protection qui ne dépend pas du jugement du
# modèle au tour où ça compte.
def test_people_search_and_document_projects_are_in_the_core() -> None:
    assert "propose_people_search" in CORE_TOOL_NAMES
    assert "search_document_projects" in CORE_TOOL_NAMES


def test_french_search_finds_a_tool_outside_the_core() -> None:
    found = search_tools("quelles factures sont bloquées ?", list(CHAT_TOOLS))
    assert 1 <= len(found) <= 5
    assert "get_invoice_blockers" in _names(found)
    assert "get_invoice_blockers" not in CORE_TOOL_NAMES


def test_search_folds_accents() -> None:
    assert _names(search_tools("agenda créneaux", list(CHAT_TOOLS))) == _names(search_tools("agenda creneaux", list(CHAT_TOOLS)))


def test_search_only_sees_the_filtered_catalog() -> None:
    catalog = [t for t in CHAT_TOOLS if t["name"] != "get_invoice_blockers"]
    assert "get_invoice_blockers" not in _names(search_tools("factures bloquées", catalog))


def test_empty_or_stopword_query_finds_nothing() -> None:
    assert search_tools("   ", list(CHAT_TOOLS)) == []
    assert search_tools("les des", list(CHAT_TOOLS)) == []


def test_discovered_tool_is_appended_after_the_stable_prefix() -> None:
    sel = ToolSelection(tools_for(None))
    before = _names(sel.current())
    out = sel.run_search({"query": "factures bloquées"})
    assert out["tools"]
    after = _names(sel.current())
    assert after[: len(before)] == before
    assert "get_invoice_blockers" in after[len(before) :]


def test_unknown_search_has_a_clear_empty_answer() -> None:
    out = ToolSelection(tools_for(None)).run_search({"query": "zzzqqq"})
    assert out["tools"] == [] and out["message"]
    assert "error" in ToolSelection(tools_for(None)).run_search({})


def test_reject_unavailable_distinguishes_unloaded_from_unknown() -> None:
    sel = ToolSelection(tools_for(None))
    assert sel.reject_unavailable("get_account_briefing") is None
    unloaded = sel.reject_unavailable("get_invoice_blockers")
    assert unloaded and SEARCH_TOOL_NAME in unloaded["error"] and "pas chargé" in unloaded["error"]
    unknown = sel.reject_unavailable("outil_qui_nexiste_pas")
    assert unknown and "inconnu" in unknown["error"].lower()
    sel.run_search({"query": "factures bloquées"})
    assert sel.reject_unavailable("get_invoice_blockers") is None


def test_no_send_tool_is_reachable_by_search() -> None:
    for query in ("envoyer un email", "envoi message", "send mail"):
        for tool in search_tools(query, list(CHAT_TOOLS)):
            assert not str(tool["name"]).startswith(("send_", "envoyer"))


def _call(name: str, tool_input: dict) -> chat_orchestrator._ToolCall:
    return chat_orchestrator._ToolCall(id="t1", name=name, input=tool_input)


async def _noop_emit(_event: dict) -> None:
    return None


def _run(sel: ToolSelection | None, name: str, tool_input: dict):
    return asyncio.run(
        chat_orchestrator._execute_one_tool(
            _call(name, tool_input),
            user_id=USER,
            profile_data=None,
            crm_connected=False,
            crm_provider="",
            semaphore=asyncio.Semaphore(1),
            emit=_noop_emit,
            tool_selection=sel,
        )
    )


def test_discovered_tool_is_executed_afterwards(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def fake_exec(name, tool_input, **_kw):
        calls.append(name)
        return {"ok": True}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", fake_exec)
    sel = ToolSelection(tools_for(None))
    _entry, out, is_error = _run(sel, SEARCH_TOOL_NAME, {"query": "factures bloquées"})
    assert not is_error and out["tools"] and calls == []  # la recherche ne touche aucun exécuteur
    _entry, out, is_error = _run(sel, "get_invoice_blockers", {})
    assert out == {"ok": True} and calls == ["get_invoice_blockers"]


def test_undiscovered_and_unknown_tools_return_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(*_a, **_kw):
        raise AssertionError("l'exécuteur ne doit pas être appelé")

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", boom)
    sel = ToolSelection(tools_for(None))
    for name in ("get_invoice_blockers", "outil_qui_nexiste_pas"):
        entry, out, _err = _run(sel, name, {})
        assert SEARCH_TOOL_NAME in out["error"]
        assert entry["status"] == "error"


def test_without_selection_the_executor_path_is_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    async def fake_exec(name, tool_input, **_kw):
        seen.append(name)
        return {"ok": True}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", fake_exec)
    _entry, out, _err = _run(None, "get_invoice_blockers", {})
    assert out == {"ok": True} and seen == ["get_invoice_blockers"]



# Aucun outil perdu : chaque spec du catalogue est soit exposée d'office, soit retrouvée
# par `chercher_un_outil` quand le modèle la demande par son NOM — c'est ce que lui dit
# `reject_unavailable` (« cherche-le d'abord »). Avant, `get_account_access`,
# `get_account_firmographics`, `get_account_strategy_5p` et `enrich_contact` restaient
# introuvables par leur propre nom, noyés sous des descriptions plus bavardes.
def test_every_catalog_tool_is_exposed_or_found_by_its_name() -> None:
    catalog = tools_for(None)
    sel = ToolSelection(catalog)
    exposed = sel.exposed_names()
    lost = [
        str(t["name"])
        for t in catalog
        if t["name"] not in exposed and t["name"] not in _names(search_tools(str(t["name"]), catalog, exclude=exposed))
    ]
    assert lost == []


def test_core_plus_searchable_catalog_is_exactly_the_current_list() -> None:
    catalog = tools_for(None)
    sel = ToolSelection(catalog)
    for tool in catalog:
        if tool["name"] not in sel.exposed_names():
            sel.run_search({"query": str(tool["name"])})
    names = _names(sel.current())
    assert len(names) == len(set(names))  # rien en double
    assert set(names) - {SEARCH_TOOL_NAME} == set(_names(catalog))


def test_core_order_does_not_depend_on_catalog_order() -> None:
    catalog = tools_for(None)
    assert _names(ToolSelection(catalog).current()) == _names(ToolSelection(list(reversed(catalog))).current())
