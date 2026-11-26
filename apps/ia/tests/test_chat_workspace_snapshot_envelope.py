"""#2852.6-53 (lot EP8, 02/10) — les dix lectures « état de l'espace » de Laura
(contexte, santé, adoption, blocages, maillon faible, routines, imports,
réglages, mémoire, vocabulaire) rendent l'enveloppe canonique de RÉSULTAT
D'OUTIL, additive, au lieu d'un texte comme seul signal.

Ces dix outils partageaient une porte `is_configured()` COMMUNE qui répondait
le même texte pour « pont éteint » et pour tout le reste. Le NO-GO de #2282 :
« pont éteint » (`not_covered`) ne se lit jamais « le pont n'a pas répondu »
(`provider_error`), et aucun des deux n'est « ton espace n'a rien » (`empty`).
Chaque test REJOUE le tour : entrée du modèle → `execute_chat_tool` → réponse.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"

# nom de l'outil, fonction du pont, type de résultat déclaré, charge utile type
CASES: list[tuple[str, str, str, dict[str, Any]]] = [
    ("get_user_context", "laura_user_context", "workspace_user_context", {"role": "sales"}),
    ("get_workspace_health", "laura_workspace_health", "workspace_health", {"measurable": False}),
    ("get_feature_adoption", "laura_feature_adoption", "workspace_feature_adoption", {"features": []}),
    ("get_blocking_issues", "laura_blocking_issues", "workspace_blocking_issues", {"issues": []}),
    (
        "get_weakest_link_diagnosis",
        "laura_weakest_link_diagnosis",
        "weakest_link_diagnosis",
        {"primary_bottleneck": None},
    ),
    ("get_routines", "laura_routines_summary", "workspace_routines", {"routines": []}),
    ("get_import_overview", "laura_import_overview", "workspace_import_overview", {"jobs": []}),
    ("get_settings_overview", "laura_settings_overview", "workspace_settings_overview", {"sections": []}),
    ("get_memory", "laura_memory_ledger", "workspace_memory", {"entries": [], "unreadable_layers": []}),
    ("get_workspace_vocabulary", "laura_workspace_vocabulary", "workspace_vocabulary", {"terms": []}),
]
IDS = [case[0] for case in CASES]


async def _run(name: str) -> dict:
    return await chat_tools.execute_chat_tool(name, {}, user_id=USER, profile_data=None)


def _bridge(monkeypatch: pytest.MonkeyPatch, fn: str, value: Any, *, configured: bool = True) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: configured)

    async def fake(_user_id: str) -> Any:
        return value

    monkeypatch.setattr(bellum_api, fn, fake)


@pytest.mark.asyncio
@pytest.mark.parametrize(("name", "fn", "result_type", "payload"), CASES, ids=IDS)
async def test_a_switched_off_bridge_is_not_covered(
    monkeypatch: pytest.MonkeyPatch, name: str, fn: str, result_type: str, payload: dict
) -> None:
    _bridge(monkeypatch, fn, payload, configured=False)
    result = await _run(name)
    assert result["error"] == "Je n'ai pas accès à l'état de ton espace depuis ici."
    assert result["status"] == "not_covered"
    assert result["error_code"] == "bridge_not_configured"
    assert result["result_type"] == result_type
    assert result["suggested_next_step"]


@pytest.mark.asyncio
@pytest.mark.parametrize(("name", "fn", "result_type", "payload"), CASES, ids=IDS)
async def test_a_silent_bridge_is_a_provider_error_never_empty(
    monkeypatch: pytest.MonkeyPatch, name: str, fn: str, result_type: str, payload: dict
) -> None:
    _bridge(monkeypatch, fn, None)
    result = await _run(name)
    assert "error" in result
    assert result["status"] == "provider_error"
    assert result["error_code"] == "bridge_unavailable"
    assert result["result_type"] == result_type


@pytest.mark.asyncio
@pytest.mark.parametrize(("name", "fn", "result_type", "payload"), CASES, ids=IDS)
async def test_an_answered_read_keeps_its_payload_and_names_its_source(
    monkeypatch: pytest.MonkeyPatch, name: str, fn: str, result_type: str, payload: dict
) -> None:
    _bridge(monkeypatch, fn, dict(payload))
    result = await _run(name)
    assert "error" not in result
    for key, value in payload.items():
        assert result[key] == value
    assert result["status"] == "success"
    assert result["result_type"] == result_type
    assert result["sources_succeeded"] == ["bellum_workspace"]
    # Un enregistrement unique : aucun total ni compteur inventé.
    assert "total_found" not in result
    assert "returned_count" not in result


@pytest.mark.asyncio
async def test_unreadable_blocking_issues_is_an_error_not_a_clean_bill(monkeypatch: pytest.MonkeyPatch) -> None:
    # « Je n'ai pas pu vérifier » n'est jamais « aucun blocage ».
    _bridge(monkeypatch, "laura_blocking_issues", {"issues": None})
    result = await _run("get_blocking_issues")
    assert result["status"] == "provider_error"
    assert "issues" not in result


@pytest.mark.asyncio
async def test_the_memory_ledger_keeps_its_cap_and_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    entries = [{"id": i} for i in range(chat_tools._LIST_TOOL_CAP + 5)]
    _bridge(monkeypatch, "laura_memory_ledger", {"entries": entries})
    result = await _run("get_memory")
    assert len(result["entries"]) == chat_tools._LIST_TOOL_CAP
    assert result["truncated"] is True
    assert result["status"] == "success"


@pytest.mark.asyncio
async def test_a_payload_key_is_never_overwritten_by_the_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    # Le contenu du pont gagne : une clé `status` du pont ne devient jamais le
    # statut d'enveloppe, et l'enveloppe ne l'écrase pas.
    _bridge(monkeypatch, "laura_user_context", {"status": "trial"})
    result = await _run("get_user_context")
    assert result["status"] == "trial"
    assert result["result_type"] == "workspace_user_context"
