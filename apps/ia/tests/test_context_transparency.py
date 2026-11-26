"""Transparence du contexte du chatbot — l'objet structuré « contexte actif /
sources / non consulté » qui accompagne chaque réponse (P0 démo)."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.models.chat import ChatRequest
from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.context_transparency import build_context_transparency
from app.services import rag_service


def _terminal_event(text: str) -> dict:
    """`/chat/message` diffuse en SSE (LOT STREAM) — le dernier événement porte
    la MÊME forme que l'ancien corps JSON de cet endpoint."""
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def _build(**overrides):
    base = dict(
        profile_data={"esn_name": "Skaizen"},
        account_data={"company_name": "SNCF"},
        contacts_summary="Alice - DSI - decideur\nBob - Archi - influenceur",
        plan_summary='{"strategy": "approche par la cyber"}',
        knowledge_docs=[{"title": "Playbook SNCF", "content": "budget cyber voté"}],
        accounts_summary="",
    )
    base.update(overrides)
    return build_context_transparency(**base)


def test_active_context_reflects_what_was_provided():
    ctx = _build()
    active = ctx["active"]
    assert active["profile"] == {"present": True, "name": "Skaizen"}
    assert active["account"] == {"present": True, "name": "SNCF"}
    assert active["contacts_count"] == 2
    assert active["plan"]["present"] is True


def test_sources_list_the_retrieved_docs_by_title():
    ctx = _build()
    # #1954.21/#1954.31 — `excerpt` porte désormais un extrait RÉEL du contenu
    # injecté, pas seulement le titre (`test_rag_source_excerpt.py`).
    assert ctx["sources"] == [{"kind": "knowledge_doc", "label": "Playbook SNCF", "excerpt": "budget cyber voté"}]


def test_sources_skip_empty_and_dedup():
    docs = [
        {"title": "A", "content": "utile"},
        {"title": "A", "content": "doublon même titre"},
        {"title": "Vide", "content": "   "},
    ]
    ctx = _build(knowledge_docs=docs)
    assert ctx["sources"] == [{"kind": "knowledge_doc", "label": "A", "excerpt": "utile"}]


def test_memory_count_counts_what_the_prompt_reads_not_an_object_repr():
    """#1962.8 — `pinned_facts` porte désormais des OBJETS (nature + origine).
    `str(item).strip()` d'un objet n'est jamais vide (c'est sa représentation) :
    un élément sans texte, que `_format_memory` écarte du prompt, était compté
    quand même dans « mémoire : N ». Le compte doit dire ce que le modèle LIT."""
    from app.models.chat import PinnedMemoryItem

    ctx = _build(
        pinned_facts=[
            PinnedMemoryItem(fact="Budget IT voté", kind="fact", origin="manual"),
            PinnedMemoryItem(fact="   ", kind="correction", origin="manual"),
            {"fact": "", "kind": "fact", "origin": "copilot"},
            "  ",
            "Préférence : ton direct",
        ]
    )
    assert ctx["active"]["memory"]["pinned_facts"] == 2


def test_source_carries_the_real_document_date():
    # Fraîcheur par source (restitution V2 §13) : un document de 2024 et un signal
    # d'hier ne doivent plus s'afficher à l'identique. La date vient du RÉEL
    # (`created_at` du document), jamais d'une estimation.
    docs = [{"title": "Playbook 2024", "content": "utile", "created_at": "2024-03-12T10:00:00+00:00"}]
    ctx = _build(knowledge_docs=docs)
    assert ctx["sources"][0]["as_of"] == "2024-03-12T10:00:00+00:00"


def test_source_without_a_known_date_shows_no_freshness_at_all():
    # Pas d'à-peu-près : sans date réelle (absente ou illisible), la clé `as_of`
    # n'existe pas — le panneau n'affichera aucune fraîcheur pour cette source.
    ctx = _build(knowledge_docs=[{"title": "Sans date", "content": "utile"}])
    assert "as_of" not in ctx["sources"][0]
    ctx = _build(knowledge_docs=[{"title": "Cassée", "content": "utile", "created_at": "hier"}])
    assert "as_of" not in ctx["sources"][0]


