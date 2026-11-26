"""#4400.1 (recette prod 22/10) — « archi cyber » rendait le vide alors que « dev js » marchait.

Deux causes : (1) le lexique ne lisait « cyber » que comme « cybersécurité / ssi » — « Architecte sécurité » et
« Security architect » ne matchaient pas ; (2) la source d'offres était interrogée avec la saisie BRUTE
(« archi cyber »), qui n'est un mot d'aucune offre : rien ne revenait, donc rien à filtrer. Aucun appel réseau :
des intitulés figés et des sources simulées."""

from __future__ import annotations

import time
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.routers.discover import _skill_widening_steps
from app.services import discover_skill_offers as skill
from app.services.criteria_widening import widen_rows
from app.services.flexible_search import matches_flexible_query, upstream_query

MATCHING = [
    "Architecte cybersécurité",
    "Architecte sécurité",
    "Architecte SSI",
    "Security architect",
    "Architecte sécurité des systèmes d'information",
    "Architecte réseau et sécurité",
]
REFUSED = ["Chargé d'archives", "Agent de sécurité", "Développeur Java", "Architecte logiciel"]


@pytest.mark.parametrize("title", MATCHING)
def test_abbreviated_query_reads_the_real_titles(title: str) -> None:
    assert matches_flexible_query("archi cyber", title) is True


@pytest.mark.parametrize("title", REFUSED)
def test_the_guard_still_says_no(title: str) -> None:
    assert matches_flexible_query("archi cyber", title) is False


def test_plain_terms_are_not_rewritten() -> None:
    assert upstream_query("java") == "java"
    assert upstream_query("  Java   Spring ") == "Java Spring"


def test_upstream_query_expands_every_abbreviation() -> None:
    assert upstream_query("archi cyber") == "architecte cybersécurité"


def _frozen(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    asked: list[str] = []

    async def ft(term: str, department: str | None, profile: Any, *, page: int = 0) -> list[dict]:
        asked.append(term)
        if term != "architecte cybersécurité":
            return []  # la source ne connaît pas « archi cyber » : ce n'est le mot d'aucune offre
        return [
            {
                "employer": "Acme",
                "siren": "123456789",
                "title": "Architecte sécurité",
                "department": "69",
                "date": time.strftime("%Y-%m-%d"),
                "url": "https://x/1",
                "source": "france_travail",
                "termChecked": True,
            }
        ]

    monkeypatch.setattr(skill, "france_travail_offers", ft)
    monkeypatch.setattr(skill, "adzuna_offers", AsyncMock(return_value=[]))
    monkeypatch.setattr(skill, "cached_offers", AsyncMock(return_value=[]))
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    return asked


async def test_the_source_is_asked_with_the_expanded_form(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = _frozen(monkeypatch)
    harvest = await skill.harvest_skill_offers(["archi cyber"], ["69"], {}, deadline=None)
    assert "architecte cybersécurité" in asked
    assert [o["employer"] for o in harvest.offers] == ["Acme"]
    assert harvest.offers[0]["skill"] == "archi cyber"


async def test_a_plain_term_costs_no_extra_call(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = _frozen(monkeypatch)
    # #4579 — « java » se décline désormais ; un terme sans écriture connue du référentiel reste UN appel.
    await skill.harvest_skill_offers(["kafka"], ["69"], {}, deadline=None)
    assert asked == ["kafka"]


async def test_strict_empty_tries_the_weighted_or_tier_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    searched: list[list[str]] = []

    async def find(terms: list[str], zone: Any, profile: Any, *, deadline: Any, city: Any) -> Any:
        searched.append(list(terms))
        account = {"siren": "123456789", "skillEvidence": {"skill": terms[0]}}
        return skill.SkillAccounts(accounts=[account])

    monkeypatch.setattr("app.routers.discover.find_skill_accounts", find)
    monkeypatch.setattr("app.routers.discover._skill_rows", lambda accounts: [dict(a) for a in accounts])
    steps = _skill_widening_steps(["archi cyber"], ["69"], {}, time.monotonic() + 60, None, [])
    rows, widening = await widen_rows([], steps, key=lambda r: str(r.get("siren") or ""))
    assert searched, "le palier OU doit être tenté, jamais le vide sans palier"
    assert all("archi cyber" not in group for group in searched)
    assert rows[0]["widenedBy"]["axis"] == "skill"
    assert widening is not None and widening["exactCount"] == 0


def test_dev_js_keeps_its_referential_tiers_and_gets_no_or_tier() -> None:
    from app.services.criteria_referential import skill_widening_tiers

    deadline = time.monotonic() + 60
    steps = _skill_widening_steps(["dev js"], ["69"], {}, deadline, None, [])
    assert [tier for _axis, tier, _fetch in steps] == [tier for tier, _items in skill_widening_tiers("dev js")]
