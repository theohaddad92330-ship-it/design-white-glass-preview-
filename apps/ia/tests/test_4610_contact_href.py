"""#4610 — les contacts cités dans une carte de Laura mènent à leur fiche.

Le `href` est posé par le SERVEUR, à partir du `contact_id` que l'outil a rendu (même mécanique que les comptes) :
jamais laissé au modèle, jamais un identifiant inventé, jamais un lien mort."""

from __future__ import annotations

import json

from app.services.contact_card_fallback import contact_block_from_tool_output, with_contact_card
from app.services.reply_blocks import split_reply_blocks

CAROLINE = "3D60B875-E3BA-4C00-992C-527302A9D8FB"
MARC = "920adc18-73fa-4d99-97ae-5ea44ec8b9ae"

OUTPUT = {
    "contacts": [
        {"contact_id": CAROLINE, "full_name": "Caroline Jaouen", "title": "DSI", "company_name": "UNEO"},
        {"contact_id": MARC, "full_name": "Marc Lenoir", "title": "RSSI", "company_name": "UNEO"},
        {"full_name": "Sans Fiche", "title": "DSI adjoint", "company_name": "UNEO"},
        {"contact_id": "pas-un-uuid", "full_name": "Id Cassé", "company_name": "UNEO"},
    ],
    "total": 4,
}


def _cards(reply: str) -> list[dict]:
    return [s.block for s in split_reply_blocks(reply) if s.kind == "block"]


def _reply(card: dict) -> str:
    return f"Voici.\n\n```bellum-block\n{json.dumps(card)}\n```"


def test_the_card_built_from_the_tool_links_each_contact_to_its_record():
    items = {i["name"]: i for i in contact_block_from_tool_output(OUTPUT)["items"]}
    assert items["Caroline Jaouen"]["href"] == f"/contacts/{CAROLINE.lower()}"
    assert items["Marc Lenoir"]["href"] == f"/contacts/{MARC}"


def test_a_contact_without_a_record_stays_text_never_a_dead_link():
    items = {i["name"]: i for i in contact_block_from_tool_output(OUTPUT)["items"]}
    assert "href" not in items["Sans Fiche"]
    assert "href" not in items["Id Cassé"]  # un identifiant illisible n'est jamais devenu un chemin


def test_a_card_written_by_the_model_gets_the_server_href():
    block = contact_block_from_tool_output(OUTPUT)
    card = {"type": "contact_list", "items": [{"name": "Caroline Jaouen", "role": "DSI"}]}
    out = _cards(with_contact_card(_reply(card), block))[0]
    caroline = next(i for i in out["items"] if i["name"] == "Caroline Jaouen")
    assert caroline["href"] == f"/contacts/{CAROLINE.lower()}"


def test_an_href_invented_by_the_model_is_never_kept():
    block = contact_block_from_tool_output(OUTPUT)
    invented = "/contacts/00000000-0000-4000-8000-000000000000"
    card = {
        "type": "contact_list",
        "items": [
            {"name": "Caroline Jaouen", "href": invented},  # réécrit par celui de l'outil
            {"name": "Inconnu Total", "href": invented},  # aucune lecture : retiré, la ligne reste du texte
        ],
    }
    out = _cards(with_contact_card(_reply(card), block))[0]
    by_name = {i["name"]: i for i in out["items"]}
    assert by_name["Caroline Jaouen"]["href"] == f"/contacts/{CAROLINE.lower()}"
    assert "href" not in by_name["Inconnu Total"]


def test_two_homonyms_never_share_a_link():
    other = "11111111-1111-4111-8111-111111111111"
    block = contact_block_from_tool_output(
        {
            "contacts": [
                {"contact_id": CAROLINE, "full_name": "Paul Martin", "company_name": "A"},
                {"contact_id": other, "full_name": "Paul Martin", "company_name": "B"},
            ]
        }
    )
    card = {"type": "contact_list", "items": [{"name": "Paul Martin"}]}
    out = _cards(with_contact_card(_reply(card), block))[0]
    first = next(i for i in out["items"] if i["name"] == "Paul Martin")
    assert "href" not in first


def test_the_search_tool_and_the_account_tool_both_feed_the_same_builder():
    # L'appelant est branché : le producteur de carte est appelé pour les DEUX outils de lecture de contacts.
    from app.services.contact_card_fallback import CONTACT_TOOL_NAMES

    assert CONTACT_TOOL_NAMES == {"get_account_contacts", "search_workspace_contacts"}


# #4610 PARTIAL (prod 27/10, EXOTEC) — les 10 « Arnaud — nom à confirmer » n'avaient AUCUN lien : le modèle accole
# « — nom à confirmer » au prénom, et dix prénoms identiques sont des homonymes pour un rapprochement par le seul nom.
ARNAUD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ARNAUD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ARNAUDS = {
    "contacts": [
        {"contact_id": ARNAUD_A, "full_name": "Arnaud", "title": "Directeur Achats", "company_name": "EXOTEC"},
        {"contact_id": ARNAUD_B, "full_name": "Arnaud", "title": "DSI", "company_name": "EXOTEC"},
    ]
}


