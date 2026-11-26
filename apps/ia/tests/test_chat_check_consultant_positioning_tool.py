"""#3182.3 (épopée #3248, retour bêta 28/09/2026) — L'AGRÉGATEUR DES
PRÉREQUIS DE POSITIONNEMENT.

Retour bêta #3182 : « des fragments existent séparément (search_talents pour
la disponibilité, find_needs/run_matching pour le besoin actuel) mais aucun
agrégateur ne les inspecte ensemble avant qu'une recommandation de
positionnement soit faite ». Ce fichier tient :
  - l'outil existe, lecture seule, jamais gated par une famille connectée ;
  - sans pont configuré : chemin byte-identique aux autres outils du vivier
    (`_DELIVERY_TOOLS`), jamais un appel réseau tenté ni une donnée devinée ;
  - il exige besoin + run (rendu par run_matching) + consultant, jamais deviné ;
  - il relaie `checks`/`missing`/`status` du pont TELS QUELS — aucun second
    calcul, aucune probabilité inventée ;
  - un consultant hors du run est nommé tel quel, jamais un refus déguisé ;
  - un run ou un besoin introuvable refuse net, jamais une préflight inventée.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool, tools_for

USER = "55555555-5555-4555-8555-555555555555"
TOOL_NAME = "check_consultant_positioning"


async def _run(tool_input: dict[str, Any]) -> dict[str, Any]:
    return await execute_chat_tool(TOOL_NAME, tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_the_tool_and_it_stays_read_only() -> None:
    names = {t["name"] for t in CHAT_TOOLS}
    assert TOOL_NAME in names
    assert TOOL_NAME not in WRITE_TOOL_NAMES


def test_tool_is_never_gated_by_a_connected_family() -> None:
    names = {t["name"] for t in tools_for(())}
    assert TOOL_NAME in names


@pytest.mark.asyncio
async def test_names_the_bridge_as_absent_rather_than_a_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sans clé/pont configuré : même famille de refus que `search_talents` et
    `run_matching` (`_DELIVERY_TOOLS`) — chemin byte-identique, jamais un
    appel réseau tenté."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)

    called = False

    async def _fake(*_a: object, **_k: object) -> dict[str, Any]:
        nonlocal called
        called = True
        return {"status": "ready"}

    monkeypatch.setattr(bellum_api, "submission_preflight", _fake)
    result = await _run({"need_id": "n-1", "run_id": "r-1", "consultant_id": "c-1"})
    assert called is False
    assert "error" in result


@pytest.mark.asyncio
async def test_requires_need_run_and_consultant(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await _run({})
    assert "error" in result


@pytest.mark.asyncio
async def test_relays_checks_and_missing_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _fake(*_a: object, **_k: object) -> dict[str, Any]:
        return {
            "status": "ready",
            "blocked": False,
            "checks": [
                {"level": "ok", "label": "le talent autorise à le représenter pour ce compte"},
                {"level": "warning", "label": "le TJM ou les conditions ne sont pas validés avec le talent"},
            ],
            "missing": ["TJM non validé"],
        }

    monkeypatch.setattr(bellum_api, "submission_preflight", _fake)
    result = await _run({"need_id": "n-1", "run_id": "r-1", "consultant_id": "c-1"})
    assert result["status"] == "ready"
    assert result["blocked"] is False
    assert result["missing"] == ["TJM non validé"]
    assert result["checks"][0]["label"] == "le talent autorise à le représenter pour ce compte"
    assert result["cost_credits"] == 0


@pytest.mark.asyncio
async def test_a_blocking_check_names_the_no_go(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _fake(*_a: object, **_k: object) -> dict[str, Any]:
        return {
            "status": "no_go",
            "blocked": True,
            "checks": [{"level": "blocking", "label": "le talent n'autorise pas à le représenter pour ce compte"}],
            "missing": ["compte non autorisé par le talent"],
        }

    monkeypatch.setattr(bellum_api, "submission_preflight", _fake)
    result = await _run({"need_id": "n-1", "run_id": "r-1", "consultant_id": "c-1"})
    assert result["status"] == "no_go"
    assert result["blocked"] is True


@pytest.mark.asyncio
async def test_names_a_consultant_outside_the_run_rather_than_a_disguised_refusal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _fake(*_a: object, **_k: object) -> dict[str, Any]:
        return {"error": "consultant_not_ranked"}

    monkeypatch.setattr(bellum_api, "submission_preflight", _fake)
    result = await _run({"need_id": "n-1", "run_id": "r-1", "consultant_id": "c-9"})
    assert result.get("not_ranked") is True
    assert "error" not in result


@pytest.mark.asyncio
async def test_refuses_an_unknown_run_rather_than_inventing_a_preflight(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _fake(*_a: object, **_k: object) -> dict[str, Any]:
        return {"error": "run_not_found"}

    monkeypatch.setattr(bellum_api, "submission_preflight", _fake)
    result = await _run({"need_id": "n-1", "run_id": "r-x", "consultant_id": "c-1"})
    assert "error" in result
    assert "run_matching" in result["error"]


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_need(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _fake(*_a: object, **_k: object) -> dict[str, Any]:
        return {"error": "need_not_found"}

    monkeypatch.setattr(bellum_api, "submission_preflight", _fake)
    result = await _run({"need_id": "n-x", "run_id": "r-1", "consultant_id": "c-1"})
    assert "error" in result


@pytest.mark.asyncio
async def test_a_silent_bridge_never_invents_a_preflight(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _fake(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "submission_preflight", _fake)
    result = await _run({"need_id": "n-1", "run_id": "r-1", "consultant_id": "c-1"})
    assert "error" in result
