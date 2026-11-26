"""#5054 (recette prod 02/11) — « 3 comptes à travailler cette semaine » puis « compare-les ».

Le message ne force AUCUN outil (`asks_what_to_do_this_week` exige « que faire cette semaine ») : le modèle choisit
librement (ici `get_action_plan`). Sa sortie ne citait aucun compte au fil ⇒ la garde de `prepare` était sautée et
l'identifiant choisi par le modèle (SLIB) passait.
"""

from __future__ import annotations

from app.services.chat_thread_state import ThreadStateCollector, cited_objects
from app.services.compilers.intent_router import asks_what_to_do_this_week

PLAN = {
    "gestures": [
        {"gesture": "repondre", "status": "ok", "actions": [{"accountId": "acc-a", "companyName": "Alpha SAS"}]},
        {
            "gesture": "relancer",
            "status": "ok",
            "actions": [
                {"accountId": "acc-b", "companyName": "Beta SAS"},
                {"accountId": "acc-a", "companyName": "Alpha SAS"},
            ],
        },
        {"gesture": "contacter", "status": "ok", "actions": [
            {"accountId": "acc-c", "companyName": "AUREOSYS"},
            {"accountId": None, "companyName": "Sans id", "contactId": "ct-1"},
        ]},
        {"gesture": "appeler", "status": "source_failed", "actions": []},
    ]
}


def test_le_message_de_la_recette_ne_force_pas_le_plan_d_actions():
    assert asks_what_to_do_this_week("Donne-moi 3 comptes de mon portefeuille à travailler cette semaine") is None


def test_le_plan_d_actions_cite_ses_comptes_sans_doublon_ni_compte_sans_id():
    objects, is_list = cited_objects("get_action_plan", PLAN)
    assert is_list is True
    assert [o.id for o in objects] == ["acc-b", "acc-a", "acc-c"] or {o.id for o in objects} == {"acc-a", "acc-b", "acc-c"}
    assert len(objects) == 3


def test_plan_puis_compare_un_id_hors_fil_est_ecarte():
    thread = ThreadStateCollector()
    thread.record("get_action_plan", {}, PLAN)
    prepared, _ = thread.prepare("compare_accounts", {"account_ids": ["acc-slib", "acc-c"]})
    assert prepared["account_ids"] == ["acc-c"]


def test_plan_puis_compare_les_reprend_les_trois_comptes():
    thread = ThreadStateCollector()
    thread.record("get_action_plan", {}, PLAN)
    prepared, _ = thread.prepare("compare_accounts", {"account_ids": []})
    assert sorted(prepared["account_ids"]) == ["acc-a", "acc-b", "acc-c"]


def test_un_seul_compte_cite_suffit_a_ecarter_l_intrus():
    thread = ThreadStateCollector()
    thread.record("get_account_briefing", {}, {"account_id": "acc-a", "company_name": "Alpha SAS"})
    prepared, _ = thread.prepare("compare_accounts", {"account_ids": ["acc-a", "acc-slib"]})
    assert prepared["account_ids"] == ["acc-a"]


def test_fil_sans_compte_cite_inchange():
    given = {"account_ids": ["acc-x", "acc-y"]}
    prepared, _ = ThreadStateCollector().prepare("compare_accounts", given)
    assert prepared == given


def test_bilan_de_relance_cite_ses_comptes():
    objects, _ = cited_objects("get_reengagement_report", {"accounts": [{"accountId": "r1", "companyName": "R"}]})
    assert [o.id for o in objects] == ["r1"]