def test_account_carries_its_last_analysis_date():
    # Les signaux d'un compte datent de sa dernière analyse : c'est `updated_at`
    # (déjà la référence de fraîcheur côté API) qui fait foi.
    ctx = _build(account_data={"company_name": "SNCF", "updated_at": "2026-07-21T08:00:00Z"})
    assert ctx["active"]["account"]["as_of"] == "2026-07-21T08:00:00+00:00"
    # Sans date connue, la forme reste celle d'avant cette PR.
    assert _build()["active"]["account"] == {"present": True, "name": "SNCF"}


def test_crossed_crm_is_dated_from_the_moment_it_was_queried():
    # Le read-back CRM a lieu PENDANT cette réponse : sa fraîcheur est l'instant
    # de la requête — une vraie date, pas une approximation.
    ctx = _build(crm_connected=True, crm_provider="hubspot", crm_presence="3 contacts")
    crm = next(s for s in ctx["sources"] if s["kind"] == "crm")
    assert crm["as_of"].startswith(datetime.now(UTC).strftime("%Y-%m-%d"))


def test_2264_crm_source_names_its_scope_confidence_and_relation_to_the_account():
    """#2264.17/.18/.20 (épopée #2921) — le contrat de vérité demande, pour
    chaque fait structurant, un PÉRIMÈTRE, une CONFIANCE et une RELATION AVEC
    L'OBJET. Le read-back CRM est le premier fait qui les porte réellement :
    il décrit CE compte (jamais un secteur), une confiance FORTE (lecture live
    du CRM pendant cette réponse, pas une estimation), et il se relie
    nommément au compte actif — jamais un « scope » générique deviné."""
    ctx = _build(
        crm_connected=True,
        crm_provider="hubspot",
        crm_presence="3 contacts",
        account_data={"company_name": "SNCF"},
    )
    crm = next(s for s in ctx["sources"] if s["kind"] == "crm")
    assert crm["scope"] == "ce compte"
    assert crm["confidence"] == "high"
    assert crm["relatesTo"] == "SNCF"


def test_2264_22_crm_source_names_its_next_verification():
    """#2264.22 (épopée #2921) — une VÉRIFICATION SUIVANTE nommée, distincte
    d'une action suivante générique : le CRM est recroisé à chaque question,
    jamais mis en cache d'un tour à l'autre."""
    ctx = _build(crm_connected=True, crm_provider="hubspot", crm_presence="3 contacts")
    crm = next(s for s in ctx["sources"] if s["kind"] == "crm")
    assert crm["nextVerification"] == "recroisé à la prochaine question sur ce compte"
    # Sans compte actif, rien à relier : le champ ne se DEVINE pas.
    ctx_no_account = _build(
        crm_connected=True,
        crm_provider="hubspot",
        crm_presence="3 contacts",
        account_data={},
    )
    crm_no_account = next(s for s in ctx_no_account["sources"] if s["kind"] == "crm")
    assert "relatesTo" not in crm_no_account


def test_not_consulted_actions_point_only_to_screens_that_exist():
    # « Cliquer sur un élément manquant pour le connecter » (V2 §13) : une action
    # n'est proposée QUE là où un écran existe (intégrations, connaissances,
    # nouvelle analyse). LinkedIn n'a pas d'écran → aucune action.
    ctx = _build(account_data={}, accounts_summary="", knowledge_docs=[])
    actions = {a["label"]: a["action"] for a in ctx["not_consulted_actions"]}
    assert actions["Aucun CRM connecté"] == "connect_crm"
    assert any(v == "add_knowledge" for v in actions.values())
    assert any(v == "analyse_account" for v in actions.values())
    assert all("Réseaux professionnels" not in label for label in actions)
    # Chaque action référence un libellé RÉELLEMENT présent dans la liste.
    assert set(actions) <= set(ctx["not_consulted"])


