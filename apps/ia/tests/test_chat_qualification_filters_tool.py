"""#2273 (LAU-FINAL-015, épopée #2959) — l'outil `/chat`
`evaluate_account_qualification_filters`.

L'APPELANT : un moteur de filtres juste que personne n'appelle ne compte pas.
Ce test prouve que le tool est dans `CHAT_TOOLS` (Laura peut le choisir) et
que l'exécuteur lit `raw_analysis.evaluation.scoreBreakdown` et
`raw_analysis.purchasingThread.byBuyer` du compte du portefeuille de
l'utilisateur (même lecture que `resolve_account_territory` pour le second —
aucun second calcul) avant d'appeler `evaluate_qualification_filters`.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services import ownership, supabase_client
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "44444444-4444-4444-8444-444444444444"


def test_registry_exposes_the_tool_with_a_required_account_id() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "evaluate_account_qualification_filters")
    assert tool["input_schema"]["required"] == ["account_id"]


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool(
        "evaluate_account_qualification_filters", tool_input, user_id=USER, profile_data=None
    )


@pytest.mark.asyncio
async def test_reads_the_score_breakdown_and_evaluates_the_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        assert user_id == USER  # scopé au portefeuille de l'appelant
        return {
            "id": account_id,
            "raw_analysis": {
                "evaluation": {
                    "scoreBreakdown": [
                        {"axis": "fit_offre", "points": 5},
                        {"axis": "accessibilite", "points": 1},
                        {"axis": "timing", "points": 4},
                    ]
                },
                "purchasingThread": {"byBuyer": [{"name": "Filiale Y", "contractsAwarded": 1}]},
            },
        }

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "a-1"})
    by_key = {f["key"]: f for f in result["filters"]}
    assert by_key["expertise_utile"]["status"] == "valide"
    assert by_key["voie_acces"]["status"] == "a_verifier"
    assert by_key["voie_achat"]["status"] == "valide"
    # #2273.6 — toujours à vérifier, jamais deviné.
    assert by_key["prix_zone_modele"]["status"] == "a_verifier"


@pytest.mark.asyncio
async def test_tolerates_a_missing_raw_analysis_without_inventing_a_score(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        return {"id": account_id, "raw_analysis": {}}

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "a-2"})
    # #2273.8 — aucune donnée n'est un rejet, jamais un statut inventé.
    assert {f["status"] for f in result["filters"]} == {"a_verifier"}


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_account(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fetch(*_a: object, **_k: object) -> dict:
        raise HTTPException(status_code=404)

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "not-mine"})
    # #3195 — le refus garde son message exact et porte le geste suivant.
    assert result["error"] == "Compte introuvable dans votre portefeuille."
    assert "web_search" in result["next_step"]


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await _run({})
    assert result == {"error": "Un identifiant de compte est requis."}
