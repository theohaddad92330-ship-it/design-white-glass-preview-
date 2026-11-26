"""#3857 (lot RBJ, recette prod 11/10, 03f2b2e83a) — « ouvre la fiche Société Générale » alors que
DEUX fiches portent ce nom : Laura répondait « Laquelle veux-tu ouvrir ? » sans bouton ni nom.

Le lot RBA a retiré la promesse « options juste dessous » ; il restait à FAIRE rendre les boutons.
Le modèle n'appelle pas `offer_reply_options` à coup sûr : la règle vit donc dans le CHEMIN. Quand
`search_workspace_accounts` rend plusieurs fiches de même nom, l'orchestrateur pose lui-même UN
bouton par fiche, nommé par ce qui les distingue (secteur, puis responsable, puis dernière analyse —
données réelles seulement). Rien de distinguable → aucun bouton (jamais d'option inventée)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.chat_thread_state import ThreadStateCollector
from app.services.homonym_options import homonym_account_options

SEARCH = "search_workspace_accounts"
SG_BANK = {
    "account_id": "a-1",
    "company_name": "Société Générale",
    "sector": "Banque de détail",
    "owner": None,
    "last_analyzed_at": None,
}
SG_INV = {
    "account_id": "a-2",
    "company_name": "Société Générale",
    "sector": "Banque d'investissement",
    "owner": None,
    "last_analyzed_at": None,
}


class _Throttle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _Stream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in self._response.content:
            if block.type == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _Messages:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})
        return _Stream(self._responses.pop(0))


def _install(monkeypatch, responses):
    fake = SimpleNamespace(messages=_Messages(responses))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    return fake.messages


def _resp(stop_reason, content):
    return SimpleNamespace(stop_reason=stop_reason, content=content)


def _tool_use(name, tool_input, call_id):
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=call_id)


def _search_output(accounts):
    return {"accounts": accounts, "total": len(accounts), "truncated": False, "status": "success"}


# --- fonction pure -------------------------------------------------------------------------------


def test_two_homonyms_become_two_named_options() -> None:
    offer = homonym_account_options("Société Générale", [SG_BANK, SG_INV])
    assert offer is not None
    assert offer.options == ["Société Générale — Banque de détail", "Société Générale — Banque d'investissement"]
    assert [obj.id for obj in offer.objects] == ["a-1", "a-2"]


def test_same_sector_falls_back_to_owner_then_analysis_date() -> None:
    a = {**SG_BANK, "owner": "Camille"}
    b = {**SG_BANK, "account_id": "a-2", "owner": "Louis"}
    offer = homonym_account_options("Société Générale", [a, b])
    assert offer is not None and len(set(offer.options)) == 2
    assert "Camille" in offer.options[0] and "Louis" in offer.options[1]
    c = {**SG_BANK, "last_analyzed_at": "2026-09-01T10:00:00Z"}
    d = {**SG_BANK, "account_id": "a-2", "last_analyzed_at": "2026-10-02T10:00:00Z"}
    offer = homonym_account_options("Société Générale", [c, d])
    assert offer is not None and "01/09/2026" in offer.options[0] and "02/10/2026" in offer.options[1]


def test_nothing_to_tell_them_apart_means_no_button() -> None:
    twin = {**SG_BANK, "account_id": "a-2"}
    assert homonym_account_options("Société Générale", [SG_BANK, twin]) is None


def test_one_match_or_different_names_is_not_a_homonym() -> None:
    assert homonym_account_options("Société Générale", [SG_BANK]) is None
    other = {**SG_INV, "company_name": "Société Générale Securities Services"}
    assert homonym_account_options("Société Générale", [SG_BANK, other]) is None


def test_more_than_four_homonyms_keep_four() -> None:
    rows = [{**SG_BANK, "account_id": f"a-{i}", "sector": f"Secteur {i}"} for i in range(6)]
    offer = homonym_account_options("Société Générale", rows)
    assert offer is not None and len(offer.options) == 4


# --- le tour entier ------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rbj_3857_the_real_turn_ends_with_one_named_button_per_fiche(monkeypatch):
    messages = _install(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use(SEARCH, {"query": "Société Générale"}, "t1")]),
            _resp(
                "end_turn",
                [SimpleNamespace(type="text", text="Deux fiches Société Générale : laquelle veux-tu ouvrir ?")],
            ),
        ],
    )
    executed = AsyncMock(return_value=_search_output([SG_BANK, SG_INV]))
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executed)
    thread = ThreadStateCollector()

    _reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "ouvre la fiche Société Générale",
        user_id="u1",
        profile_data=None,
        user_message="ouvre la fiche Société Générale",
        thread=thread,
    )

    offered = [a for a in actions if a.get("reply_options")]
    assert len(offered) == 1
    precision = offered[0]["reply_options"][0]
    assert precision["options"] == ["Société Générale — Banque de détail", "Société Générale — Banque d'investissement"]
    # le fil retient QUELLE fiche chaque bouton désigne : un clic ne retombe pas sur l'homonymie.
    assert [(o.id, o.label) for o in thread.state.last_list] == [
        ("a-1", "Société Générale — Banque de détail"),
        ("a-2", "Société Générale — Banque d'investissement"),
    ]
    # le modèle sait que les boutons sont posés (il ne les rappelle pas, ne les énumère pas).
    fed_back = str(messages.calls[1]["messages"])
    assert "offer_reply_options" in fed_back


@pytest.mark.asyncio
async def test_rbj_3857_no_second_set_when_the_model_offered_options_itself(monkeypatch):
    _install(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use(SEARCH, {"query": "Société Générale"}, "t1"),
                    _tool_use(
                        "offer_reply_options",
                        {"precisions": [{"question": "Laquelle ?", "options": ["SG Banque", "SG Inv"]}]},
                        "t2",
                    ),
                ],
            ),
            _resp("end_turn", [SimpleNamespace(type="text", text="Laquelle ?")]),
        ],
    )

    async def executor(name, tool_input, **_kw):
        if name == SEARCH:
            return _search_output([SG_BANK, SG_INV])
        return {
            "status": "reply_options",
            "reply_options": [{"question": "Laquelle ?", "options": ["SG Banque", "SG Inv"]}],
        }

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(side_effect=executor))
    _reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "ouvre la fiche Société Générale",
        user_id="u1",
        profile_data=None,
        user_message="ouvre la fiche Société Générale",
    )
    assert len([a for a in actions if a.get("reply_options")]) == 1


@pytest.mark.asyncio
async def test_rbj_3857_a_single_fiche_gets_no_button(monkeypatch):
    _install(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use(SEARCH, {"query": "Société Générale"}, "t1")]),
            _resp("end_turn", [SimpleNamespace(type="text", text="Voici la fiche.")]),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value=_search_output([SG_BANK])))
    _reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "ouvre la fiche Société Générale",
        user_id="u1",
        profile_data=None,
        user_message="ouvre la fiche Société Générale",
    )
    assert not [a for a in actions if a.get("reply_options")]
