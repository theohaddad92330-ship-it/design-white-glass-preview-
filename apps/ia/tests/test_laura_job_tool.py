"""#2276.1 / #2276.2 / #2276.63 — une demande complexe devient un JOB, pas une réponse texte.

L'outil ``plan_laura_job`` ne fait RIEN : il pose une fiche (intention, résultat
attendu, périmètre, hypothèses, étapes et dépendances) que l'API persiste en job
« À confirmer ». Ces tests tiennent la forme de la fiche, la frontière avec le
contrat TypeScript (les capacités), et le passage de la fiche jusqu'au contexte
du tour.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool
from app.services.laura_job_tool import (
    LAURA_JOB_CAPABILITIES,
    LAURA_JOB_STATUS,
    LAURA_JOB_TOOL_NAME,
    build_laura_job,
    laura_job_of_turn,
)

_CONTRACT = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "schemas" / "laura-job.ts"


def _input(**overrides):
    base = {
        "intent": "Cartographier les décideurs des filiales Thales",
        "expected_outcome": "50 décideurs rattachés à leur filiale",
        "scope": {"description": "Les filiales françaises de Thales", "account_ids": ["11111111-1111-4111-8111-111111111111"]},
        "assumptions": ["Je suppose les filiales françaises seulement"],
        "steps": [
            {"key": "analyse", "label": "Analyser les filiales", "capability": "account_analysis", "units": 20},
            {
                "key": "enrich",
                "label": "Enrichir les décideurs",
                "capability": "contact_enrichment",
                "units": 50,
                "depends_on": ["analyse"],
            },
        ],
        "sources": ["Registre des entreprises"],
    }
    base.update(overrides)
    return base


def test_the_tool_is_declared_and_executed() -> None:
    assert LAURA_JOB_TOOL_NAME in [tool["name"] for tool in CHAT_TOOLS]
    out = asyncio.run(
        execute_chat_tool(LAURA_JOB_TOOL_NAME, _input(), user_id="11111111-1111-4111-8111-111111111111", profile_data=None)
    )
    assert out["status"] == LAURA_JOB_STATUS
    job = out["laura_job"]
    # La fiche parle la langue du contrat (camelCase), jamais celle de l'outil.
    assert job["intent"].startswith("Cartographier")
    assert job["expectedOutcome"]
    assert job["scope"]["accountIds"] == ["11111111-1111-4111-8111-111111111111"]
    assert job["steps"][1]["dependsOn"] == ["analyse"]
    assert job["steps"][0]["units"] == 20
    # Le modèle ne fixe ni coût ni état : l'API les tire de la grille.
    assert "estimatedCredits" not in job and "status" not in job["steps"][0]


def test_a_dependency_on_a_later_or_unknown_step_is_refused() -> None:
    forward = _input(
        steps=[
            {"key": "a", "label": "A", "capability": "read_workspace", "depends_on": ["b"]},
            {"key": "b", "label": "B", "capability": "read_workspace"},
        ]
    )
    assert "error" in build_laura_job(forward)


def test_an_unknown_capability_is_refused_never_guessed() -> None:
    wrong = _input(steps=[{"key": "a", "label": "A", "capability": "send_email"}])
    assert "error" in build_laura_job(wrong)


def test_a_job_without_intent_or_steps_is_refused() -> None:
    assert "error" in build_laura_job(_input(intent=""))
    assert "error" in build_laura_job(_input(steps=[]))
    assert "error" in build_laura_job({})


def test_capabilities_match_the_typescript_contract() -> None:
    """La garde LIT le contrat : une capacité ajoutée d'un seul côté la fait tomber."""
    source = _CONTRACT.read_text(encoding="utf-8")
    block = re.search(r"lauraJobCapabilitySchema = z\.enum\(\[(.*?)\]\)", source, re.S)
    assert block, "le contrat n'est plus lisible — la garde ne prouve plus rien"
    declared = re.findall(r"'([a-z_]+)'", block.group(1))
    assert len(declared) >= 5
    assert list(LAURA_JOB_CAPABILITIES) == declared


def test_the_turn_carries_the_request_verbatim_as_original_request() -> None:
    actions = [
        {"tool": "get_account_briefing", "status": "done"},
        {"tool": LAURA_JOB_TOOL_NAME, "status": "noted", "laura_job": build_laura_job(_input())["laura_job"]},
    ]
    job = laura_job_of_turn(actions, "Analyse les 20 filiales de Thales et trouve 50 décideurs")
    assert job is not None
    assert job["originalRequest"] == "Analyse les 20 filiales de Thales et trouve 50 décideurs"
    assert laura_job_of_turn([{"tool": "x", "status": "done"}], "bonjour") is None


def test_the_orchestrator_carries_the_job_on_its_action_entry_and_marks_it_noted() -> None:
    """Rien n'est fait : l'entrée est NOTÉE (jamais « done »), et porte la fiche pour `chat.py`."""
    from app.services.chat_orchestrator import _execute_one_tool, _ToolCall
    from app.services.unrouted_intent import NOTED_STATUS

    async def _emit(_event: dict) -> None:
        return None

    entry, _output, is_error = asyncio.run(
        _execute_one_tool(
            _ToolCall(id="t1", name=LAURA_JOB_TOOL_NAME, input=_input()),
            user_id="11111111-1111-4111-8111-111111111111",
            profile_data=None,
            crm_connected=False,
            crm_provider="",
            semaphore=asyncio.Semaphore(1),
            emit=_emit,
        )
    )
    assert is_error is False
    assert entry["status"] == NOTED_STATUS
    assert entry["laura_job"]["steps"][0]["capability"] == "account_analysis"
    assert laura_job_of_turn([entry], "Analyse les filiales")["originalRequest"] == "Analyse les filiales"
