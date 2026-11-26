"""#3179 (LAU-FINAL-185) — l'APPELANT `/chat` du verdict d'aptitude commerciale.

Le calcul est testé à part, sans I/O, dans `test_account_suitability.py`. Ce
fichier prouve la chaîne complète : `CHAT_TOOLS` l'expose au modèle,
`execute_chat_tool("get_account_suitability_verdict", …)` le route, et
l'ownership est appliqué comme pour `get_account_preflight` — même motif.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool, tools_for

USER = "44444444-4444-4444-8444-444444444444"


def _stub_owned_account(monkeypatch: pytest.MonkeyPatch, account: dict) -> None:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))

    async def _fetch_owned_account(*_a: object, **_k: object) -> dict:
        return account

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_fetch_owned_account))


async def _run(tool_input: dict, profile_data: dict | None = None) -> dict:
    return await execute_chat_tool(
        "get_account_suitability_verdict", tool_input, user_id=USER, profile_data=profile_data
    )


def test_registry_exposes_the_tool_read_only_and_before_push_profile() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert "get_account_suitability_verdict" in names
    assert "get_account_suitability_verdict" not in WRITE_TOOL_NAMES
    assert names.index("get_account_suitability_verdict") < names.index("push_profile")


def test_tool_is_never_gated_by_a_connected_family() -> None:
    names = {t["name"] for t in tools_for(())}
    assert "get_account_suitability_verdict" in names


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await _run({})
    assert "error" in result
    # #2852.6-53 (lot t02-29-09) — même enveloppe canonique que
    # get_account_briefing sur une lecture à un seul enregistrement.
    assert result["status"] == "invalid_input"
    assert result["result_type"] == "account_suitability_verdict"
    assert result["error_code"] == "missing_account_id"


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_account(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))

    async def _not_found(*_a: object, **_k: object) -> dict:
        raise HTTPException(status_code=404, detail="Account not found")

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_not_found))
    result = await _run({"account_id": "acc-x"})
    assert "error" in result
    assert result["status"] == "empty"
    assert result["result_type"] == "account_suitability_verdict"


@pytest.mark.asyncio
async def test_account_without_any_analysis_is_not_evaluable_never_a_guessed_verdict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_owned_account(monkeypatch, {"id": "acc-1", "company_name": "Sans Analyse"})
    result = await _run({"account_id": "acc-1"})
    assert result["verdict"] == "NOT_EVALUABLE"


@pytest.mark.asyncio
async def test_analysed_account_renders_a_verdict_explained_by_named_axes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub_owned_account(
        monkeypatch,
        {
            "id": "acc-2",
            "company_name": "Client Test",
            "raw_analysis": {
                "painPoints": ["cloud"],
                "recentSignals": [{"freshness": "current"}, {"freshness": "current"}],
                "itJobSignals": [1, 2, 3],
                "contacts": [{"email": "a@b.com"}, {"phone": "0600000000"}],
                "competitorsPresent": [],
                "sources": ["a", "b", "c"],
                "entitiesExhaustive": ["x"],
            },
        },
    )
    result = await _run({"account_id": "acc-2"}, profile_data={"offers": ["cloud"], "references": ["ref1"]})
    assert result["verdict"] in (
        "GO_NOW",
        "GO_VIA_PARTNER",
        "GO_AFTER_PROOF",
        "WATCH",
        "NO_GO_NOW",
        "NOT_EVALUABLE",
    )
    assert result["dominant_reasons"] or result["blocking_factors"] or result["verdict"] == "NOT_EVALUABLE"
    assert result["status"] == "success"
    assert result["result_type"] == "account_suitability_verdict"
    assert result["sources_consulted"] == ["bellum_workspace"]


@pytest.mark.asyncio
async def test_partners_axis_is_read_from_the_bridge_and_named_in_the_turn(monkeypatch: pytest.MonkeyPatch) -> None:
    """#185.2 (#3242) — rejeu du tour : entrée → outil → le partenaire déclaré du compte est cité."""
    _stub_owned_account(monkeypatch, {"id": "acc-3", "company_name": "Client", "raw_analysis": {}})
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    reading = {"partners": [{"name": "Alten", "relationship": "partner", "rank": "rank2", "source": "declared"}]}
    monkeypatch.setattr("app.services.bellum_api.account_partners", AsyncMock(return_value=reading))
    result = await _run({"account_id": "acc-3"})
    assert result["partners_on_account"] == [{"name": "Alten", "rank": "rank2", "source": "declared"}]
    assert "partenaires" not in [u["axis"] for u in result["unknowns"]]


@pytest.mark.asyncio
async def test_partners_axis_stays_unevaluated_when_the_bridge_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, {"id": "acc-4", "company_name": "Client", "raw_analysis": {}})
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: False)
    result = await _run({"account_id": "acc-4"})
    assert "partners_on_account" not in result
    assert "partenaires" in [u["axis"] for u in result["unknowns"]]


@pytest.mark.asyncio
async def test_references_axis_reads_the_declared_reference_sectors_in_the_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3476 (#3242 / #185.2) — rejeu du tour : profil (`referenceSectors`) + secteur du
    compte → outil → la référence sectorielle déclarée est citée, l'axe sort des inconnues."""
    _stub_owned_account(
        monkeypatch, {"id": "acc-5", "company_name": "Société Générale", "sector": "Banque", "raw_analysis": {}}
    )
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: False)
    profile = {"referenceSectors": ["Banque de détail & Banque privée"]}
    result = await _run({"account_id": "acc-5"}, profile_data=profile)
    assert result["sector_reference"] == {
        "declared_sector": "Banque de détail & Banque privée",
        "account_sector": "Banque",
    }
    assert "références et preuves mobilisables" not in [u["axis"] for u in result["unknowns"]]