def test_connected_crm_offers_no_connect_action():
    # Déjà connecté : rien à connecter, on ne propose pas une action inutile.
    ctx = _build(crm_connected=True, crm_provider="salesforce")
    assert all(a["action"] != "connect_crm" for a in ctx["not_consulted_actions"])


def test_not_consulted_says_no_crm_connected_by_default():
    # crm_connected defaults to False → the panel must state it plainly so a beta
    # tester never believes Bellum crossed a CRM when it did not. The line names
    # the CAPABILITY, never the vendor (addendum final p12).
    ctx = _build()
    joined = " | ".join(ctx["not_consulted"])
    assert "Aucun CRM connecté" in joined
    assert any("Réseaux professionnels" in x for x in ctx["not_consulted"])


def test_not_consulted_when_crm_connected_says_not_crossed_not_absent():
    ctx = _build(crm_connected=True, crm_provider="salesforce")
    joined = " | ".join(ctx["not_consulted"])
    # Connected → we don't claim it's absent, but we're honest it wasn't crossed.
    assert "Votre CRM connecté" in joined and "non croisé" in joined
    assert "non connecté" not in joined


def test_excluded_crm_is_named_excluded_not_not_crossed_or_disconnected():
    """#3708.exclusion (recette prod 08/10) — un CRM exclu pour ce fil (« Outils
    et sources ») reste CONNECTÉ (rien n'a été déconnecté) : le panneau ne doit
    jamais le confondre avec « non croisé » (laisse croire qu'on a regardé) ni
    avec « non connecté »/« indisponible » (laisse croire qu'il faut rétablir
    l'accès) — c'est un CHOIX réversible, nommé comme tel."""
    ctx = _build(crm_connected=True, crm_provider="hubspot", excluded_families=["crm"])
    joined = " | ".join(ctx["not_consulted"])
    assert "exclu" in joined
    assert "non croisé" not in joined
    assert "non connecté" not in joined
    assert "indisponible" not in joined
    # Jamais l'éditeur — seulement la capacité générique.
    assert "hubspot" not in joined.lower() and "HubSpot" not in joined
    assert "Votre CRM" in joined
    # Rien à connecter : le choix se change depuis « Outils et sources », pas ici.
    assert all(a["action"] != "connect_crm" for a in ctx["not_consulted_actions"])


def test_excluded_crm_label_is_english_on_an_english_interface():
    ctx = _build(crm_connected=True, crm_provider="hubspot", excluded_families=["crm"], language="en")
    joined = " | ".join(ctx["not_consulted"])
    assert "excluded by you" in joined
    assert "not cross-checked" not in joined and "not connected" not in joined


def test_excluded_crm_wins_over_unavailable_and_crossed():
    # Un choix explicite prime sur un état de connexion ambigu — l'exclusion
    # retire déjà l'outil du catalogue du tour, donc `crm_crossed`/`crm_unavailable`
    # ne devraient de toute façon jamais être vrais en même temps en pratique,
    # mais le panneau reste honnête si un appelant les transmet quand même.
    ctx = _build(crm_connected=True, crm_provider="hubspot", crm_unavailable=True, excluded_families=["crm"])
    joined = " | ".join(ctx["not_consulted"])
    assert "exclu" in joined
    assert "indisponible" not in joined


def test_crm_presence_crossed_moves_crm_from_not_consulted_to_sources():
    # The presence read-back really queried the CRM for this account → it is a
    # USED source now, not a "connected but not crossed" caveat.
    ctx = _build(
        crm_connected=True,
        crm_provider="hubspot",
        crm_presence="Votre CRM consulté pour « SNCF » :\n- 3 contact(s) déjà dans votre CRM",
    )
    crm = next(s for s in ctx["sources"] if s["kind"] == "crm")
    assert crm["label"] == "Votre CRM — présence du compte croisée"
    assert all("CRM" not in x for x in ctx["not_consulted"])


