"""#AM.32 — la carte « interlocuteurs d'un périmètre » (cyber chez EDF) porte de quoi ouvrir l'organigramme déjà
filtré : le compte et le périmètre, rien d'autre. Sans compte unique ou sans périmètre, aucun lien."""

from __future__ import annotations

from app.services.contact_card_fallback import contact_block_from_tool_output

ACCOUNT = "11111111-1111-4111-8111-111111111111"
ROW = {"contact_id": "c1", "full_name": "Ana Roy", "title": "RSSI"}


def test_get_account_contacts_avec_une_fonction_porte_le_compte_et_le_perimetre():
    out = {"contacts": [ROW], "requested_function": "cyber GRC"}
    block = contact_block_from_tool_output(out, {"account_id": ACCOUNT, "function": "cyber GRC"})
    assert block is not None
    assert block["org_view"] == {"account_id": ACCOUNT, "perimeter": "cyber GRC"}


def test_recherche_dans_l_espace_le_compte_commun_aux_lignes_suffit():
    out = {
        "contacts": [
            {**ROW, "account_id": ACCOUNT},
            {**ROW, "contact_id": "c2", "full_name": "Bo Li", "account_id": ACCOUNT},
        ]
    }
    block = contact_block_from_tool_output(out, {"query": "cyber", "company": "EDF"})
    assert block is not None
    assert block["org_view"] == {"account_id": ACCOUNT, "perimeter": "cyber"}


def test_sans_perimetre_ou_sans_compte_unique_aucun_lien():
    # Sans périmètre nommé : une simple liste de contacts, pas un périmètre.
    assert "org_view" not in contact_block_from_tool_output({"contacts": [ROW]}, {"account_id": ACCOUNT})
    # Deux comptes différents : on n'ouvre pas l'organigramme de l'un en y mettant l'autre.
    two = {
        "contacts": [
            {**ROW, "account_id": ACCOUNT},
            {**ROW, "contact_id": "c2", "full_name": "Bo Li", "account_id": "x"},
        ]
    }
    assert "org_view" not in contact_block_from_tool_output(two, {"function": "cyber"})
    # Appel sans entrée (anciens appelants) : comportement inchangé.
    assert "org_view" not in contact_block_from_tool_output({"contacts": [ROW]})


def test_la_carte_ecrite_par_le_modele_recoit_aussi_le_lien():
    import json

    from app.services.contact_card_fallback import with_contact_card

    out = {"contacts": [ROW], "requested_function": "cyber"}
    block = contact_block_from_tool_output(out, {"account_id": ACCOUNT})
    own = {"type": "contact_list", "items": [{"name": "Ana Roy", "role": "RSSI"}]}
    reply = "Voici.\n\n```bellum-block\n" + json.dumps(own) + "\n```"
    assert '"org_view"' in with_contact_card(reply, block)
