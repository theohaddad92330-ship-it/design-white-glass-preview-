"""#3889 (épopée #3977) — les projets décrits dans les DOCUMENTS de l'espace, par compte.

`search_document_projects` lit `rag_documents` (jamais les besoins enregistrés en
base — ça, c'est `find_needs`) et range chaque passage en besoins ouverts, anciens
besoins, missions, projets du client ou besoins à statut non établi. Chaque
garantie est prouvée dans les DEUX sens (le test sait dire NON) :

  * ouvert / ancien se décide sur ce que le document DIT (statut, date), jamais
    deviné : sans date ni statut, le passage est « non daté » ;
  * chaque projet cite le titre de son document ;
  * l'isolation par espace, par auteur (`personal`) et par compte (`account`) est
    celle de la récupération générale (`rag_service._scope_retrieval`) ;
  * aucun document → l'outil le dit, il n'invente rien ; une lecture en échec est
    une erreur, jamais « aucun projet ».
"""

from __future__ import annotations

import asyncio
from datetime import date

import pytest
from fastapi import HTTPException

from app.services import document_projects
from app.services.chat_tools import CHAT_TOOLS, cited_sources, execute_chat_tool
from app.services.context_mode import WORKSPACE_DATA_TOOL_NAMES
from app.services.tool_permissions import READ_ONLY_TOOLS
from tests.rag_visibility_fake import is_visibility_filter, visibility_predicate

TODAY = date(2026, 10, 11)
WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
SANOFI = "0000000a-0000-4000-8000-00000000000a"
OTHER = "0000000b-0000-4000-8000-00000000000b"


# ─── Le classement, pur ────────────────────────────────────────────────────


def _one(text: str, *, company: str = "Sanofi", about_account: bool = True) -> dict:
    doc = {"id": "d1", "title": "Doc Sanofi", "content": text}
    buckets = document_projects.extract_document_projects(
        [doc], company_name=company, today=TODAY, account_docs={"d1"} if about_account else set()
    )
    found = [(bucket, item) for bucket, items in buckets.items() for item in items]
    assert len(found) == 1, found
    bucket, item = found[0]
    return {"bucket": bucket, **item}


def test_un_besoin_que_le_document_dit_ouvert_est_un_besoin_ouvert():
    item = _one("Besoin ouvert : architecte données pour la plateforme R&D, démarrage mars 2027.")
    assert item["bucket"] == "open_needs"
    assert item["basis"] == "statut"
    assert item["said"] == "ouvert"
    assert "mars 2027" in item["dates"]


def test_un_besoin_que_le_document_dit_clos_est_un_ancien_besoin_jamais_ouvert():
    item = _one("Besoin clôturé en juin 2024 : refonte du SI RH, le client a choisi un autre prestataire.")
    assert item["bucket"] == "past_needs"
    assert item["basis"] == "statut"


def test_une_mission_realisee_est_rangee_en_mission_et_dit_terminee():
    item = _one("Mission réalisée de janvier 2023 à décembre 2023 : migration de la plateforme de données.")
    assert item["bucket"] == "missions"
    assert item["state"] == "terminée"
    assert item["nature"] == "mission"


def test_NON_sans_date_ni_statut_le_besoin_est_non_date_jamais_devine_ouvert():
    item = _one("Besoin d'un chef de projet SAP sur le périmètre finance.")
    assert item["bucket"] == "unsettled_needs"
    assert item["state"] == "non daté"
    assert item["basis"] is None


def test_NON_une_date_recente_sans_statut_ne_suffit_pas_a_dire_ouvert_ou_ancien():
    item = _one("Besoin exprimé le 15/09/2026 : deux ingénieurs data.")
    assert item["bucket"] == "unsettled_needs"
    assert item["state"] == "daté, statut non dit"
    assert item["dates"] == ["15/09/2026"]


def test_une_date_a_venir_dit_ouvert_et_une_date_ancienne_dit_ancien():
    ahead = _one("Appel d'offres sur l'observabilité, réponse attendue en T1 2027.")
    assert ahead["bucket"] == "open_needs"
    assert ahead["basis"] == "date"
    old = _one("Besoin data sur la pharmacovigilance, 2019.")
    assert old["bucket"] == "past_needs"
    assert old["basis"] == "date"


