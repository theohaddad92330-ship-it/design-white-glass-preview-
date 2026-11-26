"""Edges RELATIONNELS de l'OrgGraph (épopée #2919, issue #2310).

`org-graph.ts` porte `orgRelationalEdgeSchema` depuis le lot de nuit 18
(#2310.13/.15/.19/.20/.21, .27, .28) mais rien ne le PEUPLE : l'assembleur
n'avait aucun producteur pour `relationalEdges[]` (confirmé par le commentaire
« reste » du 26/09 sur #2919 — `git grep` vide sur son usage dans
`org_graph_assembler.py`). Ces tests verrouillent le producteur minimal ajouté
ici : un paramètre `llm_relational_edges`, séparé de `llm_relations`, qui suit
la même règle n°1 que le reste du fichier — rien n'est inventé, un nom inconnu
ou une preuve/un auteur absents ne produisent AUCUNE ligne.
"""

from __future__ import annotations

from app.models.outputs.contacts import OrganigrammeOutput
from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_build import build_org_graph_payload

_ENTITIES = [
    {"name": "TF1 Groupe", "type": "groupe", "parentId": None, "siren": "326300159"},
    {"name": "Data Factory", "type": "programme", "parentId": "TF1 Groupe"},
    {"name": "Capgemini", "type": "partenaire", "parentId": None},
]

_CONTACTS = [
    {
        "fullName": "Jean Dupont",
        "title": "DSI",
        "entity": "TF1 Groupe",
        "role": "technical",
        "hierarchyLevel": "c_level",
        "source": "apollo",
    }
]


def _relational(graph: dict, edge_type: str) -> list[dict]:
    return [e for e in graph.get("relationalEdges", []) if e["type"] == edge_type]


def test_no_llm_relational_edges_is_byte_identical():
    graph = assemble_org_graph(contacts=_CONTACTS, entities=_ENTITIES)
    assert "relationalEdges" not in graph


def test_relational_edge_without_evidence_produces_nothing():
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relational_edges=[
            {
                "type": "owns_project",
                "from": "Jean Dupont",
                "to": "Data Factory",
                "author": "Jean Dupont",
            }
        ],
    )
    assert "relationalEdges" not in graph


def test_relational_edge_without_author_produces_nothing():
    """#2310.28 — aucun auteur ne se devine."""
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relational_edges=[
            {
                "type": "owns_project",
                "from": "Jean Dupont",
                "to": "Data Factory",
                "evidence": "Organigramme projet interne",
            }
        ],
    )
    assert "relationalEdges" not in graph


def test_relational_edge_with_unknown_node_is_ignored():
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relational_edges=[
            {
                "type": "owns_project",
                "from": "Personne Inconnue",
                "to": "Data Factory",
                "evidence": "Organigramme projet interne",
                "author": "Jean Dupont",
            }
        ],
    )
    assert "relationalEdges" not in graph


def test_owns_project_relational_edge_is_produced():
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relational_edges=[
            {
                "type": "owns_project",
                "from": "Jean Dupont",
                "to": "Data Factory",
                "evidence": "Organigramme projet interne",
                "author": "Jean Dupont",
            }
        ],
    )
    edges = _relational(graph, "owns_project")
    assert len(edges) == 1
    edge = edges[0]
    assert edge["scope"] == "workspace"
    assert edge["author"] == "Jean Dupont"
    assert edge["sourceIds"]
    assert 0 <= edge["confidence"] <= 100


def test_related_workspace_blocks_and_introduced_by_are_supported():
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relational_edges=[
            {
                "type": "related_workspace",
                "from": "TF1 Groupe",
                "to": "Capgemini",
                "evidence": "Mentionné comme partenaire courant",
                "author": "Jean Dupont",
            },
            {
                "type": "blocks",
                "from": "Capgemini",
                "to": "Data Factory",
                "evidence": "Dépendance technique bloquante citée en entretien",
                "author": "Jean Dupont",
            },
            {
                "type": "introduced_by",
                "from": "Jean Dupont",
                "to": "Capgemini",
                "evidence": "Mise en relation citée en entretien",
                "author": "Jean Dupont",
            },
        ],
    )
    assert len(_relational(graph, "related_workspace")) == 1
    assert len(_relational(graph, "blocks")) == 1
    assert len(_relational(graph, "introduced_by")) == 1


