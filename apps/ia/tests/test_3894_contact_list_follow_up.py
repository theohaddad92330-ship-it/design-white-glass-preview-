"""#3894 — relance dans contact_list (Louis 16/10) : la carte « par destinataire relancé » est une EXTENSION du bloc
``contact_list`` — une information de relance par contact (dernier envoi / relance préparée, et sa date), lue dans
``outreach_messages``. Absence = rien (ni « 0 », ni ligne)."""

from __future__ import annotations

import asyncio

from app.services.contact_card_fallback import contact_block_from_tool_output
from app.services.ownership import fetch_follow_ups_by_contact


class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, rows):
        self._rows = rows
        self.filters: list[tuple] = []

    def select(self, *_a):
        return self

    def in_(self, col, values):
        self.filters.append((col, tuple(values)))
        return self

    def eq(self, col, value):
        self.filters.append((col, value))
        return self

    def order(self, *_a, **_k):
        return self

    async def aexecute(self):
        return _Res(self._rows)


class _Sb:
    def __init__(self, rows):
        self.query = _Query(rows)

    def table(self, name):
        assert name == "outreach_messages"
        return self.query


ROWS = [
    {"contact_id": "c1", "channel": "email", "status": "sent", "created_at": "2026-10-12T09:30:00+00:00"},
    {"contact_id": "c1", "channel": "email", "status": "drafted", "created_at": "2026-10-14T08:00:00+00:00"},
    {"contact_id": "c2", "channel": "linkedin", "status": "approved", "created_at": "2026-10-13T10:00:00+00:00"},
    {"contact_id": "c3", "channel": "email", "status": "bounced", "created_at": "2026-10-11T10:00:00+00:00"},
]


def _run(rows, ids=("c1", "c2", "c3", "c4")):
    return asyncio.run(fetch_follow_ups_by_contact(_Sb(rows), list(ids), "u1", workspace_id="w1"))


def test_the_latest_sent_message_is_the_follow_up_and_a_later_draft_is_named_apart():
    out = _run(ROWS)
    assert out["c1"] == {"kind": "sent", "channel": "email", "as_of": "2026-10-12"}


def test_a_prepared_message_alone_is_prepared_never_sent():
    assert _run(ROWS)["c2"] == {"kind": "prepared", "channel": "linkedin", "as_of": "2026-10-13"}


def test_no_trace_means_no_entry_not_zero():
    out = _run(ROWS)
    assert "c3" not in out and "c4" not in out  # un rebond n'est ni envoi ni préparation ; inconnu = absent


def test_unreadable_dates_are_dropped_rather_than_invented():
    assert _run([{"contact_id": "c1", "channel": "email", "status": "sent", "created_at": None}]) == {}


def test_the_card_carries_the_follow_up_when_the_tool_rendered_one_and_only_then():
    out = {
        "contacts": [
            {"full_name": "Camille Martin", "follow_up": {"kind": "sent", "channel": "email", "as_of": "2026-10-12"}},
            {"full_name": "Sans Trace"},
            {"full_name": "Mal Formé", "follow_up": {"kind": "opened", "as_of": "2026-10-12"}},
        ]
    }
    items = contact_block_from_tool_output(out)["items"]
    assert items[0]["follow_up"] == {"kind": "sent", "channel": "email", "as_of": "2026-10-12"}
    assert "follow_up" not in items[1] and "follow_up" not in items[2]


def test_the_tool_rows_get_their_follow_up_and_a_failed_read_leaves_them_untouched(monkeypatch):
    from app.services import chat_tools, ownership, supabase_client, workspace_scope

    async def fake_fetch(_sb, ids, _uid, workspace_id=None):
        assert ids == ["c1", "c2"]
        return {"c1": {"kind": "sent", "as_of": "2026-10-12"}}

    async def fake_ws(_uid, sb=None):
        return "w1"

    monkeypatch.setattr(supabase_client, "get_supabase", lambda: object())
    monkeypatch.setattr(workspace_scope, "resolve_workspace_id", fake_ws)
    monkeypatch.setattr(ownership, "fetch_follow_ups_by_contact", fake_fetch)
    rows = [{"contact_id": "c1", "full_name": "A"}, {"contact_id": "c2", "full_name": "B"}]
    out = asyncio.run(chat_tools._with_follow_ups(rows, "u1"))
    assert out[0]["follow_up"] == {"kind": "sent", "as_of": "2026-10-12"} and "follow_up" not in out[1]

    async def boom(*_a, **_k):
        raise RuntimeError("down")

    monkeypatch.setattr(ownership, "fetch_follow_ups_by_contact", boom)
    assert asyncio.run(chat_tools._with_follow_ups(rows, "u1")) == rows


def test_the_prompt_names_the_follow_up_field():
    from app.prompts import reply_formats

    assert "follow_up?" in reply_formats.REPLY_FORMATS_DIRECTIVE


def test_a_card_written_by_the_model_is_completed_with_the_tool_follow_up():
    from app.services.contact_card_fallback import with_contact_card
    from app.services.reply_blocks import split_reply_blocks

    block = contact_block_from_tool_output(
        {"contacts": [{"full_name": "Camille Martin", "follow_up": {"kind": "prepared", "as_of": "2026-10-13"}}]}
    )
    card = '{"type":"contact_list","items":[{"name":"Camille Martin","reason":"Porte le programme"}]}'
    out = with_contact_card(f"Voici.\n\n```bellum-block\n{card}\n```", block)
    cards = [s.block for s in split_reply_blocks(out) if s.kind == "block"]
    assert cards[0]["items"][0]["follow_up"] == {"kind": "prepared", "as_of": "2026-10-13"}
