"""#4055.4 / .6 / .7 — « complète ce compte », niveau « secteurs », personnes détectées hors base."""

from __future__ import annotations

from app.services.account_completion import (
    SourceRead,
    build_completion,
    count_decision_makers,
    detected_outside_base,
    name_key,
    sector_levels,
)


def _reads(**counts: int | None) -> dict[str, SourceRead]:
    return {kind: SourceRead(count) for kind, count in counts.items()}


def test_a_read_and_empty_source_is_missing_and_proposed_never_launched() -> None:
    out = build_completion(_reads(signals=0, needs=3, decision_makers=0, org_chart=1))
    assert out["missing"] == ["signals", "decision_makers"]
    assert out["present"] == [{"kind": "needs", "count": 3}, {"kind": "org_chart", "count": 1}]
    assert out["nothing_launched"] is True
    tools = {entry["tool"]: entry for entry in out["proposed_collections"]}
    assert tools["start_analysis"]["kinds"] == ["signals"]
    assert tools["propose_people_search"]["kinds"] == ["decision_makers"]
    assert all(e["launched"] is False and e["confirmation_required"] is True for e in out["proposed_collections"])


def test_an_unread_source_is_not_read_never_missing() -> None:
    out = build_completion(_reads(signals=None, needs=2, decision_makers=2, org_chart=2))
    assert out["not_read"] == ["signals"] and out["missing"] == []
    assert out["proposed_collections"] == []  # rien à proposer pour une source qu'on n'a pas pu lire
    assert out["complete"] is False  # un résultat partiel ne dit jamais « complet »


def test_a_complete_account_proposes_nothing() -> None:
    out = build_completion(_reads(signals=4, needs=1, decision_makers=2, org_chart=5))
    assert out["missing"] == [] and out["not_read"] == [] and out["complete"] is True
    assert out["proposed_collections"] == []


def test_needs_have_no_launchable_collection_and_say_so() -> None:
    out = build_completion(_reads(signals=1, needs=0, decision_makers=1, org_chart=1))
    (entry,) = out["proposed_collections"]
    assert entry["tool"] is None and entry["kinds"] == ["needs"] and entry["note"]


def test_missing_kind_from_the_mapping_is_not_read() -> None:
    assert build_completion({})["not_read"] == ["signals", "needs", "decision_makers", "org_chart"]


def test_decision_makers_are_counted_by_role() -> None:
    contacts = [{"decision_role": "economic"}, {"decision_role": "user"}, {"decision_role": "Technical"}, {}]
    assert count_decision_makers(contacts) == 2
    # Les lignes d'un compte portent leur groupe de classement, pas `decision_role`.
    assert count_decision_makers([{"group": "decision_maker"}, {"group": "relay"}]) == 1


# ── personnes détectées hors base ───────────────────────────────────────────
def test_a_named_person_absent_from_contacts_is_proposed_outside_the_base() -> None:
    out = detected_outside_base(
        [{"full_name": "Hélène Martin", "title": "DSI"}, {"full_name": "Marc Durand"}],
        [{"full_name": "helene martin"}],
        contacts_complete=True,
    )
    assert [p["full_name"] for p in out["people"]] == ["Marc Durand"]
    assert out["people"][0]["status"] == "outside_base"
    assert out["people"][0]["proposed_action"] == "add_contact" and out["people"][0]["added"] is False
    assert out["nothing_added"] is True


def test_a_truncated_contact_list_only_allows_to_reconcile() -> None:
    out = detected_outside_base([{"full_name": "Marc Durand"}], [], contacts_complete=False)
    assert out["people"][0]["status"] == "to_reconcile" and out["contacts_complete"] is False


def test_empty_names_and_repeats_are_never_proposed() -> None:
    out = detected_outside_base(
        [{"full_name": " "}, {"full_name": "Marc Durand"}, {"full_name": "MARC  durand"}], [], contacts_complete=True
    )
    assert out["count"] == 1


# #4055.10 (18/10) — une proposition RETENUE (contact ajouté) ou ÉCARTÉE ne revient plus au rejeu.
def test_a_dismissed_person_is_never_proposed_again() -> None:
    out = detected_outside_base(
        [{"full_name": "Marc Durand"}, {"full_name": "Hélène Martin"}],
        [],
        contacts_complete=True,
        dismissed={name_key("marc  DURAND")},
    )
    assert [p["full_name"] for p in out["people"]] == ["Hélène Martin"]