def test_entity_level_works_with_is_relational_not_hierarchy():
    """`works_with` existe des deux côtés (#2121.34 personne<->personne dans
    `llm_relations`, #2310.13 workspace/entité ici) : une valeur entité<->entité
    passée à `llm_relational_edges` va dans `relationalEdges`, jamais dans
    `hierarchyEdges`/`influenceEdges`."""
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relational_edges=[
            {
                "type": "works_with",
                "from": "TF1 Groupe",
                "to": "Capgemini",
                "evidence": "Contrat cadre en cours",
                "author": "Jean Dupont",
            }
        ],
    )
    assert len(_relational(graph, "works_with")) == 1
    assert not [e for e in graph["hierarchyEdges"] if e["type"] == "works_with"]
    assert not [e for e in graph["influenceEdges"] if e.get("topic") == "collaboration"]


def test_unknown_relational_edge_type_is_ignored():
    graph = assemble_org_graph(
        contacts=_CONTACTS,
        entities=_ENTITIES,
        llm_relational_edges=[
            {
                "type": "sponsors",
                "from": "Jean Dupont",
                "to": "Data Factory",
                "evidence": "Organigramme projet interne",
                "author": "Jean Dupont",
            }
        ],
    )
    assert "relationalEdges" not in graph


# ── Le producteur manquant (reste noté sur #2919 le 26/09) : le paramètre
# `llm_relational_edges` ci-dessus attendait un appelant, mais BELLUM-ORGANIGRAMME
# (`app/prompts/bellum_organigramme.py`) ne demandait encore aucune des cinq
# natures relationnelles au modèle, et `build_org_graph_payload` (la porte
# d'entrée réelle d'un run — voir sa docstring) ne lisait pas `relationalEdges`
# sur `data`. Ces tests verrouillent le câblage bout en bout : sortie du prompt
# (via `OrganigrammeOutput`) → `data` → `assemble_org_graph`.


def test_organigramme_output_parses_relational_edges_alias():
    """La sortie JSON du prompt (`relationalEdges`, camelCase) doit survivre au
    passage par le modèle typé — même alias que `hierarchyRelations`/
    `influenceMap` juste au-dessus."""
    output = OrganigrammeOutput.model_validate(
        {
            "relationalEdges": [
                {
                    "type": "owns_project",
                    "from": "Jean Dupont",
                    "to": "Data Factory",
                    "evidence": "Organigramme projet interne",
                    "author": "Jean Dupont",
                }
            ]
        }
    )
    dumped = output.model_dump(by_alias=True)
    assert dumped["relationalEdges"][0]["type"] == "owns_project"
    assert dumped["relationalEdges"][0]["author"] == "Jean Dupont"


def test_no_relational_edges_in_output_is_byte_identical():
    """Défaut vide — même garantie que `hierarchyRelations`/`influenceMap` :
    un modèle qui ne produit rien ici laisse `data` exactement comme avant."""
    dumped = OrganigrammeOutput().model_dump(by_alias=True)
    assert dumped["relationalEdges"] == []


def test_build_org_graph_payload_wires_relational_edges_from_data():
    """L'APPELANT manquant : `data.get("relationalEdges")` (sortie fondue du
    prompt) doit atteindre `orgGraph.relationalEdges`, exactement comme
    `data.get("hierarchyRelations")`/`data.get("influenceMap")` le font déjà."""
    payload = build_org_graph_payload(
        data={
            "relationalEdges": [
                {
                    "type": "owns_project",
                    "from": "Jean Dupont",
                    "to": "Data Factory",
                    "evidence": "Organigramme projet interne",
                    "author": "Jean Dupont",
                }
            ]
        },
        contacts=_CONTACTS,
        research={"entities_exhaustive": _ENTITIES},
    )
    assert _relational(payload["orgGraph"], "owns_project")


def test_build_org_graph_payload_without_relational_edges_is_byte_identical():
    payload = build_org_graph_payload(
        data={},
        contacts=_CONTACTS,
        research={"entities_exhaustive": _ENTITIES},
    )
    assert "relationalEdges" not in payload["orgGraph"]
