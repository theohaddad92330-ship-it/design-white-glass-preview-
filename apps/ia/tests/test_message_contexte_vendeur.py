"""#3752 — la génération de message relit le contexte vendeur ET les documents de l'espace.

Avant : `message.py` ne recevait que `profile_data` et ne faisait AUCUNE récupération
RAG ; le brouillon parlait avec la voix générique du modèle, pas celle de l'ESN.

Règles tenues ici :
* 3752.1 — positionnement + preuves du vendeur et documents de l'espace entrent dans le prompt ;
* 3752.2 — une preuve citée vient UNIQUEMENT des documents fournis, et la réponse nomme
  les sources réellement injectées (`knowledgeSources`) ;
* 3752.3 — mot interdit : une régénération max, sinon un avertissement NOMMÉ (`lexiconWarning`) ;
* 3752.4 — le CORPS des messages reçus ne sort jamais vers le modèle ;
* 3752.5 — sans document ET sans contexte vendeur : prompt byte-identique à celui d'avant ;
* 3752.6 — éval hors-ligne : 10 cas dorés, seuil 10/10 FIXÉ ICI avant l'implémentation.
"""

from __future__ import annotations

import re
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.prompts.bellum_outreach import build_user_prompt
from app.services import message_context

_CONTACT = {
    "full_name": "Sophie Durand",
    "title": "DSI",
    "decision_role": "Décideur",
    "entity": "Logis3PL",
    "account_id": "acc-1",
}
_ACCOUNT = {
    "company_name": "Logis3PL",
    "sector": "Logistique 3PL",
    "raw_analysis": {"recent_signals": [{"title": "Nouvel entrepôt"}]},
}
_VOICE_PROFILE = {
    "companyName": "exFabrica",
    "positioning": "Livré validé = facturé",
    "references": ["Migration WMS chez un 3PL européen, -30 % de délais"],
    "offerPortfolioContext": {"forbiddenTerms": ["synergie"], "preferredTerms": ["livré validé"]},
}
_DOC_BLOCK = "<rag_knowledge>\n- Cas client WMS : -30 % de délais de préparation\n</rag_knowledge>"
_SOURCES = [{"docId": "d1", "title": "Cas client WMS", "category": "proof", "origin": "uploaded"}]

_BASE = {
    "contact": _CONTACT,
    "raw_analysis": {},
    "profile": {"companyName": "Acme"},
    "recent_signals": [],
    "channel": "email",
    "context": "audit SRE",
    "company_name": "Logis3PL",
}


def _post(client: TestClient, *, profile=None, retrieval=(("", [])), claude_side_effect=None, tables=None):
    captured: dict = {"prompts": []}

    async def fake_claude(system_prompt, user_prompt, **_kwargs):
        captured["prompts"].append((system_prompt, user_prompt))
        return {"subject": "Suite", "body": "Bonjour Sophie, un mot sur votre entrepôt."}, None

    sb = MagicMock()
    if tables is not None:
        sb.table.side_effect = lambda name: tables.append(name) or MagicMock()
    with (
        patch("app.routers.message.get_supabase", return_value=sb),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
        patch("app.routers.message.fetch_last_loss", new_callable=AsyncMock, return_value=None),
        patch("app.routers.message.retrieve_message_knowledge", new_callable=AsyncMock, return_value=retrieval) as rk,
        patch("app.routers.message.call_claude", side_effect=claude_side_effect or fake_claude) as cc,
    ):
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "email",
                "context": "audit SRE",
                "profile_data": profile if profile is not None else {"companyName": "Acme"},
            },
        )
    captured["retrieval"] = rk
    captured["claude"] = cc
    return res, captured


# ── 3752.5 — byte-identique sans document ni contexte vendeur ───────────────────


def test_prompt_inchange_sans_voix_ni_documents() -> None:
    assert build_user_prompt(**_BASE) == build_user_prompt(**_BASE, seller_voice="", knowledge="")


def test_routeur_sans_document_ni_voix_garde_le_prompt_d_avant(client: TestClient) -> None:
    res, cap = _post(client)
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert "knowledgeSources" not in data
    assert "lexiconWarning" not in data
    _system, user = cap["prompts"][0]
    assert "DOCUMENTS DE L'ESN" not in user
    assert "VOIX DU VENDEUR" not in user
    assert len(cap["prompts"]) == 1


# ── 3752.1 / 3752.2 — voix, documents, source nommée ────────────────────────────


