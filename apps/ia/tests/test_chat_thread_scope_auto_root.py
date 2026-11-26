"""#3178.3b (#3227) — la RACINE du périmètre se pose d'elle-même quand un outil
de chat rend un compte que le résolveur a LUI-MÊME rangé comme groupe.

Avant : seul le modèle pouvait nommer `group_scope_root`. Maintenant, la
projection de `get_account_briefing` (`entity_kind`, posé par
`entity_resolution.py` uniquement sur un état ancré) suffit — sans jamais
écraser ce que le modèle a déjà nommé, et sans jamais déduire un groupe d'une
filiale (`parent_names` ne porte que des NOMS, jamais un identifiant)."""

from __future__ import annotations

import pytest

from app.services.chat_thread_state import ThreadObject, ThreadPersistentScope, ThreadStateCollector


def _briefing(kind: str | None, *, account_id: str = "acc-sg", name: str = "Société Générale") -> dict:
    out: dict = {"account_id": account_id, "company_name": name}
    if kind is not None:
        out["entity_kind"] = kind
    return out


@pytest.mark.parametrize("kind", ["group", "parent_company", "holding"])
def test_a_briefing_of_a_group_sets_the_scope_root(kind: str) -> None:
    collector = ThreadStateCollector()
    collector.record("get_account_briefing", {}, _briefing(kind))
    scope = collector.state.persistent_scope
    assert scope is not None
    assert (scope.root_entity.id, scope.root_entity.label) == ("acc-sg", "Société Générale")


@pytest.mark.parametrize("kind", ["subsidiary", "business_unit", "brand", None])
def test_a_briefing_of_a_non_group_never_sets_a_scope(kind: str | None) -> None:
    """Une filiale n'est pas un groupe : on ne remonte jamais au parent (pas d'id)."""
    collector = ThreadStateCollector()
    collector.record("get_account_briefing", {}, {**_briefing(kind), "parent_names": ["Société Générale"]})
    assert collector.state.persistent_scope is None


def test_the_model_named_scope_is_never_replaced_by_the_automatic_root() -> None:
    collector = ThreadStateCollector()
    collector.state.persistent_scope = ThreadPersistentScope(
        root_entity=ThreadObject(kind="account", id="acc-bpce", label="Groupe BPCE")
    )
    collector.record("get_account_briefing", {}, _briefing("group"))
    assert collector.state.persistent_scope is not None
    assert collector.state.persistent_scope.root_entity.id == "acc-bpce"


def test_a_briefing_without_identifier_or_label_sets_nothing() -> None:
    collector = ThreadStateCollector()
    collector.record("get_account_briefing", {}, {"entity_kind": "group", "company_name": "X"})
    assert collector.state.persistent_scope is None


def test_the_automatic_root_survives_a_later_subsidiary_focus() -> None:
    collector = ThreadStateCollector()
    collector.record("get_account_briefing", {}, _briefing("group"))
    collector.record("get_account_briefing", {}, _briefing("subsidiary", account_id="acc-bb", name="BoursoBank"))
    assert collector.state.persistent_scope is not None
    assert collector.state.persistent_scope.root_entity.id == "acc-sg"
