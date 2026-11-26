"""Ownership-scoped fetch helpers (app/services/ownership.py)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.ownership import (
    ACTION_PLAN_ITEM_DUPLICATE_ASK_STATUSES,
    OUTREACH_DUPLICATE_ASK_STATUSES,
    fetch_owned_account,
    fetch_owned_contact,
    fetch_recent_action_plan_item_for_contact,
    fetch_pending_reminder_for_contact,
    fetch_recent_outreach_for_contact,
)


class _FakeQuery:
    def __init__(self, store: dict) -> None:
        self._store = store
        self._filters: dict[str, str] = {}

    def select(self, _cols: str) -> "_FakeQuery":
        return self

    def eq(self, col: str, val: str) -> "_FakeQuery":
        self._filters[col] = val
        return self

    def maybe_single(self) -> "_FakeQuery":
        return self

    def execute(self):
        # Return the row only if every filter matches the seeded row.
        row = self._store
        ok = all(row.get(k) == v for k, v in self._filters.items())
        return type("Res", (), {"data": row if ok else None})()

    async def aexecute(self):
        return self.execute()


class _FakeSb:
    def __init__(self, row: dict) -> None:
        self._row = row

    def table(self, _name: str) -> _FakeQuery:
        return _FakeQuery(self._row)


async def test_fetch_owned_account_returns_row_when_owner_matches():
    sb = _FakeSb({"id": "acc-1", "user_id": "u-1", "company_name": "SG"})
    account = await fetch_owned_account(sb, "acc-1", "u-1")
    assert account["company_name"] == "SG"


async def test_fetch_owned_account_404_on_wrong_owner():
    sb = _FakeSb({"id": "acc-1", "user_id": "u-1"})
    with pytest.raises(HTTPException) as exc:
        await fetch_owned_account(sb, "acc-1", "someone-else")
    assert exc.value.status_code == 404


async def test_fetch_owned_account_404_on_empty_user():
    sb = _FakeSb({"id": "acc-1", "user_id": "u-1"})
    with pytest.raises(HTTPException) as exc:
        await fetch_owned_account(sb, "acc-1", "")
    assert exc.value.status_code == 404


async def test_fetch_owned_contact_scopes_by_user():
    sb = _FakeSb({"id": "c-1", "user_id": "u-1", "first_name": "Jane"})
    assert (await fetch_owned_contact(sb, "c-1", "u-1"))["first_name"] == "Jane"
    with pytest.raises(HTTPException):
        await fetch_owned_contact(sb, "c-1", "intruder")


# ── #3211 (LAU-FINAL-217) — fetch_recent_outreach_for_contact ───────────────


class _FakeOutreachQuery:
    """Chaîne minimale utilisée par `fetch_recent_outreach_for_contact` :
    `.select().eq().eq().eq().in_().order().limit().aexecute()`. Rend les
    lignes de `rows` dont TOUS les filtres `eq`/`in_` posés correspondent."""

    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows
        self._eq: dict[str, str] = {}
        self._in: dict[str, list[str]] = {}

    def select(self, _cols: str) -> "_FakeOutreachQuery":
        return self

    def eq(self, col: str, val: str) -> "_FakeOutreachQuery":
        self._eq[col] = val
        return self

    def in_(self, col: str, values: list[str]) -> "_FakeOutreachQuery":
        self._in[col] = list(values)
        return self

    def order(self, _col: str, ascending: bool = True) -> "_FakeOutreachQuery":
        return self

    def limit(self, _n: int) -> "_FakeOutreachQuery":
        return self

    async def aexecute(self):
        def _matches(row: dict) -> bool:
            if any(row.get(k) != v for k, v in self._eq.items()):
                return False
            return all(row.get(k) in v for k, v in self._in.items())

        matched = [row for row in self._rows if _matches(row)]
        return type("Res", (), {"data": matched})()


class _FakeOutreachSb:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def table(self, _name: str) -> _FakeOutreachQuery:
        return _FakeOutreachQuery(self._rows)


async def test_fetch_recent_outreach_returns_none_without_history():
    sb = _FakeOutreachSb([])
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "u-1", "email") is None


async def test_fetch_recent_outreach_scopes_by_contact_user_and_channel():
    row = {
        "id": "m-1",
        "contact_id": "c-1",
        "user_id": "u-1",
        "channel": "email",
        "status": "sent",
        "reason": None,
    }
    sb = _FakeOutreachSb([row])
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "u-1", "email") == row
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "intruder", "email") is None
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "u-1", "linkedin") is None


@pytest.mark.parametrize("status", OUTREACH_DUPLICATE_ASK_STATUSES)
async def test_fetch_recent_outreach_includes_sent_and_delivered(status: str) -> None:
    row = {"id": "m-1", "contact_id": "c-1", "user_id": "u-1", "channel": "email", "status": status}
    sb = _FakeOutreachSb([row])
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "u-1", "email") == row


@pytest.mark.parametrize("status", ["replied", "bounced", "failed", "cancelled", "expired", "drafted"])
async def test_fetch_recent_outreach_excludes_every_other_status(status: str) -> None:
    row = {"id": "m-1", "contact_id": "c-1", "user_id": "u-1", "channel": "email", "status": status}
    sb = _FakeOutreachSb([row])
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "u-1", "email") is None


async def test_fetch_recent_outreach_returns_none_on_missing_arguments():
    sb = _FakeOutreachSb([{"id": "m-1", "contact_id": "c-1", "user_id": "u-1", "channel": "email", "status": "sent"}])
    assert await fetch_recent_outreach_for_contact(sb, "", "u-1", "email") is None
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "", "email") is None
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "u-1", "") is None


# ── #3211.6 (épopée #3234) — fetch_recent_outreach_for_contact, workspace_id ──


async def test_fetch_recent_outreach_with_workspace_sees_a_colleagues_message():
    """Un COLLÈGUE (autre `user_id`) a envoyé le message : sans `workspace_id`,
    invisible (comportement d'avant ce lot) ; avec, il ressort — et porte son
    `user_id` pour que l'appelant le nomme plutôt que de le taire."""
    row = {
        "id": "m-1",
        "contact_id": "c-1",
        "user_id": "colleague",
        "workspace_id": "ws-1",
        "channel": "email",
        "status": "sent",
        "reason": None,
    }
    sb = _FakeOutreachSb([row])
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "me", "email") is None
    seen = await fetch_recent_outreach_for_contact(sb, "c-1", "me", "email", workspace_id="ws-1")
    assert seen == row
    assert seen["user_id"] == "colleague"


