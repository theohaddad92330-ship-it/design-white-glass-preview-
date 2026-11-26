"""La méthode built-in devient citable par le copilote (annexe p29, Phase 5).

Deux exigences opposées, testées ensemble :
  1. une question qui PORTE sur une règle métier ramène la règle, citable par titre ;
  2. le cas par défaut (question hors sujet / vide) ne change RIEN — le prompt
     advisor reste byte-identique à ce qu'il était avant ce module.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.context_transparency import build_context_transparency
from app.services import method_knowledge

_PROFILE = {"esn_name": "Skaizen", "offers": ["Data", "Cloud"], "sectors": ["Banque"]}
_ACCOUNT = {"company_name": "TF1", "sector": "Média"}


# ── 1) Les règles métier deviennent des chunks retrouvables ───────────────────


def test_objection_is_retrieved_and_citable_by_title():
    chunks = method_knowledge.retrieve_method_chunks(
        "Le prospect me dit qu'il a déjà ses ESN partenaires, je réponds quoi ?"
    )
    titles = [c["title"] for c in chunks]
    assert any("partenaires" in t.lower() for t in titles), titles
    # Un chunk est shapé comme un doc RAG : il traverse le formatage existant.
    assert all({"title", "content", "category", "similarity"} <= set(c) for c in chunks)


def test_business_rule_is_retrieved_with_its_source():
    chunks = method_knowledge.retrieve_method_chunks("comment est calculé le score du compte ?")
    joined = " ".join(f"{c['title']} {c['content']}" for c in chunks)
    assert "score" in joined.lower()
    # Une règle citée porte SA source (auditable) — jamais une règle inventée.
    assert "Source :" in joined


def test_sector_playbook_only_when_that_sector_is_in_play():
    banque = method_knowledge.retrieve_method_chunks(
        "quelle est la chaîne de décision ?", sector="Banque de détail"
    )
    assert any("banque" in c["title"].lower() for c in banque)
    # Le playbook d'un AUTRE secteur ne doit jamais s'inviter.
    assert not any("assurance" in c["title"].lower() for c in banque)


def test_retrieval_is_deterministic_and_capped():
    query = "objection budget gelé et chaîne de décision"
    first = method_knowledge.retrieve_method_chunks(query)
    second = method_knowledge.retrieve_method_chunks(query)
    assert [c["title"] for c in first] == [c["title"] for c in second]
    assert len(first) <= 3


# ── 2) Non-régression : sans match, tout reste byte-identique ────────────────


def test_no_match_returns_nothing():
    assert method_knowledge.retrieve_method_chunks("") == []
    assert method_knowledge.retrieve_method_chunks("   ") == []
    # Une question sans aucun mot-clé méthode ne doit rien ramener.
    assert method_knowledge.retrieve_method_chunks("zzzz yyyy xxxx") == []
    assert method_knowledge.format_method_context([]) == ""


def test_advisor_prompt_is_byte_identical_without_method_chunks():
    before = build_system_prompt(_PROFILE, _ACCOUNT, "contacts", "plan")
    after = build_system_prompt(_PROFILE, _ACCOUNT, "contacts", "plan", method_context="")
    assert after == before
    assert "MÉTHODE BELLUM" not in before


def test_advisor_prompt_gains_a_citable_block_with_method_chunks():
    chunks = method_knowledge.retrieve_method_chunks("on a déjà nos ESN partenaires")
    prompt = build_system_prompt(
        _PROFILE,
        _ACCOUNT,
        "contacts",
        "plan",
        method_context=method_knowledge.format_method_context(chunks),
    )
    assert "MÉTHODE BELLUM" in prompt
    assert "CITE la règle par son titre" in prompt


# ── 3) Transparence : la méthode est une source affichée, d'un kind distinct ──


def test_transparency_lists_method_chunks_as_their_own_source_kind():
    chunks = method_knowledge.retrieve_method_chunks("on a déjà nos ESN partenaires")
    context = build_context_transparency(
        profile_data=_PROFILE,
        account_data=_ACCOUNT,
        contacts_summary="",
        plan_summary="",
        knowledge_docs=None,
        method_chunks=chunks,
    )
    kinds = {s["kind"] for s in context["sources"]}
    assert "method_rule" in kinds
    # La ligne « aucun document pertinent » reste pilotée par les VRAIS documents
    # de l'utilisateur : la méthode built-in ne la fait pas disparaître.
    assert any("Base de connaissance" in x for x in context["not_consulted"])


def test_transparency_is_unchanged_without_method_chunks():
    kwargs = {
        "profile_data": _PROFILE,
        "account_data": _ACCOUNT,
        "contacts_summary": "",
        "plan_summary": "",
        "knowledge_docs": None,
    }
    assert build_context_transparency(**kwargs) == build_context_transparency(
        **kwargs, method_chunks=None
    )


# ── Prospection inversée : les objections CÔTÉ CONSULTANT (item 33) ───────────
#
# La bibliothèque ne portait que des objections de prospection CLIENT. Les treize
# du guide de prospection inversée n'existaient nulle part, alors que ce sont
# celles qu'un chargé de recrutement entend tous les jours.


def test_the_library_carries_both_sides_and_says_which() -> None:
    from app.knowledge import objection_library

    entries = objection_library()
    sides = {str(entry.get("side") or "client") for entry in entries}
    assert sides == {"client", "consultant"}
    assert sum(1 for e in entries if e.get("side") == "consultant") == 13
    # Chaque entrée reste exploitable : une objection sans réponse ni question
    # miroir serait un titre dans une liste.
    for entry in entries:
        assert str(entry.get("objection") or "").strip()
        assert str(entry.get("response") or "").strip()
        assert str(entry.get("mirror_question") or "").strip()


def test_a_consultant_objection_is_never_served_as_a_client_one() -> None:
    """Le côté est dans le TITRE du fragment, et c'est ce qui compte.

    « Mon TJM est trop élevé » venant d'un consultant n'appelle pas la réponse
    qu'on ferait à un acheteur — et servir la mauvaise braque le consultant, ce
    que l'objectif du document interdit en toutes lettres."""
    from app.services.method_knowledge import retrieve_method_chunks

    titles = [c.get("title", "") for c in retrieve_method_chunks("un consultant refuse l'intermédiation", top_k=3)]
    assert titles, "la recherche ne rend rien — le corpus est-il vide ?"
    assert any("côté consultant" in title for title in titles)
    # La garde inverse : le côté client reste identifiable, lui aussi.
    client = [c.get("title", "") for c in retrieve_method_chunks("le client dit qu'on est trop cher", top_k=3)]
    assert any("prospection client" in title for title in client)