def test_not_consulted_says_unavailable_when_the_read_failed_not_just_not_crossed():
    """#1915.11 — « panne de source → indisponible, pas zéro ». Un CRM connecté
    dont la lecture a ÉCHOUÉ (panne réseau, 500 du fournisseur) ne doit pas se
    lire comme un CRM qu'on n'a simplement pas croisé cette fois : les deux
    causes sont différentes (« on n'a rien trouvé » contre « on n'a pas pu
    vérifier »), et la doctrine « non mesuré n'est jamais 0 » s'applique à ce
    cran-là aussi — un beta testeur qui lit « non croisé » peut croire que
    Bellum a regardé et n'a rien vu, alors que la lecture n'a jamais abouti."""
    ctx = _build(crm_connected=True, crm_provider="salesforce", crm_unavailable=True)
    joined = " | ".join(ctx["not_consulted"])
    assert "indisponible" in joined
    assert "non croisé" not in joined
    assert "non connecté" not in joined


def test_crm_unavailable_without_a_connection_is_a_no_op():
    """Témoin : le drapeau ne doit rien changer quand le CRM n'est même pas
    connecté — la ligne « Aucun CRM connecté » reste celle qui prime."""
    ctx = _build(crm_connected=False, crm_unavailable=True)
    joined = " | ".join(ctx["not_consulted"])
    assert "Aucun CRM connecté" in joined
    assert "indisponible" not in joined


def test_crm_unavailable_defaults_to_false_byte_identical():
    """La garde qui sait dire NON : un appelant qui ne connaît pas ce
    paramètre obtient EXACTEMENT le panneau d'avant."""
    with_default = _build(crm_connected=True, crm_provider="salesforce")
    explicit_false = _build(crm_connected=True, crm_provider="salesforce", crm_unavailable=False)
    assert with_default == explicit_false


def test_crm_presence_without_connection_never_claims_a_crossing():
    # Defensive honesty: presence text without a real connection must NOT flip the
    # panel — no phantom source, the "non connecté" line stays.
    ctx = _build(crm_connected=False, crm_presence="3 contacts…")
    assert all(s["kind"] != "crm" for s in ctx["sources"])
    joined = " | ".join(ctx["not_consulted"])
    assert "Aucun CRM connecté" in joined


def test_crm_crossed_does_not_hide_the_empty_knowledge_base_line():
    # `has_sources` must stay knowledge-doc-only: a crossed CRM is not a reason to
    # stop flagging that the KB had nothing relevant.
    ctx = _build(knowledge_docs=[], crm_connected=True, crm_provider="hubspot", crm_presence="1 contact")
    assert any("aucun document" in x for x in ctx["not_consulted"])


# #4150 — « Qualification complémentaire nécessaire » ne doit jamais s'allumer
# sur une absence structurelle (réseaux pro, signaux archivés) ni sur un CRM
# connecté simplement non croisé : seule une ligne qui porte une action réelle
# (connecter CRM/messagerie, analyser le compte) ou une panne (CRM
# indisponible) doit l'allumer. `not_consulted` continue de porter TOUTES les
# lignes (le panneau « Voir la source » ne perd rien) : seul `qualification_needed`
# change.
def test_4150_everything_connected_and_crossed_has_no_qualification_needed():
    ctx = _build(
        crm_connected=True,
        crm_provider="hubspot",
        crm_presence="Votre CRM consulté pour « SNCF » :\n- 3 contact(s) déjà dans votre CRM",
        email_connected=True,
    )
    # Les absences structurelles restent dans le panneau...
    assert any("Réseaux professionnels" in x for x in ctx["not_consulted"])
    assert any("Signaux d'achat archivés" in x for x in ctx["not_consulted"])
    # ...mais ne déclenchent pas le badge.
    assert ctx["qualification_needed"] is False


