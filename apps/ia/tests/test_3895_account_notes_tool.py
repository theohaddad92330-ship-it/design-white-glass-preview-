"""#3895 — Laura lit les notes d'un compte AVEC leur portée de groupe.

Décision Louis 11/10 : une note achats qui vaut pour une autre entité du même groupe doit pouvoir y être
rattachée. L'API sait déjà la servir (`NotesService.list` : `inheritedFrom`, `alsoAppliesTo`) ; aucun outil
de chat ne la lisait. Ce fichier vérifie que `get_account_notes` RELAIE cette lecture telle quelle, nomme
l'origine d'une note héritée, ne généralise jamais une note au-delà de sa portée, et distingue « aucune
note » de « compte introuvable ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "22222222-4222-4222-8222-222222222222"
ACCOUNT = "33333333-4333-8333-8333-333333333333"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_account_notes", tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_a_read_only_tool() -> None:
    assert "get_account_notes" in {t["name"] for t in CHAT_TOOLS}
    assert "get_account_notes" not in WRITE_TOOL_NAMES


def test_description_bounds_the_reach_of_a_note() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_notes")
    description = str(tool["description"])
    assert tool["input_schema"]["required"] == ["account_id"]
    assert "inheritedFrom" in description
    assert "alsoAppliesTo" in description
    # Une note ne vaut que là où elle le dit : jamais généralisée à un autre compte ou au groupe entier.
    assert "ne la généralise JAMAIS" in description
    # Un délai noté reste une durée DÉCLARÉE, pas une garantie.
    assert "durée déclarée" in description


@pytest.mark.asyncio
async def test_relays_the_notes_with_their_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "notes": [
            {
                "id": "n-1",
                "body": "Centrale d'achat obligatoire, délai six semaines",
                "pinned": True,
                "createdAt": "2026-10-01T09:00:00Z",
                "authorName": "Léa Martin",
                "inheritedFrom": {"id": "a-1", "name": "Sanofi"},
                "alsoAppliesTo": [],
            },
            {
                "id": "n-2",
                "body": "Point DSI du 3 octobre",
                "pinned": False,
                "createdAt": "2026-10-03T09:00:00Z",
                "authorName": None,
                "inheritedFrom": None,
                "alsoAppliesTo": [{"id": "a-3", "name": "Sanofi Genzyme"}],
            },
        ],
        "truncated": False,
    }

    async def _fake(user_id: str, account_id: str) -> dict:
        assert (user_id, account_id) == (USER, ACCOUNT)
        return payload

    monkeypatch.setattr(bellum_api, "account_notes", _fake, raising=False)
    out = await _run({"account_id": ACCOUNT})
    assert out["notes"] == payload["notes"]
    assert out["scope_note"]
    assert "ne vaut que" in out["scope_note"]


@pytest.mark.asyncio
async def test_no_note_is_named_without_generalising(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(user_id: str, account_id: str) -> dict:
        return {"notes": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "account_notes", _fake, raising=False)
    out = await _run({"account_id": ACCOUNT})
    assert out["notes"] == []
    assert "aucune note" in out["scope_note"].lower()
    assert "ne dit rien" in out["scope_note"]


@pytest.mark.asyncio
async def test_unknown_account_is_an_error_never_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(user_id: str, account_id: str) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "account_notes", _fake, raising=False)
    out = await _run({"account_id": ACCOUNT})
    assert out.get("error")
    assert "notes" not in out


@pytest.mark.asyncio
async def test_missing_account_id_is_refused_without_a_call(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _boom(user_id: str, account_id: str) -> dict:
        raise AssertionError("aucun appel sans compte")

    monkeypatch.setattr(bellum_api, "account_notes", _boom, raising=False)
    out = await _run({})
    assert out.get("error")


@pytest.mark.asyncio
async def test_bridge_down_is_named(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _none(user_id: str, account_id: str) -> None:
        return None

    monkeypatch.setattr(bellum_api, "account_notes", _none, raising=False)
    out = await _run({"account_id": ACCOUNT})
    assert out.get("error")
    assert "notes" not in out