def test_le_prompt_porte_positionnement_preuve_et_documents(client: TestClient) -> None:
    res, cap = _post(client, profile=_VOICE_PROFILE, retrieval=(_DOC_BLOCK, _SOURCES))
    assert res.status_code == 200, res.text
    _system, user = cap["prompts"][0]
    assert "Livré validé = facturé" in user
    assert "Migration WMS chez un 3PL européen" in user
    assert "-30 % de délais de préparation" in user
    assert "UNIQUEMENT" in user  # la preuve citée vient seulement des documents fournis
    assert res.json()["data"]["knowledgeSources"] == [
        {"docId": "d1", "title": "Cas client WMS", "category": "proof", "origin": "uploaded"}
    ]


def test_la_requete_de_recherche_porte_role_secteur_et_objectif(client: TestClient) -> None:
    _res, cap = _post(client, profile=_VOICE_PROFILE, retrieval=(_DOC_BLOCK, _SOURCES))
    query = cap["retrieval"].await_args.args[0]
    assert "DSI" in query
    assert "Logistique 3PL" in query
    assert "audit SRE" in query


def test_la_recherche_est_scopee_a_l_utilisateur_et_au_compte(client: TestClient) -> None:
    _res, cap = _post(client, retrieval=(_DOC_BLOCK, _SOURCES))
    kwargs = cap["retrieval"].await_args.kwargs
    assert cap["retrieval"].await_args.args[1] == "u1"
    assert kwargs["account_id"] == "acc-1"


def test_sans_voix_mais_avec_documents_le_message_cite_ses_sources(client: TestClient) -> None:
    res, cap = _post(client, retrieval=(_DOC_BLOCK, _SOURCES))
    assert res.json()["data"]["knowledgeSources"][0]["title"] == "Cas client WMS"
    assert "Cas client WMS" in cap["prompts"][0][1]


# ── 3752.4 — le corps des messages reçus ne sort jamais ─────────────────────────


# c94 (#2877 GLOBAL, Louis 11/10/2026) — la génération lit les COMPTES mutualisés
# de l'apprentissage des messages (signal, nombre, espaces) : une table d'agrégats,
# jamais un corps. Elle est la SEULE table « message » admise, et seulement pour
# ces trois colonnes ; toute autre table de messages reste refusée.
_SHARED_LEARNING_TABLE = "shared_message_learning_aggregates"
_SHARED_LEARNING_COLUMNS = "signal, count, contributing_workspaces"


def test_aucune_table_de_messages_n_est_lue_pour_la_generation(client: TestClient) -> None:
    tables: list[str] = []
    _post(client, profile=_VOICE_PROFILE, retrieval=(_DOC_BLOCK, _SOURCES), tables=tables)
    assert not [t for t in tables if "message" in t and t != _SHARED_LEARNING_TABLE], tables


def test_les_agregats_d_apprentissage_ne_lisent_que_des_comptes() -> None:
    from app.services import shared_message_learning

    source = Path(shared_message_learning.__file__).read_text(encoding="utf-8")
    assert f'_TABLE = "{_SHARED_LEARNING_TABLE}"' in source
    selects = re.findall(r'\.select\("([^"]*)"\)', source)
    assert _SHARED_LEARNING_COLUMNS in selects, selects
    for columns in selects:
        assert "body" not in columns and "content" not in columns, columns


def test_le_module_de_contexte_ne_lit_aucun_corps_de_message() -> None:
    source = Path(message_context.__file__).read_text(encoding="utf-8")
    for needle in ('"messages"', "'messages'", "contact_messages", "inbound", "received_messages"):
        assert needle not in source, needle


# ── 3752.3 — contrôle du champ lexical après génération ─────────────────────────


def _claude_sequence(bodies: list[str]):
    calls: list[tuple[str, str]] = []

    async def fake(system_prompt, user_prompt, **_kwargs):
        calls.append((system_prompt, user_prompt))
        body = bodies[min(len(calls) - 1, len(bodies) - 1)]
        return {"subject": "Suite", "body": body}, None

    return fake, calls


def test_mot_interdit_une_regeneration_puis_message_propre(client: TestClient) -> None:
    fake, calls = _claude_sequence(["Une belle synergie à explorer.", "Un livré validé à explorer."])
    res, _cap = _post(client, profile=_VOICE_PROFILE, claude_side_effect=fake)
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert len(calls) == 2
    assert "synergie" in calls[1][1].lower()  # la régénération NOMME le mot à retirer
    assert "synergie" not in data["body"].lower()
    assert "lexiconWarning" not in data


