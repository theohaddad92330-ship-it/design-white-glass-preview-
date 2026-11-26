"""#3983.11 (Louis 15/10) — filiale sans dirigeant visible → dirigeant du groupe, nommé comme tel."""

from __future__ import annotations

from app.services import group_people

P, F, X = "811111111", "822222222", "833333333"


def _person(name: str, role: str | None = "Président") -> dict:
    p = {"name": {"value": name, "origin": "registry", "observedAt": "2026-09-01"}}
    if role:
        p["role"] = {"value": role, "origin": "registry", "observedAt": "2026-09-01"}
    return p


async def _no_fetch(_siren: str) -> list[dict]:
    raise AssertionError("aucun appel attendu")


async def test_subsidiary_without_people_inherits_parent_people_from_the_list():
    rows = [
        {"siren": P, "people": [_person("Anne Martin")]},
        {"siren": F, "people": []},
    ]
    await group_people.inherit_group_people(rows, {(P, F)}, _no_fetch)
    got = rows[1]["people"]
    assert [x["name"]["value"] for x in got] == ["Anne Martin"]
    assert got[0]["role"]["value"] == "Dirigeant du groupe · Président"
    assert rows[0]["people"][0]["role"]["value"] == "Président"  # la mère n'est pas touchée


async def test_parent_not_in_list_is_fetched_once_and_role_absent_is_still_named():
    calls: list[str] = []

    async def fetch(siren: str) -> list[dict]:
        calls.append(siren)
        return [_person("Paul Durand", None)]

    rows = [{"siren": F, "people": []}, {"siren": X, "people": []}]
    await group_people.inherit_group_people(rows, {(P, F), (P, X)}, fetch)
    assert calls == [P]
    assert rows[0]["people"][0]["role"]["value"] == "Dirigeant du groupe"
    assert rows[1]["people"][0]["role"]["value"] == "Dirigeant du groupe"


async def test_own_people_are_never_replaced_and_no_edge_means_nothing():
    rows = [{"siren": F, "people": [_person("Luc Petit")]}, {"siren": X, "people": []}]
    await group_people.inherit_group_people(rows, {(P, F)}, _no_fetch)
    assert rows[0]["people"][0]["name"]["value"] == "Luc Petit"
    assert rows[1]["people"] == []  # pas de lien sourcé : rien de deviné


async def test_fetch_failure_or_empty_leaves_the_subsidiary_empty():
    async def boom(_s: str) -> list[dict]:
        raise RuntimeError("down")

    rows = [{"siren": F, "people": []}]
    await group_people.inherit_group_people(rows, {(P, F)}, boom)
    assert rows[0]["people"] == []


async def test_key_absent_stays_absent():
    rows = [{"siren": F}]  # ce chemin ne regarde pas les personnes
    await group_people.inherit_group_people(rows, {(P, F)}, _no_fetch)
    assert "people" not in rows[0]
