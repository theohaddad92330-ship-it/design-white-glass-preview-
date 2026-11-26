"""#3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — Laura lit le
contrôle AVANT une action sur UN contact.

Le calcul vit côté API (`ContactsService.preflight` → `compileContactPreflight`,
`@bellum/contracts`) et sert AUSSI la fiche contact : cet outil le RELAIE par le
pont (`POST /internal/copilot/contact/preflight`), il ne recalcule rien
(GA-26). Ce fichier prouve la chaîne : `CHAT_TOOLS` l'expose, la lecture est
sans écriture, le pont reçoit le contact et l'action, et chaque échec se dit
dans sa propre enveloppe — jamais un « rien à signaler » deviné.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool, tools_for

USER = "33333333-3333-4333-8333-333333333333"
CONTACT = "44444444-4444-4444-8444-444444444444"

PREFLIGHT = {
    "contactId": CONTACT,
    "action": "export_crm",
    "status": "differences",
    "items": [
        {
            "kind": "scope_difference",
            "field": "title",
            "claims": [
                {
                    "value": "Directeur technique",
                    "source": "pipeline",
                    "at": "2026-09-21T10:00:00.000Z",
                    "scope": "Groupe entier",
                },
                {
                    "value": "Directeur technique — entité numérique voyageurs",
                    "source": "pipeline",
                    "at": "2026-10-05T10:00:00.000Z",
                    "scope": "Filiales",
                },
            ],
        }
    ],
    "unknowns": [],
}


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_contact_preflight", tool_input, user_id=USER, profile_data=None)


def _tool() -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == "get_contact_preflight")


def test_registry_exposes_the_tool_and_it_stays_read_only() -> None:
    assert "get_contact_preflight" in {t["name"] for t in CHAT_TOOLS}
    assert "get_contact_preflight" not in WRITE_TOOL_NAMES
    # Aucune famille branchée n'est requise : le contrôle lit la fiche et son journal.
    assert "get_contact_preflight" in {t["name"] for t in tools_for(())}


def test_appended_before_push_profile_never_inserted_earlier() -> None:
    names = [str(t["name"]) for t in CHAT_TOOLS]
    assert names.index("get_contact_preflight") > names.index("search_document_projects")
    assert names[-1] == "push_profile"


def test_description_forbids_deciding_for_the_human_and_names_scope_difference() -> None:
    description = str(_tool()["description"])
    assert "ne TRANCHES JAMAIS" in description
    assert "scope_difference" in description
    assert "recordKeptByHuman" in description
    assert "unknowns" in description
    lowered = description.lower()
    for vendor in ("apollo", "hubspot", "salesforce", "pipedrive", "dropcontact"):
        assert vendor not in lowered
    actions = _tool()["input_schema"]["properties"]["action"]["enum"]
    assert actions == ["prepare_message", "add_to_sequence", "export_crm"]


@pytest.mark.asyncio
async def test_requires_a_contact_id() -> None:
    result = await _run({})
    assert result["status"] == "invalid_input"
    assert result["result_type"] == "contact_preflight"


@pytest.mark.asyncio
async def test_relays_the_bridge_answer_unchanged_with_the_action(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple] = []

    async def preflight(user_id: str, contact_id: str, *, action: str | None = None) -> dict:
        calls.append((user_id, contact_id, action))
        return PREFLIGHT

    monkeypatch.setattr(bellum_api, "contact_preflight", preflight)
    result = await _run({"contact_id": CONTACT, "action": "export_crm"})
    assert calls == [(USER, CONTACT, "export_crm")]
    assert result["items"] == PREFLIGHT["items"]
    assert result["status"] == "success"
    assert result["result_type"] == "contact_preflight"


@pytest.mark.asyncio
async def test_an_unknown_action_is_dropped_never_guessed(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str | None] = []

    async def preflight(_user_id: str, _contact_id: str, *, action: str | None = None) -> dict:
        calls.append(action)
        return {**PREFLIGHT, "action": None}

    monkeypatch.setattr(bellum_api, "contact_preflight", preflight)
    await _run({"contact_id": CONTACT, "action": "send_now"})
    assert calls == [None]


@pytest.mark.asyncio
async def test_a_silent_bridge_is_a_provider_error_never_no_difference(monkeypatch: pytest.MonkeyPatch) -> None:
    async def preflight(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "contact_preflight", preflight)
    result = await _run({"contact_id": CONTACT})
    assert result["status"] == "provider_error"
    assert "items" not in result


@pytest.mark.asyncio
async def test_a_foreign_contact_reads_as_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    async def preflight(*_a: object, **_k: object) -> dict:
        return {"error": "contact_not_found"}

    monkeypatch.setattr(bellum_api, "contact_preflight", preflight)
    result = await _run({"contact_id": CONTACT})
    assert result["status"] == "empty"
    assert "introuvable" in result["error"]


@pytest.mark.asyncio
async def test_bridge_client_posts_to_the_contact_preflight_route(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[tuple[str, dict]] = []

    async def _post(path: str, payload: dict) -> dict:
        sent.append((path, payload))
        return PREFLIGHT

    monkeypatch.setattr(bellum_api, "_post", _post)
    await bellum_api.contact_preflight(USER, CONTACT, action="prepare_message")
    await bellum_api.contact_preflight(USER, CONTACT)
    assert sent == [
        ("/internal/copilot/contact/preflight", {"userId": USER, "contactId": CONTACT, "action": "prepare_message"}),
        ("/internal/copilot/contact/preflight", {"userId": USER, "contactId": CONTACT}),
    ]