# ── 4) Les règles de DISCIPLINE commerciale, quatrième source du corpus ───────
#
# Dix règles gardées et sept interdits vivaient dans `method-delta.ts` sans aucun
# appelant : aucun prompt ne les portait, le copilote ne les avait jamais vues.
# Ils entrent ici comme une source de plus, citable au même titre que les
# objections et les playbooks — pas comme un quatrième chemin de récupération.


def test_les_dix_sept_enonces_sont_TOUS_dans_le_corpus() -> None:
    """La preuve que le branchement est ENTIER, pas trois règles sur dix.

    Une source à moitié câblée passerait toutes les recherches ci-dessous : il
    suffirait que la règle interrogée soit du bon côté de la coupure. Ce test-ci
    compare des ENSEMBLES — il ne peut pas être vrai par vacuité.
    """
    from app.knowledge.method_rules import METHOD_REFUSALS, METHOD_RULES

    corpus_contents = {c["content"] for c in method_knowledge._corpus()}
    assert len(corpus_contents) > 17, "corpus suspect : les trois sources d'origine ont-elles disparu ?"
    for rule in METHOD_RULES + METHOD_REFUSALS:
        assert any(rule.statement in content for content in corpus_contents), rule.id


def test_une_regle_de_discipline_est_retrouvee_et_citable_par_son_titre() -> None:
    chunks = method_knowledge.retrieve_method_chunks("le fil achats, c'est le même que le fil métier ?")
    titles = [c["title"] for c in chunks]
    assert any("fil achats est distinct du fil métier" in t for t in titles), titles
    # Elle traverse le formatage RAG existant comme n'importe quel autre chunk.
    assert all({"title", "content", "category", "similarity"} <= set(c) for c in chunks)
    assert all(c["category"] == method_knowledge.CATEGORY_METHOD for c in chunks)


def test_un_interdit_est_retrouve_ET_annonce_quil_est_un_refus() -> None:
    """Un interdit cité sans son cadrage se lirait comme une consigne à suivre."""
    chunks = method_knowledge.retrieve_method_chunks("puis-je automatiser mon réseau professionnel ?")
    refus = [c for c in chunks if "automatisation du réseau professionnel" in c["title"]]
    assert refus, [c["title"] for c in chunks]
    assert refus[0]["title"].startswith("Interdit de méthode")
    assert "REFUSE" in refus[0]["content"]


