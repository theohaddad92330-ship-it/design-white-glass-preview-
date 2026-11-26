"""#2616.1 — la table de vérité UNIQUE des plateformes d'offres d'emploi
publiques (GA-26 : un réglage vit à un seul endroit) et la détection
plateforme/entreprise depuis l'URL d'une offre, réutilisée par
``job_search.list_hiring_companies_search`` ET par
``discover_signals._corroborate_hiring_platforms``.
"""

from __future__ import annotations

from app.services.data_sources.job_platforms import (
    JOB_PLATFORM_LABELS,
    company_from_url,
    platform_from_url,
)


def test_labels_cover_every_known_platform() -> None:
    assert JOB_PLATFORM_LABELS["wttj"] == "Welcome to the Jungle"
    assert JOB_PLATFORM_LABELS["greenhouse"] == "Greenhouse"
    assert JOB_PLATFORM_LABELS["lever"] == "Lever"
    assert JOB_PLATFORM_LABELS["teamtailor"] == "Teamtailor"
    assert JOB_PLATFORM_LABELS["smartrecruiters"] == "SmartRecruiters"
    assert JOB_PLATFORM_LABELS["welcomekit"] == "Welcomekit"


def test_platform_from_url_wttj() -> None:
    assert platform_from_url("https://www.welcometothejungle.com/fr/companies/doctolib/jobs/x") == "wttj"


def test_platform_from_url_lever() -> None:
    assert platform_from_url("https://jobs.lever.co/qonto/abc-123") == "lever"


def test_platform_from_url_greenhouse() -> None:
    assert platform_from_url("https://boards.greenhouse.io/algolia/jobs/456") == "greenhouse"


def test_platform_from_url_teamtailor_subdomain() -> None:
    assert platform_from_url("https://ledger.teamtailor.com/jobs/789-devops") == "teamtailor"


def test_platform_from_url_smartrecruiters() -> None:
    assert platform_from_url("https://jobs.smartrecruiters.com/CapgeminiFrance/12-dev") == "smartrecruiters"


def test_platform_from_url_welcomekit() -> None:
    assert platform_from_url("https://www.welcomekit.co/companies/alan/jobs/x") == "welcomekit"


def test_platform_from_url_unknown_host_is_none() -> None:
    assert platform_from_url("https://example.com/jobs/1") is None


def test_platform_from_url_empty_is_none() -> None:
    assert platform_from_url("") is None
    assert platform_from_url(None) is None  # type: ignore[arg-type]


def test_company_from_url_wttj_slug() -> None:
    assert company_from_url("https://www.welcometothejungle.com/fr/companies/groupe-sii/jobs/dev") == "Groupe Sii"


def test_company_from_url_lever_slug() -> None:
    assert company_from_url("https://jobs.lever.co/qonto/abc-123") == "Qonto"


def test_company_from_url_greenhouse_slug() -> None:
    assert company_from_url("https://boards.greenhouse.io/algolia/jobs/456") == "Algolia"


def test_company_from_url_teamtailor_subdomain() -> None:
    assert company_from_url("https://ledger.teamtailor.com/jobs/789-devops") == "Ledger"


def test_company_from_url_smartrecruiters_camel_case_slug() -> None:
    assert company_from_url("https://jobs.smartrecruiters.com/CapgeminiFrance/12-dev") == "Capgemini France"


def test_company_from_url_welcomekit_slug() -> None:
    assert company_from_url("https://www.welcomekit.co/companies/alan/jobs/x") == "Alan"


def test_company_from_url_unresolvable_is_none() -> None:
    assert company_from_url("https://jobs.lever.co/", "lever") is None
    assert company_from_url("https://example.com/x") is None
