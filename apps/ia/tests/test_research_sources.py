"""Unit tests for the source-typology rules.

Covers the typology slots in the ticket: scraping page web, interviews,
presse, site officiel, projets, offres d'emploi. The classifier is
deterministic and runs zero network — these tests catch regressions when
adding categories or tweaking regexes.
"""

from __future__ import annotations

from app.services.research.sources import (
    SourceCategory,
    classify,
    infer_official_hosts,
)


def test_press_classified_by_host_seed():
    assert classify(
        "https://www.usinedigitale.fr/article/capgemini-lance-une-offre-data.N123",
        "Capgemini lance une offre data",
        official_hosts=set(),
    ) is SourceCategory.PRESS


def test_press_classified_by_url_pattern():
    assert classify(
        "https://www.capgemini.com/news/press-releases/2024/cap-announces-q3.html",
        "Q3 results announcement",
        official_hosts={"www.capgemini.com"},
    ) is SourceCategory.PRESS


def test_jobs_classified_by_host_seed():
    assert classify(
        "https://www.welcometothejungle.com/fr/companies/capgemini/jobs",
        "Capgemini sur Welcome to the Jungle",
        official_hosts=set(),
    ) is SourceCategory.JOBS


def test_jobs_classified_by_url_pattern():
    assert classify(
        "https://www.capgemini.com/fr-fr/carrieres/nos-metiers",
        "Carrières — Nos métiers",
        official_hosts={"www.capgemini.com"},
    ) is SourceCategory.JOBS


def test_project_classified_by_url_pattern():
    assert classify(
        "https://www.capgemini.com/investors/annual-report-2024.pdf",
        "Annual Report 2024",
        official_hosts={"www.capgemini.com"},
    ) is SourceCategory.PROJECT


def test_project_classified_by_title():
    assert classify(
        "https://example.com/whatever",
        "Plan stratégique 2024-2026",
        official_hosts=set(),
    ) is SourceCategory.PROJECT


def test_interview_classified_by_title():
    assert classify(
        "https://example.com/article/blah",
        "Interview du DSI de Capgemini",
        official_hosts=set(),
    ) is SourceCategory.INTERVIEW


def test_official_when_on_corporate_host():
    assert classify(
        "https://www.capgemini.com/about-us",
        "About Capgemini",
        official_hosts={"www.capgemini.com"},
    ) is SourceCategory.OFFICIAL


def test_official_routed_to_specific_category_when_corporate_press_release():
    """A press release on the corporate site goes to PRESS, not OFFICIAL."""
    assert classify(
        "https://www.capgemini.com/news/press-releases/q3-results",
        "Press release: Q3 results",
        official_hosts={"www.capgemini.com"},
    ) is SourceCategory.PRESS


def test_falls_back_to_other_when_no_match():
    assert classify(
        "https://reddit.com/r/programming/comments/abc/discussion",
        "A discussion about something",
        official_hosts=set(),
    ) is SourceCategory.OTHER


def test_infer_official_hosts_picks_slug_match():
    hits = [
        {"url": "https://www.capgemini.com/about", "title": "About"},
        {"url": "https://lesechos.fr/article/capgemini", "title": "Article"},
        {"url": "https://www.capgemini.com/news/2024", "title": "News"},
        {"url": "https://welcometothejungle.com/capgemini", "title": "WTJ"},
    ]
    hosts = infer_official_hosts(hits, "Capgemini")
    assert "www.capgemini.com" in hosts
    assert "lesechos.fr" not in hosts


def test_infer_official_hosts_handles_short_company_name():
    hits = [
        {"url": "https://www.sncf.com/fr", "title": "SNCF"},
        {"url": "https://lesechos.fr/article", "title": "Article SNCF"},
    ]
    hosts = infer_official_hosts(hits, "SNCF")
    assert "www.sncf.com" in hosts


def test_infer_official_hosts_returns_empty_for_unknown_name():
    hits = [{"url": "https://random.com/abc", "title": "..."}]
    assert infer_official_hosts(hits, "AcmeCorp") == set()
