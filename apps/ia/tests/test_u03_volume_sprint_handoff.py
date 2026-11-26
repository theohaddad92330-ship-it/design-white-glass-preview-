"""Recette prod 01/10 (#3428, #3392) — « Trouve-moi 100 grands comptes » ne
rendait ni « Je peux te sortir les 100 » ni la carte Sprint : Laura proposait
seulement « Ouvrir Découvrir » (tour d'horizon limité à 20).

Cause : le schéma de `limit` dit « 1 à 20 », donc le modèle n'y met JAMAIS 100
et le détecteur de capacité (`limit` > 20) ne se déclenchait jamais ;
`find_accounts` n'avait aucun champ de volume du tout. Ces tests rejouent le
tour (entrée → outil → résultat) et prouvent que le volume demandé atteint
l'outil, que le résultat dit quoi rendre, et que la liste complète a un lien."""

from __future__ import annotations

import pytest

from app.prompts.bellum_advisor import _BLOCK_ACCOUNT_VOLUME_SPRINT, build_system_prompt
from app.services import chat_tools

USER = "66666666-6666-4666-8666-666666666666"


@pytest.fixture(autouse=True)
def _stub_count(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _count(*_a: object, **_k: object) -> int | None:
        return 5

    monkeypatch.setattr(chat_tools, "_find_accounts_count", _count)


def _schema_props(tool: dict) -> dict:
    return tool["input_schema"]["properties"]


def test_both_search_tools_take_the_requested_count_beyond_the_cap() -> None:
    """Le volume demandé a une porte d'entrée qui n'est PAS plafonnée à 20."""
    for tool in (chat_tools.FIND_ACCOUNTS_TOOL, chat_tools.RUN_ACCOUNT_SEARCH_TOOL):
        prop = _schema_props(tool)["requested_count"]
        assert prop["type"] == "integer"
        assert "100" in prop["description"]


@pytest.mark.asyncio
async def test_find_accounts_with_100_requested_sends_the_model_to_the_sprint_not_to_discover_alone() -> None:
    result = await chat_tools.execute_chat_tool(
        "find_accounts",
        {"sectors": ["finance"], "region": ["84"], "requested_count": 100},
        user_id=USER,
        profile_data=None,
    )
    assert "error" not in result
    assert result["challenge"]["case"] == "action dont le coût dépasse la valeur probable"
    sprint = result["volume_sprint"]
    assert sprint["requested_count"] == 100
    assert sprint["next_tool"] == "run_account_search"
    assert sprint["render_as"] == "account_volume_sprint"
    assert sprint["full_list_href"].startswith("/discover?")
    assert "region=84" in sprint["full_list_href"]
    assert "laura=1" in sprint["full_list_href"]


@pytest.mark.asyncio
async def test_run_account_search_with_100_requested_tells_how_to_fill_the_card(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_search(_tool_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        items = [{"name": f"Société {n}"} for n in range(20)]
        return {"items": items, "criteria": {"sectors": ["finance"], "department": "69"}}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search)
    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"sectors": ["finance"], "department": "69", "requested_count": 100},
        user_id=USER,
        profile_data=None,
    )
    sprint = result["volume_sprint"]
    assert sprint["requested_count"] == 100
    assert sprint["returned_count"] == 20
    assert sprint["render_as"] == "account_volume_sprint"
    assert "next_tool" not in sprint
    # Le compte annoncé est celui qu'on A, jamais les 100 demandés (non mesuré).
    assert "full_list_count = 20" in sprint["instruction"]
    assert "department=69" in sprint["full_list_href"]
    assert result["challenge"]["case"] == "action dont le coût dépasse la valeur probable"


@pytest.mark.asyncio
async def test_a_request_within_the_cap_carries_no_sprint_handoff(monkeypatch: pytest.MonkeyPatch) -> None:
    """SAIT DIRE NON : 15 comptes demandés, aucun sprint, aucune consigne ajoutée."""

    async def _fake_search(_tool_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"items": [{"name": "A"}], "criteria": {"sectors": ["finance"]}}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search)
    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"sectors": ["finance"], "requested_count": 15},
        user_id=USER,
        profile_data=None,
    )
    assert "volume_sprint" not in result
    found = await chat_tools.execute_chat_tool(
        "find_accounts", {"sectors": ["finance"], "requested_count": 15}, user_id=USER, profile_data=None
    )
    assert "volume_sprint" not in found


@pytest.mark.asyncio
async def test_a_failed_search_never_carries_a_sprint(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_error(_tool_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"error": "Le registre des entreprises n'a pas répondu."}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_error)
    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"sectors": ["finance"], "requested_count": 100}, user_id=USER, profile_data=None
    )
    assert "volume_sprint" not in result


def test_the_prompt_opens_with_the_promise_and_forbids_the_discover_only_answer() -> None:
    block = _BLOCK_ACCOUNT_VOLUME_SPRINT
    assert "Je peux te sortir les" in block
    assert "`requested_count`" in block
    # Le réflexe interdit est décrit comme un GESTE, jamais par le libellé du bouton
    # (test_copilote_prompt_blocks refuse tout libellé de bouton cité dans un prompt).
    assert "renvoi vers l'écran de découverte" in block
    assert "Ouvrir Découvrir" not in block
    assert "UNE seule question" in block
    assert "VOLUME DE COMPTES DEMANDÉ ET CAPACITÉ RÉELLE" in build_system_prompt({}, {}, "", "")


def test_the_card_keeps_a_valid_full_list_link_and_drops_a_foreign_one() -> None:
    """Miroir de `reply-blocks.ts` : le lien de la liste complète reste DANS l'application."""
    from app.models.reply_blocks import validate_reply_block

    base = {
        "type": "account_volume_sprint",
        "full_list_count": 20,
        "sprint": [{"name": "Alpha"}],
        "focus": [],
    }
    kept = validate_reply_block({**base, "full_list_href": "/discover?region=84&laura=1"})
    assert kept is not None and kept["full_list_href"] == "/discover?region=84&laura=1"
    dropped = validate_reply_block({**base, "full_list_href": "https://evil.example/x"})
    assert dropped is not None and "full_list_href" not in dropped
    assert "full_list_href" not in (validate_reply_block(base) or {})