def test_4150_crm_connected_but_not_crossed_has_no_qualification_needed():
    # A.2 — un CRM CONNECTÉ non croisé n'est pas un manque, rien à faire.
    ctx = _build(crm_connected=True, crm_provider="hubspot", email_connected=True)
    assert any("non croisé" in x for x in ctx["not_consulted"])
    assert ctx["qualification_needed"] is False


def test_4150_no_crm_connected_has_qualification_needed():
    # Une action réelle existe (se connecter) : le badge doit s'allumer.
    ctx = _build(email_connected=True)
    assert ctx["qualification_needed"] is True


def test_4150_crm_unavailable_has_qualification_needed_even_if_otherwise_connected():
    # A.2/A.3 — une PANNE de lecture CRM déclenche le badge, même quand tout le
    # reste (messagerie, compte, documents) est par ailleurs disponible.
    ctx = _build(crm_connected=True, crm_provider="salesforce", crm_unavailable=True, email_connected=True)
    assert ctx["qualification_needed"] is True


def test_4150_missing_knowledge_base_alone_has_no_qualification_needed():
    # « Aucun document pertinent trouvé » n'est pas dans la liste d'actions
    # nommée par #4150.3 (CRM, messagerie, compte) : seule, elle ne doit pas
    # faire croire qu'il manque quelque chose à régler.
    ctx = _build(
        crm_connected=True,
        crm_provider="hubspot",
        crm_presence="1 contact",
        email_connected=True,
        knowledge_docs=[],
    )
    assert any("aucun document" in x for x in ctx["not_consulted"])
    assert ctx["qualification_needed"] is False


# #2145.23 (via #2925) — la messagerie suit EXACTEMENT le même patron que le
# CRM ci-dessus (Aucun X connecté → action `connect_X`) : le signal
# `email_connected` est le SEUL réel déjà mesuré par l'appelant
# (`req.connected_families`, `chat.py`) — jamais un état inventé pour
# l'occasion.
def test_not_consulted_says_no_mailbox_connected_by_default():
    ctx = _build()
    joined = " | ".join(ctx["not_consulted"])
    assert "Aucune messagerie connectée" in joined


def test_mailbox_not_connected_offers_a_connect_action():
    ctx = _build()
    actions = {a["label"]: a["action"] for a in ctx["not_consulted_actions"]}
    assert actions["Aucune messagerie connectée"] == "connect_email"


def test_connected_mailbox_offers_no_connect_action_and_no_absence_line():
    ctx = _build(email_connected=True)
    joined = " | ".join(ctx["not_consulted"])
    assert "Aucune messagerie connectée" not in joined
    assert all(a["action"] != "connect_email" for a in ctx["not_consulted_actions"])


def test_mailbox_not_connected_label_is_english_on_an_english_interface():
    ctx = _build(language="en")
    joined = " | ".join(ctx["not_consulted"])
    assert "No mailbox connected" in joined
    assert "Aucune messagerie connectée" not in joined


def test_not_consulted_flags_missing_account_and_empty_kb():
    ctx = _build(account_data={}, accounts_summary="", knowledge_docs=[])
    joined = " | ".join(ctx["not_consulted"])
    assert "Aucun compte" in joined
    assert "aucun document" in joined


# #1958.10 — les libellés du panneau « ce qui n'a pas été consulté » suivent la
# langue de l'INTERFACE (#1958.8), jamais le français en dur. `context_transparency`
# ne connaissait aucun paramètre `language` : une interface anglaise lisait quand
# même « Aucun CRM connecté », rendu brut par `ContextDisclosure.tsx` sans t().
def test_not_consulted_labels_are_english_on_an_english_interface():
    ctx = _build(language="en")
    joined = " | ".join(ctx["not_consulted"])
    assert "No CRM connected" in joined
    assert "Professional networks not queried" in joined
    assert "Archived buying signals not included" in joined
    assert "Aucun CRM connecté" not in joined


def test_not_consulted_missing_account_and_kb_are_english_on_an_english_interface():
    ctx = _build(account_data={}, accounts_summary="", knowledge_docs=[], language="en")
    joined = " | ".join(ctx["not_consulted"])
    assert "No account analysed linked to this conversation" in joined
    assert "Knowledge base: no relevant document found" in joined


