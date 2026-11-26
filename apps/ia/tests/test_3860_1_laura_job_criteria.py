"""#3860.1 (lot M06) — une étape de job porte son FILTRE (`criteria`).

La mémoire marché, le matching d'un besoin et la photo d'un territoire exigent
un filtre par étape (contrat `lauraJobStepCriteriaSchema`, packages/contracts).
L'outil le recopie dans la forme du contrat, n'en invente aucun, et écarte ce
qui n'a pas la forme attendue (l'API le refuserait de toute façon).
"""

from __future__ import annotations

from app.services.laura_job_tool import LAURA_JOB_TOOL, build_laura_job

NEED = "55555555-5555-4555-8555-555555555555"


def _job(step: dict) -> dict:
    out = build_laura_job(
        {
            "intent": "Lire le marché",
            "expected_outcome": "Un décompte",
            "scope": {"description": "Toulouse"},
            "steps": [{"key": "s", "label": "Étape", "capability": "search_market_memory", **step}],
        }
    )
    return out["laura_job"]["steps"][0]


def test_the_tool_schema_offers_a_criteria_object_per_step() -> None:
    props = LAURA_JOB_TOOL["input_schema"]["properties"]["steps"]["items"]["properties"]
    assert set(props["criteria"]["properties"]) == {"technology", "location", "region", "department", "need_id"}


def test_criteria_are_copied_in_the_contract_shape() -> None:
    step = _job({"criteria": {"technology": "Java", "department": "31", "need_id": NEED}})
    assert step["criteria"] == {"technology": "Java", "department": "31", "needId": NEED}


def test_a_malformed_criterion_is_dropped_never_guessed() -> None:
    step = _job({"criteria": {"department": "Haute-Garonne", "region": "Occitanie", "need_id": "pas-un-uuid"}})
    assert "criteria" not in step


def test_no_criteria_no_key() -> None:
    assert "criteria" not in _job({})
