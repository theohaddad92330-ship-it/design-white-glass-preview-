"""Mémoire du graphe d'organigramme (Annexe Organigramme §5, p30).

Ce que ces tests verrouillent : un élément écarté (contact signalé parti,
entité hors périmètre) NE REVIENT PAS dans le graphe d'un run suivant, et la
version du graphe portée par la correction est bien celle du graphe émis.

La mémoire voyage par ``sourceId``, un id synthétisé de façon déterministe
depuis le nom (``_slug``) — c'est ce qui permet à un rejet posé sur un run de
retrouver la même personne dans le suivant, où tout est réassemblé de zéro.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
import app.services.org_graph_build as org_graph_build
from app.routers.graph_analyze import GraphAnalyzeRequest
from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_validate import validate_org_graph


def _contacts() -> list[dict]:
    return [
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "entity": "TF1 Groupe",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "pappers",
            "bucket": "decideur",
        },
        {
            "fullName": "Marie Martin",
            "title": "Responsable Data",
            "entity": "TF1 Groupe",
            "role": "user",
            "hierarchyLevel": "management",
            "source": "apollo",
            "reportingTo": "Jean Dupont",
            "bucket": "operationnel",
        },
    ]


def _entities() -> list[dict]:
    return [
        {"name": "TF1 Groupe", "type": "groupe", "parentId": None, "siren": "326300159"},
        {"name": "TF1 Pub", "type": "filiale_strategique", "parentId": "TF1 Groupe"},
    ]


def test_a_memorised_contact_is_never_reinjected():
    """Le run suivant ne réaffiche pas un contact écarté par l'utilisateur."""
    g = assemble_org_graph(
        contacts=_contacts(),
        entities=_entities(),
        rejected_items=[{"sourceId": "p-jean-dupont", "reason": "signalé parti"}],
    )
    assert [p["fullName"] for p in g["people"]] == ["Marie Martin"]
    assert {"sourceId": "p-jean-dupont", "reason": "signalé parti"} in g["rejectedItems"]
    assert validate_org_graph(g) == []


def test_the_edges_of_a_memorised_contact_go_with_him():
    """Aucun lien pendant : le reports_to vers l'écarté disparaît avec lui."""
    g = assemble_org_graph(
        contacts=_contacts(),
        entities=_entities(),
        rejected_items=[{"sourceId": "p-jean-dupont", "reason": "signalé parti"}],
    )
    node_ids = {n["id"] for n in [*g["people"], *g["entities"]]}
    for edge in [*g["hierarchyEdges"], *g["influenceEdges"]]:
        assert edge["fromId"] in node_ids and edge["toId"] in node_ids
    assert validate_org_graph(g) == []


def test_a_memorised_contact_never_reaches_the_recommended_path():
    g = assemble_org_graph(
        contacts=_contacts(),
        entities=_entities(),
        approach_order=[{"contact": "Jean Dupont", "why_first": "décideur"}, {"contact": "Marie Martin"}],
        rejected_items=[{"sourceId": "p-jean-dupont", "reason": "signalé parti"}],
    )
    people = {p["id"]: p["fullName"] for p in g["people"]}
    assert [people[s["personId"]] for s in g["recommendedPath"]] == ["Marie Martin"]
    # Séquence renumérotée, sans trou.
    assert [s["step"] for s in g["recommendedPath"]] == [1]


def test_a_memorised_entity_is_never_reinjected():
    g = assemble_org_graph(
        contacts=[],
        entities=_entities(),
        rejected_items=[{"sourceId": "e-tf1-pub", "reason": "entité cédée"}],
    )
    assert [e["name"] for e in g["entities"]] == ["TF1 Groupe"]
    assert validate_org_graph(g) == []


def test_the_memory_is_cumulative_even_when_the_item_does_not_reappear():
    """Un écarté absent du run reste mémorisé — sinon le run d'après le ressort."""
    g = assemble_org_graph(
        contacts=_contacts(),
        entities=_entities(),
        rejected_items=[{"sourceId": "p-parti-ailleurs", "reason": "signalé parti"}],
    )
    assert {"sourceId": "p-parti-ailleurs", "reason": "signalé parti"} in g["rejectedItems"]
    assert validate_org_graph(g) == []