def test_une_regle_de_discipline_porte_toujours_sa_source() -> None:
    """Auditable : jamais une règle sortie de nulle part."""
    chunks = method_knowledge.retrieve_method_chunks("un message d’ouverture doit-il dérouler l’offre ?")
    discipline = [c for c in chunks if c["title"].startswith("Règle de méthode")]
    assert discipline, [c["title"] for c in chunks]
    assert all("Source :" in c["content"] for c in discipline)


def test_un_interdit_gagne_les_egalites_contre_les_regles_gardees() -> None:
    """La question même que le premier interdit existe pour attraper.

    Mesuré : sur « combien de contacts je dois viser », quatre chunks étaient à
    égalité de score et le départage par ordre de corpus sortait l'interdit du
    top 3 — le copilote voyait deux règles de couverture et jamais « la méthode
    REFUSE les nombres fixes de contacts ». Ne pas citer un interdit coûte plus
    cher que de le citer pour rien, donc les interdits passent en premier.
    """
    titles = [c["title"] for c in method_knowledge.retrieve_method_chunks("combien de contacts je dois viser sur ce compte ?")]
    assert any("Des nombres fixes de contacts" in t for t in titles), titles


def test_la_quatrieme_source_ne_reveille_pas_les_questions_hors_sujet() -> None:
    """Non-régression : le chemin par défaut reste byte-identique."""
    assert method_knowledge.retrieve_method_chunks("zzzz yyyy xxxx") == []
    assert method_knowledge.retrieve_method_chunks("") == []


# ── 5) Packs méthode nommés, cinquième source du corpus (#3221, #206.3) ───────
#
# Le pack existait déjà comme donnée typée (`app/knowledge/method_packs.py`)
# sans aucun appelant : le copilote ne pouvait jamais le citer. Ces tests
# prouvent le branchement ENTIER — retrouvé par intention, citable par son
# libellé humain, jamais par son rule_id ni son domain brut.


def test_un_pack_methode_est_retrouve_et_cite_par_son_libelle_humain() -> None:
    chunks = method_knowledge.retrieve_method_chunks(
        "la premiere porte n'est pas forcement le decideur final, qui viser ?"
    )
    titles = [c["title"] for c in chunks]
    assert any(t.startswith("Méthode Bellum : première porte") for t in titles), titles


def test_tous_les_packs_sources_sont_dans_le_corpus() -> None:
    """Même discipline que les dix-sept énoncés de discipline : une preuve
    d'ensemble, pas trois packs sur quinze."""
    from app.knowledge.method_packs import METHOD_PACK_RULES

    corpus_contents = {c["content"] for c in method_knowledge._corpus()}
    for pack_rule in METHOD_PACK_RULES:
        assert any(pack_rule.recommendation in content for content in corpus_contents), pack_rule.rule_id


def test_un_pack_methode_porte_toujours_sa_source() -> None:
    chunks = method_knowledge.retrieve_method_chunks(
        "un consultant est disponible, je fais quoi de son cv ?"
    )
    packs = [c for c in chunks if c["title"].startswith("Méthode Bellum :")]
    assert packs, [c["title"] for c in chunks]
    assert all("Source :" in c["content"] for c in packs)


def test_aucun_pack_methode_ne_nomme_lidentifiant_interne_dans_le_titre() -> None:
    """Le panneau de transparence lit ce titre directement (#3200, section
    CITATION) — un rule_id ou un domain brut n'a rien à faire dans une phrase
    lue par un commercial (même discipline que
    test_citable_titles_carry_no_internal_id.py)."""
    from app.knowledge.method_packs import METHOD_PACK_RULES

    for pack_rule in METHOD_PACK_RULES:
        chunks = method_knowledge.retrieve_method_chunks(pack_rule.trigger)
        for chunk in chunks:
            if chunk["title"].startswith("Méthode Bellum :"):
                assert pack_rule.rule_id not in chunk["title"]
                assert pack_rule.domain not in chunk["title"]


# ── #3857 (BEL-LAU-1008-006) — une réserve (exception / condition d'arrêt /
# source) ne doit jamais disparaître d'une troncature d'affichage ───────────


