"""`launch_vivier_export` — #3950.1 (décision Louis 09/10/2026, lot G01).

Laura peut LANCER l'export du vivier (ATS, en lot) sur demande. Même patron
que `pin_memory_fact`/`propose_contact_departure` : l'exécuteur ne fait QUE
proposer — aucune lecture, aucun appel au pont, aucun chemin d'écriture sous
cette branche. Le clic appelle directement `GET talents/export/ats` ou
`POST talents/export/bulk` (`PendingActions.tsx`), jamais un second chemin.

La règle d'espace « qui peut exporter » n'est PAS vérifiée ici (comme
`export_contact_to_crm`) : ce test le prouve en l'absence de tout pont
configuré — zéro appel réseau, et pourtant la proposition part.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "11111111-1111-4111-8111-111111111111"


async def _run(tool_input: dict) -> dict:
    return await chat_tools.execute_chat_tool("launch_vivier_export", tool_input, user_id=USER, profile_data=None)


def test_the_tool_is_declared() -> None:
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert "launch_vivier_export" in names


def test_it_is_counted_as_a_write_tool() -> None:
    assert "launch_vivier_export" in chat_tools.WRITE_TOOL_NAMES


def test_mode_is_a_closed_enum_in_the_schema() -> None:
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "launch_vivier_export")
    schema = tool["input_schema"]
    assert schema["required"] == ["mode"]
    assert set(schema["properties"]["mode"]["enum"]) == {"ats", "bulk"}


@pytest.mark.asyncio
async def test_ats_mode_returns_a_frozen_proposal_with_zero_network_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir : aucune lecture, aucun pont")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    out = await _run({"mode": "ats"})
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "launch_vivier_export"
    assert proposal["mode"] == "ats"
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_bulk_mode_returns_a_frozen_proposal() -> None:
    out = await _run({"mode": "bulk"})
    proposal = out["proposal"]
    assert proposal["mode"] == "bulk"


@pytest.mark.asyncio
async def test_an_invented_mode_is_refused_not_proposed() -> None:
    out = await _run({"mode": "csv"})
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_missing_mode_is_refused() -> None:
    out = await _run({})
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_never_calls_a_write_endpoint() -> None:
    """Preuve par l'absence : `bellum_api` n'expose aucun verbe d'export. L'export
    part du CLIC de l'utilisateur, authentifié JWT (`GET talents/export/ats`,
    `POST talents/export/bulk`), jamais du pont interne."""
    from app.services import bellum_api

    assert not hasattr(bellum_api, "export_talents")
    assert not hasattr(bellum_api, "launch_vivier_export")


@pytest.mark.asyncio
async def test_declared_depends_on_is_carried_through() -> None:
    out = await _run({"mode": "ats", "depends_on": [0]})
    assert out["proposal"]["depends_on"] == [0]