def test_NON_un_document_qui_dit_ouvert_ET_annule_n_est_ni_l_un_ni_l_autre():
    item = _one("Besoin ouvert en mars puis annulé par le client.")
    assert item["bucket"] == "unsettled_needs"
    assert item["state"] == "ambigu"


def test_un_projet_du_client_garde_sa_nature_de_projet():
    item = _one("Projet de refonte du portail fournisseurs, mis en production en 2021 et terminé.")
    assert item["bucket"] == "client_projects"
    assert item["nature"] == "projet"


def test_NON_une_ligne_sans_projet_besoin_ni_mission_ne_fait_aucune_ligne():
    doc = {
        "id": "d1",
        "title": "Doc",
        "content": "Atelier tenu avec l'équipe d'exploitation.\nPrioriser l'observabilité.",
    }
    buckets = document_projects.extract_document_projects(
        [doc], company_name="Sanofi", today=TODAY, account_docs={"d1"}
    )
    assert all(not items for items in buckets.values())


def test_NON_un_document_d_equipe_ne_rattache_au_compte_que_les_lignes_qui_le_nomment():
    doc = {
        "id": "team",
        "title": "Références de l'ESN",
        "content": "Mission terminée chez Sanofi en 2024 : qualification de données cliniques.\n"
        "Mission en cours chez un autre client : migration cloud.",
    }
    buckets = document_projects.extract_document_projects([doc], company_name="Sanofi", today=TODAY, account_docs=set())
    excerpts = [item["excerpt"] for item in buckets["missions"]]
    assert len(excerpts) == 1
    assert "Sanofi" in excerpts[0]


def test_chaque_projet_cite_le_titre_de_son_document():
    item = _one("Mission en cours : support applicatif niveau 2.")
    assert item["source"] == "Doc Sanofi"
    assert item["source_id"] == "d1"


# ─── L'outil, de bout en bout, sur un faux PostgREST ───────────────────────


def _doc(doc_id, content, *, scope="workspace", user=ALICE, ws=WS_A, account=None, title=None, origin="uploaded"):
    return {
        "id": doc_id,
        "user_id": user,
        "workspace_id": ws,
        "scope": scope,
        "account_id": account,
        "title": title or f"Titre {doc_id}",
        "content": content,
        "category": "Référence",
        "origin": origin,
        "archived_at": None,
        "created_at": "2026-09-01T00:00:00+00:00",
    }


ROWS = [
    _doc("acct-sanofi", "Besoin ouvert : architecte données, démarrage T1 2027.", scope="account", account=SANOFI),
    _doc("team-sanofi", "Mission terminée chez Sanofi en 2024 : qualification de données.", title="Références ESN"),
    _doc("kb-sanofi", "Ancien besoin Sanofi annulé en 2023 : pilotage de portefeuille.", scope="knowledge_base"),
    # Jamais lus, chacun pour sa raison :
    _doc("acct-other", "Besoin ouvert chez Sanofi Pasteur ? Non : autre compte.", scope="account", account=OTHER),
    _doc("bob-perso", "Besoin ouvert Sanofi noté par Bob.", scope="personal", user=BOB),
    _doc("conv", "Besoin ouvert Sanofi joint à un fil.", scope="conversation"),
    _doc("ws-b", "Besoin ouvert Sanofi d'un autre espace.", ws=WS_B, user=BOB),
    _doc("distilled", "Besoin ouvert Sanofi déduit d'une analyse.", origin="distilled"),
    {**_doc("archived", "Besoin ouvert Sanofi, version remplacée."), "archived_at": "2026-09-02T00:00:00+00:00"},
]


class _Res:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error