async def test_fetch_recent_outreach_with_workspace_excludes_other_workspaces():
    row = {
        "id": "m-1",
        "contact_id": "c-1",
        "user_id": "u-1",
        "workspace_id": "ws-other",
        "channel": "email",
        "status": "sent",
    }
    sb = _FakeOutreachSb([row])
    assert await fetch_recent_outreach_for_contact(sb, "c-1", "u-1", "email", workspace_id="ws-1") is None


# ── #3265.10 (épopée #3265, lot R11 29/09) — fetch_recent_action_plan_item_for_contact ──


async def test_fetch_recent_action_plan_item_returns_none_without_history():
    sb = _FakeOutreachSb([])
    assert await fetch_recent_action_plan_item_for_contact(sb, "c-1", "u-1", "email") is None


async def test_fetch_recent_action_plan_item_scopes_by_contact_user_and_channel():
    row = {
        "id": "api-1",
        "contact_id": "c-1",
        "user_id": "u-1",
        "channel": "email",
        "execution_status": "todo",
        "reason": None,
    }
    sb = _FakeOutreachSb([row])
    assert await fetch_recent_action_plan_item_for_contact(sb, "c-1", "u-1", "email") == row
    assert await fetch_recent_action_plan_item_for_contact(sb, "c-1", "intruder", "email") is None
    assert await fetch_recent_action_plan_item_for_contact(sb, "c-1", "u-1", "linkedin") is None


