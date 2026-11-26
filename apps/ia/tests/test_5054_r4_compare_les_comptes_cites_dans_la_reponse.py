"""#5054 (4e tour, recette prod 02/11) — « 3 comptes à travailler » (`get_portfolio_priorities`) puis « compare-les ».

Cause : la sortie de `get_portfolio_priorities` rend TOUT le portefeuille (now, toVerify, toWatch, notNow) ; le fil
citait ces lignes (les 10-12 premières) et non les 3 comptes que la réponse NOMME. SLIB et AUREOSYS (analysés, en
« now ») étaient donc « cités » : l'intrus choisi par le modèle passait la garde de `prepare`.
Forme réelle : `{id, companyName}` par ligne (`portfolio-priorities.ts`), importés sous `toVerify`.
"""

from __future__ import annotations

from app.services.chat_thread_state import ThreadStateCollector

PORTFOLIO = {
    "now": [
        {"id": "acc-slib", "companyName": "SLIB", "bucket": "now"},
        {"id": "acc-aureosys", "companyName": "AUREOSYS LOGICIELS", "bucket": "now"},
    ],
    "toVerify": [
        {"id": "acc-alsatia", "companyName": "Alsatia Assurances", "bucket": "to_verify"},
        {"id": "acc-rhin", "companyName": "Banque du Rhin", "bucket": "to_verify"},
        {"id": "acc-rhena", "companyName": "Rhénatech Industries", "bucket": "to_verify"},
        *({"id": f"acc-x{i}", "companyName": f"Importé {i}", "bucket": "to_verify"} for i in range(12)),
    ],
    "toWatch": [],
    "notNow": [],
}
REPLY = (
    "Voici 3 comptes à travailler : **Alsatia Assurances**, **Banque du Rhin** et **Rhénatech Industries** "
    "(importés, pas encore analysés)."
)


def _thread_after_reply() -> ThreadStateCollector:
    thread = ThreadStateCollector()
    thread.record("get_portfolio_priorities", {}, PORTFOLIO)
    thread.narrow_to_reply(REPLY)
    return thread


def test_compare_les_ne_reprend_que_les_comptes_nommes_par_la_reponse():
    prepared, _ = _thread_after_reply().prepare("compare_accounts", {"account_ids": []})
    assert sorted(prepared["account_ids"]) == ["acc-alsatia", "acc-rhena", "acc-rhin"]


def test_le_modele_qui_choisit_slib_et_aureosys_n_a_pas_le_dernier_mot():
    prepared, _ = _thread_after_reply().prepare("compare_accounts", {"account_ids": ["acc-slib", "acc-aureosys"]})
    assert sorted(prepared["account_ids"]) == ["acc-alsatia", "acc-rhena", "acc-rhin"]
    assert "acc-slib" not in prepared["account_ids"]


def test_un_intrus_et_un_compte_cite_ne_garde_que_le_cite():
    prepared, _ = _thread_after_reply().prepare("compare_accounts", {"account_ids": ["acc-slib", "acc-rhin"]})
    assert prepared["account_ids"] == ["acc-rhin"]


def test_reponse_qui_ne_nomme_aucun_compte_laisse_l_etat_inchange():
    thread = ThreadStateCollector()
    thread.record("get_portfolio_priorities", {}, PORTFOLIO)
    before = [o.id for o in thread.state.last_list]
    thread.narrow_to_reply("Je n'ai rien de précis à te proposer.")
    assert [o.id for o in thread.state.last_list] == before


def test_compare_x_et_y_nommes_explicitement_passe_toujours():
    thread = ThreadStateCollector()
    thread.record("search_workspace_accounts", {}, {"accounts": [{"id": "a1", "company_name": "Alpha"}, {"id": "b1", "company_name": "Beta"}]})
    thread.narrow_to_reply("J'ai trouvé Alpha et Beta.")
    prepared, _ = thread.prepare("compare_accounts", {"account_ids": ["a1", "b1"]})
    assert prepared["account_ids"] == ["a1", "b1"]
