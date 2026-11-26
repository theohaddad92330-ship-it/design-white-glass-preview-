"""Le prompt refondu BELLUM ACCOUNT MAPPING (annexe organigramme p23-p28).

Ce qui manquait (audit `agent_docs/audit-org-mapping-2026-07-22.md`, manque n°4) :
le prompt d'organigramme ne demandait AUCUNE relation typée, donc le produit
n'avait ni carte d'influence métier, ni sponsoring de programme, ni posture. Le
graphe était reconstruit après coup par un assembleur déterministe qui ne peut
pas deviner ce qu'aucun champ ne porte.

Ce que ces tests verrouillent, dans l'ordre d'importance :

1. **La règle n°1 du produit** — le modèle ne peut PAS inventer un lien. Un nom
   inconnu, une relation sans preuve citée, un raisonnement absent : rien ne
   sort. Et rien de ce que le modèle affirme ne devient une ligne hiérarchique
   vérifiée : la provenance `llm` plafonne à 49 et route vers l'influence.
2. Les cinq blocs de l'annexe sont réellement dans le prompt système.
3. La sortie du modèle alimente les edges TYPÉS + les champs de contrat qui
   n'avaient aucun producteur (canal, fallback, entité/famille/niveau des zones).
4. Sans matière LLM, le graphe est identique à celui d'avant la refonte.
"""

from __future__ import annotations

from app.prompts.bellum_organigramme import build_system_prompt, build_user_prompt
from app.services.classification import relationship_context_line, signals_digest
from app.services.org_confidence import LLM_ONLY_CEILING
from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_validate import validate_org_graph

_PROFILE = {
    "companyName": "Skaizen",
    "size": 40,
    "offers": ["Cloud", "Data"],
    "sectors": ["Banque"],
    "personas": ["DSI"],
    "salesCycle": "3 mois",
}

_ENTITIES = [
    {"name": "TF1 Groupe", "type": "groupe", "parentId": None, "siren": "326300159"},
    {"name": "TF1 Pub", "type": "filiale_strategique", "parentId": "TF1 Groupe"},
]


def _person(full_name: str, title: str, **extra) -> dict:
    base = {
        "fullName": full_name,
        "title": title,
        "entity": "TF1 Groupe",
        "role": "technical",
        "hierarchyLevel": "c_level",
        "source": "apollo",
    }
    base.update(extra)
    return base


_CONTACTS = [
    _person("Jean Dupont", "DSI"),
    _person("Marie Martin", "Directrice Achats", hierarchyLevel="direction", role="purchasing"),
]


def _influence(graph: dict, topic: str) -> list[dict]:
    return [e for e in graph["influenceEdges"] if e["topic"] == topic]


def _pid(graph: dict, full_name: str) -> str:
    return next(p["id"] for p in graph["people"] if p["fullName"] == full_name)


# ── 1. Règle n°1 : aucun lien inventé ────────────────────────────────────────


def test_a_relation_without_cited_evidence_produces_nothing():
    """Garde-fou p27 : « si manager/reporting inconnu, n'ajoute pas de lien ».
    Une relation que le modèle ne peut pas justifier n'existe pas — ni en
    hiérarchie, ni même en influence."""
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relations=[{"from": "Marie Martin", "to": "Jean Dupont", "type": "reports_to", "evidence": "   "}],
    )
    assert _influence(graph, "rattachement hiérarchique") == []
    assert not [
        e for e in graph["hierarchyEdges"] if e["fromId"] == _pid(graph, "Marie Martin") and e["type"] == "reports_to"
    ]


def test_a_relation_naming_someone_absent_from_the_input_produces_nothing():
    """Le modèle ne peut pas introduire une personne : un nom hors CONTACTS est
    ignoré, jamais créé comme nœud."""
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relations=[
            {
                "from": "Sophie Inconnue",
                "to": "Jean Dupont",
                "type": "reports_to",
                "evidence": "titre « Directrice adjointe »",
            }
        ],
        llm_influences=[
            {
                "from": "Sophie Inconnue",
                "to": "Jean Dupont",
                "topic": "budget cyber 2026",
                "reasoning": "hypothèse",
            }
        ],
    )
    assert [p["fullName"] for p in graph["people"]] == ["Jean Dupont", "Marie Martin"]
    assert graph["influenceEdges"] == []