def test_mot_interdit_persistant_avertissement_nomme_sans_reecriture(client: TestClient) -> None:
    fake, calls = _claude_sequence(["Une belle synergie à explorer."])
    res, _cap = _post(client, profile=_VOICE_PROFILE, claude_side_effect=fake)
    data = res.json()["data"]
    assert len(calls) == 2  # UNE régénération max
    assert data["body"] == "Une belle synergie à explorer."  # jamais réécrit en silence
    assert data["lexiconWarning"] == {"terms": ["synergie"]}


def test_sans_mot_interdit_un_seul_appel(client: TestClient) -> None:
    fake, calls = _claude_sequence(["Bonjour, un mot sur votre entrepôt."])
    _post(client, profile=_VOICE_PROFILE, claude_side_effect=fake)
    assert len(calls) == 1


def test_lexicon_violations_mot_entier_sans_casse() -> None:
    profile = {"offerPortfolioContext": {"forbiddenTerms": ["ESN"]}}
    assert message_context.lexicon_violations("Notre ESN vous aide", profile) == ["ESN"]
    assert message_context.lexicon_violations("Les besoins de l'équipe", profile) == []
    assert message_context.lexicon_violations("rien", {}) == []


# ── 3752.6 — éval hors-ligne, 10 cas dorés, seuil FIXÉ avant l'implémentation ───

EVAL_THRESHOLD = 10  # 10/10 — fixé avant le code, jamais relevé à la baisse pour passer.

_GOLDEN = [
    # (positioning, reference, doc title, doc extract, role, sector)
    ("Livré validé = facturé", "WMS chez un 3PL", "Cas WMS", "-30 % de délais", "DSI", "Logistique"),
    ("Forfait au résultat", "Refonte portail banque", "Cas Portail", "NPS +12", "DSI", "Banque"),
    ("Équipes seniors uniquement", "SRE assurance", "Cas SRE", "99,95 % de dispo", "CTO", "Assurance"),
    ("Pas de sous-traitance en cascade", "Data lake énergie", "Cas Data", "x3 de débit", "DSI", "Énergie"),
    ("Engagement de transfert de compétences", "Cloud retail", "Cas Cloud", "-18 % de coûts", "CIO", "Retail"),
    ("Astreinte incluse", "Support industrie", "Cas Support", "MTTR divisé par 2", "DSI", "Industrie"),
    ("Pilotage par la valeur", "ERP santé", "Cas ERP", "go-live en 6 mois", "DAF", "Santé"),
    ("Cybersécurité by design", "SOC télécom", "Cas SOC", "-40 % d'incidents", "RSSI", "Télécom"),
    ("Agilité à l'échelle", "Mobile transport", "Cas Mobile", "4,6/5 en store", "CPO", "Transport"),
    ("Recrutement sous 10 jours", "Staffing défense", "Cas Staffing", "12 profils en 3 semaines", "DRH", "Défense"),
]


def _golden_case_passes(case: tuple[str, ...]) -> bool:
    positioning, reference, doc_title, doc_extract, role, sector = case
    profile = {"companyName": "exFabrica", "positioning": positioning, "references": [reference]}
    voice = message_context.seller_voice_block(profile)
    fenced = f"<rag_knowledge>\n- {doc_title} : {doc_extract}\n</rag_knowledge>"
    knowledge = message_context.knowledge_block(fenced)
    prompt = build_user_prompt(**_BASE, seller_voice=voice, knowledge=knowledge)
    query = message_context.retrieval_query(
        {"title": role}, {"sector": sector}, {"objective": "premier_contact"}, {}, "audit"
    )
    return (
        positioning in prompt  # le positionnement
        and reference in prompt  # la preuve fournie par l'ESN
        and doc_title in prompt  # la source documentaire
        and doc_extract in prompt
        and "UNIQUEMENT" in prompt  # la règle : preuve = documents fournis seulement
        and role in query
        and sector in query  # la requête porte rôle + secteur
    )


def test_eval_hors_ligne_dix_cas_dores() -> None:
    assert len(_GOLDEN) == 10
    score = sum(1 for case in _GOLDEN if _golden_case_passes(case))
    assert score >= EVAL_THRESHOLD, f"{score}/{len(_GOLDEN)}"


@pytest.mark.parametrize("case", _GOLDEN, ids=[c[2] for c in _GOLDEN])
def test_cas_dore_individuel(case: tuple[str, ...]) -> None:
    assert _golden_case_passes(case)