def test_a_dismissal_hides_a_person_even_when_the_contact_list_is_truncated() -> None:
    out = detected_outside_base(
        [{"full_name": "Marc Durand"}], [], contacts_complete=False, dismissed={name_key("Marc Durand")}
    )
    assert out["count"] == 0


def test_without_dismissals_nothing_changes() -> None:
    out = detected_outside_base([{"full_name": "Marc Durand"}], [], contacts_complete=True, dismissed=frozenset())
    assert out["count"] == 1


# ── secteurs ────────────────────────────────────────────────────────────────
def test_accounts_are_counted_per_sector_and_unknown_sectors_stay_apart() -> None:
    accounts = [
        {"company_name": "A", "sector": "Banque"},
        {"company_name": "B", "sector": "banque "},
        {"company_name": "C", "sector": "Énergie"},
        {"company_name": "D", "sector": None},
        {"company_name": "E", "sector": ""},
    ]
    out = sector_levels(accounts, complete=True)
    assert [(s["sector"], s["account_count"]) for s in out["sectors"]] == [("Banque", 2), ("Énergie", 1)]
    assert out["without_sector"] == 2 and out["accounts_read"] == 5 and out["complete"] is True
    assert out["sectors"][0]["examples"] == ["A", "B"]


def test_a_partial_read_is_never_the_whole_portfolio() -> None:
    out = sector_levels([{"company_name": "A", "sector": "Banque"}], complete=False)
    assert out["complete"] is False and out["accounts_read"] == 1


def test_no_account_gives_no_sector_not_a_zero_row() -> None:
    assert sector_levels([], complete=True)["sectors"] == []


# ── #4055.10 — l'écart mémorisé, de bout en bout de l'outil ──────────────────
import asyncio  # noqa: E402
from unittest.mock import AsyncMock, MagicMock, patch  # noqa: E402

from app.services import account_completion_tools as tools  # noqa: E402

_ACCOUNT = "22222222-2222-4222-8222-222222222222"


class _Table:
    def __init__(self, rows, log):
        self._rows, self._log = rows, log

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def is_(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def insert(self, row):
        self._log.append(row)
        return self

    async def aexecute(self):
        return MagicMock(data=self._rows, error=None)


def _supabase(rows, log):
    sb = MagicMock()
    sb.table = lambda _name: _Table(rows, log)
    return sb


def test_dismissing_a_person_writes_one_row_scoped_to_the_user_and_the_account() -> None:
    log: list = []
    with (
        patch.object(tools, "_owned_account", AsyncMock(return_value={"id": _ACCOUNT, "workspace_id": "ws-1"})),
        patch("app.services.supabase_client.get_supabase", return_value=_supabase([], log)),
    ):
        out = asyncio.run(
            tools.execute_dismiss_completion_person({"account_id": _ACCOUNT, "full_name": "Marc  DURAND"}, "user-1")
        )
    assert out["dismissed"] is True
    assert log == [
        {
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "account_id": _ACCOUNT,
            "name_key": name_key("Marc Durand"),
            "full_name": "Marc  DURAND",
        }
    ]


def test_dismissing_on_a_foreign_account_writes_nothing() -> None:
    log: list = []
    with (
        patch.object(tools, "_owned_account", AsyncMock(return_value=None)),
        patch("app.services.supabase_client.get_supabase", return_value=_supabase([], log)),
    ):
        out = asyncio.run(
            tools.execute_dismiss_completion_person({"account_id": _ACCOUNT, "full_name": "Marc Durand"}, "user-1")
        )
    assert "dismissed" not in out and log == []


def test_dismissed_keys_are_read_back_for_the_replay() -> None:
    rows = [{"name_key": name_key("Marc Durand")}]
    with patch("app.services.supabase_client.get_supabase", return_value=_supabase(rows, [])):
        keys = asyncio.run(tools._read_dismissed_keys(_ACCOUNT, "user-1"))
    assert keys == {name_key("Marc Durand")}
