"""Recette prod 07/10 (r3a, point 1) — « Qui dois-je contacter à la DSI de UNEO ? » : la carte contacts
porte l'e-mail et le téléphone EN CLAIR (doctrine : coordonnées toujours en clair), pas seulement
« e-mail vérifié ». Un champ que l'outil n'a pas rendu reste absent."""

from __future__ import annotations

from app.services.contact_card_fallback import contact_block_from_tool_output, with_contact_card
from app.services.reply_blocks import split_reply_blocks

OUTPUT = {
    "contacts": [
        {
            "full_name": "Caroline Jaouen",
            "title": "Directrice des SI",
            "company_name": "UNEO",
            "email": "caroline.jaouen@uneo.example",
            "phone": "+33 1 23 45 67 89",
            "email_verified": True,
        },
        {"full_name": "Sans Coordonnée", "title": "DSI adjoint", "company_name": "UNEO"},
    ],
    "total": 2,
}


def test_the_card_carries_email_and_phone_in_clear():
    block = contact_block_from_tool_output(OUTPUT)
    first, second = block["items"]
    assert first["email"] == "caroline.jaouen@uneo.example"
    assert first["phone"] == "+33 1 23 45 67 89"
    assert "email" not in second and "phone" not in second


def test_a_card_written_by_the_model_without_coordinates_is_completed_from_the_tool_read():
    block = contact_block_from_tool_output(OUTPUT)
    card = '{"type":"contact_list","items":[{"name":"Caroline Jaouen","role":"Directrice des SI","reason":"E-mail vérifié"}]}'
    reply = f"Voici.\n\n```bellum-block\n{card}\n```"
    out = with_contact_card(reply, block)
    cards = [s.block for s in split_reply_blocks(out) if s.kind == "block"]
    caroline = next(i for i in cards[0]["items"] if i["name"] == "Caroline Jaouen")
    assert caroline["email"] == "caroline.jaouen@uneo.example" and caroline["phone"] == "+33 1 23 45 67 89"


def test_the_prompt_asks_for_the_coordinates_in_clear_on_the_card():
    from app.prompts import reply_formats

    assert "email?" in reply_formats.REPLY_FORMATS_DIRECTIVE and "phone?" in reply_formats.REPLY_FORMATS_DIRECTIVE


def test_3596_search_workspace_contacts_also_instructs_coordinates_in_clear():
    """Recette prod nuit 08→09/10 (#3596) — « contacts BNP » (recherche cross-compte, donc
    `search_workspace_contacts`, pas `get_account_contacts`) rendait des contacts sans e-mail ni
    téléphone. `get_account_contacts` dit explicitement « donne le nom complet, la fonction et la
    coordonnée EN CLAIR » ; `search_workspace_contacts` ne le disait PAS — seul « les canaux dont on
    dispose » le suggérait, sans jamais citer e-mail/téléphone ni la règle « en clair »."""
    from app.services.chat_tools import SEARCH_WORKSPACE_CONTACTS_TOOL

    description = SEARCH_WORKSPACE_CONTACTS_TOOL["description"]
    assert "email" in description.lower() and "en clair" in description.lower()


def test_a_card_written_with_an_abbreviated_name_is_still_completed_from_the_tool_read():
    """Le modèle écrit parfois un nom abrégé (initiale du prénom + nom de famille) sur la carte ;
    la coordonnée lue par l'outil, sous le nom COMPLET, doit quand même la compléter — jamais
    inventée, mais jamais perdue non plus pour une simple différence de graphie du même nom."""
    block = contact_block_from_tool_output(OUTPUT)
    card = '{"type":"contact_list","items":[{"name":"C. Jaouen","role":"Directrice des SI"}]}'
    reply = f"Voici.\n\n```bellum-block\n{card}\n```"
    out = with_contact_card(reply, block)
    cards = [s.block for s in split_reply_blocks(out) if s.kind == "block"]
    caroline = next(i for i in cards[0]["items"] if i["name"] == "C. Jaouen")
    assert caroline["email"] == "caroline.jaouen@uneo.example" and caroline["phone"] == "+33 1 23 45 67 89"