def test_a_first_name_only_row_with_a_marker_is_linked_when_name_and_role_designate_one_record():
    block = contact_block_from_tool_output(ARNAUDS)
    card = {
        "type": "contact_list",
        "items": [
            {"name": "Arnaud — nom à confirmer", "role": "DSI", "company": "EXOTEC"},
            {"name": "Arnaud (prénom seul, nom à confirmer)", "role": "Directeur Achats", "company": "EXOTEC"},
        ],
    }
    items = _cards(with_contact_card(_reply(card), block))[0]["items"]
    # Les lignes ÉCRITES par le modèle (marqueur dans le nom), pas celles que l'outil y ajoute.
    written = {i["role"]: i for i in items if "confirmer" in i["name"]}
    assert written["DSI"]["href"] == f"/contacts/{ARNAUD_B}"
    assert written["Directeur Achats"]["href"] == f"/contacts/{ARNAUD_A}"


def test_two_first_names_with_the_same_role_still_share_no_link():
    other = {"contacts": [{**ARNAUDS["contacts"][0]}, {**ARNAUDS["contacts"][1], "title": "Directeur Achats"}]}
    block = contact_block_from_tool_output(other)
    card = {"type": "contact_list", "items": [{"name": "Arnaud — nom à confirmer", "role": "Directeur Achats"}]}
    items = _cards(with_contact_card(_reply(card), block))[0]["items"]
    assert "href" not in next(i for i in items if "confirmer" in i["name"])


# #4610.7 — le COMPTE cité dans la carte Contacts mène à sa fiche, comme dans les autres cartes : `company_href` est
# posé par le SERVEUR depuis l'`account_id` que l'outil a rendu (jamais celui du modèle).
UNEO = "5e1b7a30-1111-4222-8333-444455556666"
ENGIE = "6f2c8b41-2222-4333-8444-555566667777"
WITH_ACCOUNTS = {
    "contacts": [
        {"contact_id": CAROLINE, "full_name": "Caroline Jaouen", "title": "DSI", "company_name": "UNEO", "account_id": UNEO},
        {"contact_id": MARC, "full_name": "Marc Lenoir", "title": "RSSI", "company_name": "ENGIE", "account_id": ENGIE.upper()},
        {"full_name": "Sans Compte", "title": "DSI", "company_name": "Libre"},
        {"full_name": "Id Cassé", "company_name": "X", "account_id": "pas-un-uuid"},
    ]
}


def test_the_company_of_a_listed_contact_links_to_its_account_page():
    items = {i["name"]: i for i in contact_block_from_tool_output(WITH_ACCOUNTS)["items"]}
    assert items["Caroline Jaouen"]["company_href"] == f"/accounts/{UNEO}"
    assert items["Marc Lenoir"]["company_href"] == f"/accounts/{ENGIE}"


def test_a_company_without_a_readable_account_id_stays_text():
    items = {i["name"]: i for i in contact_block_from_tool_output(WITH_ACCOUNTS)["items"]}
    assert "company_href" not in items["Sans Compte"]
    assert "company_href" not in items["Id Cassé"]


def test_the_account_of_the_call_links_rows_that_carry_no_account_id():
    # `get_account_contacts(account_id=…)` : toutes les lignes sont de CE compte, l'appel le dit.
    output = {"contacts": [{"contact_id": CAROLINE, "full_name": "Caroline Jaouen", "company_name": "UNEO"}]}
    item = contact_block_from_tool_output(output, {"account_id": UNEO})["items"][0]
    assert item["company_href"] == f"/accounts/{UNEO}"
    # Un identifiant d'appel illisible n'ouvre rien.
    assert "company_href" not in contact_block_from_tool_output(output, {"account_id": "a1"})["items"][0]


def test_a_company_href_written_by_the_model_is_replaced_or_removed():
    block = contact_block_from_tool_output(WITH_ACCOUNTS)
    invented = "/accounts/00000000-0000-4000-8000-000000000000"
    card = {
        "type": "contact_list",
        "items": [
            {"name": "Caroline Jaouen", "company": "UNEO", "company_href": invented},
            {"name": "Inconnu Total", "company": "Nulle part", "company_href": invented},
        ],
    }
    by_name = {i["name"]: i for i in _cards(with_contact_card(_reply(card), block))[0]["items"]}
    assert by_name["Caroline Jaouen"]["company_href"] == f"/accounts/{UNEO}"
    assert "company_href" not in by_name["Inconnu Total"]


def test_homonyms_of_two_companies_never_share_an_account_link():
    block = contact_block_from_tool_output(
        {
            "contacts": [
                {"full_name": "Paul Martin", "company_name": "A", "account_id": UNEO},
                {"full_name": "Paul Martin", "company_name": "B", "account_id": ENGIE},
            ]
        }
    )
    card = {"type": "contact_list", "items": [{"name": "Paul Martin", "company": "A"}]}
    first = next(i for i in _cards(with_contact_card(_reply(card), block))[0]["items"] if i["name"] == "Paul Martin")
    assert "company_href" not in first
