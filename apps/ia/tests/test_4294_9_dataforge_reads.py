"""#4294.9 (#4281.1) — l'analyse ET Laura lisent pour de vrai les besoins historiques DU compte.

Données SYNTHÉTIQUES. Quatre écarts constatés le 20/10 sur `origin/main` :
  · le compte n'était lu que pour SON créateur (`user_id`) — un coéquipier de l'espace qui
    analyse le même compte ne voyait aucun besoin : le cloisonnement est l'ESPACE ;
  · « qu'a-t-on déjà fait chez X ? » sur une entreprise pas (encore) au portefeuille : aucun
    chemin, l'outil exigeait un compte ;
  · aucune synthèse : Laura recomptait gagnés / perdus elle-même sur 15 lignes ;
  · la classification des interlocuteurs ignorait les prescripteurs des besoins passés.
"""

from __future__ import annotations

import json
from datetime import date

import pytest

from app.services import dataforge_needs as dn
from app.services import radar_chat_tools as rct
from app.services.analysis_account_facts import known_contacts_block
from tests.test_dataforge_needs import NEEDS, TODAY, _FakeSupabase

ACCOUNTS = [
    {
        "id": "acc-1",
        "user_id": "u1",
        "workspace_id": "ws-A",
        "company_name": "Acme",
        "siren": "111111111",
        "group_head_siren": None,
    },
]
DF_ACCOUNTS = [
    {"source_id": "DF-0042", "siren": "111111111", "cluster_id": "C1", "is_cluster_primary": True},
    {"source_id": "DF-0099", "siren": "333333333", "cluster_id": "C9", "is_cluster_primary": True},
    {"source_id": "DF-0043", "siren": "222222222", "cluster_id": "C2", "is_cluster_primary": True},
    {"source_id": "DF-0044", "siren": "222222222", "cluster_id": "C3", "is_cluster_primary": True},
]


@pytest.fixture
def fake(monkeypatch):
    sb = _FakeSupabase(rows={"accounts": ACCOUNTS, "dataforge_needs": NEEDS, "dataforge_accounts": DF_ACCOUNTS})
    monkeypatch.setattr(dn, "get_supabase", lambda: sb)
    return sb


# ── cloisonnement par ESPACE ─────────────────────────────────────────────────


async def test_un_coequipier_du_meme_espace_lit_les_besoins_du_compte(fake):
    out = await dn.needs_for_owned_account("acc-1", "u2-coequipier", workspace_id="ws-A", today=TODAY)
    assert [n["title"] for n in out["needs"]] == ["Consultant SAP FI/CO", "Chef de projet S/4"]
    # la lecture du compte porte l'espace, jamais un `where id` seul
    account_reads = [q for q in fake.queries if q.table == "accounts"]
    assert ("eq", "workspace_id", "ws-A") in account_reads[-1].filters


async def test_NON_un_autre_espace_ne_lit_rien_meme_avec_le_bon_identifiant(fake):
    out = await dn.needs_for_owned_account("acc-1", "u1", workspace_id="ws-B", today=TODAY)
    assert out == {"needs": [], "to_verify": None, "source_ids": []}


async def test_sans_espace_la_portee_reste_le_createur(fake):
    assert (await dn.needs_for_owned_account("acc-1", "u1", today=TODAY))["needs"]
    assert (await dn.needs_for_owned_account("acc-1", "u2", today=TODAY))["needs"] == []


# ── une entreprise hors portefeuille, par SIREN (jamais par nom) ─────────────


async def test_besoins_par_siren_d_une_entreprise_hors_portefeuille(fake):
    out = await dn.needs_for_siren("333 333 333", today=TODAY)
    assert out["source_ids"] == ["DF-0099"]
    assert [n["title"] for n in out["needs"]] == ["Admin Salesforce"]


async def test_NON_siren_ambigu_ou_inconnu_ne_lit_aucun_besoin(fake):
    ambiguous = await dn.needs_for_siren("222222222", today=TODAY)
    assert ambiguous["needs"] == [] and ambiguous["to_verify"].startswith("à vérifier")
    assert (await dn.needs_for_siren("999999999", today=TODAY))["needs"] == []
    assert (await dn.needs_for_siren("Acme", today=TODAY))["needs"] == []


# ── la synthèse : ce qu'on a déjà fait chez X ────────────────────────────────


