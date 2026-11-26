"""#5054 (suite de #4705.3) — la carte de comparaison se construit depuis les comptes DU FIL.

Trois comptes analysés par `analyze_named_companies` (réutilisés ou lancés) puis « compare-les » : l'état du fil
les cite, l'appel sans identifiants les reprend. Un identifiant ne vient que d'une SORTIE d'outil du fil.
"""

from __future__ import annotations

from app.services.chat_thread_state import ThreadStateCollector, cited_objects
from app.services.chat_tools import COMPARE_ACCOUNTS_TOOL

BATCH_OUTPUT = {
    "launched": [{"company": "Thales", "account_id": "acc-thales"}],
    "known": [
        {"company": "Servier", "account_name": "Servier SA", "account_id": "acc-servier", "last_analyzed_at": None},
        {"company": "Sanofi", "account_name": "Sanofi", "account_id": "acc-sanofi", "last_analyzed_at": None},
    ],
    "not_launched": [{"company": "Inconnue SARL", "why": "introuvable"}],
}


def test_un_lot_cite_ses_comptes_reutilises_et_lances():
    objects, is_list = cited_objects("analyze_named_companies", BATCH_OUTPUT)
    assert is_list is True
    assert {(o.kind, o.id) for o in objects} == {
        ("account", "acc-servier"),
        ("account", "acc-sanofi"),
        ("account", "acc-thales"),
    }
    labels = {o.id: o.label for o in objects}
    assert labels["acc-servier"] == "Servier SA"  # le nom du dossier de l'espace
    assert labels["acc-thales"] == "Thales"  # le nom cité pour un compte lancé


def test_un_nom_non_lance_ne_devient_pas_un_compte():
    objects, _ = cited_objects("analyze_named_companies", {"not_launched": [{"company": "X", "why": "y"}]})
    assert objects == []


def test_compare_les_sans_identifiants_reprend_les_comptes_du_fil():
    thread = ThreadStateCollector()
    thread.record("analyze_named_companies", {"companies": ["Servier", "Sanofi", "Thales"]}, BATCH_OUTPUT)
    prepared, _ = thread.prepare("compare_accounts", {"account_ids": []})
    assert sorted(prepared["account_ids"]) == ["acc-sanofi", "acc-servier", "acc-thales"]


def test_des_identifiants_donnes_ne_sont_jamais_ecrases():
    thread = ThreadStateCollector()
    thread.record("analyze_named_companies", {}, BATCH_OUTPUT)
    given = {"account_ids": ["acc-servier", "acc-sanofi"]}
    prepared, _ = thread.prepare("compare_accounts", given)
    assert prepared == given


def test_un_fil_sans_compte_ne_devine_rien():
    prepared, _ = ThreadStateCollector().prepare("compare_accounts", {"account_ids": []})
    assert prepared == {"account_ids": []}


def test_seuls_les_comptes_du_fil_entrent_pas_un_contact_ni_un_inconnu():
    thread = ThreadStateCollector()
    thread.record("get_account_contacts", {"account_id": "a"}, {"contacts": [{"contact_id": "c1", "full_name": "A B"}]})
    prepared, _ = thread.prepare("compare_accounts", {"account_ids": []})
    assert prepared == {"account_ids": []}


def test_la_description_de_l_outil_dit_d_appeler_avec_account_ids_vide():
    text = COMPARE_ACCOUNTS_TOOL["description"]
    assert "account_ids" in text and "vide" in text


async def test_sans_compte_au_fil_le_refus_reste_le_message_honnete():
    """Sans compte au fil : le refus reste l'ancien message honnête (deux comptes au moins)."""
    from app.services.chat_tools import execute_chat_tool

    result = await execute_chat_tool("compare_accounts", {"account_ids": []}, user_id="user-1", profile_data=None)
    assert "error" in result
