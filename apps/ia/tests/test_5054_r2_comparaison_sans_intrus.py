"""#5054 (recette prod 01/11) — « compare-les » ne compare QUE les comptes cités par le fil.

Cause : les sorties de `search_workspace_accounts` / `get_accounts_by_owner` (comptes de l'espace) ne citaient rien dans
l'état du fil ; sans compte au fil, le modèle choisissait lui-même des identifiants (un dossier récent hors fil, « SLIB »).
"""

from __future__ import annotations

from app.services.chat_thread_state import ThreadStateCollector, cited_objects

PORTFOLIO = {
    "accounts": [
        {"account_id": "acc-alpha", "company_name": "[recette 01/11] Alpha SAS"},
        {"account_id": "acc-beta", "company_name": "[recette 01/11] Beta SAS"},
        {"account_id": "acc-aureosys", "company_name": "AUREOSYS LOGICIELS"},
    ]
}


def test_une_liste_de_comptes_de_l_espace_cite_ses_comptes():
    for tool in ("search_workspace_accounts", "get_accounts_by_owner"):
        objects, is_list = cited_objects(tool, PORTFOLIO)
        assert is_list is True
        assert {o.id for o in objects} == {"acc-alpha", "acc-beta", "acc-aureosys"}


def test_compare_les_apres_une_liste_reprend_exactement_ces_comptes():
    thread = ThreadStateCollector()
    thread.record("search_workspace_accounts", {"sector": "logiciel"}, PORTFOLIO)
    prepared, _ = thread.prepare("compare_accounts", {"account_ids": []})
    assert sorted(prepared["account_ids"]) == ["acc-alpha", "acc-aureosys", "acc-beta"]


def test_un_identifiant_hors_fil_est_ecarte_quand_le_fil_a_ses_comptes():
    thread = ThreadStateCollector()
    thread.record("search_workspace_accounts", {"sector": "logiciel"}, PORTFOLIO)
    prepared, _ = thread.prepare("compare_accounts", {"account_ids": ["acc-aureosys", "acc-slib"]})
    assert "acc-slib" not in prepared["account_ids"]
    assert prepared["account_ids"] == ["acc-aureosys"]


def test_compare_x_et_y_nommes_passe_apres_leur_resolution():
    thread = ThreadStateCollector()
    thread.record("search_workspace_accounts", {"query": "X"}, {"accounts": [{"account_id": "x", "company_name": "X"}]})
    thread.record("search_workspace_accounts", {"query": "Y"}, {"accounts": [{"account_id": "y", "company_name": "Y"}]})
    given = {"account_ids": ["x", "y"]}
    prepared, _ = thread.prepare("compare_accounts", given)
    assert prepared == given


def test_un_fil_sans_liste_ne_filtre_pas_les_identifiants_donnes():
    prepared, _ = ThreadStateCollector().prepare("compare_accounts", {"account_ids": ["a", "b"]})
    assert prepared == {"account_ids": ["a", "b"]}
