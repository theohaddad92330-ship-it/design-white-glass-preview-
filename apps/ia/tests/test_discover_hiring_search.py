"""#2616.1 — « comptes qui recrutent » élargi au-delà de WTTJ/APEC via le
MOTEUR DE RECHERCHE déjà branché (``data_gateway.DataGateway``, waterfall
Serper → Tavily → Brave), en complément de l'index Algolia WTTJ (no-op tant
que l'opérateur n'a pas d'accès partenaire — voir ``wttj.py``).

Décision Louis 23/09/2026 (doctrine ``c79_collecte_large_mais_propre``) :
résultats de recherche PUBLICS uniquement — jamais l'index privé WTTJ ni sa
clé embarquée. Même contrat de sortie ROW que
``apec.py::list_hiring_companies_apec`` / ``wttj.py::list_hiring_companies_wttj``
(``name``/``siren``/``department``/``city``/``sourceLabel``/
``signal{type,label,date,url,detail}``).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.services.data_gateway import DataGateway
from app.services.data_sources.job_search import list_hiring_companies_search


def _hit(url: str, title: str, description: str = "", date: str = "") -> dict:
    return {"title": title, "url": url, "description": description, "source": "brave", "date": date}


def _recent(days_ago: int = 5) -> str:
    """Une date ISO RÉELLEMENT récente au moment du test — jamais une date en
    dur (voir memory ``une-date-de-capacite-recopiee-dans-un-test-devient-
    fausse-seule``)."""
    return (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat()


def _stub_gateway(
    monkeypatch: pytest.MonkeyPatch,
    by_query: dict[str, list[dict]] | None = None,
    default: list[dict] | None = None,
):
    calls: list[str] = []

    async def _fake_search(self, query, *, limit=10):
        calls.append(query)
        if by_query is not None:
            for needle, hits in by_query.items():
                if needle in query:
                    return hits
        return default or []

    monkeypatch.setattr(DataGateway, "search", _fake_search)
    return calls


async def test_noop_without_any_search_key(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("SERPER_API_KEY", "TAVILY_API_KEY", "BRAVE_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    spy = AsyncMock(return_value=[])
    with patch.object(DataGateway, "search", spy):
        out = await list_hiring_companies_search()
    assert out == []
    spy.assert_not_called()  # NO FAKE, NO network


async def test_extracts_employer_from_wttj_search_hit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    date = _recent(5)
    url = f"https://www.welcometothejungle.com/fr/companies/doctolib/jobs/dev-python-{date}"
    _stub_gateway(
        monkeypatch,
        by_query={"welcometothejungle.com": [_hit(url, "Développeur Python H/F CDI")]},
    )
    out = await list_hiring_companies_search()
    assert [row["name"] for row in out] == ["Doctolib"]
    assert out[0]["sourceLabel"] == "Welcome to the Jungle"
    assert out[0]["signal"]["type"] == "hiring"
    assert out[0]["signal"]["url"] == url
    assert out[0]["signal"]["date"] == date
    assert out[0]["siren"] is None


async def test_extracts_employer_from_lever_search_hit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    url = f"https://jobs.lever.co/qonto/abc-123-{_recent(3)}"
    _stub_gateway(monkeypatch, by_query={"jobs.lever.co": [_hit(url, "Ingénieur DevOps CDI")]})
    out = await list_hiring_companies_search()
    assert [row["name"] for row in out] == ["Qonto"]
    assert out[0]["sourceLabel"] == "Lever"


async def test_drops_hits_outside_the_intended_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le `site:` de Brave n'est pas garanti à 100% — un résultat hors
    domaine ciblé n'est jamais rattaché à une plateforme au hasard."""
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    _stub_gateway(
        monkeypatch,
        by_query={"welcometothejungle.com": [_hit("https://example.com/blog/x", "Article de blog")]},
    )
    out = await list_hiring_companies_search()
    assert out == []