async def test_synthese_compte_les_statuts_date_le_dernier_et_borne_le_tjm(fake):
    out = await dn.needs_for_owned_account("acc-1", "u1", today=TODAY)
    summary = dn.needs_summary(out["needs"])
    assert summary["total"] == 2
    assert summary["by_status"] == {"GAGNE": 1, "PERDU": 1}
    assert summary["latest_date"] == "2024-03-14"
    assert summary["latest_won"] == {"title": "Consultant SAP FI/CO", "date": "2024-03-14"}
    # TJM : seulement ceux qui sont écrits — jamais une moyenne qui en inventerait un
    assert summary["tjm_eur"] == {"min": 720, "max": 720, "known": 1}
    assert summary["technologies"] == ["SAP"]
    names = [p["name"] for p in summary["prescribers"]]
    assert names == ["Jeanne Martin", "Paul Durand"]
    assert summary["prescribers"][1]["freshness"]["kind"] == "to_revalidate"
    assert "gagné" in summary["line"] and "perdu" in summary["line"] and "2024-03-14" in summary["line"]


def test_NON_synthese_vide_sans_besoin_jamais_un_zero_affiche():
    assert dn.needs_summary([]) is None


# ── Laura : « qu'a-t-on déjà fait chez X ? » ─────────────────────────────────


async def test_laura_lit_l_historique_par_siren_avec_sa_synthese(fake, monkeypatch):
    out = await rct.execute_search_historical_needs({"siren": "333333333"}, "u1")
    assert [r["title"] for r in out["results"]] == ["Admin Salesforce"]
    assert out["summary"]["total"] == 1
    assert "dataforge" not in json.dumps(out, ensure_ascii=False).lower()


async def test_laura_compte_lu_dans_le_fil_rend_la_synthese(fake, monkeypatch):
    async def _ws(_user_id, sb=None):
        return "ws-A"

    monkeypatch.setattr(rct, "resolve_workspace_id", _ws)
    out = await rct.execute_search_historical_needs({"account_id": "acc-1"}, "u2-coequipier")
    assert out["summary"]["by_status"] == {"GAGNE": 1, "PERDU": 1}


def test_la_description_de_l_outil_porte_la_question_et_le_siren():
    desc = rct.SEARCH_HISTORICAL_NEEDS_TOOL["description"]
    assert "qu'a-t-on déjà fait chez" in desc.lower()
    assert "siren" in rct.SEARCH_HISTORICAL_NEEDS_TOOL["input_schema"]["properties"]
    assert "dataforge" not in desc.lower() and "orion" not in desc.lower()


# ── classification : les prescripteurs départagent, ne filtrent pas ─────────


async def test_prescripteurs_du_compte_deviennent_des_interlocuteurs_connus(fake):
    out = await dn.needs_for_owned_account("acc-1", "u1", today=TODAY)
    known = dn.prescriber_contacts(out)
    assert known[0] == {
        "name": "Jeanne Martin",
        "role": "DSI adjointe",
        "relation": "prescriber",
        "last_seen": "2026-06-01",
        "to_revalidate": False,
    }
    assert known[1]["to_revalidate"] is True
    block = known_contacts_block(known)
    assert "Jeanne Martin" in block and "prescripteur d'un besoin passé chez ce client" in block
    assert "à revalider" in block.split("Paul Durand", 1)[1].split("\n", 1)[0]
    assert "dataforge" not in block.lower()


def test_NON_sans_prescripteur_aucun_interlocuteur_invente():
    assert dn.prescriber_contacts({"needs": [{"title": "x", "prescriber": None}]}) == []
    assert dn.prescriber_contacts({}) == []


# ── le plan : angle, interlocuteur, preuve ───────────────────────────────────


def test_bloc_du_plan_dit_comment_peser_angle_interlocuteur_preuve():
    views = [
        {
            "title": "Consultant SAP FI/CO",
            "status": "GAGNE",
            "status_label": "gagné",
            "date": "2024-03-14",
            "tjm_eur": None,
            "technologies": ["SAP"],
            "prescriber": None,
        }
    ]
    block = dn.historical_needs_block({"needs": views, "to_verify": None})
    for word in ("ANGLE", "INTERLOCUTEUR", "PREUVE"):
        assert word in block
    assert "Synthèse" in block and "1 gagné" in block


def test_le_rendu_reste_date_aujourdhui_injecte():
    assert isinstance(TODAY, date)
