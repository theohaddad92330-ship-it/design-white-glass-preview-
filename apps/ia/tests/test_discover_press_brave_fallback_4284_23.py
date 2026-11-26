"""#4284.23 / #4286.3 — une carte Découvrir sans actualité dans les flux RSS lit aussi les brèves
datées de la recherche d'actualités, rattachées par SIREN (jamais sur le seul nom).

Cause (recette prod 19-20/10) : les flux RSS ne nomment presque jamais une PME ; sans autre source, 8 cartes
sur 10 ne portaient que des offres d'emploi. L'analyse complète lit déjà cette source ; la carte ne la lisait pas.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.routers import discover

SIREN = "552049447"


def _brave_item(title: str, *, days: int = 3, description: str = "") -> dict:
    age = f"{days} days ago"
    return {"title": title, "url": f"https://exemple.test/{abs(hash(title))}", "age": age, "description": description}


@pytest.fixture
def no_rss(monkeypatch):
    async def _empty(*_a, **_k):
        return []

    monkeypatch.setattr(discover, "press_signals", _empty)


def test_carte_sans_rss_lit_les_breves_rattachees_par_siren(monkeypatch, no_rss):
    async def _news(company, **_k):
        return [_brave_item("Catamania remporte un contrat de refonte SI", description=f"SIREN {SIREN}")]

    monkeypatch.setattr(discover, "recent_news", _news)
    rows = asyncio.run(discover._press_for("Catamania", SIREN, None))
    assert [r["title"] for r in rows] == ["Catamania remporte un contrat de refonte SI"]
    assert rows[0]["published_at"].startswith(
        (datetime.now(UTC) - timedelta(days=3)).strftime("%Y-%m")[:4]
    )


def test_NON_une_breve_qui_ne_nomme_pas_l_entite_est_ecartee(monkeypatch, no_rss):
    async def _news(company, **_k):
        return [_brave_item("Une autre société lève des fonds")]

    monkeypatch.setattr(discover, "recent_news", _news)
    assert asyncio.run(discover._press_for("Catamania", SIREN, None)) == []


def test_NON_sans_siren_ancre_aucune_breve(monkeypatch, no_rss):
    async def _news(company, **_k):
        return [_brave_item("Catamania recrute")]

    monkeypatch.setattr(discover, "recent_news", _news)
    assert asyncio.run(discover._press_for("Catamania", "", None)) == []


def test_NON_les_flux_rss_suffisent_alors_pas_d_appel_actualites(monkeypatch):
    async def _rss(*_a, **_k):
        return [{"type": "autre", "title": "Catamania ouvre une agence", "url": "https://x.test/a", "published_at": "2026-10-01T00:00:00+00:00"}]

    async def _boom(*_a, **_k):
        raise AssertionError("la recherche d'actualités ne doit pas partir quand les flux ont répondu")

    monkeypatch.setattr(discover, "press_signals", _rss)
    monkeypatch.setattr(discover, "recent_news", _boom)
    assert len(asyncio.run(discover._press_for("Catamania", SIREN, None))) == 1