async def test_drops_non_it_offers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    url = f"https://boards.greenhouse.io/acme/jobs/1-{_recent(4)}"
    _stub_gateway(monkeypatch, by_query={"boards.greenhouse.io": [_hit(url, "Comptable F/H CDI")]})
    out = await list_hiring_companies_search(profile={"offerDomain": "esn_it"})
    assert out == []


async def test_drops_hits_without_a_resolvable_company_slug(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    url = "https://jobs.lever.co/"
    _stub_gateway(monkeypatch, by_query={"jobs.lever.co": [_hit(url, "Développeur Python CDI")]})
    out = await list_hiring_companies_search()
    assert out == []


async def test_drops_hits_with_no_parseable_date_never_guesses_one(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2616.1 — sans date, la ligne n'est jamais retenue : une date DEVINÉE
    (ex. aujourd'hui) fausserait le tri par fraîcheur. Même choix qu'APEC/WTTJ
    (broadcast), qui excluent déjà silencieusement leurs offres sans date."""
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    url = "https://jobs.lever.co/qonto/no-date-here"
    _stub_gateway(monkeypatch, by_query={"jobs.lever.co": [_hit(url, "Développeur Python CDI")]})
    out = await list_hiring_companies_search()
    assert out == []


async def test_extracts_employer_from_a_real_dateless_lever_url_via_provider_date(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#2616.1 — LA cause de « prod ne montre toujours que France Travail »
    (recette 23/09) : une VRAIE offre Lever n'a jamais de date dans son URL
    (un identifiant opaque, pas ``/YYYY-MM-DD/``) — contrairement aux URLs de
    test ci-dessus qui en fabriquaient une. Sans la date RÉELLE que Brave rend
    par résultat (``page_age``, transmise par ``data_gateway.brave_search_single``
    depuis le 24/09), cette ligne était droppée à 100 % en prod. Jamais devinée
    ici : c'est la métadonnée du fournisseur, pas une date inventée."""
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    url = "https://jobs.lever.co/qonto/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    _stub_gateway(
        monkeypatch,
        by_query={"jobs.lever.co": [_hit(url, "Ingénieur DevOps CDI", date=_recent(3))]},
    )
    out = await list_hiring_companies_search()
    assert [row["name"] for row in out] == ["Qonto"]


async def test_drops_offers_older_than_since_days(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    url = "https://jobs.lever.co/qonto/old-1900-01-01"
    _stub_gateway(monkeypatch, by_query={"jobs.lever.co": [_hit(url, "Développeur Python CDI")]})
    out = await list_hiring_companies_search(since_days=90)
    assert out == []


async def test_dedups_by_url_across_platform_queries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    url = f"https://jobs.lever.co/qonto/abc-{_recent(2)}"
    hits = [_hit(url, "Développeur Python CDI")]
    _stub_gateway(monkeypatch, default=hits)
    out = await list_hiring_companies_search()
    assert len(out) == 1


async def test_never_raises_on_gateway_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")

    async def _boom(self, query, *, limit=10):
        raise RuntimeError("boom")

    monkeypatch.setattr(DataGateway, "search", _boom)
    assert await list_hiring_companies_search() == []


async def test_row_never_names_our_own_search_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    """Doctrine : nos fournisseurs ne se nomment jamais — seule la plateforme
    PUBLIQUE de l'entreprise cible (Lever, WTTJ…) apparaît."""
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    url = f"https://jobs.lever.co/qonto/abc-{_recent(2)}"
    _stub_gateway(monkeypatch, by_query={"jobs.lever.co": [_hit(url, "Développeur Python CDI")]})
    out = await list_hiring_companies_search()
    assert out  # la ligne doit exister pour que le test prouve quelque chose
    blob = str(out)
    for forbidden in ("brave", "serper", "tavily", "Brave", "Serper", "Tavily"):
        assert forbidden not in blob
