"""#4408.1 (recette prod 26/10, FAIL) — « des petites structures sans gros process achat » : Laura DEMANDAIT le
territoire, puis sur « toute la France » répondait « il manque une tranche d'effectif, un secteur, un département
ou une raison sociale » (0 compte sur 10). Doctrine « Laura AGIT » : le périmètre le plus large qu'elle sait servir
est POSÉ et NOMMÉ, jamais une question, jamais un zéro muet."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_orchestrator
from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_tools import execute_chat_tool
from app.services.light_structure_request import light_scope_note
from tests.test_chat_orchestrator import (  # noqa: F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
)

USER = "99999999-9999-4999-8999-999999999999"
PHRASE = "des petites structures sans gros process achat"


def _row(siren: str, name: str, **extra: Any) -> dict[str, Any]:
    return {"siren": siren, "name": name, "city": "Lyon", "department": "69", "nafLabel": "Conseil", **extra}


GROUPE = _row("200000001", "GROUPE NATIONAL", sizeClass="GE", headcountTranche="52", headcount=9000)
PME = _row("200000002", "PETITE ALPHA", sizeClass="PME", headcountTranche="22", headcount=120)


async def _search(monkeypatch: pytest.MonkeyPatch, rows: list[dict[str, Any]], asked: dict[str, Any]) -> dict[str, Any]:
    seen: list[Any] = []

    class _Response:
        degraded: list[Any] = []
        query: dict[str, Any] = {}
        recommendedSort = "balanced"
        candidates = rows

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response()

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    set_turn_thread(PHRASE, [])
    try:
        out = await execute_chat_tool("run_account_search", asked, user_id=USER, profile_data=None)
    finally:
        set_turn_thread("", [])
    out["_requests"] = seen
    return out


@pytest.mark.asyncio
async def test_sans_territoire_ni_critere_la_recherche_part_au_lieu_d_une_erreur(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _search(monkeypatch, [GROUPE, PME], {"limit": 10})
    assert "error" not in out, out.get("error")
    assert [i["name"] for i in out["items"]] == ["PETITE ALPHA"]
    assert [d["name"] for d in out["out_of_scope"]] == ["GROUPE NATIONAL"]  # écarté listé, jamais muet


@pytest.mark.asyncio
async def test_le_perimetre_pose_est_nomme_dans_la_reponse(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _search(monkeypatch, [PME], {})
    scope = out["default_scope"]
    assert "toute la France" in scope["message"]
    assert scope["headcount"] == out["criteria"]["headcount"]
    assert scope["headcount"] in scope["message"]
    assert out["criteria"]["headcount"]  # un critère existe, posé par le code
    assert "region" not in out["criteria"] and "department" not in out["criteria"]


@pytest.mark.asyncio
async def test_une_demande_sans_petite_structure_garde_l_erreur(monkeypatch: pytest.MonkeyPatch) -> None:
    set_turn_thread("trouve-moi des comptes", [])
    try:
        out = await execute_chat_tool("run_account_search", {}, user_id=USER, profile_data=None)
    finally:
        set_turn_thread("", [])
    assert "error" in out


@pytest.mark.asyncio
async def test_sous_le_volume_les_ecartes_sont_listes_par_critere(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _search(monkeypatch, [GROUPE, PME], {"limit": 10})
    assert out["out_of_scope_count"] == 1
    assert out["out_of_scope"][0]["reason"]


def test_la_consigne_pose_et_dit_le_perimetre_sans_question() -> None:
    note = light_scope_note(PHRASE, {})
    assert "toute la France" in note and "run_account_search" in note
    assert "AUCUNE question" in note
    assert "jamais « tu veux élargir ? »" in note


def test_la_consigne_prend_la_zone_du_profil() -> None:
    assert "Île-de-France (ton profil)" in light_scope_note(PHRASE, {"geoZone": "Île-de-France"})


@pytest.mark.asyncio
async def test_tour_rejoue_aucune_question_de_territoire(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools(
        "sys", PHRASE, user_id="u1", profile_data={}, user_message=PHRASE
    )
    first_call = fake.messages.calls[0]
    assert "ask_clarification" not in {tool["name"] for tool in first_call["tools"]}
    assert "Périmètre : toute la France" in str(first_call["system"])
