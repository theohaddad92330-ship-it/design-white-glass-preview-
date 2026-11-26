"""#2547 / #2533 (recette prod du 07/10) — Laura lit la fiche avant de répondre,
et ne recadre pas une demande déjà cadrée.

Questions exactes à poser en recette dans /chat :
- « Quels signaux commerciaux récents chez Arquus ? »
- « Qui dois-je contacter à la DSI de UNEO ? »
- « Trouve-moi des entreprises industrielles en Bourgogne-Franche-Comté avec des
  signaux, et 10 personnes à appeler par entreprise »

Les tours sont rejoués entrée → catalogue d'outils vu par le modèle → outils
appelés → réponse, avec le même faux client que ``test_chat_orchestrator.py``.
"""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.chat_tools import PLAN_ANALYSIS_TOOL
from app.services.account_read_first import (
    account_contact_function_note,
    account_signals_note,
    contacts_at_named_company_note,
    framed_prospecting_note,
    is_account_signals_question,
    is_framed_prospecting_request,
    name_geo_codes,
    per_company_count,
    requested_contact_function,
    requested_contacts_at_named_company,
)
from tests.test_chat_orchestrator import (  # noqa: F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)

ARQUUS = "Quels signaux commerciaux récents chez Arquus ?"
UNEO = "Qui dois-je contacter à la DSI de UNEO ?"
BFC = (
    "Trouve-moi des entreprises industrielles en Bourgogne-Franche-Comté avec des signaux, "
    "et 10 personnes à appeler par entreprise"
)
KIABI = "Trouve-moi 5 décideurs IT chez Kiabi"


# ── la forme de la demande ────────────────────────────────────────────────────


@pytest.mark.parametrize("message", [ARQUUS, "Des signaux sur Thales ?", "quels signaux pour Arquus"])
def test_account_signals_question_is_detected(message):
    assert is_account_signals_question(message)


@pytest.mark.parametrize("message", ["", BFC, "C'est quoi un signal ?", "Montre-moi les signaux de la semaine"])
def test_account_signals_guard_knows_how_to_say_no(message):
    assert not is_account_signals_question(message)


def test_contact_function_is_read_from_the_question():
    assert requested_contact_function(UNEO) == "DSI"
    assert requested_contact_function("Qui appeler à la direction des achats chez Airbus ?") == "direction des achats"


@pytest.mark.parametrize("message", ["", "Qui est le DSI de Société Générale ?", BFC, "Contacter la DSI"])
def test_contact_function_guard_knows_how_to_say_no(message):
    assert requested_contact_function(message) is None


# ── #3859 — recherche de PERSONNES chez une entreprise NOMMÉE (sans « qui ») ─


def test_contacts_at_named_company_is_detected_with_its_function():
    assert requested_contacts_at_named_company(KIABI) == ("Kiabi", "IT")
    assert requested_contacts_at_named_company("Trouve-moi 3 interlocuteurs chez Thales") == ("Thales", None)


@pytest.mark.parametrize("message", ["", BFC, UNEO, "Les décideurs sont importants", "Contacts de l'équipe"])
def test_contacts_at_named_company_guard_knows_how_to_say_no(message):
    assert requested_contacts_at_named_company(message) is None


def test_contacts_at_named_company_note_never_tells_the_user_to_broaden_alone():
    note = contacts_at_named_company_note("Kiabi", "IT")
    assert "« Kiabi »" in note and "« IT »" in note
    assert "plan_account_analysis" in note and "start_account_analysis" in note
    assert "il faut élargir la recherche" not in note
    assert "VRAIE raison" in note


def test_plan_analysis_tool_itself_names_the_contacts_at_named_company_case():
    """Recette prod 09/10 (code aef69661e9) — « trouve-moi 5 décideurs IT chez
    Lactalis » (absente de l'espace) restait répondue par une recherche
    interne malgré la consigne de tour (``contacts_at_named_company_note``).
    La description du PROPRE outil ne couvrait QUE « demande une analyse » —
    un modèle qui pèse chaque outil par sa description ne reconnaissait pas
    une demande de CONTACTS comme relevant de cet outil. Elle doit nommer ce
    cas, pas seulement la consigne de tour qui pointe vers lui."""
    description = PLAN_ANALYSIS_TOOL["description"]
    assert "décideurs" in description and "contacts" in description
    assert "ABSENTE de l'espace" in description
    assert "jamais une recherche interne" in description


def test_framed_prospecting_request_is_detected():
    assert is_framed_prospecting_request(BFC)
    assert per_company_count(BFC) == 10


@pytest.mark.parametrize(
    "message",
    [
        "",
        "Trouve-moi des comptes Java",  # pas de zone, pas de livrable
        "Des entreprises en Bourgogne-Franche-Comté ?",  # pas de livrable
        "10 personnes à appeler",  # ni zone ni type
    ],
)
def test_framed_prospecting_guard_knows_how_to_say_no(message):
    assert not is_framed_prospecting_request(message)


def test_per_company_count_is_capped_and_said():
    assert per_company_count("dans le Doubs, des PME, 25 contacts par entreprise") == 10
    note = framed_prospecting_note("dans le Doubs, des PME, 25 contacts par entreprise")
    assert "plafonné à 10" in note


# ── les consignes du tour ────────────────────────────────────────────────────


def test_signals_note_demands_nature_date_and_source():
    note = account_signals_note()
    for word in ("NATURE", "DATE", "SOURCE", "search_workspace_accounts"):
        assert word in note


def test_contact_note_demands_the_coordinate_in_clear_and_never_invents():
    note = account_contact_function_note("DSI")
    assert "get_account_contacts" in note and "« DSI »" in note
    assert "EN CLAIR" in note
    assert "jamais un nom inventé" in note


def test_framed_note_defaults_to_all_signals_and_builds_the_lists():
    note = framed_prospecting_note(BFC)
    assert "TOUS les types" in note and "UNE ligne" in note
    assert "jusqu'à 10 contacts" in note
    assert "coût" in note and "jamais un nom inventé" in note


# ── en sortie : jamais un code INSEE brut ────────────────────────────────────


def test_region_code_is_named_in_the_reply():
    assert (
        name_geo_codes("Région : 27 · Secteur : industrie") == "Région : Bourgogne-Franche-Comté · Secteur : industrie"
    )
    assert name_geo_codes("Département : 21") == "Département : Côte-d'Or (21)"


def test_reply_without_codes_is_returned_byte_for_byte():
    text = "Région : Bourgogne-Franche-Comté — Département : Côte-d'Or (21). Rien à changer."
    assert name_geo_codes(text) == text
    assert name_geo_codes("Région : 99") == "Région : 99"


# ── tours rejoués ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_replayed_uneo_turn_reads_the_account_and_never_clarifies(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Caroline Jaouen — Directrice des SI.")])])
    await chat_orchestrator.run_chat_with_tools("sys", UNEO, user_id="u1", profile_data=None, user_message=UNEO)
    first_call = fake.messages.calls[0]
    assert "ask_clarification" not in {tool["name"] for tool in first_call["tools"]}
    assert "`function` = « DSI »" in str(first_call["system"])


@pytest.mark.asyncio
async def test_replayed_arquus_turn_is_told_to_read_the_account_signals(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools("sys", ARQUUS, user_id="u1", profile_data=None, user_message=ARQUUS)
    assert "NATURE, sa DATE et sa SOURCE" in str(fake.messages.calls[0]["system"])


@pytest.mark.asyncio
async def test_replayed_bfc_turn_never_clarifies_and_names_the_region(monkeypatch):
    fake = _install_client(
        monkeypatch, [_resp("end_turn", [_text("J'ai pris tous les types de signaux. Région : 27.")])]
    )
    reply, _actions = await chat_orchestrator.run_chat_with_tools(
        "sys", BFC, user_id="u1", profile_data=None, user_message=BFC
    )
    first_call = fake.messages.calls[0]
    assert "ask_clarification" not in {tool["name"] for tool in first_call["tools"]}
    assert "jusqu'à 10 contacts" in str(first_call["system"])
    assert "Région : 27" not in reply
    assert "Bourgogne-Franche-Comté" in reply


@pytest.mark.asyncio
async def test_replayed_kiabi_turn_launches_the_search_instead_of_asking_to_broaden(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools("sys", KIABI, user_id="u1", profile_data=None, user_message=KIABI)
    first_call = fake.messages.calls[0]
    assert "ask_clarification" not in {tool["name"] for tool in first_call["tools"]}
    system_text = str(first_call["system"])
    assert "plan_account_analysis" in system_text and "« Kiabi »" in system_text


@pytest.mark.asyncio
async def test_a_general_turn_keeps_the_clarification_tool(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools(
        "sys", "Analyse Decathlon", user_id="u1", profile_data=None, user_message="Analyse Decathlon"
    )
    assert "ask_clarification" in {tool["name"] for tool in fake.messages.calls[0]["tools"]}
