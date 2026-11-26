"""#2805 (#2291.3) — DataForge/ORION comme source de CANDIDATS Découvrir.

Deux couches testées :

1. `app.services.data_sources.dataforge_candidates` — la projection d'une
   ligne `OrionAccountStatusView` (JSON du pont interne) sur la forme
   FACTUELLE du registre (même clés que `_registry_row`) : une ligne sans
   SIREN valide ou sans nom est écartée, jamais rendue à moitié vraie.
2. `POST /discover/registry` — DataForge COMPLÈTE la liste registre, jamais ne
   la remplace : dédupliquée par SIREN (le registre gagne), bornée par
   le volume demandé (#4793.1 : plafond de 5 levé, la coupe se fait au rang), et
   totalement absente quand le pont interne n'est pas configuré ou tombe en
   panne (`graceful_empty`, `source_registry.py`).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services.data_sources.dataforge_candidates import dataforge_candidates as project_dataforge_rows

# ── Couche 1 — la projection ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_projects_a_known_row_onto_the_registry_shape() -> None:
    with patch(
        "app.services.bellum_api.dataforge_candidates",
        new_callable=AsyncMock,
        return_value=[
            {
                "sourceId": "DF-0001",
                "entreprise": "ACME Test",
                "sirenSiret": "552100554",
                "sector": "Banque",
                "headquarters": "Paris",
                "accountPotentialScore": 90,
            }
        ],
    ):
        rows = await project_dataforge_rows(sector="Banque", limit=5)

    assert rows == [
        {
            "name": "ACME Test",
            "siren": "552100554",
            "nafCode": None,
            "sector": "Banque",
            "city": "Paris",
            "department": None,
            "headcountRange": None,
            "creationDate": None,
            "sizeClass": None,
            "headcountTranche": None,
            "establishmentCount": None,
            "legalCategory": None,
            "ceased": False,
        }
    ]


@pytest.mark.asyncio
async def test_drops_rows_without_a_real_siren_or_a_name() -> None:
    """Même règle n°1 que le registre public : pas de SIREN réel = pas de
    candidat. Un SIRET (14 chiffres) n'est PAS tronqué en SIREN — deviner les
    9 premiers chiffres n'est pas la même chose que les lire."""
    with patch(
        "app.services.bellum_api.dataforge_candidates",
        new_callable=AsyncMock,
        return_value=[
            {"sourceId": "DF-0002", "entreprise": "Sans SIREN", "sirenSiret": None},
            {"sourceId": "DF-0003", "entreprise": "", "sirenSiret": "552100554"},
            {"sourceId": "DF-0004", "entreprise": "SIRET pas SIREN", "sirenSiret": "55210055400017"},
        ],
    ):
        rows = await project_dataforge_rows(sector=None, limit=5)

    assert rows == []


@pytest.mark.asyncio
async def test_returns_nothing_without_crashing_when_the_bridge_is_unconfigured() -> None:
    """`bellum_api.dataforge_candidates` rend `None` sans clé/pont configuré
    (voir son docstring) — ce module le traite comme `[]`, jamais comme une
    panne qui remonte."""
    with patch("app.services.bellum_api.dataforge_candidates", new_callable=AsyncMock, return_value=None):
        assert await project_dataforge_rows(sector=None, limit=5) == []


@pytest.mark.asyncio
async def test_a_non_positive_limit_never_calls_the_bridge() -> None:
    with patch("app.services.bellum_api.dataforge_candidates", new_callable=AsyncMock) as bridge:
        assert await project_dataforge_rows(sector=None, limit=0) == []
    bridge.assert_not_awaited()


# ── Couche 2 — le branchement dans `/discover/registry` ─────────────────────

FILTERS = {"sector": "Banque"}

ROW_LYON = {
    "name": "ACME INDUSTRIE",
    "siren": "552081317",
    "nafCode": "62.02A",
    "sector": "Banque",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "100 à 199 salariés",
    "creationDate": "2005-03-14",
}