def test_an_llm_relation_never_becomes_a_verified_hierarchy_line():
    """« La hiérarchie ne peut pas être plus certaine que la donnée qui
    l'alimente » (p10) : une affirmation du modèle est un grounding C, donc une
    INFLUENCE plafonnée à 49 — jamais un trait plein."""
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relations=[
            {
                "from": "Jean Dupont",
                "to": "TF1 Groupe",
                "type": "owns_budget",
                "evidence": "titre « DSI » + entité TF1 Groupe",
                "reasoning": "un DSI groupe arbitre le budget SI du périmètre",
            }
        ],
    )
    edges = _influence(graph, "autorité budgétaire")
    assert len(edges) == 1
    assert edges[0]["confidence"] <= LLM_ONLY_CEILING
    assert edges[0]["reasoning"]
    assert not any(e["verified"] for e in graph["hierarchyEdges"] if e["type"] == "owns_budget")
    assert validate_org_graph(graph) == []


# ── 2. Les cinq blocs de l'annexe sont dans le prompt système ────────────────


def test_system_prompt_carries_the_five_annexe_blocks():
    prompt = build_system_prompt(_PROFILE)
    # p23 — rôle / mission, quatre sorties séparées.
    assert "BELLUM ACCOUNT MAPPING" in prompt
    for output in ("ORGANIGRAMME VERIFIE", "CARTE D'INFLUENCE", "BUYING COMMITTEE", "CHEMIN COMMERCIAL"):
        assert output in prompt
    # p24 — contexte obligatoire + la consigne de dégradation.
    for block in (
        "SELLER_CONTEXT",
        "RELATIONSHIP_CONTEXT",
        "SCOPE",
        "ENTITIES",
        "CONTACTS",
        "SIGNALS",
        "INTERNAL_MEMORY",
    ):
        assert block in prompt
    assert "degrade la confiance" in prompt
    # p25 — règles de hiérarchie, niveaux, rôles, relations typées.
    for level in ("L0", "L1", "L2", "L3", "L4", "L5"):
        assert level in prompt
    for relation in ("reports_to", "member_of", "sponsors", "owns_budget", "procures_for"):
        assert relation in prompt
    assert "procurement" in prompt  # rôle achats DISTINCT (p8)
    # p26 — stratégie par scénario + anti-recommandation.
    for scenario in ("bottom-up", "top-down", "rang 2", "appel d'offres", "public"):
        assert scenario in prompt
    assert "fallback" in prompt.lower()
    # p27 — garde-fous.
    assert "embellir" in prompt
    assert "Aucun lien vaut mieux qu'un lien invente" in prompt


def test_system_prompt_still_describes_the_seller():
    """Le bloc SELLER_CONTEXT reste le profil de l'ESN QUI VEND, pas la cible."""
    assert "- Nom : Skaizen" in build_system_prompt(_PROFILE)


# ── 3. Le user prompt transporte des objets et six tâches (p28) ──────────────


def test_user_prompt_asks_for_the_six_tasks_and_the_typed_keys():
    prompt = build_user_prompt("TF1", "[]", "[]", "[]", "[]")
    for key in ("hierarchyRelations", "influenceMap", "uncoveredZones", "approach_order", "rejected"):
        assert key in prompt
    for field in ('"evidence"', '"stance"', '"confidence"', '"channel"', '"fallback"'):
        assert field in prompt
    assert "1. Classe chaque personne" in prompt
    assert "6. Liste les elements rejetes" in prompt


def test_user_prompt_asks_for_relational_edges():
    """#2310.13/.15/.19/.20/.21 (épopée #2919) — le producteur manquant noté
    « reste » sur #2919 le 26/09 : la clé `relationalEdges` et ses cinq natures
    doivent être dans le prompt, avec la même règle n°1 (preuve + auteur) que
    `hierarchyRelations`."""
    prompt = build_user_prompt("TF1", "[]", "[]", "[]", "[]")
    assert "relationalEdges" in prompt
    for edge_type in ("works_with", "owns_project", "blocks", "introduced_by", "related_workspace"):
        assert edge_type in prompt
    assert '"author"' in prompt
    assert "7. Si le contexte fourni etablit un lien RELATIONNEL" in prompt
    assert "sans `author` nomme, n'emets rien" in prompt


def test_approach_order_asks_for_the_five_new_step_fields():
    # #2312.4/.5/.6/.9/.12 (épopée #2963, Recommended Path Builder) — question à
    # poser, information à obtenir, preuve à mobiliser, condition de passage,
    # risque : absents du prompt jusqu'ici (constat audit 25/09/2026).
    prompt = build_user_prompt("TF1", "[]", "[]", "[]", "[]")
    for field in (
        '"question_to_ask"',
        '"info_to_obtain"',
        '"evidence_to_use"',
        '"gating_condition"',
        '"risk"',
    ):
        assert field in prompt


