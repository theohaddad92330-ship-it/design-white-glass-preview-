"""#3973 — « Outils et sources » : les OUTILS décochés pour ce fil
(`req.excluded_providers`, déjà recoupés par l'API) descendent jusqu'aux
lectures de messagerie et d'agenda du pont NestJS.

Avec deux messageries (ou deux agendas) branchées, la famille reste offerte
quand un seul outil est décoché : c'est le pont qui doit savoir lequel ne pas
lire. Le tour pose l'exclusion une fois (`set_turn_excluded_providers`), et
CHAQUE lecture du pont qui choisit un backend la relaie — jamais une autre.
Sans exclusion, le corps envoyé est byte-identique à avant.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.models.chat import ChatRequest
from app.routers import chat as chat_router
from app.services import bellum_api
from app.services.chat_requested_mode import excluded_tool_providers_scope

_BRIDGE_READS = [
    (
        "/internal/copilot/mailbox/search",
        lambda: bellum_api.search_mailbox("user-1", intent="unread"),
        {"threads": []},
    ),
    ("/internal/copilot/agenda/events", lambda: bellum_api.list_agenda("user-1"), []),
    ("/internal/copilot/agenda/free-slots", lambda: bellum_api.find_free_slots("user-1"), []),
    ("/internal/copilot/agenda/day-brief", lambda: bellum_api.day_brief("user-1"), {"events": []}),
]


def _capture(monkeypatch: pytest.MonkeyPatch, answer: Any) -> dict[str, Any]:
    captured: dict[str, Any] = {}

    async def fake_post(path: str, payload: dict[str, Any], **_kwargs: object):
        captured["path"] = path
        captured["payload"] = payload
        return answer

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    return captured


@pytest.mark.parametrize(("path", "call", "answer"), _BRIDGE_READS)
async def test_each_mailbox_and_agenda_read_relays_the_excluded_tools(monkeypatch, path, call, answer) -> None:
    captured = _capture(monkeypatch, answer)
    with excluded_tool_providers_scope(["gmail", "google-calendar"]):
        await call()
    assert captured["path"] == path
    assert captured["payload"]["excludedProviders"] == ["gmail", "google-calendar"]


@pytest.mark.parametrize(("path", "call", "answer"), _BRIDGE_READS)
async def test_without_exclusion_the_body_is_unchanged(monkeypatch, path, call, answer) -> None:
    captured = _capture(monkeypatch, answer)
    with excluded_tool_providers_scope(None):
        await call()
    assert captured["path"] == path
    assert "excludedProviders" not in captured["payload"]


async def test_reads_that_choose_no_backend_never_carry_it(monkeypatch) -> None:
    captured = _capture(monkeypatch, {})
    with excluded_tool_providers_scope(["gmail"]):
        await bellum_api.agenda_preferences("user-1")
    assert "excludedProviders" not in captured["payload"]


class _TurnStarted(Exception):
    pass


async def test_the_turn_sets_the_excluded_tools_from_the_request(monkeypatch) -> None:
    seen: list[list[str] | None] = []

    def fake_set(providers: list[str] | None) -> None:
        seen.append(providers)
        raise _TurnStarted

    monkeypatch.setattr(chat_router, "set_turn_excluded_providers", fake_set)
    req = ChatRequest(message="Qui ne m'a pas répondu ?", user_id="u1", excluded_providers=["gmail"])

    async def emit(_event: dict) -> None:
        return None

    with pytest.raises(_TurnStarted):
        await chat_router._run_chat_turn(req, emit)
    assert seen == [["gmail"]]


# ── Le brief du jour (#3973, même famille de défaut) ─────────────────────────
#
# Le brief de Laura lit AUSSI la messagerie et l'agenda (pont
# `/internal/copilot/briefing`). L'outil reste offert quand une famille est
# décochée — il a d'autres sections — mais la section décochée n'est pas lue, et
# le DIT, avec la même phrase que le CRM décoché de `get_account_preflight`.


async def test_the_briefing_relays_excluded_tools_and_families(monkeypatch) -> None:
    captured = _capture(monkeypatch, {"actions": []})
    with excluded_tool_providers_scope(["gmail"]):
        await bellum_api.daily_briefing("user-1", excluded_families=["calendar", "crm"])
    assert captured["path"] == "/internal/copilot/briefing"
    assert captured["payload"]["excludedProviders"] == ["gmail"]
    assert captured["payload"]["excludedFamilies"] == ["calendar", "crm"]


async def test_the_briefing_body_is_unchanged_without_exclusion(monkeypatch) -> None:
    captured = _capture(monkeypatch, {"actions": []})
    with excluded_tool_providers_scope(None):
        await bellum_api.daily_briefing("user-1")
    assert captured["payload"] == {"userId": "user-1"}


async def test_the_briefing_tool_passes_the_thread_exclusions(monkeypatch) -> None:
    from app.services import chat_tools

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: list[dict[str, Any]] = []

    async def fake_briefing(user_id: str, **kwargs: Any) -> dict[str, Any]:
        seen.append(kwargs)
        return {"agenda": {"state": "ready"}, "mail": {"state": "ready"}, "actions": []}

    monkeypatch.setattr(bellum_api, "daily_briefing", fake_briefing)
    await chat_tools.execute_chat_tool(
        "get_daily_briefing", {}, user_id="u1", profile_data=None, excluded_families=["email"]
    )
    await chat_tools.execute_chat_tool("get_daily_briefing", {}, user_id="u1", profile_data=None)
    assert seen == [{"excluded_families": ["email"]}, {}]


async def test_a_section_unticked_entirely_says_so_and_carries_no_count(monkeypatch) -> None:
    from app.services import chat_tools

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_briefing(user_id: str, **_kwargs: Any) -> dict[str, Any]:
        return {
            "agenda": {"state": "unavailable", "reason": "agenda_excluded_for_thread"},
            "mail": {"state": "unavailable", "reason": "mailbox_excluded_for_thread"},
            "actions": [],
        }

    monkeypatch.setattr(bellum_api, "daily_briefing", fake_briefing)
    result = await chat_tools.execute_chat_tool(
        "get_daily_briefing", {}, user_id="u1", profile_data=None, excluded_families=["email", "calendar"]
    )
    assert result["mailbox_state"] == "excluded_by_user"
    assert result["agenda_state"] == "excluded_by_user"
    assert result["mailbox_note"] == result["agenda_note"] == "Exclu par toi pour ce fil — non lu, bien que branché."
    # Une section non lue ne s'affiche jamais « 0 ».
    for key in ("threads_awaiting_reply", "positive_replies", "meetings_to_prepare", "conflicts"):
        assert key not in result