@pytest.mark.parametrize("status", ACTION_PLAN_ITEM_DUPLICATE_ASK_STATUSES)
async def test_fetch_recent_action_plan_item_includes_todo_and_done(status: str) -> None:
    row = {"id": "api-1", "contact_id": "c-1", "user_id": "u-1", "channel": "email", "execution_status": status}
    sb = _FakeOutreachSb([row])
    assert await fetch_recent_action_plan_item_for_contact(sb, "c-1", "u-1", "email") == row


@pytest.mark.parametrize("status", ["snoozed", "prepared", "obsolete"])
async def test_fetch_recent_action_plan_item_excludes_every_other_status(status: str) -> None:
    row = {"id": "api-1", "contact_id": "c-1", "user_id": "u-1", "channel": "email", "execution_status": status}
    sb = _FakeOutreachSb([row])
    assert await fetch_recent_action_plan_item_for_contact(sb, "c-1", "u-1", "email") is None


async def test_fetch_recent_action_plan_item_returns_none_on_missing_arguments():
    sb = _FakeOutreachSb(
        [{"id": "api-1", "contact_id": "c-1", "user_id": "u-1", "channel": "email", "execution_status": "todo"}]
    )
    assert await fetch_recent_action_plan_item_for_contact(sb, "", "u-1", "email") is None
    assert await fetch_recent_action_plan_item_for_contact(sb, "c-1", "", "email") is None
    assert await fetch_recent_action_plan_item_for_contact(sb, "c-1", "u-1", "") is None


# ── #3211.1 (extension, #3234) / #3211.9 — fetch_pending_reminder_for_contact ──


class _FakeUserActionsQuery:
    """Chaîne minimale utilisée par `fetch_pending_reminder_for_contact` :
    `.select().eq().eq().eq().order().limit().aexecute()`."""

    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows
        self._eq: dict[str, str] = {}

    def select(self, _cols: str) -> "_FakeUserActionsQuery":
        return self

    def eq(self, col: str, val: str) -> "_FakeUserActionsQuery":
        self._eq[col] = val
        return self

    def order(self, _col: str, ascending: bool = True) -> "_FakeUserActionsQuery":
        return self

    def limit(self, _n: int) -> "_FakeUserActionsQuery":
        return self

    async def aexecute(self):
        matched = [row for row in self._rows if all(row.get(k) == v for k, v in self._eq.items())]
        return type("Res", (), {"data": matched})()


class _FakeUserActionsSb:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def table(self, _name: str) -> _FakeUserActionsQuery:
        return _FakeUserActionsQuery(self._rows)


async def test_fetch_pending_reminder_returns_none_without_history():
    sb = _FakeUserActionsSb([])
    assert await fetch_pending_reminder_for_contact(sb, "c-1", "u-1") is None


async def test_fetch_pending_reminder_scoped_and_shaped():
    row = {
        "id": "ua-1",
        "contact_id": "c-1",
        "user_id": "u-1",
        "action_type": "plan_action_added",
        "metadata": {"router_intent": "schedule_reminder", "remind_at": "2026-12-25T09:00:00Z", "detail": "Relancer"},
        "created_at": "2026-09-20T09:00:00Z",
    }
    sb = _FakeUserActionsSb([row])
    assert await fetch_pending_reminder_for_contact(sb, "c-1", "u-1") == {
        "id": "ua-1",
        "remind_at": "2026-12-25T09:00:00Z",
        "note": "Relancer",
        "created_at": "2026-09-20T09:00:00Z",
        "user_id": "u-1",
    }
    assert await fetch_pending_reminder_for_contact(sb, "c-1", "intruder") is None
    assert await fetch_pending_reminder_for_contact(sb, "c-2", "u-1") is None


