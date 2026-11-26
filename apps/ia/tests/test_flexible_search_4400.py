"""#4400.1 (retour bêta ESN, 21/10/2026) — « archi cyber » doit trouver « Architecte Cybersécurité ».

Jumeau de ``matchesFlexibleQuery`` (packages/contracts/src/schemas/flexible-search.ts) : le MÊME fichier de cas
et de lexique (``fixtures/flexible-search.json``), relu ici. Une dérive entre les deux langages casse ce test."""

import json
from pathlib import Path

import pytest

from app.routers.discover import _rank_signals_by_keywords
from app.services.discover_skill_offers import _mentions
from app.services.flexible_search import SEARCH_LEXICON, explain_flexible_query, matches_flexible_query, search_tokens

_FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/contracts/src/fixtures/flexible-search.json").read_text(
        encoding="utf-8"
    )
)


def test_the_lexicon_is_the_shared_file() -> None:
    assert {k: list(v) for k, v in SEARCH_LEXICON.items()} == _FIXTURE["lexicon"]


@pytest.mark.parametrize("case", _FIXTURE["cases"], ids=lambda c: f"{c['query']}|{c['text']}")
def test_shared_cases(case: dict) -> None:
    assert matches_flexible_query(case["query"], case["text"]) is case["match"], case["why"]


@pytest.mark.parametrize("case", _FIXTURE["explain"], ids=lambda c: c["query"])
def test_explain(case: dict) -> None:
    assert explain_flexible_query(case["query"])["expanded"] == case["expanded"]


def test_the_guard_knows_how_to_say_no() -> None:
    refusals = [c for c in _FIXTURE["cases"] if not c["match"]]
    assert len(refusals) >= 4
    assert not any(matches_flexible_query(c["query"], c["text"]) for c in refusals)


def test_tokens_are_folded() -> None:
    assert search_tokens("  Développeurs  JAVA ") == ["developpeur", "java"]


def test_offers_are_read_flexibly() -> None:
    assert _mentions("archi cyber", "Architecte Cybersécurité — Lyon") is True
    assert _mentions("dev java", "Développeur Java confirmé") is True
    assert _mentions("archi cyber", "Chargé d'archives") is False


def test_observed_stack_and_signals_are_read_flexibly() -> None:
    signals = [
        {"label": "Offre — Architecte Cybersécurité", "detail": "", "technologies": []},
        {"label": "Offre — Chargé d'archives", "detail": "", "technologies": []},
    ]
    ranked = _rank_signals_by_keywords(signals, ["archi cyber"])
    assert ranked[0].get("keywordMatch") is True
    assert ranked[1].get("keywordMatch") is None
