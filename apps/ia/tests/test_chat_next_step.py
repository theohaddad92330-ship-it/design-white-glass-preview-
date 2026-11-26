"""#AM.20 (#4054.5) — dans /chat, « la suite » d'une priorité rendue par Laura enchaîne sur la liste des
personnes du compte, puis sur un brouillon, SANS perdre le compte du contexte. Les outils sont
`get_account_contacts` puis `prepare_message_for_contact` ; le compte voyage par l'état du fil."""

from __future__ import annotations

from app.services.chat_next_step import (
    asks_for_the_next_step,
    forced_next_step_kwargs,
    next_step,
    next_step_note,
)
from app.services.chat_thread_state import ThreadStateCollector

ACCOUNT = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
CONTACT = "33333333-3333-4333-8333-333333333333"

PRIORITIES = {
    "now": [
        {"id": ACCOUNT, "companyName": "Orange Business"},
        {"id": OTHER, "companyName": "Thales"},
    ]
}
CONTACTS = {"contacts": [{"contact_id": CONTACT, "full_name": "Ana Roy", "title": "RSSI"}], "presented_count": 1}
TOOLS = [{"name": "get_account_contacts"}, {"name": "prepare_message_for_contact"}]


def _thread_after(*calls):
    thread = ThreadStateCollector()
    for name, tool_input, output in calls:
        thread.record(name, tool_input, output)
    return ThreadStateCollector(thread.state)


def test_la_suite_est_reconnue_et_une_autre_demande_non():
    for message in ("la suite", "Et la suite ?", "on continue", "vas-y, continue", "ensuite"):
        assert asks_for_the_next_step(message), message
    for message in ("la suite logicielle de Thales", "prépare un message pour Ana", "qui est le RSSI ?"):
        assert not asks_for_the_next_step(message), message


def test_apres_les_priorites_la_suite_est_la_liste_des_personnes_du_premier_compte():
    thread = _thread_after(("get_portfolio_priorities", {}, PRIORITIES))
    step = next_step("la suite", thread.previous)
    assert step is not None
    assert (step.tool, step.arguments) == ("get_account_contacts", {"account_id": ACCOUNT})
    assert "Orange Business" in next_step_note(step)
    assert forced_next_step_kwargs(step, 0, TOOLS, called=[]) == {"force_tool": "get_account_contacts"}


def test_apres_la_liste_des_personnes_la_suite_est_un_brouillon_et_le_compte_reste_au_contexte():
    thread = _thread_after(
        ("get_portfolio_priorities", {}, PRIORITIES),
        ("get_account_contacts", {"account_id": ACCOUNT}, CONTACTS),
    )
    # Le compte reste dans le fil (objet cité), la liste courante est celle des personnes.
    assert any(obj.kind == "account" and obj.id == ACCOUNT for obj in thread.previous.objects)
    step = next_step("on continue", thread.previous)
    assert step is not None
    assert (step.tool, step.arguments) == ("prepare_message_for_contact", {"contact_id": CONTACT})
    assert forced_next_step_kwargs(step, 0, TOOLS, called=[]) == {"force_tool": "prepare_message_for_contact"}


def test_le_modele_qui_oublie_l_identifiant_le_retrouve_dans_le_fil():
    thread = _thread_after(("get_portfolio_priorities", {}, PRIORITIES))
    effective, _ = thread.prepare("get_account_contacts", {})
    assert effective == {"account_id": ACCOUNT}
    # Un identifiant donné par le modèle n'est jamais écrasé.
    given, _ = thread.prepare("get_account_contacts", {"account_id": OTHER})
    assert given == {"account_id": OTHER}
    with_contacts = _thread_after(
        ("get_portfolio_priorities", {}, PRIORITIES),
        ("get_account_contacts", {"account_id": ACCOUNT}, CONTACTS),
    )
    prepared, _ = with_contacts.prepare("prepare_message_for_contact", {"channel": "email"})
    assert prepared == {"channel": "email", "contact_id": CONTACT}


def test_sans_priorite_ni_liste_rien_n_est_force_et_un_outil_deja_appele_ne_l_est_pas_deux_fois():
    assert next_step("la suite", _thread_after().previous) is None
    thread = _thread_after(("get_portfolio_priorities", {}, PRIORITIES))
    step = next_step("la suite", thread.previous)
    assert forced_next_step_kwargs(step, 0, TOOLS, called=["get_account_contacts"]) == {}
    assert forced_next_step_kwargs(step, 1, TOOLS, called=[]) == {}
    assert forced_next_step_kwargs(step, 0, [{"name": "find_needs"}], called=[]) == {}
