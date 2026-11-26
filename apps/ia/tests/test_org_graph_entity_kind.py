"""#2284.5-.9, .14 — la taxonomie d'entité posée sur les nœuds de l'organigramme.

Arbitrage GA-26 : le nœud porte déjà ``type`` (l'axe de structure). Le
producteur n'écrit ``entityKind`` QUE s'il affine ce type — une marque rangée en
``filiale``, une direction métier rangée en ``bu``. Répéter la projection est
refusé (zod ``entity_kind_repeats_type`` et son miroir Python)."""

from __future__ import annotations

from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_validate import validate_org_graph


def test_a_brand_and_a_business_direction_keep_their_kind_on_the_node():
    """#2284.6 / #2284.7 — « marque » tombait sur ``filiale``, « direction » sur
    ``bu`` : l'information était perdue en route."""
    entities = [
        {"name": "Societe Generale", "type": "groupe", "parentId": None},
        {"name": "Boursorama", "type": "marque", "parentId": "Societe Generale"},
        {"name": "DSI Groupe", "type": "direction", "parentId": "Societe Generale"},
        {"name": "Credit du Nord", "type": "filiale", "parentId": "Societe Generale"},
        {"name": "GBIS", "type": "bu", "parentId": "Societe Generale"},
    ]
    g = assemble_org_graph(contacts=[], entities=entities)
    by_name = {e["name"]: e for e in g["entities"]}
    assert by_name["Boursorama"]["type"] == "filiale"
    assert by_name["Boursorama"]["entityKind"] == "brand"
    assert by_name["DSI Groupe"]["type"] == "bu"
    assert by_name["DSI Groupe"]["entityKind"] == "business_direction"
    # Le type suffit : AUCUN kind qui le répéterait.
    for name in ("Societe Generale", "Credit du Nord", "GBIS"):
        assert "entityKind" not in by_name[name]
    assert validate_org_graph(g) == []


def test_a_rejected_homonym_is_named_homonym_not_spv():
    """#2284.14 — un homonyme écarté se disait « entité écartée (type spv) » :
    faux. Chaque écarté porte désormais son kind et une raison juste."""
    entities = [
        {"name": "Thales", "type": "groupe", "parentId": None},
        {"name": "Thales Boulangerie", "type": "homonyme"},
        {"name": "Koala Finance", "type": "spv"},
        {"name": "Thales Ancienne Filiale", "type": "cedee"},
    ]
    g = assemble_org_graph(contacts=[], entities=entities)
    by_id = {r["sourceId"]: r for r in g["rejectedItems"]}
    homonym = by_id["e-thales-boulangerie"]
    assert homonym["entityKind"] == "homonym"
    assert "spv" not in homonym["reason"]
    assert by_id["e-koala-finance"]["entityKind"] == "legal_vehicle"
    assert by_id["e-thales-ancienne-filiale"]["entityKind"] == "inactive_company"
    assert validate_org_graph(g) == []


def test_the_validator_refuses_a_kind_that_repeats_the_type():
    """GA-26 — miroir de ``entity_kind_repeats_type`` : il sait dire NON."""
    g = assemble_org_graph(contacts=[], entities=[{"name": "LCL", "type": "filiale"}])
    g["entities"][0]["entityKind"] = "subsidiary"
    assert any("entity_kind_repeats_type" in e for e in validate_org_graph(g))
    g["entities"][0]["entityKind"] = "brand"
    assert validate_org_graph(g) == []
    g["entities"][0]["entityKind"] = "marque"
    assert any("entityKind" in e for e in validate_org_graph(g))
