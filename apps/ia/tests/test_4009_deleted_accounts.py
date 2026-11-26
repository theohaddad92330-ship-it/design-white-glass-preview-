"""#4009 — une fiche supprimée (soft delete, `status = 'deleted'`) ne ressort
jamais : ni rapprochée par nom (le pré-tour qui a rattaché un besoin à la
fiche supprimée d'Altran), ni par SIREN, ni citée par le brief hebdomadaire.
Décision Louis du 11/10 (#3670).

Le faux client APPLIQUE les filtres comme PostgREST le ferait (`eq`, `neq`,
`ilike`, `in_`) : sans la borne de statut, la ligne supprimée ressort.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services import chat_tools

USER = "66666666-6666-4666-8666-666666666666"
LIVING_ID = "11111111-1111-4111-8111-111111111111"
DELETED_ID = "22222222-2222-4222-8222-222222222222"

ACCOUNTS = [
    {
        "id": LIVING_ID,
        "user_id": USER,
        "company_name": "Capgemini",
        "siren": "330703844",
        "priority_score": 50,
        "status": "completed",
    },
    {
        "id": DELETED_ID,
        "user_id": USER,
        "company_name": "Altran Technologies",
        "siren": "702012956",
        "priority_score": 90,
        "status": "deleted",
    },
]


class _FilteringQuery:
    """Une requête chaînable qui filtre VRAIMENT ses lignes."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = list(rows)

    def select(self, *_a: object) -> _FilteringQuery:
        return self

    def eq(self, column: str, value: object) -> _FilteringQuery:
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def neq(self, column: str, value: object) -> _FilteringQuery:
        self._rows = [r for r in self._rows if r.get(column) != value]
        return self

    def ilike(self, column: str, pattern: str) -> _FilteringQuery:
        needle = pattern.strip("%").lower()
        self._rows = [r for r in self._rows if needle in str(r.get(column, "")).lower()]
        return self

    def in_(self, column: str, values: list[object]) -> _FilteringQuery:
        self._rows = [r for r in self._rows if r.get(column) in values]
        return self

    def order(self, *_a: object, **_k: object) -> _FilteringQuery:
        return self

    def limit(self, *_a: object) -> _FilteringQuery:
        return self

    def __getattr__(self, _name: str):
        # lte / gte / is_ … sur les autres tables : sans effet ici.
        def _chain(*_a: object, **_k: object) -> _FilteringQuery:
            return self

        return _chain

    async def aexecute(self) -> Any:
        return SimpleNamespace(data=self._rows)


class _FilteringSupabase:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _FilteringQuery:
        return _FilteringQuery(self._tables.get(name, []))


@pytest.mark.asyncio
async def test_4009_name_match_never_returns_a_deleted_account(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FilteringSupabase({"accounts": ACCOUNTS})
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: fake)

    assert await chat_tools._accounts_named_like("Altran Technologies", USER) == []
    # Sait dire OUI : la fiche vivante se rapproche toujours.
    living = await chat_tools._accounts_named_like("Capgemini", USER)
    assert [row["id"] for row in living] == [LIVING_ID]


@pytest.mark.asyncio
async def test_4009_siren_match_never_attaches_a_deleted_account(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FilteringSupabase({"accounts": ACCOUNTS})
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: fake)
    items = [{"name": "Altran", "siren": "702012956"}, {"name": "Capgemini", "siren": "330703844"}]

    await chat_tools._attach_owned_account_ids(items, USER)

    assert "account_id" not in items[0]
    assert items[1]["account_id"] == LIVING_ID


def test_4009_weekly_brief_never_cites_a_deleted_account(client: TestClient) -> None:
    with (
        patch("app.routers.weekly.get_supabase", return_value=_FilteringSupabase({"accounts": ACCOUNTS})),
        patch("app.routers.weekly.build_user_prompt", return_value="PROMPT") as build_prompt,
        patch("app.routers.weekly.call_claude", new_callable=AsyncMock, return_value=({"greeting": "Bonjour"}, None)),
    ):
        res = client.post("/weekly/briefing", json={"user_id": USER, "profile_data": {"esn_name": "Acme"}})

    assert res.status_code == 200
    cited = [account["company_name"] for account in build_prompt.call_args.kwargs["accounts"]]
    assert cited == ["Capgemini"]
