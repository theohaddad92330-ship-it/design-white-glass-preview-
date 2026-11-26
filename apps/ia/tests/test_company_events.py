"""#3921 — événements d'entreprise OFFICIELS et datés, par SIREN.

Sans réseau : les réponses sont des fixtures fidèles à ce qui a été OBSERVÉ le
08/10/2026 sur recherche-entreprises.api.gouv.fr (SIREN 552032534) :
- `/search?q=<siren>` rend l'unité légale (nom_complet, siren, dirigeants SANS date,
  tranche d'effectif avec seulement `annee_tranche_effectif_salarie`) mais
  `matching_etablissements` y est VIDE ;
- `/search?q=<nom>&limite_matching_etablissements=100` rend la liste des
  établissements avec `siret`, `date_creation`, `etat_administratif`, `est_siege`.
Aucun champ de date de nomination d'un dirigeant, ni d'historique d'effectif, n'a
été observé : ces deux types ne sont donc JAMAIS émis (contrat vérifié ou rien).
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.middleware.correlation_id import _correlation_id as correlation_id_var
from app.services import source_health as registry
from app.services.data_sources import company_events as ce

CID = "cid-company-events"
SIREN = "552032534"


@pytest.fixture(autouse=True)
def _scope(monkeypatch: pytest.MonkeyPatch):
    registry.clear_degradations(CID)
    token = correlation_id_var.set(CID)
    monkeypatch.setenv("COMPANY_EVENTS_ENABLED", "true")
    yield
    correlation_id_var.reset(token)
    registry.clear_degradations(CID)


def _days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


def _etab(siret: str, created: str | None, *, state: str = "A", siege: bool = False) -> dict:
    return {
        "siret": siret,
        "date_creation": created,
        "date_debut_activite": created,
        "etat_administratif": state,
        "est_siege": siege,
        "tranche_effectif_salarie": "NN",
        "adresse": "1 RUE TEST 75001 PARIS",
        "libelle_commune": "PARIS",
    }


def _unit(siren: str = SIREN, etabs: list[dict] | None = None) -> dict:
    return {
        "siren": siren,
        "nom_complet": "DANONE",
        "nom_raison_sociale": "DANONE",
        "dirigeants": [{"nom": "X", "prenoms": "Y", "qualite": "Directeur Général"}],
        "tranche_effectif_salarie": "42",
        "annee_tranche_effectif_salarie": 2024,
        "matching_etablissements": etabs or [],
    }


def _client(by_siren: dict, by_name: dict) -> AsyncMock:
    async def get(url: str, params: dict | None = None, **_kw):
        q = (params or {}).get("q")
        body = by_siren if q == SIREN else by_name
        return httpx.Response(200, json={"results": [body]}, request=httpx.Request("GET", url))

    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=get)
    return c


@pytest.mark.asyncio
async def test_recent_new_establishment_is_reported_with_its_date() -> None:
    recent = _days_ago(30)
    client = _client(_unit(), _unit(etabs=[_etab("55203253400711", recent)]))
    out = await ce.company_events(SIREN, client=client)
    assert len(out) == 1
    ev = out[0]
    assert ev["type"] == "new_establishment"
    assert ev["date"] == recent
    assert ev["source"] == "recherche-entreprises"
    assert "PARIS" in ev["label"]
    assert ev["url"] is None or ev["url"].startswith("https://")


@pytest.mark.asyncio
async def test_old_establishment_is_kept_lot762() -> None:
    # Lot 762 : plus de fenêtre de 180 j — un établissement ouvert il y a 900 j reste un événement daté.
    client = _client(_unit(), _unit(etabs=[_etab("55203253400679", _days_ago(900))]))
    assert len(await ce.company_events(SIREN, client=client)) == 1


@pytest.mark.asyncio
async def test_undated_establishment_is_dropped_never_treated_as_recent() -> None:
    client = _client(_unit(), _unit(etabs=[_etab("55203253400679", None)]))
    assert await ce.company_events(SIREN, client=client) == []


@pytest.mark.asyncio
async def test_closed_establishment_is_not_a_new_opening() -> None:
    client = _client(_unit(), _unit(etabs=[_etab("55203253400679", _days_ago(10), state="F")]))
    assert await ce.company_events(SIREN, client=client) == []


@pytest.mark.asyncio
async def test_since_days_window_is_respected() -> None:
    client = _client(_unit(), _unit(etabs=[_etab("55203253400711", _days_ago(100))]))
    assert await ce.company_events(SIREN, since_days=30, client=client) == []


@pytest.mark.asyncio
async def test_homonym_with_another_siren_is_never_attached() -> None:
    other = _unit(siren="123456789", etabs=[_etab("12345678900011", _days_ago(5))])
    client = _client(_unit(), other)
    assert await ce.company_events(SIREN, client=client) == []


@pytest.mark.asyncio
async def test_no_executive_or_headcount_event_without_a_dated_source_field() -> None:
    """Dirigeants sans date de nomination, effectif sans historique : rien d'inventé."""
    client = _client(_unit(), _unit(etabs=[]))
    out = await ce.company_events(SIREN, client=client)
    assert out == []
    assert {e["type"] for e in out} <= {"new_establishment"}


@pytest.mark.asyncio
async def test_missing_siren_returns_empty_without_network() -> None:
    client = _client(_unit(), _unit())
    assert await ce.company_events("", client=client) == []
    assert await ce.company_events("12", client=client) == []
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_disabled_flag_returns_empty_without_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COMPANY_EVENTS_ENABLED", "false")
    client = _client(_unit(), _unit())
    assert await ce.company_events(SIREN, client=client) == []
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_network_error_returns_empty_and_records_degradation() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
    assert await ce.company_events(SIREN, client=c) == []
    reasons = [e["reason"] for e in registry.get_degradations(CID) if e["source"] == "company_events"]
    assert reasons and "connection refused" in reasons[0]


@pytest.mark.asyncio
async def test_events_are_sorted_newest_first() -> None:
    etabs = [
        _etab("55203253400711", _days_ago(60)),
        _etab("55203253400729", _days_ago(5)),
    ]
    client = _client(_unit(), _unit(etabs=etabs))
    out = await ce.company_events(SIREN, client=client)
    assert [e["date"] for e in out] == [_days_ago(5), _days_ago(60)]
