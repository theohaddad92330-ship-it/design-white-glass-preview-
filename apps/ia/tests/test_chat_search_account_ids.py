"""#3227 — `run_account_search` et `search_market_memory` rendent l'ID du compte
quand l'entreprise trouvée EST un compte de l'espace appelant, pour que Laura
pose la racine du groupe dans le fil (`note_thread_context.group_scope_root`).

Jamais l'id d'un autre espace ; jamais une clé vide pour une entreprise qui
n'est pas un compte.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api, chat_tools

USER = "66666666-6666-4666-8666-666666666666"
OWNED_ID = "11111111-1111-4111-8111-111111111111"


class _Query:
    def __init__(self, store: dict[str, Any], rows: list[dict[str, str]]) -> None:
        self.store = store
        self.rows = rows

    def select(self, *_a: object) -> _Query:
        return self

    def in_(self, column: str, values: list[str]) -> _Query:
        self.store["in"] = (column, values)
        return self

    def eq(self, column: str, value: str) -> _Query:
        self.store.setdefault("eq", []).append((column, value))
        return self

    def neq(self, column: str, value: str) -> _Query:
        self.store.setdefault("neq", []).append((column, value))
        return self

    async def aexecute(self) -> Any:
        class _Res:
            data = self.rows

        return _Res()


class _Supabase:
    def __init__(self, rows: list[dict[str, str]]) -> None:
        self.store: dict[str, Any] = {}
        self.rows = rows

    def table(self, name: str) -> _Query:
        self.store["table"] = name
        return _Query(self.store, self.rows)


def _items() -> list[dict[str, str]]:
    return [{"name": "Docaposte", "siren": "123456789"}, {"name": "Autre", "siren": "987654321"}]


@pytest.mark.asyncio
async def test_an_owned_account_gets_its_id_and_a_stranger_gets_none(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _Supabase([{"id": OWNED_ID, "siren": "123456789"}])
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: fake)
    items = _items()

    await chat_tools._attach_owned_account_ids(items, USER)

    assert items[0]["account_id"] == OWNED_ID
    assert "account_id" not in items[1]
    # Scopé à l'appelant : c'est ce filtre qui interdit l'id d'un autre espace.
    assert fake.store["table"] == "accounts"
    assert ("user_id", USER) in fake.store["eq"]


@pytest.mark.asyncio
async def test_a_failed_lookup_names_no_id(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> Any:
        raise RuntimeError("down")

    monkeypatch.setattr("app.services.supabase_client.get_supabase", boom)
    items = _items()
    await chat_tools._attach_owned_account_ids(items, USER)
    assert all("account_id" not in item for item in items)


@pytest.mark.asyncio
async def test_run_account_search_wires_the_ids_end_to_end(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_search(_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"items": _items(), "criteria": {"sectors": ["it"]}}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search)
    monkeypatch.setattr(
        "app.services.supabase_client.get_supabase", lambda: _Supabase([{"id": OWNED_ID, "siren": "123456789"}])
    )

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"sectors": ["it"]}, user_id=USER, profile_data=None
    )

    assert [item.get("account_id") for item in result["items"]] == [OWNED_ID, None]


@pytest.mark.asyncio
async def test_market_memory_id_comes_from_the_validated_route_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    row = {
        "companyName": "Docaposte",
        "coverage": {"covered": True, "marketPaths": 41, "esnObserved": [], "observedStack": [], "roleFamilies": []},
    }

    async def fake(*_a: object, **_k: object) -> dict[str, object]:
        return {
            "status": "ok",
            "truncated": False,
            "matches": [{**row, "accountRoute": f"/accounts/{OWNED_ID}"}, {**row, "companyName": "Autre"}],
        }

    monkeypatch.setattr(bellum_api, "search_market_memory", fake)
    result = await chat_tools.execute_chat_tool(
        "search_market_memory", {"technology": "java"}, user_id=USER, profile_data=None
    )

    assert result["matches"][0]["account_id"] == OWNED_ID
    assert "account_id" not in result["matches"][1]


@pytest.mark.asyncio
async def test_strict_exclusion_skips_the_workspace_lookup_and_the_membership_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3853 (recette prod 09/10) — en portée « Sans les données de l'espace »,
    `run_account_search` ne doit NI lire le portefeuille NI marquer un compte
    « déjà dans ton espace » : la carte affichait « Déjà dans ton espace » sur
    Société Générale alors que la portée promettait de ne rien lire de
    l'espace. L'absence de vérification se NOMME par l'absence du champ —
    jamais un `already_in_workspace: false` qui prétendrait avoir vérifié."""

    async def _fake_search(_input: dict, *, profile_data: dict | None, space_key: str | None = None) -> dict:
        return {"items": _items(), "criteria": {"sectors": ["it"]}}

    monkeypatch.setattr(chat_tools, "_run_account_search", _fake_search)

    def _boom() -> Any:
        raise AssertionError("le portefeuille ne doit pas être lu en exclusion stricte")

    monkeypatch.setattr("app.services.supabase_client.get_supabase", _boom)

    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"sectors": ["it"]},
        user_id=USER,
        profile_data=None,
        exclude_workspace_data=True,
    )

    assert all("account_id" not in item for item in result["items"])
    assert all("already_in_workspace" not in item for item in result["items"])
    assert "already_in_workspace_count" not in result
    assert "new_targets_count" not in result
    assert "known_account_note" not in result


def test_both_descriptions_tell_laura_where_the_id_goes() -> None:
    for name in ("run_account_search", "search_market_memory"):
        tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)
        assert "account_id" in str(tool["description"]), name
        assert "group_scope_root" in str(tool["description"]), name