class _FakeQuery:
    def __init__(self, rows, *, fail=False):
        self._rows = rows
        self._preds: list = []
        self._limit = 1000
        self._fail = fail

    def select(self, *a, **k):
        return self

    def limit(self, n, *a, **k):
        self._limit = n
        return self

    def order(self, *a, **k):
        return self

    def eq(self, column, value):
        self._preds.append(lambda r: r.get(column) == value)
        return self

    def is_(self, column, value):
        self._preds.append(lambda r: r.get(column) is None if value in (None, "null") else r.get(column) == value)
        return self

    def or_(self, expression: str):
        if is_visibility_filter(expression):
            self._preds.append(visibility_predicate(expression))
            return self
        ws = expression.split("workspace_id.eq.", 1)[1].split(",", 1)[0]
        uid = expression.split("user_id.eq.", 1)[1].rstrip(")")
        self._preds.append(
            lambda r: r.get("workspace_id") == ws or (r.get("workspace_id") is None and r.get("user_id") == uid)
        )
        return self

    def ilike(self, column, value, **k):
        needle = value.strip("%").lower()
        self._preds.append(lambda r: needle in str(r.get(column) or "").lower())
        return self

    async def aexecute(self):
        if self._fail:
            return _Res(None, error={"message": "boom"})
        return _Res([r for r in self._rows if all(p(r) for p in self._preds)][: self._limit])


class _FakeClient:
    def __init__(self, rows, *, fail=False):
        self._rows = rows
        self._fail = fail
        self.tables: list[str] = []

    def table(self, name):
        self.tables.append(name)
        return _FakeQuery(self._rows, fail=self._fail)


ACCOUNTS = {SANOFI: {"id": SANOFI, "company_name": "Sanofi", "user_id": ALICE}}


def _install(monkeypatch, rows=ROWS, *, fail=False, owned=ACCOUNTS):
    client = _FakeClient(rows, fail=fail)

    async def _fake_owned(_sb, account_id, user_id, columns="*"):
        account = owned.get(account_id)
        if not account or account["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Account not found")
        return account

    async def _fake_ws(user_id, sb=None):
        return WS_A if user_id == ALICE else WS_B

    monkeypatch.setattr(document_projects, "get_supabase", lambda: client)
    monkeypatch.setattr(document_projects, "fetch_owned_account", _fake_owned)
    monkeypatch.setattr(document_projects, "resolve_workspace_id", _fake_ws)
    monkeypatch.setattr(document_projects, "_today", lambda: TODAY)
    return client


def _run(tool_input, *, user=ALICE, context_mode=None):
    return asyncio.run(
        execute_chat_tool(
            "search_document_projects", tool_input, user_id=user, profile_data=None, context_mode=context_mode
        )
    )


def _excerpts(result) -> str:
    return " | ".join(
        item["excerpt"]
        for key in ("open_needs", "past_needs", "missions", "client_projects", "unsettled_needs")
        for item in result[key]
    )


def test_l_outil_range_les_projets_du_compte_et_cite_chaque_source(monkeypatch):
    _install(monkeypatch)
    result = _run({"account_id": SANOFI})
    assert "error" not in result
    assert result["account"] == "Sanofi"
    assert [i["source"] for i in result["open_needs"]] == ["Titre acct-sanofi"]
    assert [i["source"] for i in result["missions"]] == ["Références ESN"]
    assert [i["source"] for i in result["past_needs"]] == ["Titre kb-sanofi"]
    assert result["documents_read"] == 3
    assert sorted(result["sources"]) == ["Références ESN", "Titre acct-sanofi", "Titre kb-sanofi"]


def test_NON_isolation_aucun_document_d_un_autre_compte_espace_auteur_fil_ni_distille(monkeypatch):
    _install(monkeypatch)
    text = _excerpts(_run({"account_id": SANOFI}))
    for leak in ("autre compte", "Bob", "joint à un fil", "autre espace", "déduit d'une analyse", "remplacée"):
        assert leak not in text


def test_NON_un_compte_hors_portefeuille_ne_lit_aucun_document(monkeypatch):
    client = _install(monkeypatch)
    result = _run({"account_id": SANOFI}, user=BOB)
    assert result.get("error")
    assert "rag_documents" not in client.tables


def test_NON_aucun_document_l_outil_le_dit_sans_rien_inventer(monkeypatch):
    _install(monkeypatch, rows=[])
    result = _run({"account_id": SANOFI})
    assert "error" not in result
    assert result["documents_read"] == 0
    assert all(
        result[key] == [] for key in ("open_needs", "past_needs", "missions", "client_projects", "unsettled_needs")
    )
    assert "Aucun document" in result["message"]
    assert "Sanofi" in result["message"]


