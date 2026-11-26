"""#4065.8 / #4065.9 — `list_records` lit AUSSI la liste du CRM branché (affaires gagnées / perdues +
interlocuteur), les candidats vus en entretien (ATS) et les missions terminées (période passée).

Doctrine : un CRM / un ATS non branché se DIT en une phrase, jamais inventé, jamais « 0 » ; nos
fournisseurs ne se nomment jamais ; une date absente n'est jamais devinée.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.services import bellum_api
from app.services.chat_requested_mode import connected_families_scope
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict[str, Any]) -> dict[str, Any]:
    return await execute_chat_tool("list_records", tool_input, user_id=USER, profile_data=None)


def _day(n: int) -> str:
    return (datetime.now(UTC) - timedelta(days=n)).date().isoformat()


def _deal(i: str, status: str, closed: str | None, contact: str | None = "Jeanne Martin") -> dict[str, Any]:
    return {
        "id": i,
        "title": f"Affaire {i}",
        "stage": "Closed",
        "status": status,
        "amount": 90000,
        "accountName": "ACME",
        "contactName": contact,
        "closedAt": closed,
    }


def test_the_tool_schema_offers_the_deal_outcome_and_the_past_ats_lists() -> None:
    props = next(t for t in CHAT_TOOLS if t["name"] == "list_records")["input_schema"]["properties"]
    assert set(props["deal_outcome"]["enum"]) == {"lost", "won", "closed"}
    assert {"interviewed_candidates", "ended_missions"} <= set(props["ats_list"]["enum"])


@pytest.mark.asyncio
async def test_crm_lost_deals_in_a_window_come_with_their_interlocutor(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def _deals(_u: str, *, outcome: str, since: str | None = None) -> dict[str, Any]:
        seen.update(outcome=outcome, since=since)
        return {
            "connected": True,
            "complete": True,
            "dealsRead": 3,
            "deals": [
                _deal("dedans", "lost", _day(30)),
                _deal("dehors", "lost", _day(400)),
                _deal("sans-date", "lost", None),
            ],
        }

    monkeypatch.setattr(bellum_api, "crm_deals", _deals)
    with connected_families_scope(["crm"]):
        out = await _run({"source": "crm", "deal_outcome": "lost", "from_iso": _day(90), "to_iso": _day(0)})
    assert "error" not in out, out
    assert seen["outcome"] == "lost" and seen["since"]
    cells = [r["cells"] for r in out["card"]["rows"]]
    assert len(cells) == 1 and "Affaire dedans" in cells[0] and "Jeanne Martin" in cells[0]
    assert "Interlocuteur" in out["card"]["columns"]
    # une affaire sans date de clôture lisible n'est jamais rangée dans la période — elle est NOMMÉE
    assert any("sans date de clôture" in n for n in out["notes"])
    assert out["records_read"] == 3


@pytest.mark.asyncio
async def test_crm_deals_without_interlocutor_say_so_and_never_invent_one(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _deals(_u: str, **_k: Any) -> dict[str, Any]:
        return {"connected": True, "complete": True, "dealsRead": 1, "deals": [_deal("a", "won", _day(5), None)]}

    monkeypatch.setattr(bellum_api, "crm_deals", _deals)
    with connected_families_scope(["crm"]):
        out = await _run({"source": "crm", "deal_outcome": "won"})
    # R46 — « Interlocuteur » est vide sur la seule ligne : la colonne ne s'affiche pas, la note le dit.
    assert "Interlocuteur" not in out["card"]["columns"]
    assert any("interlocuteur" in n for n in out["notes"])


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("bridge", "needle"),
    [
        ({"connected": False, "deals": []}, "CRM"),
        ({"error": "crm_read_forbidden"}, "droit"),
        ({"error": "crm_read_failed"}, "n'a pas répondu"),
        (None, "n'a pas répondu"),
    ],
)
async def test_crm_deals_unreadable_is_one_sentence_never_a_zero(
    monkeypatch: pytest.MonkeyPatch, bridge: dict[str, Any] | None, needle: str
) -> None:
    async def _deals(_u: str, **_k: Any) -> dict[str, Any] | None:
        return bridge

    monkeypatch.setattr(bellum_api, "crm_deals", _deals)
    with connected_families_scope(["crm"]):
        out = await _run({"source": "crm", "deal_outcome": "lost"})
    assert needle in out["error"] and "card" not in out
    for vendor in ("salesforce", "hubspot", "pipedrive", "odoo", "attio", "zoho"):
        assert vendor not in out["error"].lower()


@pytest.mark.asyncio
async def test_an_unchecked_crm_is_absent_for_deals_too(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _deals(*_a: Any, **_k: Any) -> dict[str, Any]:
        raise AssertionError("une source décochée n'est jamais lue")

    monkeypatch.setattr(bellum_api, "crm_deals", _deals)
    out = await execute_chat_tool(
        "list_records",
        {"source": "crm", "deal_outcome": "lost"},
        user_id=USER,
        profile_data=None,
        excluded_families=["crm"],
    )
    assert out["absent_sources"] == ["CRM"]


@pytest.mark.asyncio
async def test_ats_interviewed_candidates_are_listed_in_the_past_window(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def _ats(_u: str, **kw: Any) -> dict[str, Any]:
        seen.update(kw)
        return {
            "connected": True,
            "candidatesRead": True,
            "interviewedCandidates": [
                {"id": "1", "fullName": "Ana Lima", "title": "Dev", "interviewedAt": f"{_day(20)}T00:00:00.000Z"},
                {"id": "2", "fullName": "Trop Vieux", "title": None, "interviewedAt": f"{_day(300)}T00:00:00.000Z"},
            ],
        }

    monkeypatch.setattr(bellum_api, "ats_records", _ats)
    with connected_families_scope(["ats"]):
        out = await _run(
            {"source": "ats", "ats_list": "interviewed_candidates", "from_iso": _day(90), "to_iso": _day(0)}
        )
    assert "error" not in out, out
    assert seen.get("interviewed_since_days", 0) >= 90
    names = [r["cells"][1] for r in out["card"]["rows"]]
    assert names == ["Ana Lima"]


@pytest.mark.asyncio
async def test_ats_candidates_unread_is_named_not_counted_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ats(_u: str, **_k: Any) -> dict[str, Any]:
        return {"connected": True, "candidatesRead": False, "interviewedCandidates": []}

    monkeypatch.setattr(bellum_api, "ats_records", _ats)
    with connected_families_scope(["ats"]):
        out = await _run({"source": "ats", "ats_list": "interviewed_candidates"})
    assert "candidats" in out["error"] and "card" not in out


@pytest.mark.asyncio
async def test_ats_ended_missions_use_the_past_window(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def _ats(_u: str, **kw: Any) -> dict[str, Any]:
        seen.update(kw)
        return {
            "connected": True,
            "endedMissions": [
                {
                    "consultantName": "Ana Lima",
                    "companyName": "ACME",
                    "endsAt": f"{_day(10)}T00:00:00.000Z",
                    "title": "TMA",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "ats_records", _ats)
    with connected_families_scope(["ats"]):
        out = await _run({"source": "ats", "ats_list": "ended_missions", "from_iso": _day(60)})
    assert seen.get("ended_since_days", 0) >= 60
    assert out["card"]["rows"][0]["cells"] and out["rows_total"] == 1


@pytest.mark.asyncio
async def test_missions_source_lists_finished_missions_for_a_past_window(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ended(_u: str, *, ended_since_days: int) -> dict[str, Any]:
        assert ended_since_days >= 90
        return {
            "missions": [
                {"label": "TMA", "accountName": "ACME", "ends_on": _day(20)},
                {"label": "Ancienne", "accountName": "BETA", "ends_on": _day(200)},
            ]
        }

    async def _ending(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("une fenêtre entièrement passée ne lit pas l'à-venir")

    monkeypatch.setattr(bellum_api, "missions_ended", _ended)
    monkeypatch.setattr(bellum_api, "missions_ending", _ending)
    # « jusqu'à hier » : une fin écrite en date seule INCLUT son jour (`parse_bound`) — « jusqu'à aujourd'hui »
    # couvrirait le reste de la journée, donc de l'à-venir.
    out = await _run({"source": "missions", "from_iso": _day(90), "to_iso": _day(1)})
    assert "error" not in out, out
    assert [r["cells"][0] for r in out["card"]["rows"]] == ["ACME"] or "ACME" in repr(out["card"]["rows"])
    assert "BETA" not in repr(out["card"]["rows"])