def test_la_condition_darret_dun_pack_survit_a_la_troncature_daffichage() -> None:
    # Mesuré sur `pack_compte_grand_groupe_ferme` (581 caractères, avant ce
    # lot) : la troncature générique de `format_knowledge_context` coupait à
    # 380 caractères SANS savoir qu'une partie du texte est une réserve à
    # préserver — "S'arrête si : ... la démotion ne s'applique plus." et la
    # source disparaissaient tous les deux, laissant une règle qui se lit
    # comme absolue alors qu'elle a une sortie documentée.
    from app.knowledge.method_packs import METHOD_PACK_RULES

    rule = next(r for r in METHOD_PACK_RULES if r.rule_id == "pack_compte_grand_groupe_ferme")
    full_content = next(c["content"] for c in method_knowledge._corpus() if c["_unit_id"] == f"pack:{rule.rule_id}")
    assert rule.stop_condition and len(full_content) > method_knowledge._SNIPPET_CHARS  # la mesure tient toujours

    chunks = method_knowledge.retrieve_method_chunks(rule.trigger)
    block = method_knowledge.format_method_context(chunks)
    assert rule.stop_condition in block, block
    assert "Source :" in block


def test_3857_2_une_question_qui_reprend_le_vocabulaire_du_titre_retrouve_la_regle() -> None:
    """#3857.2 (recette prod 08/10, lot N02) — « Airbus froid + GO » n'avait
    retrouvé AUCUNE règle de gouvernance ; le lot N02 a nommé la limite
    (overlap de TOKENS LITTÉRAUX, pas un index synonymique — décision produit
    réservée à Louis) tout en prédisant qu'une question qui REPREND le
    vocabulaire du titre (« board », « porte d'entrée ») devrait, elle,
    réussir — « sinon c'est un vrai défaut de câblage, distinct de #3857.2 ».
    Vérifié ici : elle réussit — le chunk `pack:pack_compte_grand_groupe_ferme`
    (« Méthode Bellum : compte fermé sans accès », qui PORTE le texte de la
    règle) arrive EN TÊTE (score le plus haut du corpus). Son `_rule_id` reste
    `None` (chunk de DOMAINE, pas de règle isolée) — ce n'est donc jamais lui
    qui apparaît dans `rule_ids`, seulement dans `chunks` : c'est bien ce que
    le modèle LIT qui compte, pas cette clé annexe (exclusion des règles
    contredites par un espace, hors sujet ici)."""
    chunks, _rule_ids = method_knowledge.retrieve_method_chunks_with_rules(
        "ce compte est-il un grand groupe fermé, un board est-il une bonne porte d'entrée ?"
    )
    assert chunks, "aucun chunk retrouvé"
    assert "n'est jamais une porte d'entrée" in chunks[0]["content"], chunks[0]


def test_une_reserve_courte_ne_change_rien_au_contenu_affiche() -> None:
    # Non-régression : un chunk qui tient déjà dans le budget n'est pas
    # réécrit — même sortie qu'avant ce lot.
    chunks = method_knowledge.retrieve_method_chunks("qui contacter chez Airbus")
    block_direct = method_knowledge.format_method_context(chunks)
    from app.services import rag_service

    assert block_direct == rag_service.format_knowledge_context(
        chunks, max_chars=method_knowledge._MAX_CHARS, snippet_chars=method_knowledge._SNIPPET_CHARS
    )


# ── #3857 (BEL-LAU-1008-006) — une relance courte conserve la méthode du
# travail en cours, pas seulement le dernier message ────────────────────────


def test_method_query_text_ajoute_le_travail_en_cours_au_message() -> None:
    assert method_knowledge.method_query_text("GO", current_job="Ouverture du compte Renault") == (
        "GO Ouverture du compte Renault"
    )
    # Sans travail en cours déclaré : byte-identique au message seul.
    assert method_knowledge.method_query_text("GO") == "GO"
    assert method_knowledge.method_query_text("GO", current_job=None, current_step=None) == "GO"


def test_une_relance_go_seule_ne_retrouve_aucune_methode() -> None:
    # Mesure du défaut AVANT ce lot : "GO" (2 lettres) n'a aucun token
    # ≥4 lettres (`_TOKEN_RE`) — la méthode retrouvée au tour précédent
    # disparaissait silencieusement d'une simple relance.
    assert method_knowledge.retrieve_method_chunks("GO") == []


def test_une_relance_go_avec_le_travail_en_cours_garde_la_methode_douverture() -> None:
    # Le même "GO", mais avec le travail en cours que `chat_thread_state.py`
    # tient déjà (`current_job`) : la méthode d'ouverture de compte froid
    # reste retrouvable — « un "GO" ne doit pas faire perdre la méthode
    # d'ouverture de compte » (BEL-LAU-1008-006, critère 1).
    query = method_knowledge.method_query_text(
        "GO", current_job="Ouverture du compte froid Renault : playbook d'entrée"
    )
    chunks = method_knowledge.retrieve_method_chunks(query)
    titles = [c["title"] for c in chunks]
    assert any("ouverture de compte" in t for t in titles), titles