async def test_fetch_pending_reminder_ignores_other_router_intents():
    """Une autre action journalisée sur ce contact (ex. `prepare_message`) ne
    doit jamais être confondue avec un rappel — seul `schedule_reminder` l'est."""
    row = {
        "id": "ua-1",
        "contact_id": "c-1",
        "user_id": "u-1",
        "action_type": "plan_action_added",
        "metadata": {"router_intent": "export_contact_to_crm"},
        "created_at": "2026-09-20T09:00:00Z",
    }
    sb = _FakeUserActionsSb([row])
    assert await fetch_pending_reminder_for_contact(sb, "c-1", "u-1") is None


async def test_fetch_pending_reminder_returns_none_on_missing_arguments():
    sb = _FakeUserActionsSb(
        [
            {
                "id": "ua-1",
                "contact_id": "c-1",
                "user_id": "u-1",
                "action_type": "plan_action_added",
                "metadata": {"router_intent": "schedule_reminder", "remind_at": "2026-12-25T09:00:00Z"},
            }
        ]
    )
    assert await fetch_pending_reminder_for_contact(sb, "", "u-1") is None
    assert await fetch_pending_reminder_for_contact(sb, "c-1", "") is None


# ── #3211.12 (épopée #3234) — fetch_pending_reminder_for_contact, workspace_id ──


async def test_fetch_pending_reminder_with_workspace_sees_a_colleagues_reminder():
    row = {
        "id": "ua-1",
        "contact_id": "c-1",
        "user_id": "colleague",
        "workspace_id": "ws-1",
        "action_type": "plan_action_added",
        "metadata": {"router_intent": "schedule_reminder", "remind_at": "2026-12-25T09:00:00Z", "detail": "Relancer"},
        "created_at": "2026-09-20T09:00:00Z",
    }
    sb = _FakeUserActionsSb([row])
    assert await fetch_pending_reminder_for_contact(sb, "c-1", "me") is None
    seen = await fetch_pending_reminder_for_contact(sb, "c-1", "me", workspace_id="ws-1")
    assert seen == {
        "id": "ua-1",
        "remind_at": "2026-12-25T09:00:00Z",
        "note": "Relancer",
        "created_at": "2026-09-20T09:00:00Z",
        "user_id": "colleague",
    }


async def test_fetch_pending_reminder_with_workspace_excludes_other_workspaces():
    row = {
        "id": "ua-1",
        "contact_id": "c-1",
        "user_id": "u-1",
        "workspace_id": "ws-other",
        "action_type": "plan_action_added",
        "metadata": {"router_intent": "schedule_reminder", "remind_at": "2026-12-25T09:00:00Z"},
    }
    sb = _FakeUserActionsSb([row])
    assert await fetch_pending_reminder_for_contact(sb, "c-1", "u-1", workspace_id="ws-1") is None


# #4609.2 — « Ce contact est introuvable » sur chaque contact : l'API lit les contacts PAR ESPACE, le moteur
# les filtrait sur `user_id` seul — la fiche d'un collègue répondait 404. Avec `workspace_id`, la portée est
# l'espace ; sans lui, elle reste `user_id` (comportement identique à l'octet).
async def test_fetch_owned_contact_reads_a_colleagues_contact_within_the_workspace():
    sb = _FakeSb({"id": "c-1", "user_id": "u-colleague", "workspace_id": "ws-1"})
    contact = await fetch_owned_contact(sb, "c-1", "u-1", workspace_id="ws-1")
    assert contact["id"] == "c-1"


async def test_fetch_owned_contact_404_for_another_workspace():
    sb = _FakeSb({"id": "c-1", "user_id": "u-1", "workspace_id": "ws-other"})
    with pytest.raises(HTTPException) as exc:
        await fetch_owned_contact(sb, "c-1", "u-1", workspace_id="ws-1")
    assert exc.value.status_code == 404


async def test_fetch_owned_contact_without_workspace_stays_scoped_to_the_user():
    sb = _FakeSb({"id": "c-1", "user_id": "u-colleague", "workspace_id": "ws-1"})
    with pytest.raises(HTTPException) as exc:
        await fetch_owned_contact(sb, "c-1", "u-1")
    assert exc.value.status_code == 404