DATAFORGE_ROW = {
    "name": "ORION TARGET",
    "siren": "444556677",
    "nafCode": None,
    "sector": "Banque",
    "city": "Paris",
    "department": None,
    "headcountRange": None,
    "creationDate": None,
    "sizeClass": None,
    "headcountTranche": None,
    "establishmentCount": None,
    "legalCategory": None,
    "ceased": False,
}


def _post(client, **body: Any):
    return client.post("/discover/registry", json={"filters": FILTERS, **body})


def _claude(angles: list[dict]) -> Any:
    return patch(
        "app.routers.discover.call_claude",
        new_callable=AsyncMock,
        return_value=({"angles": angles}, None),
    )


@pytest.fixture
def registry(monkeypatch):
    class _Stub:
        rows: list[dict] = []

        async def __call__(self, filters, limit, degraded=None):
            return list(type(self).rows)

    stub = _Stub()
    _Stub.rows = []
    monkeypatch.setattr("app.routers.discover._registry_search", stub)
    return _Stub


@pytest.fixture
def fallback(monkeypatch):
    class _Stub:
        rows: list[dict] = []

        async def __call__(self, filters, limit, degraded=None):
            return list(type(self).rows)

    stub = _Stub()
    _Stub.rows = []
    monkeypatch.setattr("app.routers.discover._fallback_search", stub)
    return _Stub


def test_dataforge_candidates_complete_a_short_registry_list(client, registry, fallback, monkeypatch) -> None:
    registry.rows = [ROW_LYON]
    dataforge_mock = AsyncMock(return_value=[DATAFORGE_ROW])
    monkeypatch.setattr("app.routers.discover.dataforge_candidates", dataforge_mock)

    with _claude([]):
        body = _post(client, limit=10).json()

    sirens = {c["siren"] for c in body["candidates"]}
    assert sirens == {"552081317", "444556677"}
    dataforge_mock.assert_awaited_once()
    assert dataforge_mock.await_args.kwargs["sector"] == "Banque"

    by_siren = {c["siren"]: c for c in body["candidates"]}
    # #2805 (#2291.3) — la VRAIE provenance de chaque ligne, jamais le nom du
    # waterfall registre qui ne l'a pas produite (doctrine : nos fournisseurs
    # ne se nomment jamais à l'écran — "dataforge" reste un identifiant
    # interne, jamais une marque affichée telle quelle).
    assert by_siren["444556677"]["sources"][0]["name"] == "dataforge"
    assert by_siren["552081317"]["sources"][0]["name"] != "dataforge"


def test_the_registry_wins_on_a_siren_duplicate(client, registry, fallback, monkeypatch) -> None:
    """Un doublon ne fait jamais deux lignes : le registre — déjà résolu,
    déjà daté — gagne, DataForge n'ajoute que ce que le registre n'avait pas."""
    registry.rows = [ROW_LYON]
    duplicate = {**DATAFORGE_ROW, "siren": "552081317", "name": "NOM DATAFORGE JAMAIS AFFICHÉ"}
    monkeypatch.setattr("app.routers.discover.dataforge_candidates", AsyncMock(return_value=[duplicate]))

    with _claude([]):
        body = _post(client, limit=10).json()

    assert len(body["candidates"]) == 1
    assert body["candidates"][0]["name"] == "ACME INDUSTRIE"


def test_a_full_registry_page_still_consults_the_pack_and_the_rank_decides(
    client, registry, fallback, monkeypatch
) -> None:
    """#4793.1 (Louis 31/10) — revient sur « page pleine = pas de place » (#2805) : le pack est lu même quand le
    registre a rempli la page, borné au volume demandé ; la coupe à ``limit`` se fait au RANG."""
    registry.rows = [ROW_LYON]
    dataforge_mock = AsyncMock(return_value=[DATAFORGE_ROW])
    monkeypatch.setattr("app.routers.discover.dataforge_candidates", dataforge_mock)

    with _claude([]):
        body = _post(client, limit=1).json()

    assert len(body["candidates"]) == 1
    dataforge_mock.assert_awaited_once()
    assert dataforge_mock.await_args.kwargs["limit"] == 1


