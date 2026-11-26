"""The IA's workspace resolver composes with the workspace SWITCHER (#642).

A person who belongs to their personal workspace AND to their ESN's has two valid
answers, and only the switcher says which one is right. `resolveActiveWorkspace`
picks the persisted selection first (re-proving membership); this resolver — the
IA-side safety net for callers that don't pass `workspace_id` — has to agree with
it, or a document ingested while working in the ESN quietly lands in the personal
workspace instead. That is a wrong answer, not a missing one, so it is worth its
own tests.

Also pinned: a revoked seat must not keep granting access through a stale
preference.
"""

from __future__ import annotations

from app.services import workspace_scope
from app.services.workspace_scope import resolve_workspace_id

WS_PERSONAL = "11111111-1111-1111-1111-111111111111"
WS_ESN = "22222222-2222-2222-2222-222222222222"
USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table: str, store: dict, calls: list[str]):
        self._table = table
        self._store = store
        self._calls = calls
        self._filters: dict = {}

    def select(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    async def aexecute(self):
        self._calls.append(self._table)
        rows = [
            r
            for r in self._store.get(self._table, [])
            if all(r.get(c) == v for c, v in self._filters.items())
        ]
        return _Res(rows)


class _Client:
    def __init__(self, store: dict, calls: list[str]):
        self._store = store
        self._calls = calls

    def table(self, name):
        return _Query(name, self._store, self._calls)


def _store(*, selection: str | None, memberships: list[str], owned: list[str]) -> dict:
    return {
        "workspace_active_selections": (
            [{"user_id": USER, "workspace_id": selection}] if selection else []
        ),
        "workspace_members": [{"user_id": USER, "workspace_id": w} for w in memberships],
        "workspaces": [{"id": w, "owner_user_id": USER} for w in owned],
    }


async def test_honours_the_workspace_the_user_switched_into():
    """The crossing case: the user owns their personal workspace but is CURRENTLY
    working in the ESN's. Documents belong to the ESN, not to the personal space."""
    store = _store(selection=WS_ESN, memberships=[WS_PERSONAL, WS_ESN], owned=[WS_PERSONAL])
    assert await resolve_workspace_id(USER, sb=_Client(store, [])) == WS_ESN


async def test_switching_back_changes_the_answer():
    """The same user, after switching back — the resolver must follow, otherwise
    grounding would keep reading the previous team's knowledge base."""
    store = _store(selection=WS_PERSONAL, memberships=[WS_PERSONAL, WS_ESN], owned=[WS_PERSONAL])
    assert await resolve_workspace_id(USER, sb=_Client(store, [])) == WS_PERSONAL


async def test_falls_back_to_the_owned_workspace_without_a_selection():
    """No switcher preference (the overwhelmingly common case) ⇒ the historical
    rule, unchanged."""
    store = _store(selection=None, memberships=[WS_PERSONAL], owned=[WS_PERSONAL])
    assert await resolve_workspace_id(USER, sb=_Client(store, [])) == WS_PERSONAL


async def test_a_revoked_seat_cannot_grant_access_through_a_stale_preference():
    """The privacy gate. The preference still points at the ESN, but the seat is
    gone: membership is re-proven, so the ESN is NOT returned."""
    store = _store(selection=WS_ESN, memberships=[WS_PERSONAL], owned=[WS_PERSONAL])
    assert await resolve_workspace_id(USER, sb=_Client(store, [])) == WS_PERSONAL


async def test_member_only_user_falls_back_to_their_membership():
    store = _store(selection=None, memberships=[WS_ESN], owned=[])
    assert await resolve_workspace_id(USER, sb=_Client(store, [])) == WS_ESN


async def test_unresolvable_user_yields_none_never_a_plausible_workspace():
    store = _store(selection=None, memberships=[], owned=[])
    assert await resolve_workspace_id(USER, sb=_Client(store, [])) is None


async def test_empty_user_short_circuits_without_touching_the_network():
    calls: list[str] = []
    assert await resolve_workspace_id("", sb=_Client({}, calls)) is None
    assert calls == []


async def test_resolution_failure_is_fail_soft_not_a_raise(monkeypatch):
    """Scoping must never break ingestion or an analysis: a broken Supabase
    degrades to owner-private, it does not raise."""

    class _Boom:
        def table(self, name):
            raise RuntimeError("supabase down")

    monkeypatch.setattr(workspace_scope, "get_supabase", lambda: _Boom())
    assert await resolve_workspace_id(USER) is None
