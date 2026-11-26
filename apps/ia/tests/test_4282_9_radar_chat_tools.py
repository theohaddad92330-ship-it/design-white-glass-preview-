"""#4282.9 / #4281.1 — Laura lit le radar par technologie et les besoins historiques, sans rien écrire."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.access.rights_matrix import Permission, permission_de
from app.prompts.context_transparency import _TOOL_BACKED_LAYER_TOOL_NAMES
from app.services import radar_chat_tools as rct
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, cited_sources, execute_chat_tool

USER = "22222222-2222-4222-8222-222222222222"
NEED = {
    "company": "Acme",
    "title": "Consultant SAP FI/CO",
    "status": "GAGNE",
    "status_label": "gagné",
    "date": "2024-03-14",
    "tjm_eur": 720,
    "location": None,
    "technologies": ["SAP"],
    "prescriber": {
        "name": "Jeanne Martin",
        "role": "DSI",
        "freshness": {"kind": "to_revalidate", "date": "2023-01-01"},
    },
}


def test_deux_lectures_au_catalogue_avant_push_profile_jamais_le_nom_du_pack():
    names = [t["name"] for t in CHAT_TOOLS]
    assert names[-1] == "push_profile"
    for name in ("technology_radar", "search_historical_needs"):
        assert name in names
        assert name not in WRITE_TOOL_NAMES
        assert permission_de(name) is Permission.LECTURE
        assert name in _TOOL_BACKED_LAYER_TOOL_NAMES["dataforge"]
        blob = str(next(t for t in CHAT_TOOLS if t["name"] == name)).lower()
        assert "dataforge" not in blob and "orion" not in blob
    radar_desc = next(t for t in CHAT_TOOLS if t["name"] == "technology_radar")["description"]
    for block in (
        "Missions plaçables",
        "Comptes les plus chauds",
        "rang 2",
        "Besoins historiques",
        "prescripteurs",
        "PROFILS OBSERVÉS",
        "trois poches",
    ):
        assert block in radar_desc


@pytest.mark.asyncio
async def test_radar_relaie_la_sortie_commune_et_le_chemin_decouvrir(monkeypatch):
    radar = {"technology": {"kind": "closed", "code": "SAP", "label": "SAP"}, "accounts": [], "historicalNeeds": [NEED]}
    spy = AsyncMock(return_value=radar)
    monkeypatch.setattr(rct, "technology_radar", spy)
    out = await execute_chat_tool(
        "technology_radar", {"technology": "radar SAP France"}, user_id=USER, profile_data=None
    )
    assert out["discover_path"] == "/discover/radar?technology=SAP"
    assert out["accounts"] == []
    spy.assert_awaited_once_with("radar SAP France")
    assert cited_sources("technology_radar", out) == [{"kind": "dataforge", "label": "Consultant SAP FI/CO"}]


@pytest.mark.asyncio
async def test_NON_radar_sans_technologie(monkeypatch):
    monkeypatch.setattr(rct, "technology_radar", AsyncMock(return_value=None))
    out = await execute_chat_tool("technology_radar", {"technology": "  "}, user_id=USER, profile_data=None)
    assert "error" in out


@pytest.mark.asyncio
async def test_besoins_par_technologie_lignes_datees_et_citees(monkeypatch):
    spy = AsyncMock(return_value=[NEED])
    monkeypatch.setattr(rct, "historical_needs", spy)
    out = await execute_chat_tool("search_historical_needs", {"technology": "SAP"}, user_id=USER, profile_data=None)
    assert spy.await_args.kwargs["technology_code"] == "SAP"
    line = out["results"][0]["line"]
    assert line.startswith("Consultant SAP FI/CO · gagné · 2024-03-14 · TJM observé 720 €")
    assert "à revalider" in line
    assert cited_sources("search_historical_needs", out) == [{"kind": "dataforge", "label": line}]


@pytest.mark.asyncio
async def test_besoins_d_un_compte_passent_par_le_compte_possede_et_disent_a_verifier(monkeypatch):
    spy = AsyncMock(return_value={"needs": [], "to_verify": "à vérifier : 2 fiches", "source_ids": []})
    monkeypatch.setattr(rct, "needs_for_owned_account", spy)
    monkeypatch.setattr(rct, "resolve_workspace_id", AsyncMock(return_value="ws-1"))
    out = await execute_chat_tool("search_historical_needs", {"account_id": "acc-1"}, user_id=USER, profile_data=None)
    # #4294.9 — lu dans l'ESPACE du demandeur, jamais un `where id` seul.
    spy.assert_awaited_once_with("acc-1", USER, workspace_id="ws-1")
    assert out["to_verify"] == "à vérifier : 2 fiches"
    assert out["results"] == []


@pytest.mark.asyncio
async def test_NON_sans_filtre_ou_techno_hors_liste_aucune_lecture(monkeypatch):
    spy = AsyncMock(return_value=[NEED])
    monkeypatch.setattr(rct, "historical_needs", spy)
    assert "error" in await execute_chat_tool("search_historical_needs", {}, user_id=USER, profile_data=None)
    out = await execute_chat_tool(
        "search_historical_needs", {"technology": "Mainframe COBOL"}, user_id=USER, profile_data=None
    )
    assert out["results"] == []
    spy.assert_not_called()