def test_an_unconfigured_bridge_leaves_the_registry_list_untouched(client, registry, fallback, monkeypatch) -> None:
    """`[]` gracieux (`graceful_empty`) : ni panne ni candidat manquant signalé
    — DataForge est un APPOINT, jamais structurant."""
    registry.rows = [ROW_LYON]
    monkeypatch.setattr("app.routers.discover.dataforge_candidates", AsyncMock(return_value=[]))
    # Hermétique : une panne RÉSEAU de TED/BOAMP se range désormais en `degraded` (DISCOVER-PARTIEL-2, ligne neutre) —
    # ce test parle du pont non configuré, pas de la joignabilité des marchés publics depuis la machine de test.
    monkeypatch.setattr("app.routers.discover.public_tenders", AsyncMock(return_value=[]))
    # Idem pour les signaux par carte : leur collecte réelle dépasse le budget `discover-signals` quand le réseau est
    # lent ou coupé, et `degraded` n'est alors plus vide.
    monkeypatch.setattr("app.routers.discover.it_job_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover.legal_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover.funding_signals", AsyncMock(return_value=[]))

    with _claude([]):
        body = _post(client, limit=10).json()

    assert [c["siren"] for c in body["candidates"]] == ["552081317"]
    assert body["degraded"] == []


def _eight_rows() -> list[dict]:
    return [{**DATAFORGE_ROW, "siren": f"44455667{i}", "name": f"ORION {i}"} for i in range(8)]


def test_a_registry_that_is_down_lifts_the_appoint_cap_and_says_where_the_rows_come_from(
    client, registry, fallback, monkeypatch
) -> None:
    """#2283.5/.26/.29 (épopée #2983) — source tombée : le registre public n'a
    RIEN rendu parce qu'il est en panne (une entrée de `degraded` SANS `kind`) ;
    le pack interne prend alors la relève au-delà du plafond d'appoint de 5,
    et chaque ligne dit sa vraie provenance (jamais le nom du registre)."""

    class _Down:
        async def __call__(self, filters, limit, degraded=None):
            if degraded is not None:
                degraded.append({"source": "registry", "reason": "timeout"})
            return []

    monkeypatch.setattr("app.routers.discover._registry_search", _Down())
    monkeypatch.setattr("app.routers.discover.dataforge_candidates", AsyncMock(return_value=_eight_rows()))

    with _claude([]):
        body = _post(client, limit=10).json()

    assert len(body["candidates"]) == 8
    assert {c["sources"][0]["name"] for c in body["candidates"]} == {"dataforge"}
    # La panne reste DITE : la bascule ne la masque pas.
    assert any(entry["reason"] == "timeout" for entry in body["degraded"])


def test_the_appoint_cap_is_the_requested_volume(client, registry, fallback, monkeypatch) -> None:
    """#4793.1 (Louis 31/10) — revient sur ``DATAFORGE_CANDIDATE_APPOINT_LIMIT = 5`` (#2805) : la borne est le
    volume demandé (10 ici), plus 5."""
    registry.rows = []
    dataforge_mock = AsyncMock(return_value=_eight_rows())
    monkeypatch.setattr("app.routers.discover.dataforge_candidates", dataforge_mock)

    with _claude([]):
        _post(client, limit=10).json()

    assert dataforge_mock.await_args.kwargs["limit"] == 10


def test_2983_the_pack_is_consulted_with_the_sector_the_chat_declared(client, registry, fallback, monkeypatch) -> None:
    """Recette prod 01/10 (« comptes banque Île-de-France ») : le chat pose `sectors`
    (liste), jamais `sector` — le pack était donc interrogé SANS secteur. Il l'est avec."""
    registry.rows = []
    dataforge_mock = AsyncMock(return_value=[DATAFORGE_ROW])
    monkeypatch.setattr("app.routers.discover.dataforge_candidates", dataforge_mock)

    with _claude([]):
        body = client.post("/discover/registry", json={"filters": {"sectors": ["Banque"]}, "limit": 10}).json()

    assert dataforge_mock.await_args.kwargs["sector"] == "Banque"
    assert {c["siren"] for c in body["candidates"]} == {"444556677"}
