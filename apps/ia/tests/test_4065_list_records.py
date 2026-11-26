"""#4065 — `list_records` : un listing depuis n'importe quelle source branchée, croisement inclus.

Par source : la lecture EXISTANTE du pont est appelée (jamais un second client), la carte
`file_export` sort avec source + période nommées, le total lu est dit. Doctrine : jamais le corps
d'un message, une source décochée est NOMMÉE absente (jamais « 0 »), aucune ligne devinée.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.services import bellum_api, record_listing
from app.services.chat_requested_mode import connected_families_scope
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return await execute_chat_tool("list_records", tool_input, user_id=USER, profile_data=None, **kwargs)


def _days_ago(n: int) -> str:
    return (datetime.now(UTC) - timedelta(days=n)).date().isoformat()


def _meeting(event_id: str, start: str, *attendees: tuple[str, str | None, bool]) -> dict[str, Any]:
    return {
        "id": event_id,
        "summary": f"Point {event_id}",
        "start": start,
        "cancelled": False,
        "attendees": [{"email": e, "displayName": n, "external": ext} for e, n, ext in attendees],
    }


def test_the_tool_is_offered_to_laura_and_says_when_to_use_it() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "list_records")
    assert "liste-moi" in tool["description"] and "donne-moi tous les" in tool["description"]
    assert set(tool["input_schema"]["properties"]["source"]["enum"]) >= {
        "agenda",
        "mailbox",
        "contacts",
        "accounts",
        "needs",
        "consultants",
        "missions",
        "ats",
        "crm",
    }


@pytest.mark.asyncio
async def test_agenda_people_met_are_deduplicated_by_person_with_last_date(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(_u: str, **_k: Any) -> tuple[dict, None, None]:
        return (
            {
                "events": [
                    _meeting(
                        "a",
                        "2026-09-01T09:00:00Z",
                        ("claire@acme.fr", "Claire Martin", True),
                        ("moi@esn.fr", "Moi", False),
                    ),
                    _meeting("b", "2026-09-20T09:00:00Z", ("claire@acme.fr", "Claire Martin", True)),
                    _meeting("c", "2026-08-05T09:00:00Z", ("paul@globex.com", None, True)),
                ],
                "unavailable": [],
            },
            None,
            None,
        )

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    out = await _run({"source": "agenda", "from_iso": _days_ago(92), "to_iso": _days_ago(0), "group_by": "person"})
    card = out["card"]
    assert card["type"] == "file_export"
    assert card["columns"][:3] == ["Personne", "E-mail", "Société / domaine"]
    cells = [row["cells"] for row in card["rows"]]
    # Interne exclu, Claire une seule fois (2 occurrences, dernière le 20/09), domaine en société.
    assert cells[0][:5] == ["Claire Martin", "claire@acme.fr", "acme.fr", "2", "2026-09-20"]
    assert cells[1][0] is None and cells[1][1] == "paul@globex.com"  # nom inconnu : jamais deviné
    assert len(cells) == 2
    assert out["source"] == "Agenda" and out["window"]["to"] == _days_ago(0)
    assert out["records_read"] == 3


@pytest.mark.asyncio
async def test_mailbox_listing_carries_metadata_only_never_a_body(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def _search(_u: str, **kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {
            "threads": [
                {
                    "threadId": "t1",
                    "subject": "Proposition cloud",
                    "counterpart": "Claire Martin <claire@acme.fr>",
                    "lastMessageAt": (datetime.now(UTC) - timedelta(days=3)).isoformat(),
                    "awaitingReply": True,
                    "snippet": "SECRET CORPS DU MESSAGE",
                    "text": "SECRET CORPS DU MESSAGE",
                    "account": {"id": "a1", "name": "Acme", "via": "domain"},
                }
            ],
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "search_mailbox", _search)
    out = await _run({"source": "mailbox", "from_iso": _days_ago(40), "mail_filter": "awaiting_reply"})
    assert captured["intent"] == "no_reply" and captured["window_days"] >= 40
    assert "SECRET" not in repr(out)
    assert out["card"]["rows"][0]["cells"][1:5] == ["Claire Martin", "claire@acme.fr", "Acme", "Proposition cloud"]


@pytest.mark.asyncio
async def test_contacts_listing_reads_every_page_and_says_the_total(monkeypatch: pytest.MonkeyPatch) -> None:
    offsets: list[int | None] = []

    async def _contacts(_u: str, **kwargs: Any) -> dict[str, Any]:
        offsets.append(kwargs.get("offset"))
        assert kwargs.get("list_all") is True
        start = kwargs["offset"] or 0
        batch = [
            {"full_name": f"P{i}", "email": f"p{i}@x.fr", "company_name": "X"}
            for i in range(start, min(start + 25, 60))
        ]
        return {"total": 60, "contacts": batch}

    monkeypatch.setattr(bellum_api, "workspace_contacts", _contacts)
    out = await _run({"source": "contacts"})
    assert offsets == [0, 25, 50]
    assert out["records_read"] == 60 and out["rows_total"] == 60 and out["complete"] is True
    assert len(out["card"]["rows"]) == 60


@pytest.mark.asyncio
async def test_accounts_needs_consultants_missions_reuse_their_bridge_reads(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _accounts(_u: str, **_k: Any) -> dict[str, Any]:
        return {
            "total": 1,
            "accounts": [{"company_name": "Acme", "sector": "Banque", "last_analyzed_at": "2026-09-01T00:00:00Z"}],
        }

    async def _needs(_u: str, **_k: Any) -> dict[str, Any]:
        return {
            "data": [{"title": "Dev Java", "account_name": "Acme", "status": "open"}],
            "pagination": {"totalItems": 1},
        }

    async def _talents(_u: str, **_k: Any) -> dict[str, Any]:
        return {"items": [{"fullName": "Ana Lima", "title": "Dev", "topSkills": [{"label": "Java"}]}], "total": 1}

    async def _missions(_u: str, **_k: Any) -> dict[str, Any]:
        # VU.3 — la fin tombe dans la fenêtre par défaut (7 jours) : une date figée la sortirait de l'en-tête.
        soon = (datetime.now(UTC) + timedelta(days=3)).date().isoformat()
        return {"missions": [{"label": "Run SI", "accountName": "Acme", "ends_on": soon}]}

    monkeypatch.setattr(bellum_api, "workspace_accounts", _accounts)
    monkeypatch.setattr(bellum_api, "find_needs", _needs)
    monkeypatch.setattr(bellum_api, "search_talents", _talents)
    monkeypatch.setattr(bellum_api, "missions_ending", _missions)
    for source, needle in (
        ("accounts", "Acme"),
        ("needs", "Dev Java"),
        ("consultants", "Ana Lima"),
        ("missions", "Run SI"),
    ):
        out = await _run({"source": source})
        assert needle in repr(out["card"]["rows"]), source
        assert out["records_read"] == 1


@pytest.mark.asyncio
async def test_ats_listing_names_no_vendor_and_lists_benched_consultants(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ats(_u: str, **_k: Any) -> dict[str, Any]:
        return {
            "connected": True,
            "endingMissions": [],
            "benchedConsultants": [
                {"fullName": "Ana Lima", "title": "Dev", "availableAt": None, "daysWithoutMission": 12}
            ],
            "openNeeds": [],
        }

    monkeypatch.setattr(bellum_api, "ats_records", _ats)
    with connected_families_scope(["ats"]):
        out = await _run({"source": "ats", "ats_list": "benched_consultants"})
    # R46 — les colonnes vides sur toutes les lignes disparaissent : on lit par NOM, pas par position.
    columns = out["card"]["columns"]
    assert out["card"]["rows"][0]["cells"][columns.index("Personne")] == "Ana Lima"
    assert "12 j sans mission" in repr(out["card"])


@pytest.mark.asyncio
async def test_an_unchecked_source_is_named_absent_never_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[str] = []

    async def _window(*_a: Any, **_k: Any) -> Any:
        called.append("agenda")
        return {"events": [], "unavailable": []}, None, None

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    out = await _run({"source": "agenda"}, excluded_families=["calendar"])
    assert called == []
    assert out["absent_sources"] == ["Agenda"]
    assert "card" not in out and "records_read" not in out
    with connected_families_scope(["email"]):
        out = await _run({"source": "agenda"})
    assert out["absent_sources"] == ["Agenda"] and called == []
    out = await _run({"source": "contacts"}, exclude_workspace_data=True)
    assert out["absent_sources"] == ["Contacts de l'espace"]


@pytest.mark.asyncio
async def test_crm_listing_by_inactivity_reads_accounts_then_crm_last_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#4065 (recette R26) — « mes comptes du CRM sans activité depuis 3 mois » rend une LISTE."""

    async def _accounts(_u: str, **kw: Any) -> dict[str, Any]:
        names = ["Vieux SA", "Récent SA", "Hors CRM SA", "Muet SA"]
        return {"total": 4, "accounts": [{"company_name": n, "sector": "Banque"} for n in names]}

    activity = {"Vieux SA": _days_ago(200), "Récent SA": _days_ago(5), "Muet SA": None}

    async def _presence(_u: str, *, company_name: str, **_k: Any) -> dict[str, Any]:
        if company_name not in activity:
            return {"connected": True, "matched": False}
        return {"connected": True, "matched": True, "lastActivityAt": activity[company_name]}

    monkeypatch.setattr(bellum_api, "workspace_accounts", _accounts)
    monkeypatch.setattr(bellum_api, "crm_company_presence", _presence)
    with connected_families_scope(["crm"]):
        out = await _run({"source": "crm", "inactive_since": _days_ago(90)})
    assert "error" not in out, out
    cells = [r["cells"] for r in out["card"]["rows"]]
    names = [c[0] for c in cells]
    assert "Vieux SA" in names and "Muet SA" in names
    assert "Récent SA" not in names and "Hors CRM SA" not in names
    assert out["rows_total"] == 2