def test_crm_connected_not_crossed_label_is_english_on_an_english_interface():
    ctx = _build(crm_connected=True, crm_provider="salesforce", language="en")
    joined = " | ".join(ctx["not_consulted"])
    assert "Your CRM connected — not cross-checked in this reply" in joined
    assert "non croisé" not in joined


def test_crm_unavailable_label_is_english_on_an_english_interface():
    ctx = _build(crm_connected=True, crm_provider="salesforce", crm_unavailable=True, language="en")
    joined = " | ".join(ctx["not_consulted"])
    assert "Your CRM connected — unavailable for this reply" in joined


def test_crm_crossed_source_label_is_english_on_an_english_interface():
    ctx = _build(
        crm_connected=True,
        crm_provider="hubspot",
        crm_presence="1 contact",
        language="en",
    )
    crm = next(s for s in ctx["sources"] if s["kind"] == "crm")
    assert crm["label"] == "Your CRM — account presence cross-checked"


def test_copilot_tools_cut_notice_is_english_on_an_english_interface():
    ctx = _build(copilot_tools_enabled=False, language="en")
    joined = " | ".join(ctx["not_consulted"])
    assert "temporarily paused" in joined
    assert "momentanément coupées" not in joined


def test_context_transparency_default_language_is_byte_identical_to_before():
    # Témoin : aucun appelant qui ignore `language` ne doit rien voir changer.
    with_default = _build()
    explicit_french = _build(language="fr")
    assert with_default == explicit_french


def test_prompt_surfaces_not_consulted_as_a_guardrail():
    # The advisor prompt renders the not-consulted list so the model can't claim a
    # source it never received.
    sys = build_system_prompt({}, {}, "", "", "", not_consulted=["Aucun CRM connecté"])
    assert "SOURCES NON DISPONIBLES" in sys
    assert "Aucun CRM connecté" in sys
    # Absent → no dangling header.
    assert "SOURCES NON DISPONIBLES" not in build_system_prompt({}, {}, "", "")


def test_prompt_renders_the_crm_presence_block_only_when_provided():
    presence = "Votre CRM consulté pour « SNCF » :\n- 3 contact(s) déjà dans votre CRM chez ce groupe"
    sys = build_system_prompt({}, {}, "", "", crm_presence=presence)
    assert "PRÉSENCE CRM" in sys
    assert "3 contact(s) déjà dans votre CRM chez ce groupe" in sys
    # No presence → no dangling header (and the prompt is byte-identical to before).
    assert "PRÉSENCE CRM" not in build_system_prompt({}, {}, "", "")


async def test_retrieve_knowledge_docs_degrades_to_empty(monkeypatch):
    async def _boom(*a, **k):
        raise RuntimeError("db down")

    monkeypatch.setattr(rag_service, "query", _boom)
    assert await rag_service.retrieve_knowledge_docs("q", "user-1") == []
    # No user / empty query → no backend call, empty list.
    assert await rag_service.retrieve_knowledge_docs("q", "") == []


def test_chat_endpoint_returns_context_object(client, monkeypatch):
    async def _call(system, user, **k):
        return ("réponse", None)

    async def _retrieve(*a, **k):
        return []

    # Les outils sont ON par défaut : le chemin nominal passe par l'orchestrateur.
    async def _orchestrate(system, user, **k):
        return ("réponse", [])

    monkeypatch.setattr("app.routers.chat.call_claude", _call)
    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _orchestrate)
    monkeypatch.setattr(rag_service, "retrieve_knowledge_docs", _retrieve)
    res = client.post(
        "/chat/message",
        json={"message": "salut", "user_id": "u", "profile_data": {"esn_name": "Skaizen"}},
    )
    assert res.status_code == 200
    ctx = _terminal_event(res.text)["data"]["context"]
    assert ctx["active"]["profile"] == {"present": True, "name": "Skaizen"}
    assert any("Aucun CRM connecté" in x for x in ctx["not_consulted"])