def test_user_prompt_says_when_a_context_block_is_missing():
    """p24 : un bloc absent est ANNONCÉ absent — le modèle doit dégrader sa
    confiance, pas combler le trou."""
    empty = build_user_prompt("TF1", "[]", "[]", "[]", "[]")
    assert "RELATIONSHIP_CONTEXT: non fourni" in empty
    assert "SIGNALS: non fourni" in empty

    filled = build_user_prompt(
        "TF1", "[]", "[]", "[]", "[]", relationship="état = client", signals="- AO cloud", memory="notes CRM"
    )
    assert "RELATIONSHIP_CONTEXT: état = client" in filled
    assert "INTERNAL_MEMORY: notes CRM" in filled


def test_relationship_and_signals_are_rendered_from_the_pipeline():
    line = relationship_context_line(
        {"relationship": {"state": "rang2", "derivation": "user_declared", "evidence": ["contexte: incumbent"]}}
    )
    assert "état = rang2" in line and "user_declared" in line
    assert relationship_context_line(None) == ""
    assert relationship_context_line({"relationship": {}}) == ""

    digest = signals_digest([{"title": "Appel d'offres cloud", "date": "2026-05"}, "Recrutement DSI"])
    assert "- Appel d'offres cloud (2026-05)" in digest
    assert "- Recrutement DSI" in digest
    assert signals_digest(None) == ""


# ── 4. La sortie alimente les edges typés et les champs sans producteur ──────


def test_influence_map_produces_business_edges_with_stance_and_reasoning():
    """La sortie que RIEN ne produisait : qui pèse sur quel sujet métier."""
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_influences=[
            {
                "from": "Marie Martin",
                "to": "Jean Dupont",
                "topic": "référencement fournisseurs 2026",
                "stance": "detractor",
                "confidence": 40,
                "reasoning": "les achats arbitrent le panel et cadrent le sourcing du DSI",
            }
        ],
    )
    edges = _influence(graph, "référencement fournisseurs 2026")
    assert len(edges) == 1
    assert edges[0]["stance"] == "detractor"
    assert edges[0]["reasoning"].startswith("les achats arbitrent")
    assert validate_org_graph(graph) == []


def test_an_influence_without_reasoning_is_dropped():
    """p27 : une influence peut être hypothétique, mais elle DOIT porter son
    raisonnement."""
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_influences=[{"from": "Marie Martin", "to": "Jean Dupont", "topic": "panel", "reasoning": ""}],
    )
    assert graph["influenceEdges"] == []


def test_the_models_confidence_can_only_lower_the_deterministic_score():
    """Une auto-évaluation ne rattrape pas une preuve absente : elle peut abaisser
    le score, jamais le relever."""
    base = {
        "from": "Marie Martin",
        "to": "Jean Dupont",
        "topic": "budget SI",
        "reasoning": "co-instruction du budget",
    }
    modest = assemble_org_graph(contacts=_CONTACTS, entities=_ENTITIES, llm_influences=[{**base, "confidence": 10}])
    boastful = assemble_org_graph(contacts=_CONTACTS, entities=_ENTITIES, llm_influences=[{**base, "confidence": 100}])
    assert _influence(modest, "budget SI")[0]["confidence"] == 10
    assert _influence(boastful, "budget SI")[0]["confidence"] <= LLM_ONLY_CEILING


def test_uncovered_zones_carry_entity_family_and_level():
    """p19/p30 : sans entité + famille + niveau, une zone blanche n'est pas
    relançable."""
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        uncovered_zones=[
            {
                "zone": "aucun contact achats sur TF1 Pub",
                "entity": "TF1 Pub",
                "family": "Achats",
                "level": "L5",
                "importance": "critique",
            },
            {"zone": "entité inconnue", "entity": "Filiale Fantôme", "level": "L9"},
        ],
    )
    first, second = graph["uncoveredZones"]
    assert first["entityId"] == next(e["id"] for e in graph["entities"] if e["name"] == "TF1 Pub")
    assert first["family"] == "Achats"
    assert first["hierarchyLevel"] == "L5"
    # Rien n'est fabriqué : une entité hors graphe et un niveau hors contrat sont
    # simplement absents.
    assert "entityId" not in second and "hierarchyLevel" not in second


def test_recommended_path_carries_channel_and_fallback():
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        approach_order=[
            {
                "step": 1,
                "contact": "Jean Dupont",
                "why_first": "porte l'arbitrage SI",
                "channel": "LinkedIn puis email",
                "fallback": "passer par Marie Martin (achats)",
            }
        ],
    )
    step = graph["recommendedPath"][0]
    assert step["channel"] == "LinkedIn puis email"
    assert step["fallback"] == "passer par Marie Martin (achats)"


# ── 5. Additif : sans matière LLM, le graphe ne bouge pas ────────────────────


def test_without_llm_material_the_graph_is_unchanged():
    before = assemble_org_graph(contacts=_CONTACTS, entities=_ENTITIES)
    after = assemble_org_graph(contacts=_CONTACTS, entities=_ENTITIES, llm_relations=[], llm_influences=[])
    assert before == after
