"""#3889 (recette R32, 16/10) — « Chez Servier, distingue besoins ouverts / anciens besoins / missions en
cours » : Laura répondait « partiellement », anciens besoins et missions « non vérifiés dans ce passage ».

`find_needs` avec `account_id` ET `include_closed` lit les TROIS rubriques en un seul passage ; une rubrique
vide est un FAIT LU (`read: true`, `count: 0`), jamais « non vérifié » ; une lecture en échec se nomme.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
ACCOUNT = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _wired(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _owned(*_a: object, **_k: object) -> dict[str, object]:
        return {"id": ACCOUNT, "company_name": "Servier"}

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", _owned)
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: object())


def _patch(monkeypatch: pytest.MonkeyPatch, needs: object, staffing: object) -> dict[str, object]:
    seen: dict[str, object] = {}

    async def _find_needs(user_id: str, **kwargs: object) -> object:
        seen.update(kwargs)
        return needs

    async def _staffing(user_id: str, account_id: str) -> object:
        seen["staffing_account"] = account_id
        return staffing

    monkeypatch.setattr(bellum_api, "find_needs", _find_needs)
    monkeypatch.setattr(bellum_api, "account_staffing_history", _staffing)
    return seen


def test_schema_expose_account_id() -> None:
    assert "account_id" in chat_tools.FIND_NEEDS_TOOL["input_schema"]["properties"]


@pytest.mark.asyncio
async def test_trois_rubriques_en_un_seul_appel(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _patch(
        monkeypatch,
        {
            "data": [
                {"id": "n1", "title": "Data", "account_name": "Servier", "status": "to_qualify"},
                {"id": "n2", "title": "Java", "account_name": "Servier", "status": "lost"},
            ]
        },
        {
            "consultants": [
                {"full_name": "A", "mission_label": "M1", "starts_on": "2025-01-01", "ends_on": None},
                {"full_name": "B", "mission_label": "M2", "starts_on": "2024-01-01", "ends_on": "2024-12-31"},
            ]
        },
    )
    out = await execute_chat_tool(
        "find_needs", {"account_id": ACCOUNT, "include_closed": True}, user_id=USER, profile_data=None
    )
    # #4287.9 — le compte se lit par son IDENTITÉ (`account_id`), jamais par son nom en recherche texte : « Servier »
    # ne retrouvait pas un besoin d'un compte nommé « Laboratoires Servier » (ou l'inverse) → « aucun besoin fermé ».
    assert seen["account_id"] == ACCOUNT and not seen.get("query")
    assert seen["staffing_account"] == ACCOUNT
    overview = out["account_overview"]
    assert [n["id"] for n in overview["open_needs"]["items"]] == ["n1"]
    assert [n["id"] for n in overview["past_needs"]["items"]] == ["n2"]
    assert [m["mission_label"] for m in overview["missions_in_progress"]["items"]] == ["M1"]
    assert [m["mission_label"] for m in overview["missions_ended"]["items"]] == ["M2"]
    assert all(overview[k]["read"] is True for k in ("open_needs", "past_needs", "missions_in_progress"))


@pytest.mark.asyncio
async def test_rubrique_vide_est_un_fait_lu_pas_non_verifie(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, {"data": []}, {"consultants": []})
    out = await execute_chat_tool(
        "find_needs", {"account_id": ACCOUNT, "include_closed": True}, user_id=USER, profile_data=None
    )
    overview = out["account_overview"]
    for key in ("open_needs", "past_needs", "missions_in_progress"):
        assert overview[key] == {"read": True, "count": 0, "items": []}


@pytest.mark.asyncio
async def test_lecture_missions_en_echec_se_nomme(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, {"data": [{"id": "n1", "title": "D", "account_name": "Servier", "status": "to_qualify"}]}, None)
    out = await execute_chat_tool(
        "find_needs", {"account_id": ACCOUNT, "include_closed": True}, user_id=USER, profile_data=None
    )
    overview = out["account_overview"]
    assert overview["missions_in_progress"]["read"] is False
    assert "count" not in overview["missions_in_progress"]
    assert overview["open_needs"]["read"] is True


@pytest.mark.asyncio
async def test_sans_account_id_rien_ne_change(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, {"data": [{"id": "n1", "title": "D", "account_name": "X", "status": "lost"}]}, None)
    out = await execute_chat_tool("find_needs", {"include_closed": True}, user_id=USER, profile_data=None)
    assert "account_overview" not in out