def test_NON_une_lecture_en_echec_est_une_erreur_jamais_aucun_projet(monkeypatch):
    _install(monkeypatch, fail=True)
    result = _run({"account_id": SANOFI})
    assert result.get("error")
    assert "open_needs" not in result


def test_NON_le_mode_sans_base_documentaire_ne_lit_aucun_document(monkeypatch):
    client = _install(monkeypatch)
    result = _run({"account_id": SANOFI}, context_mode="one_off_mission")
    assert result.get("error")
    assert client.tables == []


def test_NON_sans_identifiant_de_compte_rien_n_est_lu(monkeypatch):
    client = _install(monkeypatch)
    assert _run({}).get("error")
    assert client.tables == []


# #3889 (recette prod 11/10, PARTIAL) — « Quels projets a Sanofi dans nos documents ? » sur un compte
# QUI N'EST PAS dans le portefeuille : l'outil exigeait un compte possédé et ne lisait donc rien, alors que
# des documents d'équipe nomment l'entreprise. Un nom suffit ; la portée reste celle de la récupération
# générale (espace + documents personnels), jamais les documents rattachés à un compte.
def test_un_nom_d_entreprise_sans_compte_lit_les_documents_d_equipe_qui_la_nomment(monkeypatch):
    client = _install(monkeypatch)
    result = _run({"company_name": "Sanofi"})
    assert "error" not in result
    assert result["account"] == "Sanofi"
    assert result["account_id"] is None
    assert "rag_documents" in client.tables
    assert [i["source"] for i in result["missions"]] == ["Références ESN"]
    assert "compte" in result["scope_note"].lower() and "portefeuille" in result["scope_note"].lower()


def test_NON_un_nom_seul_ne_lit_aucun_document_rattache_a_un_compte_ni_d_un_autre_espace(monkeypatch):
    _install(monkeypatch)
    result = _run({"company_name": "Sanofi"})
    assert all(i["source"] != "Titre acct-sanofi" for key in ("open_needs", "past_needs", "missions", "client_projects", "unsettled_needs") for i in result[key])
    text = _excerpts(result)
    for leak in ("Bob", "autre espace", "joint à un fil", "déduit d'une analyse", "remplacée", "autre compte"):
        assert leak not in text


def test_NON_un_nom_trop_court_ou_absent_ne_lit_rien(monkeypatch):
    client = _install(monkeypatch)
    assert _run({"company_name": " "}).get("error")
    assert _run({"company_name": "S"}).get("error")
    assert client.tables == []


def test_la_portee_se_nomme_pour_ne_jamais_generaliser(monkeypatch):
    _install(monkeypatch)
    note = _run({"account_id": SANOFI})["scope_note"]
    assert "documents" in note
    assert "besoins enregistrés" in note


# ─── Le catalogue ──────────────────────────────────────────────────────────


def _tool() -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == "search_document_projects")


def test_l_outil_est_declare_en_lecture_avant_push_profile():
    names = [t["name"] for t in CHAT_TOOLS]
    assert names.index("search_document_projects") < names.index("push_profile")
    assert names[-1] == "push_profile"
    assert "search_document_projects" in READ_ONLY_TOOLS
    # #3889 (recette prod 11/10) — un compte OU un nom : aucun des deux n'est exigé seul.
    assert set(_tool()["input_schema"]["properties"]) == {"account_id", "company_name"}
    assert _tool()["input_schema"]["required"] == []


def test_l_outil_est_retire_quand_on_travaille_sans_les_donnees_de_l_espace():
    assert "search_document_projects" in WORKSPACE_DATA_TOOL_NAMES


@pytest.mark.parametrize("vendor", ["pgvector", "Supabase", "LangChain", "OpenAI", "Anthropic", "rag_documents"])
def test_NON_la_description_ne_nomme_aucun_fournisseur(vendor):
    assert vendor.lower() not in _tool()["description"].lower()


