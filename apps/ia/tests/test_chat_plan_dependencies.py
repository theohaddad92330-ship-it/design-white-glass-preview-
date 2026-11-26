"""#1950.22 — Laura DÉCLARE les dépendances de son plan (apps/ia).

Le lot précédent (#1950.14/.18/.20) a ajouté `depends_on` au contrat TS
(`copilot-card.ts`, `copilot-plan.ts`) et au serveur (qui refuse une étape dont
le prérequis DÉCLARÉ a échoué) — mais le service IA ne produisait jamais ce
champ : la capacité était inerte en production. Ce fichier prouve les deux
couches que CE lot ajoute :

1. `chat_tools.py` — les HUIT outils qui peuvent RÉELLEMENT consommer le
   résultat d'une autre proposition de la même réponse portent `depends_on`
   dans leur `input_schema`, et le relaient (sanité en type) dans la
   proposition qu'ils rendent. Les six autres (producteurs ou gestes
   autonomes — recherche, navigation, réglage) ne le portent PAS : leur
   donner le champ inviterait une dépendance devinée là où aucune ne peut
   vouloir dire quelque chose.
2. `chat_orchestrator._stabilise_declared_dependencies` (appelée depuis
   `_run_tool_round`) — la numérotation qui rend une référence STABLE : une
   dépendance déclarée vers un rang qui n'existe pas ENCORE (elle-même, ou une
   étape plus tardive) est REJETÉE, jamais relayée telle quelle.
"""

from __future__ import annotations

import asyncio

from app.services import chat_orchestrator
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"

# Les huit outils qui peuvent DÉCLARER une dépendance (#1950.22) — voir le
# commentaire au-dessus de `_DEPENDS_ON_SCHEMA_PROPERTY` dans `chat_tools.py`.
_DEPENDENCY_CAPABLE_TOOLS = {
    "prepare_message_for_contact",
    "schedule_reminder_for_contact",
    "create_contact_from_crm_presence",
    "export_contact_to_crm",
    "prepare_mail_draft",
    "prepare_campaign",
    "prepare_consultant_record",
    "pin_memory_fact",
}

# Les six qui ne le portent PAS : producteurs ou gestes autonomes.
_DEPENDENCY_FREE_TOOLS = {
    "enrich_contact",
    "find_accounts",
    "propose_guided_action",  # rend l'action `open_screen`
    "toggle_routine",
    "propose_settings_update",  # rend l'action `update_setting`
    "start_account_analysis",
}


def _run(name: str, tool_input: dict) -> dict:
    return asyncio.run(execute_chat_tool(name, tool_input, user_id=USER, profile_data=None))


def test_the_eight_dependency_capable_tools_declare_the_schema_property() -> None:
    by_name = {tool["name"]: tool for tool in CHAT_TOOLS}
    for name in _DEPENDENCY_CAPABLE_TOOLS:
        assert "depends_on" in by_name[name]["input_schema"]["properties"], name


def test_the_six_producer_or_standalone_tools_do_not_offer_it() -> None:
    by_name = {tool["name"]: tool for tool in CHAT_TOOLS}
    for name in _DEPENDENCY_FREE_TOOLS:
        assert "depends_on" not in by_name[name]["input_schema"]["properties"], name


def test_a_declared_dependency_serialises_in_the_contract_shape() -> None:
    """`depends_on` déclaré → relayé tel quel dans la proposition, en tableau
    d'entiers — la forme que `PLAN_DEPENDS_ON` (`copilot-card.ts`) attend."""
    result = _run(
        "pin_memory_fact",
        {"fact": "Le compte X paie en fin de trimestre.", "depends_on": [0]},
    )
    assert result["proposal"]["depends_on"] == [0]


def test_a_plan_without_a_dependency_carries_none() -> None:
    """Absent en entrée → absent en sortie, jamais `null` : le contrat
    (`PLAN_DEPENDS_ON`) n'est pas `.nullable()`, seule une clé absente valide."""
    result = _run("pin_memory_fact", {"fact": "Le compte X paie en fin de trimestre."})
    assert "depends_on" not in result["proposal"]


def test_malformed_dependency_input_is_dropped_not_propagated() -> None:
    """Une entrée qui n'est pas une liste d'entiers positifs ne fait pas tomber
    la proposition — elle perd juste sa dépendance, valeur par valeur."""
    result = _run("pin_memory_fact", {"fact": "Fait.", "depends_on": ["premier", -1, True, 2]})
    # "premier" n'est pas un entier ; -1 est négatif ; `True` est un booléen (pas
    # un rang valide, même si `isinstance(True, int)` vaut vrai en Python.
    # Seul `2` reste.
    assert result["proposal"]["depends_on"] == [2]


# ── #1950.22 — la numérotation stable, côté `chat_orchestrator` ─────────────


def test_a_reference_to_a_step_that_does_not_exist_yet_is_rejected() -> None:
    """Une dépendance déclarée vers un rang qui n'a pas encore été proposé (ou
    vers elle-même) est REJETÉE : elle ne peut désigner qu'un résultat déjà là."""
    proposal = {"action": "pin_memory_fact", "fact": "x", "depends_on": [0, 1, 2]}
    # own_index=0 : c'est la TOUTE PREMIÈRE proposition du tour — aucun rang
    # antérieur n'existe encore, la dépendance entière est invalide.
    chat_orchestrator._stabilise_declared_dependencies(proposal, own_index=0)
    assert "depends_on" not in proposal


def test_a_reference_to_an_earlier_step_survives_a_reference_to_a_later_one_does_not() -> None:
    proposal = {"action": "prepare_message", "depends_on": [0, 3]}
    # own_index=2 : les rangs 0 et 1 existent déjà, 3 n'existe pas encore.
    chat_orchestrator._stabilise_declared_dependencies(proposal, own_index=2)
    assert proposal["depends_on"] == [0]
