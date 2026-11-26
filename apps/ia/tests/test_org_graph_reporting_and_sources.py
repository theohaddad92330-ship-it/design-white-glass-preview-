"""Les deux trous qui vidaient l'organigramme (audit `agent_docs/audit-org-mapping-2026-07-22.md`).

1. `reportingTo` — le prompt contacts demande le TITRE du N+1 (« DSI »), l'assembleur
   ne cherchait que dans un index NOM COMPLET → id : aucun lien `reports_to` ne
   pouvait se résoudre, le graphe n'avait donc pas de hiérarchie du tout.
2. `sources` — écrit en dur à `[]` sur les entités ET les personnes, alors que la
   provenance (apollo / pappers / ia_reconstruction / manual, SIREN) est connue.

Règle n°1 du produit : un lien inventé est pire qu'un lien absent. Deux personnes
portant le même titre = ambiguïté = AUCUN edge, jamais un choix arbitraire.
"""

from __future__ import annotations

from app.services.org_confidence import VERIFIED_MIN
from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_validate import validate_org_graph

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


def _reports_to(graph: dict) -> list[dict]:
    """Le lien de reporting, OÙ QU'IL SOIT rangé.

    Ces tests portent sur la RÉSOLUTION du N+1 (« DSI » → la bonne personne), pas
    sur la force de sa preuve. Depuis que `reportingTo` est traité pour ce qu'il
    est — une supposition du modèle, cf. ``test_org_reporting_provenance`` — il
    atterrit en influence et non en hiérarchie. Balayer les deux listes garde ces
    tests sur leur sujet, et rend leurs assertions « aucun lien » plus strictes
    qu'avant : elles couvrent maintenant les deux rangements.
    """
    return [
        *(e for e in graph["hierarchyEdges"] if e["type"] == "reports_to"),
        *(e for e in graph["influenceEdges"] if e["topic"] == "rattachement hiérarchique"),
    ]


def _by_name(graph: dict) -> dict[str, dict]:
    return {p["fullName"]: p for p in graph["people"]}


# ── Défaut 1 : résolution du N+1 ──────────────────────────────────────────────


