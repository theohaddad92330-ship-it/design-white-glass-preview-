"""#3396 — LA MATRICE DE COMPORTEMENT DE LAURA, REJOUÉE TOUR PAR TOUR.

Décision de Louis (30/09/2026) : un comportement de Laura ne se ferme que sur
une réponse OBSERVÉE dans /chat. `test_copilote_data_availability_matrix_eval.py`
prouve que le bloc de prompt existe ; ce fichier REJOUE le tour — la vraie route
``POST /chat/message``, le vrai ``system`` assemblé par ``_run_chat_turn``, les
vrais outils présentés au modèle (``tools_for``), la vraie carte de contexte
rendue à l'écran — pour chacun des dix états du retour.

Le modèle est le seul élément simulé (``run_chat_with_tools``, intercepté juste
avant l'appel) : ce qu'il reçoit EST ce que la recette prod verra.

QUESTION EXACTE À POSER EN RECETTE (/chat, un espace sans CRM puis avec) :
« Que sais-tu de l'historique de mes échanges avec ce compte ? » — sans CRM,
Laura dit qu'elle ne voit pas l'historique de tes anciens échanges (jamais
« aucun échange ») ; CRM connecté mais lecture en échec, elle dit qu'elle n'a pas
pu vérifier (jamais « 0 contact »).
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.chat_tools import missing_capabilities, tools_for


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def _replay(client: TestClient, **body: Any) -> tuple[str, dict, dict]:
    """Rejoue UN tour : (system prompt réel, kwargs transmis au modèle, carte de contexte)."""
    captured: dict[str, Any] = {}

    async def _fake_model(system: str, *_a: object, **kwargs: object) -> tuple[str, list]:
        captured["system"] = system
        captured["kwargs"] = kwargs
        return "Réponse de Laura.", []

    with patch("app.services.chat_orchestrator.run_chat_with_tools", new_callable=AsyncMock, side_effect=_fake_model):
        res = client.post(
            "/chat/message",
            json={"message": "Que sais-tu de mes échanges avec ce compte ?", "user_id": "u1", **body},
        )
    assert res.status_code == 200
    assert "system" in captured, "le modèle n'a jamais été appelé — le tour s'est arrêté avant"
    context = _terminal_event(res.text)["data"]["context"]
    return captured["system"], captured["kwargs"], context


def _tool_names(kwargs: dict) -> set[str]:
    return {str(t["name"]) for t in tools_for(kwargs.get("connected_families"))}


# 1 ── AUCUN CONNECTEUR ────────────────────────────────────────────────────────
def test_no_connector_says_what_it_cannot_see_and_offers_the_connection(client: TestClient) -> None:
    system, kwargs, ctx = _replay(client, connected_families=[], crm_connected=False)
    assert any("Aucun CRM connecté" in x for x in ctx["not_consulted"])
    assert any("Aucune messagerie connectée" in x for x in ctx["not_consulted"])
    assert "SOURCES NON DISPONIBLES" in system and "Aucun CRM connecté" in system
    assert "CE QUI RESTE POSSIBLE SANS LUI" in system
    assert _tool_names(kwargs).isdisjoint({"search_mailbox", "list_agenda", "export_contact_to_crm"})
    assert "find_needs" in _tool_names(kwargs), "sans connecteur, l'essentiel reste possible"


# 2 ── PROFIL ESN SEULEMENT ────────────────────────────────────────────────────
def test_esn_profile_only_names_the_missing_account_and_the_gesture(client: TestClient) -> None:
    system, _kwargs, ctx = _replay(client, profile_data={"esn_name": "Skaizen"})
    assert ctx["active"]["profile"] == {"present": True, "name": "Skaizen"}
    assert any("Aucun compte analysé" in x for x in ctx["not_consulted"])
    assert "QUAND IL TE MANQUE DE QUOI AIDER" in system


# 3 ── CRM CONNECTÉ, PAS ENCORE CROISÉ ─────────────────────────────────────────
def test_connected_crm_is_not_crossed_never_absent(client: TestClient) -> None:
    _system, kwargs, ctx = _replay(client, connected_families=["crm"], crm_connected=True, crm_provider="hubspot")
    assert any("non croisé" in x for x in ctx["not_consulted"])
    assert not any("Aucun CRM connecté" in x for x in ctx["not_consulted"])
    assert {"export_contact_to_crm", "get_crm_presence"} <= _tool_names(kwargs)


# 3 bis ── CRM CONNECTÉ ET CROISÉ : « il a déjà répondu en mars » est lisible ─────
def test_crossed_crm_reaches_the_prompt_and_leaves_the_not_consulted_list(client: TestClient) -> None:
    presence = "2 contacts déjà dans votre CRM chez ce groupe, dont un a répondu en mars."
    system, _kwargs, ctx = _replay(
        client,
        connected_families=["crm"],
        crm_connected=True,
        crm_provider="hubspot",
        crm_presence=presence,
    )
    assert presence in system
    assert not any("non croisé" in x for x in ctx["not_consulted"])
    assert not any("Aucun CRM connecté" in x for x in ctx["not_consulted"])


# 4 ── OUTIL INDISPONIBLE OU EN ERREUR : une panne n'est jamais un zéro ────────
def test_a_failed_crm_read_is_unavailable_never_zero(client: TestClient) -> None:
    system, _kwargs, ctx = _replay(
        client, connected_families=["crm"], crm_connected=True, crm_provider="hubspot", crm_unavailable=True
    )
    assert any("indisponible pour cette réponse" in x for x in ctx["not_consulted"])
    assert not any("non croisé" in x for x in ctx["not_consulted"])
    assert "indisponible pour cette réponse" in system
    assert "source indisponible" in system, "la raison n°5 d'un manque est dans le prompt réel"


# 5 ── E-MAIL CONNECTÉ ─────────────────────────────────────────────────────────
def test_connected_mailbox_leaves_the_absence_line_and_opens_the_tools(client: TestClient) -> None:
    _system, kwargs, ctx = _replay(client, connected_families=["email"])
    assert not any("Aucune messagerie connectée" in x for x in ctx["not_consulted"])
    assert {"search_mailbox", "prepare_mail_draft"} <= _tool_names(kwargs)
    assert "list_agenda" not in _tool_names(kwargs), "l'agenda n'est pas branché : l'outil n'est pas proposé"


# 6 ── CALENDRIER CONNECTÉ ─────────────────────────────────────────────────────
def test_connected_calendar_opens_the_agenda_tools_only(client: TestClient) -> None:
    _system, kwargs, _ctx = _replay(client, connected_families=["calendar"])
    assert {"list_agenda", "find_free_slots"} <= _tool_names(kwargs)
    assert "search_mailbox" not in _tool_names(kwargs)
    # ce que l'orchestrateur DIT d'une capacité retirée (`CAPACITÉS ABSENTES…`) se lit sur cette liste
    assert {"email", "crm"} <= set(missing_capabilities(kwargs.get("connected_families")))


# 7 ── VIVIER, MISSIONS, MÉMOIRE MARCHÉ, DONNÉES CONTRADICTOIRES ──────────────
@pytest.mark.parametrize(
    ("case", "fragment"),
    [
        ("VIVIER_REMPLI", "tu construis un plan commercial complet, en cinq temps"),
        ("MISSIONS_PRESENTES", "RECOMMANDER D'ENGAGER UN RENOUVELLEMENT"),
        ("MEMOIRE_MARCHE", "HIÉRARCHIE DE VÉRITÉ SUR UN COMPTE"),
        ("DONNEES_CONTRADICTOIRES", "donnée ambiguë"),
    ],
)
def test_data_states_are_governed_in_the_system_prompt_of_a_real_turn(
    client: TestClient, case: str, fragment: str
) -> None:
    system, _kwargs, _ctx = _replay(client, connected_families=[])
    assert fragment in system, case


# 8 ── L'INTERFACE ANGLAISE DIT LA MÊME CHOSE ─────────────────────────────────
def test_the_same_absence_is_worded_in_english_on_an_english_interface(client: TestClient) -> None:
    _system, _kwargs, ctx = _replay(client, connected_families=[], interface_language="en")
    assert "No CRM connected" in ctx["not_consulted"][0]
    assert not any("Aucun CRM" in x for x in ctx["not_consulted"])


# 9 ── L'ABSENCE N'EST JAMAIS UN FAIT : aucun « zéro » inventé ──────────────────
def test_an_absence_of_data_is_never_phrased_as_an_absence_of_fact(client: TestClient) -> None:
    system, _kwargs, ctx = _replay(client, connected_families=[], crm_connected=False)
    for entry in ctx["not_consulted"]:
        assert "0 contact" not in entry and "aucun échange" not in entry.lower(), entry
    assert "n'inventes JAMAIS une valeur" in system
