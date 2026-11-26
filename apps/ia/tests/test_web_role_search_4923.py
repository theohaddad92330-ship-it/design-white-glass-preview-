"""#4923.10 / #4923.11 — recherche web ciblée par rôle."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from app.services.web_role_search import (
    SOURCE,
    employer_matches,
    merge_web_role_seeds,
    parse_linkedin_result,
    role_queries,
    web_role_search,
)


def _hit(name: str, role: str, employer: str, slug: str) -> dict:
    return {"title": f"{name} - {role} - {employer} | LinkedIn", "url": f"https://fr.linkedin.com/in/{slug}"}


def test_queries_are_bounded_and_fair_across_families() -> None:
    queries = role_queries("AXA", ["data", "achats", "dsi"], max_queries=5)
    assert len(queries) == 5
    assert {q[0] for q in queries[:3]} == {"data", "achats", "dsi"}  # une tournée équitable
    assert queries[0][2] == '"AXA" "Chief Data Officer" site:linkedin.com/in'


def test_no_account_no_query() -> None:
    assert role_queries("  ", ["data"]) == []


def test_parse_reads_only_what_is_rendered() -> None:
    assert parse_linkedin_result(_hit("Jane Doe", "Head of Data", "AXA", "jd")) == {
        "fullName": "Jane Doe",
        "title": "Head of Data",
        "employer": "AXA",
        "linkedinUrl": "https://fr.linkedin.com/in/jd",
    }
    # employeur absent du rendu → écarté, jamais complété
    assert parse_linkedin_result({"title": "Jane Doe - Head of Data | LinkedIn", "url": "https://linkedin.com/in/jd"}) is None
    # pas une page profil
    assert parse_linkedin_result(_hit("Jane Doe", "Head of Data", "AXA", "x") | {"url": "https://linkedin.com/company/axa"}) is None


def test_employer_must_be_the_account_or_its_group() -> None:
    assert employer_matches("AXA Group Operations", ["AXA"])
    assert not employer_matches("Allianz", ["AXA"])
    assert not employer_matches("", ["AXA"])


def test_search_rejects_other_employer_and_non_head_roles() -> None:
    async def search(_q: str) -> list[dict]:
        return [
            _hit("Jane Doe", "Head of Data", "AXA", "jd"),
            _hit("Paul Autre", "Head of Data", "Allianz", "pa"),  # mauvais employeur
            _hit("Mia Stagiaire", "Data Analyst", "AXA", "ms"),  # pas un rôle de tête
        ]

    found = asyncio.run(web_role_search("AXA", ["data"], search=search, max_queries=2))
    assert [f["fullName"] for f in found] == ["Jane Doe"]
    assert found[0]["source"] == SOURCE
    assert found[0]["matchProvenance"]["matchedVia"] == "web_role"


def test_a_failing_query_never_breaks_the_others() -> None:
    calls: list[str] = []

    async def search(q: str) -> list[dict]:
        calls.append(q)
        if len(calls) == 1:
            raise RuntimeError("boom")
        return [_hit("Jane Doe", "Chief Data Officer", "AXA", "jd")]

    found = asyncio.run(web_role_search("AXA", ["data"], search=search, max_queries=3))
    assert len(found) == 1


def test_without_key_is_a_strict_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    with patch("app.services.web_role_search.serper.serper_search") as net:
        assert asyncio.run(web_role_search("AXA", ["data"])) == []
    net.assert_not_called()


def test_no_family_without_head_means_no_call() -> None:
    async def search(_q: str) -> list[dict]:
        raise AssertionError("aucun appel attendu")

    assert asyncio.run(web_role_search("AXA", [], search=search)) == []


def test_merge_apollo_wins_and_web_adds_provenance_only() -> None:
    apollo = {"fullName": "Jane Doe", "title": "Head of Data", "linkedinUrl": "https://www.linkedin.com/in/jd/?trk=x", "email": "j@axa.com"}
    web = {
        "fullName": "Jane Doe",
        "title": "Head of Data",
        "linkedinUrl": "https://fr.linkedin.com/in/jd",
        "contactEmployer": "AXA",
        "source": SOURCE,
    }
    new = {"fullName": "Bob Neuf", "title": "CDO", "linkedinUrl": "https://linkedin.com/in/bn", "contactEmployer": "AXA", "source": SOURCE}
    out = merge_web_role_seeds([apollo], [web, new])
    assert [s["fullName"] for s in out] == ["Jane Doe", "Bob Neuf"]
    assert out[0]["email"] == "j@axa.com" and out[0]["alsoFoundBy"] == [SOURCE]
    assert out[1]["source"] == SOURCE


def test_same_name_other_employer_is_not_the_same_person() -> None:
    apollo = {"fullName": "Jane Doe", "title": "Head of Data", "organizationName": "Decathlon", "linkedinUrl": None}
    web = {"fullName": "Jane Doe", "title": "Head of Data", "linkedinUrl": "https://linkedin.com/in/jd2", "contactEmployer": "AXA", "source": SOURCE}
    assert len(merge_web_role_seeds([apollo], [web])) == 2


# #4928.3 — même garde d'employeur que la recherche Apollo : l'employeur extrait doit satisfaire (c) du garde partagé
# (nom égal, ou nom + suffixe juridique/géographique connu), jamais une simple inclusion de mots.
def test_4928_3_un_nom_commun_ne_ramene_pas_un_homonyme() -> None:
    async def search(_q: str) -> list[dict]:
        return [
            _hit("Jane Doe", "Head of Data", "Orange", "jd"),
            _hit("Julie France", "Head of Data", "Orange France", "jf"),  # nom + suffixe géographique connu
            _hit("Mia Fitness", "Head of Data", "Orange Bleue", "mf"),  # homonyme (salles de sport) : doit sortir
            _hit("Paul Autre", "Head of Data", "Orange Mécanique Production", "pm"),  # inclusion de mots : doit sortir
        ]

    found = asyncio.run(web_role_search("Orange", ["data"], search=search, max_queries=2))
    assert sorted(f["fullName"] for f in found) == ["Jane Doe", "Julie France"]