def test_the_memory_never_duplicates_an_id():
    """Un contact classé bruit ET déjà mémorisé n'apparaît qu'une fois."""
    contacts = [*_contacts(), {"fullName": "Bruit Fantome", "entity": "TF1 Groupe", "bucket": "bruit"}]
    g = assemble_org_graph(
        contacts=contacts,
        entities=_entities(),
        rejected_items=[{"sourceId": "p-bruit-fantome", "reason": "écarté par l'utilisateur"}],
    )
    ids = [r["sourceId"] for r in g["rejectedItems"]]
    assert ids.count("p-bruit-fantome") == 1
    # Le motif utilisateur prime sur le motif automatique (1re occurrence).
    reason = next(r["reason"] for r in g["rejectedItems"] if r["sourceId"] == "p-bruit-fantome")
    assert reason == "écarté par l'utilisateur"


def test_the_graph_version_travels_with_the_graph():
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), graph_version=4)
    assert g["graphVersion"] == 4


def test_no_memory_leaves_the_assembly_untouched():
    """Défaut (aucune mémoire) = graphe identique à avant la feature."""
    before = assemble_org_graph(contacts=_contacts(), entities=_entities())
    after = assemble_org_graph(contacts=_contacts(), entities=_entities(), rejected_items=[])
    assert before == after


# ── Câblage : wire → état du graphe → assembleur ──────────────────────────────


def test_graph_analyze_request_defaults_to_a_neutral_memory():
    """Clés absentes du wire (compte jamais corrigé) → version 1, aucune mémoire."""
    req = GraphAnalyzeRequest(company_name="TF1")
    assert req.org_graph_version == 1
    assert req.org_rejected_items == []

    carried = GraphAnalyzeRequest(
        company_name="TF1",
        org_graph_version=3,
        org_rejected_items=[{"sourceId": "p-jean-dupont", "reason": "signalé parti"}],
    )
    assert carried.org_graph_version == 3
    assert carried.org_rejected_items == [{"sourceId": "p-jean-dupont", "reason": "signalé parti"}]


def _fake_classifier_agent():
    class FakeAgent:
        async def run(self, company, profile, research, contacts, *, account_feedback=""):
            from app.models.agent_envelope import AgentEnvelope, AgentMeta, AgentStatus
            from app.models.classified_data import ClassifiedData

            return AgentEnvelope[ClassifiedData](
                status=AgentStatus.SUCCESS,
                data=ClassifiedData(contacts=[]),
                meta=AgentMeta(
                    agent_name="bellum_contacts",
                    agent_version="1.0.0",
                    started_at="2026-07-22T00:00:00Z",
                    finished_at="2026-07-22T00:00:01Z",
                    duration_ms=1000,
                ),
            )

    return FakeAgent


@pytest.mark.asyncio
async def test_classify_node_threads_the_memory_into_the_assembler(monkeypatch):
    monkeypatch.setattr(nodes, "ClassifierAgent", _fake_classifier_agent())
    monkeypatch.setattr(nodes, "enrich_top_deciders", AsyncMock(side_effect=lambda c, _n, **_kw: c))
    captured: dict = {}

    def fake_assemble(**kwargs):
        captured.update(kwargs)
        return {"graphVersion": kwargs.get("graph_version", 1)}

    monkeypatch.setattr(org_graph_build, "assemble_org_graph", fake_assemble)

    await nodes.classify_node(
        {
            "company_name": "TF1",
            "org_graph_version": 3,
            "org_rejected_items": [{"sourceId": "p-jean-dupont", "reason": "signalé parti"}],
        }
    )

    assert captured["graph_version"] == 3
    assert captured["rejected_items"] == [{"sourceId": "p-jean-dupont", "reason": "signalé parti"}]


@pytest.mark.asyncio
async def test_classify_node_defaults_the_memory_on_a_legacy_state(monkeypatch):
    """État repris / antérieur à la feature : version 1, aucune mémoire."""
    monkeypatch.setattr(nodes, "ClassifierAgent", _fake_classifier_agent())
    monkeypatch.setattr(nodes, "enrich_top_deciders", AsyncMock(side_effect=lambda c, _n, **_kw: c))
    captured: dict = {}

    def fake_assemble(**kwargs):
        captured.update(kwargs)
        return {"graphVersion": 1}

    monkeypatch.setattr(org_graph_build, "assemble_org_graph", fake_assemble)

    await nodes.classify_node({"company_name": "TF1"})

    assert captured["graph_version"] == 1
    assert captured["rejected_items"] == []
