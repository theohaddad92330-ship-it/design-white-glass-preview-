"""#4064 — « sur les 3 derniers mois, liste les personnes rencontrées » : l'agenda branché répondait
« n'a pas répondu ».

Cause trouvée : `agendaRangeRequestSchema` (contrat) ne lisait que des bornes en `Z` ; Laura écrit
l'heure de Paris (`+02:00`) ou une date seule → HTTP 400 au pont → `None` → phrase générique.
Ces tests disent NON à l'ancien comportement : bornes relayées brutes, une seule lecture de 25 sur
92 jours, « n'a pas répondu » sans raison.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.services import bellum_api, record_listing
from app.services.chat_tools import execute_chat_tool

USER = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


def test_bounds_with_paris_offset_or_date_only_are_sent_in_utc() -> None:
    assert record_listing.parse_bound("2026-07-12T00:00:00+02:00", end=False) == datetime(
        2026, 7, 11, 22, 0, tzinfo=UTC
    )
    # Date seule : début du jour de Paris ; une FIN inclut le jour entier.
    assert record_listing.parse_bound("2026-07-12", end=False) == datetime(2026, 7, 11, 22, 0, tzinfo=UTC)
    assert record_listing.parse_bound("2026-10-12", end=True) == datetime(2026, 10, 12, 22, 0, tzinfo=UTC)
    # Heure sans fuseau : heure de Paris.
    assert record_listing.parse_bound("2026-07-12T09:00:00", end=False) == datetime(2026, 7, 12, 7, 0, tzinfo=UTC)


def test_a_past_window_without_an_end_stops_at_now() -> None:
    now = datetime(2026, 10, 12, 10, 0, tzinfo=UTC)
    start, stop = record_listing.resolve_window("2026-07-12", None, now=now)  # type: ignore[misc]
    assert stop == now
    assert (stop - start).days == 92


def test_an_unreadable_or_inverted_window_is_said() -> None:
    assert isinstance(record_listing.resolve_window("le 12 juillet", None), str)
    assert isinstance(record_listing.resolve_window("2026-10-12", "2026-07-12"), str)


@pytest.mark.asyncio
async def test_list_agenda_sends_utc_bounds_and_reads_92_days_in_slices(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    async def _window(_user: str, **kwargs: object) -> tuple[dict, None, None]:
        calls.append(kwargs)
        return (
            {"events": [{"id": f"e-{kwargs['from_iso']}", "start": kwargs["from_iso"]}], "unavailable": []},
            None,
            None,
        )

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    result = await execute_chat_tool(
        "list_agenda",
        {"from_iso": "2026-07-12T00:00:00+02:00", "to_iso": "2026-10-12T23:59:59+02:00"},
        user_id=USER,
        profile_data=None,
    )
    assert "error" not in result
    # Jamais une borne `+02:00` relayée telle quelle : le pont n'accepte que ce qu'il sait lire.
    assert all(str(c["from_iso"]).endswith("Z") and str(c["to_iso"]).endswith("Z") for c in calls)
    # 92 jours → trois tranches d'un mois au plus, page pleine (250) à chaque appel.
    assert len(calls) == 3
    assert all(c["limit"] == 250 for c in calls)
    assert result["events_read"] == 3
    assert result["window"] == {"from": "2026-07-12", "to": "2026-10-12"}


@pytest.mark.asyncio
async def test_a_full_page_is_split_and_reread_never_shown_as_complete(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    async def _window(_user: str, **kwargs: object) -> tuple[dict, None, None]:
        lower, upper = str(kwargs["from_iso"]), str(kwargs["to_iso"])
        calls.append((lower, upper))
        span = datetime.fromisoformat(upper.replace("Z", "+00:00")) - datetime.fromisoformat(
            lower.replace("Z", "+00:00")
        )
        count = 250 if span.days >= 20 else 3  # la première tranche d'un mois remplit la page
        return {"events": [{"id": f"{lower}-{i}", "start": lower} for i in range(count)], "unavailable": []}, None, None

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    start, stop = record_listing.resolve_window("2026-09-01", "2026-09-30")  # type: ignore[misc]
    read = await record_listing.read_agenda_window(USER, start, stop)
    assert len(calls) == 3  # la tranche pleine est relue en deux moitiés
    assert read["events_read"] == 6


@pytest.mark.asyncio
async def test_a_refusal_names_the_reason_never_a_generic_no_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(_user: str, **_kwargs: object) -> tuple[None, str, str]:
        return None, "http_502", "L'accès à ton agenda est éteint côté fournisseur : l'API Agenda n'est pas activée."

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    result = await execute_chat_tool("list_agenda", {"from_iso": "2026-07-12"}, user_id=USER, profile_data=None)
    assert "éteint côté fournisseur" in result["error"]
    assert "n'a pas répondu ou n'est pas connecté" not in result["error"]


@pytest.mark.asyncio
async def test_a_timeout_is_named_as_a_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(_user: str, **_kwargs: object) -> tuple[None, str, None]:
        return None, "unreachable", None

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    result = await execute_chat_tool("list_agenda", {"from_iso": "2026-07-12"}, user_id=USER, profile_data=None)
    assert "délai" in result["error"]


@pytest.mark.asyncio
async def test_a_silent_calendar_and_an_unread_slice_are_named(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _window(_user: str, **kwargs: object) -> tuple[dict | None, str | None, str | None]:
        if str(kwargs["from_iso"]).startswith("2026-08"):
            return None, "unreachable", None
        return (
            {
                "events": [{"id": str(kwargs["from_iso"]), "start": kwargs["from_iso"]}],
                "unavailable": [{"provider": "google", "reason": "events_unavailable", "calendarName": "Équipe"}],
            },
            None,
            None,
        )

    monkeypatch.setattr(bellum_api, "agenda_window", _window)
    result = await execute_chat_tool(
        "list_agenda", {"from_iso": "2026-07-12", "to_iso": "2026-10-12"}, user_id=USER, profile_data=None
    )
    assert result["unavailable_calendars"] == [{"agenda": "Google Agenda « Équipe »", "reason": "events_unavailable"}]
    assert result["unread_periods"] and "délai" in result["unread_periods"][0]["reason"]


@pytest.mark.asyncio
async def test_bridge_payload_carries_the_window_route(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def _explained(path: str, payload: dict, **_k: object) -> tuple[dict, None, None]:
        captured["path"] = path
        captured["payload"] = payload
        return {"events": [], "unavailable": []}, None, None

    monkeypatch.setattr(bellum_api, "_post_explained", _explained)
    data, failure, _ = await bellum_api.agenda_window(
        USER, from_iso="2026-07-11T22:00:00Z", to_iso="2026-08-11T22:00:00Z"
    )
    assert failure is None and data == {"events": [], "unavailable": []}
    assert captured["path"] == "/internal/copilot/agenda/window"
    assert captured["payload"] == {
        "userId": USER,
        "from": "2026-07-11T22:00:00Z",
        "to": "2026-08-11T22:00:00Z",
        "limit": 250,
    }