# ── Signaux comptés (restitution V2 §13) ────────────────────────────────────
#
# La phrase promise par le rapport est « cette réponse utilise votre profil,
# 2 comptes, 3 signaux et 1 document interne ». Les signaux du dossier partaient
# bien dans le prompt mais n'étaient comptés nulle part : la phrase exacte était
# irreproductible. On compte ce qui a RÉELLEMENT été fourni, jamais une estimation.


def test_signals_of_the_active_account_are_counted():
    ctx = _build(
        account_data={
            "company_name": "SNCF",
            "raw_analysis": {
                "recent_signals": [
                    {"title": "Nomination DSI", "date": "2026-07-01"},
                    {"title": "Appel d'offres cloud", "date": "2026-06-12"},
                ]
            },
        }
    )
    assert ctx["active"]["signals_count"] == 2


def test_camel_case_shape_is_counted_too():
    """Le pipeline écrit `recentSignals`, les anciens dossiers `recent_signals`."""
    ctx = _build(account_data={"company_name": "SNCF", "raw_analysis": {"recentSignals": [{"title": "Levée"}]}})
    assert ctx["active"]["signals_count"] == 1


def test_a_dossier_without_signals_counts_zero_not_a_guess():
    assert _build()["active"]["signals_count"] == 0
    assert _build(account_data={"company_name": "SNCF", "raw_analysis": {"recent_signals": "pas une liste"}})["active"][
        "signals_count"
    ] == 0


def test_no_account_means_no_signal():
    assert _build(account_data=None)["active"]["signals_count"] == 0


def test_incomplete_5p_surfaces_as_a_discreet_method_rule_source():
    """BEL-SC-226 (#3255), section TRANSPARENCE — « Méthode utilisée : … / 5P
    incomplet », discrètement, jamais un document complet. Réutilise le canal
    `sources`/`method_rule` déjà rendu par l'écran (aucune UI neuve) plutôt
    qu'un champ parallèle — GA-26, un réglage vit à un seul endroit."""
    ctx = _build(
        account_data={
            "company_name": "SNCF",
            "strategy5p": {"readiness": "INCOMPLETE", "next_action_dimension": "perimeter"},
        }
    )
    method_labels = [s["label"] for s in ctx["sources"] if s["kind"] == "method_rule"]
    assert method_labels == ["5P incomplet (périmètre à cadrer en premier)"]


def test_ready_5p_adds_no_source_nothing_to_signal():
    ctx = _build(
        account_data={
            "company_name": "SNCF",
            "strategy5p": {"readiness": "READY_TO_ACT", "next_action_dimension": None},
        }
    )
    assert [s for s in ctx["sources"] if s["kind"] == "method_rule"] == []


def test_no_strategy5p_key_adds_no_source_client_ancien():
    ctx = _build(account_data={"company_name": "SNCF"})
    assert [s for s in ctx["sources"] if s["kind"] == "method_rule"] == []


def test_the_request_model_DECLARES_crm_unavailable() -> None:
    """#1915.11 — ⚠️ pydantic ignore une clé inconnue SANS ERREUR. Un
    `crm_unavailable` non déclaré serait envoyé par l'API, transporté, et
    jamais lu par `build_context_transparency` — le défaut « un champ ajouté
    au panneau, effacé en aval ». Ce test est le seul endroit qui le rend
    impossible."""
    assert ChatRequest(message="x", user_id="u1", crm_unavailable=True).crm_unavailable is True
    # Absent = comportement d'avant ce champ, jamais une panne devinée.
    assert ChatRequest(message="x", user_id="u1").crm_unavailable is False