def test_les_sources_citees_sont_les_documents_dont_un_projet_est_cite():
    item = {"excerpt": "Mission terminée chez Sanofi.", "source": "Références ESN", "source_id": "d9"}
    output = {"missions": [item], "open_needs": [], "sources": ["Références ESN"]}
    [source] = cited_sources("search_document_projects", output)
    assert source["kind"] == "knowledge_doc"
    assert source["label"] == "Références ESN"
    assert source["doc_id"] == "d9"
    assert "Mission terminée" in source["excerpt"]
    assert cited_sources("search_document_projects", {"error": "x", "missions": [item]}) == []
    assert cited_sources("search_document_projects", {"missions": [], "sources": []}) == []


# #4071.4 — Décision Louis 12/10 : tout l'espace voit tout, SAUF les documents
# personnels d'un membre, qui ne servent qu'à lui. Deux collègues du MÊME espace :
# chacun lit ses documents personnels, jamais ceux de l'autre — par compte comme
# par nom d'entreprise.
CAROL = "cccccccc-cccc-cccc-cccc-cccccccccccc"


def _install_same_workspace(monkeypatch):
    rows = [
        _doc("team", "Mission terminée chez Sanofi en 2024 : qualification de données.", title="Références ESN"),
        _doc("alice-perso", "Besoin ouvert Sanofi : note perso d'Alice.", scope="personal", user=ALICE),
        _doc("carol-perso", "Besoin ouvert Sanofi : note perso de Carol.", scope="personal", user=CAROL),
    ]
    client = _FakeClient(rows)
    owned = {SANOFI: {"id": SANOFI, "company_name": "Sanofi"}}

    async def _fake_owned(_sb, account_id, user_id, columns="*"):
        if account_id not in owned:
            raise HTTPException(status_code=404, detail="Account not found")
        return owned[account_id]

    async def _fake_ws(user_id, sb=None):
        return WS_A

    monkeypatch.setattr(document_projects, "get_supabase", lambda: client)
    monkeypatch.setattr(document_projects, "fetch_owned_account", _fake_owned)
    monkeypatch.setattr(document_projects, "resolve_workspace_id", _fake_ws)
    monkeypatch.setattr(document_projects, "_today", lambda: TODAY)


@pytest.mark.parametrize("tool_input", [{"account_id": SANOFI}, {"company_name": "Sanofi"}])
def test_NON_4071_4_les_documents_perso_d_un_membre_ne_servent_qu_a_lui(monkeypatch, tool_input):
    _install_same_workspace(monkeypatch)
    alice = _excerpts(_run(tool_input, user=ALICE))
    carol = _excerpts(_run(tool_input, user=CAROL))
    assert "note perso d'Alice" in alice and "note perso de Carol" not in alice
    assert "note perso de Carol" in carol and "note perso d'Alice" not in carol
    # Le document d'équipe, lui, sert à tout l'espace.
    assert "qualification de données" in alice and "qualification de données" in carol


def test_4071_4_la_description_dit_que_les_documents_perso_sont_ceux_de_la_personne():
    from app.services.chat_tools import SEARCH_DOCUMENT_PROJECTS_TOOL

    text = SEARCH_DOCUMENT_PROJECTS_TOOL["input_schema"]["properties"]["company_name"]["description"]
    assert "jamais ceux d'un autre membre" in text


# #3889.2/#4015.2 (recette R8a, Sanofi, 14/10) — Laura écrit « aucun document
# exploitable » puis cite 3 projets sourcés DANS LA MÊME RÉPONSE : la phrase
# d'absence et des projets bien réels coexistaient. Le code ne pose `message`
# que quand les cinq listes (BUCKETS) sont VIDES (`search_account_document_
# projects` : `elif not used`) — la contradiction vient de la PHRASE, jamais
# du résultat structuré. La description doit donc dire explicitement QUAND la
# phrase d'absence est permise, ancré sur la clé que le code pose réellement.
def test_4058_la_description_interdit_la_phrase_d_absence_quand_des_projets_sont_rendus():
    from app.services.chat_tools import SEARCH_DOCUMENT_PROJECTS_TOOL

    text = SEARCH_DOCUMENT_PROJECTS_TOOL["description"]
    assert "ne dis JAMAIS" in text
    assert "`message`" in text
    # L'interdiction cite au moins une des cinq listes qu'une réponse pourrait
    # citer sans que le code ait posé `message` — la cause exacte du #3889.2.
    assert "client_projects" in text or "open_needs" in text
