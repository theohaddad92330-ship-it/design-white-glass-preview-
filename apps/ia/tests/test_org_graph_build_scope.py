"""#3742 / #3744 — le périmètre géographique atteint l'assembleur d'organigramme.

Jusqu'ici le graphe ne recevait que la profondeur : le chemin recommandé d'une
relance « France » pouvait encore commencer par un profil d'Espagne ou d'Inde.
"""

from __future__ import annotations

from typing import Any

from app.services import org_graph_build


def test_build_org_graph_payload_forwards_scope_selection(monkeypatch) -> None:
    seen: dict[str, Any] = {}

    def fake_assemble(**kwargs: Any) -> dict[str, Any]:
        seen.update(kwargs)
        return {}

    monkeypatch.setattr(org_graph_build, "assemble_org_graph", fake_assemble)
    org_graph_build.build_org_graph_payload(
        data={},
        contacts=[],
        research={},
        scope_selection={"geo_perimeter": "france"},
    )
    assert seen.get("scope_selection") == {"geo_perimeter": "france"}


def test_build_org_graph_payload_without_scope_is_unchanged(monkeypatch) -> None:
    seen: dict[str, Any] = {}

    def fake_assemble(**kwargs: Any) -> dict[str, Any]:
        seen.update(kwargs)
        return {}

    monkeypatch.setattr(org_graph_build, "assemble_org_graph", fake_assemble)
    org_graph_build.build_org_graph_payload(data={}, contacts=[], research={})
    assert seen.get("scope_selection") is None