def test_closed_account_opening_surfaces_as_a_method_rule_source_3285():
    """#3285 — `relationship_state` posé par l'API sur account_data → « ouverture
    de compte fermé », même canal `method_rule` que le signal 5P (GA-26)."""
    ctx = _build(account_data={"company_name": "SNCF", "relationship_state": "dormant"})
    labels = [s["label"] for s in ctx["sources"] if s["kind"] == "method_rule"]
    assert labels == ["ouverture de compte fermé"]


def test_closed_account_opening_and_incomplete_5p_both_named_3285():
    ctx = _build(
        account_data={
            "company_name": "SNCF",
            "relationship_state": "ancien_client",
            "strategy5p": {"readiness": "INCOMPLETE", "next_action_dimension": "proof"},
        }
    )
    labels = [s["label"] for s in ctx["sources"] if s["kind"] == "method_rule"]
    assert labels == ["ouverture de compte fermé", "5P incomplet (preuve à cadrer en premier)"]


def test_cold_account_adds_no_opening_source_3285():
    ctx = _build(account_data={"company_name": "SNCF", "relationship_state": "froid"})
    assert [s for s in ctx["sources"] if s["kind"] == "method_rule"] == []


# W-G (13/10) — recette prod : le bloc « FAITS DU COMPTE » partait au modèle mais
# la transparence du tour ne le listait pas (« Plan d'action » oui, faits non).
def test_account_facts_block_is_listed_in_the_turn_transparency():
    ctx = _build(
        account_facts_context=(
            "- [2026-06-13 · il y a 4 mois] Affaire perdue : Refonte SI RH\n"
            "- [2026-08-13 · il y a 2 mois] Signal : Nouveau DSI nommé"
        )
    )
    assert ctx["active"]["account_facts"] == {"present": True, "count": 2}


def test_no_account_facts_means_no_key_never_an_empty_block():
    for empty in (None, "", "   \n "):
        assert "account_facts" not in _build(account_facts_context=empty)["active"]
    assert "account_facts" not in _build()["active"]


# #4071.3 — recette R6 (14/10) : SNCF RESEAU — Laura cite la recherche enregistrée, les
# listes de cibles et le résumé du fil, mais le panneau « Voir la source » n'en montre
# aucune ligne (0 recherche/liste/CR). Même discipline que `account_facts` ci-dessus.
def test_workspace_recall_block_is_listed_in_the_turn_transparency():
    ctx = _build(
        workspace_recall_context=(
            "- [2026-10-13 · il y a 1 jour] Recherche enregistrée : ESN cyber IDF\n"
            "- [2026-09-13 · il y a 30 jours] Liste de cibles : Campagne rentrée\n"
            "- [2026-07-01 · il y a 3 mois] Conversation passée : On a parlé de Renault."
        )
    )
    assert ctx["active"]["workspace_recall"] == {"present": True, "count": 3}


def test_no_workspace_recall_means_no_key_never_an_empty_block():
    for empty in (None, "", "   \n "):
        assert "workspace_recall" not in _build(workspace_recall_context=empty)["active"]
    assert "workspace_recall" not in _build()["active"]


# #4051.6 — « en tenant compte de mes contacts » : Laura utilise la base importée, ou ANNONCE qu'elle manque.
def test_own_contacts_requested_without_imported_base_is_announced():
    context = _build(contacts_summary="", accounts_summary="", own_contacts_requested=True)
    assert any("Base de contacts importée" in item for item in context["not_consulted"])


def test_own_contacts_requested_with_a_base_announces_nothing():
    context = _build(own_contacts_requested=True)
    assert not any("Base de contacts importée" in item for item in context["not_consulted"])


def test_own_contacts_not_requested_stays_byte_identical():
    context = _build(contacts_summary="", accounts_summary="")
    assert not any("Base de contacts importée" in item for item in context["not_consulted"])


def test_own_contacts_markers_are_detected():
    from app.services.source_plan import mentions_own_contacts

    assert mentions_own_contacts("Propose un plan, en tenant compte de mes contacts")
    assert mentions_own_contacts("Who in my contacts knows them?")
    assert not mentions_own_contacts("Quels sont les contacts de la SNCF ?")
