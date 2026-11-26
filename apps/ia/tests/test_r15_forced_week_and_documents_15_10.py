"""Recette R15 prod (15/10) — #2887 et #3889.

#2887 : « que faire cette semaine ? » répondait en PROSE (RENAULT, DECATHLON…), sans le groupement
« proche de signer » par stade que livre `get_action_plan`. Le plan existait, personne ne l'appelait :
le modèle répondait de mémoire. Même remède que #3513/#3399/#3939 — au PREMIER round, l'outil est FORCÉ.

#3889 : « Quels projets a Sanofi dans nos documents ? » → « Je n'ai pas de nouvelle demande à traiter. »
Le modèle n'appelait pas `search_document_projects` (déjà au noyau depuis #4112) et se rabattait sur
une phrase hors sujet. Au PREMIER round, la lecture des documents est FORCÉE."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.compilers.intent_router import asks_projects_in_documents, asks_what_to_do_this_week

PLAN = "get_action_plan"
DOCS = "search_document_projects"


@pytest.mark.parametrize(
    "message",
    [
        "que faire cette semaine ?",
        "Que dois-je faire cette semaine",
        "Quoi faire cette semaine ?",
        "Fais-moi mon plan d'actions de la semaine",
        "What should I do this week?",
    ],
)
def test_2887_weekly_question_is_detected(message):
    assert asks_what_to_do_this_week(message)


@pytest.mark.parametrize("message", ["Bonjour", "Quel compte attaquer en premier ?", "Cette semaine est calme", ""])
def test_2887_detector_says_no_elsewhere(message):
    assert not asks_what_to_do_this_week(message)


def test_2887_forces_the_action_plan_at_round_zero_only():
    tools = [{"name": PLAN}]
    ask = "que faire cette semaine ?"
    assert chat_orchestrator._forced_action_plan_kwargs(0, ask, tools) == {"force_tool": PLAN}
    assert chat_orchestrator._forced_action_plan_kwargs(1, ask, tools) == {}
    assert chat_orchestrator._forced_action_plan_kwargs(0, "Bonjour", tools) == {}
    assert chat_orchestrator._forced_action_plan_kwargs(0, ask, []) == {}


@pytest.mark.parametrize(
    "message",
    [
        "Quels projets a Sanofi dans nos documents ?",
        "quels sont les projets de Sanofi dans les documents de l'espace",
        "Projets de Renault dans la base de connaissance",
        "Which projects does Sanofi have in our documents?",
    ],
)
def test_3889_documents_question_is_detected(message):
    assert asks_projects_in_documents(message)


@pytest.mark.parametrize(
    "message",
    ["Quels projets a Sanofi ?", "Dépose ce document", "Quels sont mes besoins ouverts ?", "documents signés"],
)
def test_3889_documents_detector_says_no_elsewhere(message):
    assert not asks_projects_in_documents(message)


def test_3889_forces_the_document_projects_read_at_round_zero_only():
    tools = [{"name": DOCS}]
    ask = "Quels projets a Sanofi dans nos documents ?"
    assert chat_orchestrator._forced_document_projects_kwargs(0, ask, tools) == {"force_tool": DOCS}
    assert chat_orchestrator._forced_document_projects_kwargs(1, ask, tools) == {}
    assert chat_orchestrator._forced_document_projects_kwargs(0, "Bonjour", tools) == {}
    assert chat_orchestrator._forced_document_projects_kwargs(0, ask, []) == {}


# #4057 / #4058 — « interlocuteurs cyber GRC de EDF » : les contacts DÉJÀ en base se lisent d'abord.
CONTACTS = "search_workspace_contacts"


@pytest.mark.parametrize(
    "message",
    [
        "interlocuteurs cyber GRC de EDF",
        "Donne-moi les interlocuteurs cyber de ce compte",
        "contacts sécurité SI chez Renault",
        "qui est le RSSI chez Sanofi ?",
        "interlocuteurs conformité et risques de la Société Générale",
    ],
)
def test_4057_known_people_by_expertise_is_detected(message):
    from app.services.compilers.intent_router import asks_known_people_by_expertise

    assert asks_known_people_by_expertise(message)


@pytest.mark.parametrize("message", ["Bonjour", "interlocuteurs achats chez EDF", "cybersécurité du marché", ""])
def test_4057_detector_says_no_elsewhere(message):
    from app.services.compilers.intent_router import asks_known_people_by_expertise

    assert not asks_known_people_by_expertise(message)


def test_4057_forces_the_workspace_read_before_any_paid_search():
    tools = [{"name": CONTACTS}]
    ask = "interlocuteurs cyber GRC de EDF"
    assert chat_orchestrator._forced_known_people_kwargs(0, ask, tools) == {"force_tool": CONTACTS}
    assert chat_orchestrator._forced_known_people_kwargs(1, ask, tools) == {}
    assert chat_orchestrator._forced_known_people_kwargs(0, "Bonjour", tools) == {}
    assert chat_orchestrator._forced_known_people_kwargs(0, ask, []) == {}
