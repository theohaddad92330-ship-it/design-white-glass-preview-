"""#2300.54 / #2300.55 — le CONTRAT DE TRAVAIL s'ATTACHE aux résultats qu'il a cadrés.

Réfuté le 22/09/2026 (`.claude/notes/registre-2026-09-18-chat-account-work-contract.md`) :
`contract_id` (`account_work_contract.py`) est stable et testé au niveau du
compilateur (`test_account_work_contract_compiler.py`), mais n'était JAMAIS lu
ailleurs — aucun outil ne le relayait vers un résultat produit, et la
description de `get_account_work_contract` ne demandait jamais au modèle de le
citer. Ce fichier prouve les deux couches, sur le MÊME modèle que
`test_chat_plan_dependencies.py` (#1950.22) pour `depends_on` : la description
INSTRUIT, et les mêmes HUIT outils « capables de dépendance » (la famille des
propositions de la même réponse) relaient `contract_id` tel que le modèle l'a
fourni — sans nouvelle table, sans nouveau mécanisme (GA-26).
"""

from __future__ import annotations

import asyncio

from app.services.chat_tools import CHAT_TOOLS, GET_ACCOUNT_WORK_CONTRACT_TOOL, execute_chat_tool

USER = "22222222-2222-4222-8222-222222222222"

# Même famille que `_DEPENDENCY_CAPABLE_TOOLS` (test_chat_plan_dependencies.py) :
# les huit outils qui rendent une PROPOSITION rattachable à autre chose produit
# dans le même tour.
_CONTRACT_ATTACHABLE_TOOLS = {
    "prepare_message_for_contact",
    "schedule_reminder_for_contact",
    "create_contact_from_crm_presence",
    "export_contact_to_crm",
    "prepare_mail_draft",
    "prepare_campaign",
    "prepare_consultant_record",
    "pin_memory_fact",
}


def _run(name: str, tool_input: dict) -> dict:
    return asyncio.run(execute_chat_tool(name, tool_input, user_id=USER, profile_data=None))


def test_the_tool_description_instructs_citing_contract_id() -> None:
    # #2300.55 — l'instruction doit être DANS la description, pas seulement
    # dans un commentaire Python que le modèle ne lit jamais.
    assert "contract_id" in GET_ACCOUNT_WORK_CONTRACT_TOOL["description"]


def test_the_eight_attachable_tools_declare_the_schema_property() -> None:
    by_name = {tool["name"]: tool for tool in CHAT_TOOLS}
    for name in _CONTRACT_ATTACHABLE_TOOLS:
        assert "contract_id" in by_name[name]["input_schema"]["properties"], name


def test_a_declared_contract_id_serialises_in_the_proposal() -> None:
    # #2300.54 — un résultat produit dans le même tour PORTE le contract_id
    # du contrat qui l'a cadré, quand le modèle le fournit.
    result = _run(
        "pin_memory_fact",
        {"fact": "Le compte X paie en fin de trimestre.", "contract_id": "acc-1:preparer_rendez_vous"},
    )
    assert result["proposal"]["contract_id"] == "acc-1:preparer_rendez_vous"


def test_a_proposal_without_a_contract_id_carries_none() -> None:
    # Absent en entrée → absent en sortie, jamais `null` deviné.
    result = _run("pin_memory_fact", {"fact": "Le compte X paie en fin de trimestre."})
    assert "contract_id" not in result["proposal"]


def test_malformed_contract_id_is_dropped_not_propagated() -> None:
    # Une entrée qui n'est pas une chaîne non vide ne fait pas tomber la
    # proposition — elle perd juste son attache.
    result = _run("pin_memory_fact", {"fact": "Le compte X paie en fin de trimestre.", "contract_id": 42})
    assert "contract_id" not in result["proposal"]
