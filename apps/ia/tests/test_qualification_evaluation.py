"""L'évaluation de la grille de qualification de l'espace (#3755.3).

Ce que ces tests protègent :

1. **Un critère interne n'est jamais envoyé au modèle** — staffing, appétence,
   avant-vente, budget validé sont `not_evaluable` d'office.
2. **Pas de preuve, pas d'évaluation** — une note sans `evidence` redevient
   `not_evaluable`, jamais 0.
3. **Les bornes du contrat** — un statut incompatible avec le type de critère, des
   points au-delà du poids, un code hors grille : corrigés ou écartés.
4. **Grille sans critère externe → aucun appel modèle** (le coût).
5. **La route** rend `{success, data: {evaluations}}` et traduit une panne en 502.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services import qualification_evaluation as target
from app.services.claude_service import TokenUsage

CRITERIA = [
    {
        "code": "F1",
        "label": "Présence géographique",
        "kind": "eliminatory",
        "weight": None,
        "description_max": "France",
        "description_zero": "Hors France",
        "category": "Filtres",
        "position": 0,
    },
    {
        "code": "S2",
        "label": "Douleur exprimée",
        "kind": "weighted",
        "weight": 40,
        "description_max": "Projet annoncé",
        "description_zero": "Rien",
        "category": "Besoin",
        "position": 1,
    },
    {
        "code": "S3",
        "label": "Staffing disponible",
        "kind": "weighted",
        "weight": 60,
        "description_max": "Équipe prête",
        "description_zero": "Personne",
        "category": "Interne",
        "position": 2,
    },
]


def _usage() -> TokenUsage:
    return TokenUsage(input_tokens=500, output_tokens=200, model="claude-sonnet", cost_usd=0.001, cost_known=True)


@pytest.mark.asyncio
async def test_internal_criteria_never_reach_the_model_and_evidence_is_required() -> None:
    model_out = {
        "evaluations": [
            {"code": "F1", "status": "fail", "points": None, "evidence": "Siège à Montréal (Canada)."},
            {"code": "S2", "status": "scored", "points": 400, "evidence": "Refonte SI annoncée en 2026."},
            {"code": "S3", "status": "scored", "points": 60, "evidence": "deviné"},
        ]
    }
    with patch.object(target, "call_claude", AsyncMock(return_value=(model_out, _usage()))) as call:
        out = await target.evaluate_grid("Acme", {"headquarters": "Montréal"}, CRITERIA, {"tier": None})

    sent = call.call_args.args[1]
    assert "Staffing" not in sent
    by_code = {e["code"]: e for e in out}
    assert by_code["F1"]["status"] == "fail"
    assert by_code["S2"] == {"code": "S2", "status": "scored", "points": 40, "evidence": "Refonte SI annoncée en 2026."}
    assert by_code["S3"]["status"] == "not_evaluable"
    assert by_code["S3"]["points"] is None


@pytest.mark.asyncio
async def test_a_score_without_evidence_is_not_an_evaluation() -> None:
    model_out = {
        "evaluations": [
            {"code": "S2", "status": "scored", "points": 20, "evidence": ""},
            {"code": "F1", "status": "scored", "points": 3, "evidence": "x"},
            {"code": "ZZ", "status": "pass", "evidence": "hors grille"},
        ]
    }
    with patch.object(target, "call_claude", AsyncMock(return_value=(model_out, _usage()))):
        out = await target.evaluate_grid("Acme", {}, CRITERIA, {})
    assert [e["code"] for e in out] == ["F1", "S2", "S3"]
    assert all(e["status"] == "not_evaluable" for e in out)


@pytest.mark.asyncio
async def test_no_external_criterion_means_no_model_call() -> None:
    with patch.object(target, "call_claude", AsyncMock()) as call:
        out = await target.evaluate_grid("Acme", {}, [CRITERIA[2]], {})
    call.assert_not_called()
    assert out == [{"code": "S3", "status": "not_evaluable", "points": None, "evidence": None}]


def test_route_returns_envelope_and_502_on_model_failure() -> None:
    from app.main import app

    client = TestClient(app)
    body = {"account_name": "Acme", "dossier": {}, "criteria": CRITERIA, "signals": {}}
    with patch.object(
        target,
        "evaluate_grid",
        AsyncMock(return_value=[{"code": "F1", "status": "pass", "points": None, "evidence": "x"}]),
    ):
        ok = client.post("/qualification/evaluate", json=body, headers=_internal_headers())
    assert ok.status_code == 200
    assert ok.json()["data"]["evaluations"][0]["code"] == "F1"

    with patch.object(target, "evaluate_grid", AsyncMock(side_effect=RuntimeError("down"))):
        ko = client.post("/qualification/evaluate", json=body, headers=_internal_headers())
    assert ko.status_code == 502


def _internal_headers() -> dict[str, str]:
    import os

    secret = os.getenv("INTERNAL_API_SECRET")
    return {"x-internal-secret": secret} if secret else {}
