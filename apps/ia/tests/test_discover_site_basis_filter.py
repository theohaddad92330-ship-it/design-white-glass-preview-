"""#3983.2 (#3705.3) — l'écran Découvrir choisit la base : siège ou implantation.

`siteBasis` (écran, camelCase) → `on_headquarters_only` (registre). Absent ou
`presence` : le registre matche par établissement, comme avant — le chemin reste
byte-identique. `headquarters` : le siège doit être dans la zone.
"""

from __future__ import annotations

from app.routers.discover import DiscoverFilters, _registry_row, _registry_filters


def test_headquarters_maps_to_the_registry_siege_filter() -> None:
    filters = _registry_filters(DiscoverFilters(department="69", siteBasis="headquarters"))
    assert filters.on_headquarters_only is True


def test_presence_and_absent_leave_the_registry_default() -> None:
    assert _registry_filters(DiscoverFilters(department="69", siteBasis="presence")).on_headquarters_only is None
    assert _registry_filters(DiscoverFilters(department="69")).on_headquarters_only is None


def test_registry_row_carries_the_geography_block() -> None:
    geo = {"basis": "establishment", "headquarters": {"city": "PARIS", "department": "75"}, "siteCount": 2, "sites": []}
    row = _registry_row({"siren": "552032534", "name": "FREE", "geography": geo})
    assert row is not None
    assert row["geography"] == geo


def test_registry_row_without_geography_has_no_key() -> None:
    row = _registry_row({"siren": "552032534", "name": "FREE"})
    assert row is not None
    assert "geography" not in row