def test_reporting_to_resolves_against_the_manager_title():
    """Le cas réel : le LLM renvoie « DSI », pas « Jean Dupont »."""
    contacts = [
        _person("Jean Dupont", "DSI"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    people = _by_name(g)
    assert [(e["fromId"], e["toId"]) for e in _reports_to(g)] == [
        (people["Marie Martin"]["id"], people["Jean Dupont"]["id"])
    ]


def test_title_resolution_is_normalised_like_the_rest_of_the_assembler():
    contacts = [
        _person("Jean Dupont", "Directeur   des Systèmes d'Information"),
        _person(
            "Marie Martin",
            "Responsable Data",
            hierarchyLevel="management",
            reportingTo="  directeur des systèmes d'information ",
        ),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    assert len(_reports_to(g)) == 1


def test_reporting_to_still_resolves_against_a_full_name():
    """Rétro-compatibilité : le chemin nom complet reste prioritaire."""
    contacts = [
        _person("Jean Dupont", "DSI"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="Jean Dupont"),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    people = _by_name(g)
    assert [(e["fromId"], e["toId"]) for e in _reports_to(g)] == [
        (people["Marie Martin"]["id"], people["Jean Dupont"]["id"])
    ]


def test_an_ambiguous_title_creates_no_edge_at_all():
    """Deux « DSI » → on ne choisit pas : aucun lien de reporting."""
    contacts = [
        _person("Jean Dupont", "DSI"),
        _person("Paul Durand", "DSI"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    assert _reports_to(g) == []
    assert validate_org_graph(g) == []


def test_an_unknown_manager_title_creates_no_edge():
    contacts = [
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="Directeur Juridique"),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    assert _reports_to(g) == []


def test_a_person_never_reports_to_herself_through_her_own_title():
    contacts = [_person("Jean Dupont", "DSI", reportingTo="DSI")]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    assert _reports_to(g) == []


def test_a_rejected_contact_is_not_a_resolvable_manager():
    contacts = [
        _person("Bruit Fantome", "DSI", bucket="bruit"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    assert _reports_to(g) == []


# ── Défaut 2 : provenance des nœuds ───────────────────────────────────────────


def test_a_person_carries_the_provider_she_came_from():
    contacts = [
        _person("Jean Dupont", "DSI", source="pappers"),
        _person("Marie Martin", "Responsable Data", source="apollo", linkedinUrl="https://www.linkedin.com/in/mm"),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    people = _by_name(g)

    (registry,) = people["Jean Dupont"]["sources"]
    assert registry["kind"] == "registry" and registry["grounding"] == "A"
    assert "date" not in registry  # aucune date connue → aucune date inventée

    (provider,) = people["Marie Martin"]["sources"]
    assert provider["kind"] == "linkedin" and provider["grounding"] == "B"
    assert provider["ref"] == "https://www.linkedin.com/in/mm"


def test_a_person_without_a_known_provider_carries_no_source():
    contacts = [_person("Jean Dupont", "DSI", source="")]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    assert _by_name(g)["Jean Dupont"]["sources"] == []


def test_an_unmapped_provider_stays_grounding_c():
    """Un fournisseur qu'on ne sait pas classer n'est jamais promu en preuve."""
    contacts = [_person("Jean Dupont", "DSI", source="dropcontact")]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    (src,) = _by_name(g)["Jean Dupont"]["sources"]
    assert src["kind"] == "other" and src["grounding"] == "C"


def test_an_entity_cites_the_registry_when_it_is_attached_to_one():
    g = assemble_org_graph(contacts=[], entities=_ENTITIES)
    by_name = {e["name"]: e for e in g["entities"]}

    (registry,) = by_name["TF1 Groupe"]["sources"]
    assert registry["kind"] == "registry" and registry["grounding"] == "A"
    assert registry["ref"] == "326300159"  # l'identifiant registre, pas une URL inventée

    assert by_name["TF1 Pub"]["sources"] == []  # aucun SIREN connu → aucune source


def test_edge_source_ids_point_at_a_real_source_record():
    """Les `sourceIds` des edges ne référencent plus des ids fantômes."""
    contacts = [
        _person("Jean Dupont", "DSI", source="pappers"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", reportingTo="DSI"),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    known = {s["id"] for node in [*g["people"], *g["entities"]] for s in node["sources"]}
    cited = {sid for e in g["hierarchyEdges"] for sid in e["sourceIds"]}
    assert cited and cited <= known
    assert validate_org_graph(g) == []


# ── Ce que les deux correctifs ne suffisent PAS à débloquer ───────────────────


def test_the_verified_view_stays_empty_with_one_source_per_person():
    """Constat honnête (audit §1.1) : registre + titre + même org = 60.

    ⚠️ C'était 70 tant que la fraîcheur était affirmée EN DUR (`fresh=True` sur
    une provenance sans date). Le +10 de `W_FRESH_DATE` récompensait une
    fraîcheur que rien ne prouvait — l'audit du 22/07 le signalait, l'archive 05
    §O2 le rappelait cinq semaines plus tard. Un contact du pipeline ne porte
    aucune date de collecte : le bonus disparaît, et le score baisse d'autant.

    Le seuil « vérifié » est 90. Une SEULE preuve par personne ne peut donc pas
    remplir la vue n°1 — il manque une seconde source réellement indépendante
    (site officiel / organigramme publié), pas un câblage.
    """
    contacts = [
        _person("Jean Dupont", "DSI", source="pappers"),
        _person("Marie Martin", "Responsable Data", hierarchyLevel="management", source="pappers", reportingTo="DSI"),
    ]
    g = assemble_org_graph(contacts=contacts, entities=_ENTITIES)
    assert g["hierarchyEdges"]  # des liens existent…
    assert max(e["confidence"] for e in g["hierarchyEdges"]) == 60  # …mais aucun n'est vérifié
    assert all(e["verified"] is False for e in g["hierarchyEdges"])
    assert VERIFIED_MIN > 60