@pytest.mark.asyncio
async def test_crm_listing_without_a_connected_crm_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _accounts(_u: str, **kw: Any) -> dict[str, Any]:
        return {"total": 1, "accounts": [{"company_name": "A SA"}]}

    async def _presence(_u: str, **_k: Any) -> dict[str, Any]:
        return {"connected": False, "matched": False}

    monkeypatch.setattr(bellum_api, "workspace_accounts", _accounts)
    monkeypatch.setattr(bellum_api, "crm_company_presence", _presence)
    with connected_families_scope(["crm"]):
        out = await _run({"source": "crm", "inactive_since": _days_ago(90)})
    assert "error" in out and "CRM" in out["error"]


@pytest.mark.asyncio
async def test_cross_met_in_meetings_and_absent_from_crm(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(_u: str, **_k: Any) -> tuple[dict, None, None]:
        return (
            {
                "events": [
                    _meeting("a", "2026-09-01T09:00:00Z", ("claire@acme.fr", "Claire", True)),
                    _meeting("b", "2026-09-02T09:00:00Z", ("paul@globex.com", "Paul", True)),
                    _meeting("c", "2026-09-03T09:00:00Z", ("zoe@initech.io", "Zoé", True)),
                ],
                "unavailable": [],
            },
            None,
            None,
        )

    async def _presence(_u: str, *, company_name: str, domain: str | None = None, **_k: Any) -> dict[str, Any]:
        if company_name == "initech.io":
            return {"error": "crm_unreachable"}
        return {"connected": True, "matched": company_name == "acme.fr"}

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    monkeypatch.setattr(bellum_api, "crm_company_presence", _presence)
    with connected_families_scope(["calendar", "crm"]):
        out = await _run(
            {
                "source": "agenda",
                "from_iso": _days_ago(92),
                "group_by": "person",
                "cross": {"source": "crm", "mode": "absent"},
            }
        )
    people = [row["cells"][0] for row in out["card"]["rows"]]
    # Acme est au CRM → retirée ; Initech NON VÉRIFIÉE → jamais classée absente, nommée.
    assert people == ["Paul"]
    assert out["cross"]["unchecked"] == ["initech.io"]
    assert out["cross"]["checked"] == 2


@pytest.mark.asyncio
async def test_cross_with_an_unchecked_crm_is_refused_and_named(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(_u: str, **_k: Any) -> tuple[dict, None, None]:
        return (
            {"events": [_meeting("a", "2026-09-01T09:00:00Z", ("claire@acme.fr", "Claire", True))], "unavailable": []},
            None,
            None,
        )

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    with connected_families_scope(["calendar"]):
        out = await _run({"source": "agenda", "from_iso": _days_ago(30), "cross": {"source": "crm"}})
    assert out["absent_sources"] == ["CRM"] and "card" not in out


@pytest.mark.asyncio
async def test_cross_absent_from_the_workspace_base(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(_u: str, **_k: Any) -> tuple[dict, None, None]:
        return (
            {
                "events": [
                    _meeting("a", "2026-09-01T09:00:00Z", ("claire@acme.fr", "Claire", True)),
                    _meeting("b", "2026-09-02T09:00:00Z", ("paul@globex.com", "Paul", True)),
                ],
                "unavailable": [],
            },
            None,
            None,
        )

    async def _contacts(_u: str, *, query: str | None = None, **_k: Any) -> dict[str, Any]:
        return {"contacts": [{"email": "claire@acme.fr", "full_name": "Claire"}] if query == "claire@acme.fr" else []}

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    monkeypatch.setattr(bellum_api, "workspace_contacts", _contacts)
    out = await _run(
        {"source": "agenda", "from_iso": _days_ago(30), "group_by": "person", "cross": {"source": "contacts"}}
    )
    assert [row["cells"][0] for row in out["card"]["rows"]] == ["Paul"]


@pytest.mark.asyncio
async def test_an_empty_listing_says_so_without_a_card(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(_u: str, **_k: Any) -> tuple[dict, None, None]:
        return {"events": [], "unavailable": []}, None, None

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    out = await _run({"source": "agenda", "from_iso": _days_ago(30)})
    assert "card" not in out and out["records_read"] == 0 and out["note"]


def test_group_by_company_lists_people_per_company() -> None:
    records = [
        record_listing._record(person="Claire", email="claire@acme.fr", company="acme.fr", at="2026-09-01"),
        record_listing._record(person="Luc", email="luc@acme.fr", company="acme.fr", at="2026-09-05"),
    ]
    columns, rows = record_listing._group(records, "company")
    assert columns[0] == "Société / domaine"
    assert rows == [["acme.fr", "Claire, Luc", "2", "2026-09-05"]]


@pytest.mark.asyncio
async def test_agenda_note_says_which_meetings_have_no_listed_person_so_the_list_is_not_read_as_partial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#4065.7 — « 26 rendez-vous, mais la liste est partielle » : des rendez-vous sans invité externe
    n'ont aucune ligne ; la note le DIT, la lecture reste complète."""

    async def _window(_u: str, **_k: Any) -> tuple[dict, None, None]:
        events = [
            _meeting("a", "2026-09-01T09:00:00Z", ("claire@acme.fr", "Claire Martin", True)),
            _meeting("b", "2026-09-02T09:00:00Z", ("moi@esn.fr", "Moi", False)),
            {"id": "c", "summary": "Focus", "start": "2026-09-03T09:00:00Z", "cancelled": False, "attendees": []},
        ]
        return {"events": events, "unavailable": []}, None, None

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    out = await _run({"source": "agenda", "from_iso": "2026-09-01", "to_iso": "2026-09-15", "group_by": "person"})
    assert out["complete"] is True
    note = " ".join(out["notes"])
    assert "3 rendez-vous lus" in note
    assert "2 sans invité externe" in note and "hors tableau" in note


@pytest.mark.asyncio
async def test_ended_missions_without_an_ats_are_read_from_the_base_and_say_so(monkeypatch: pytest.MonkeyPatch) -> None:
    # #4065.9 (18/10) — « missions terminées » ne dépend pas d'un ATS : la base Bellum répond, et le dit.
    async def _ended(_user: str, *, ended_since_days: int) -> Any:
        return {"missions": [{"accountName": "Renault", "ends_on": _days_ago(10), "label": "Mission data"}]}

    async def _ats(*_a: Any, **_k: Any) -> Any:
        raise AssertionError("l'ATS ne doit pas être lu")

    monkeypatch.setattr(bellum_api, "missions_ended", _ended)
    monkeypatch.setattr(bellum_api, "ats_records", _ats)
    with connected_families_scope(["email"]):
        out = await _run({"source": "ats", "ats_list": "ended_missions"})
    assert "absent_sources" not in out, out
    assert out.get("records_read") == 1, out
    assert any("base Bellum" in n for n in out["notes"])
