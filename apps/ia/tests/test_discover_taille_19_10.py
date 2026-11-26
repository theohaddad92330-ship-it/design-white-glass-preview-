"""DISCOVER-TAILLE (19/10/2026) — « nucléaire : que des boîtes à 0 salarié ».

T.2 : la liste par taille reste UNE requête (``list_companies``) — plus de rappel silencieux (#4429.2).
T.4 : classement — les tranches 00/NN passent EN BAS, sans être exclues.
Tout le HTTP est moqué, aucun réseau.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.company_filters import CompanyDiscoveryFilters, tranche_codes_between
from app.services.data_sources.recherche_entreprises import list_companies


def _resp(results: list[dict[str, Any]]) -> httpx.Response:
    return httpx.Response(200, json={"results": results}, request=httpx.Request("GET", "https://x"))


def _hit(siren: str, name: str, tranche: str | None) -> dict[str, Any]:
    return {
        "siren": siren,
        "nom_complet": name,
        "activite_principale": "24.46Z",
        "tranche_effectif_salarie": tranche,
        "date_creation": "1990-01-01",
        "siege": {"libelle_commune": "PARIS", "departement": "75", "code_postal": "75001", "etat_administratif": "A"},
    }


def _client(*pages: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=list(pages))
    return c


def _tranches_sent(client: AsyncMock, call: int) -> str | None:
    return client.get.await_args_list[call].kwargs["params"].get("tranche_effectif_salarie")


ETI = tranche_codes_between("41", "52")


@pytest.mark.asyncio
async def test_t2_narrow_staffed_list_never_relaunches_on_other_tranches() -> None:
    # #4429.2/.4, #4433.3/.4 — la liste étroite n'est PLUS relancée en silence sur les tranches ≥ « 11 » :
    # une taille hors tranche n'apparaît que par un palier étiqueté (`widenedBy`), jamais fusionnée sans nom.
    client = _client(_resp([_hit("111111111", "ORANO", "53")]))
    rows = await list_companies(
        CompanyDiscoveryFilters(naf_code="24.46Z,35.11Z", headcount_tranches=ETI), 25, client=client
    )
    assert client.get.await_count == 1
    assert _tranches_sent(client, 0) == ",".join(ETI)
    assert [r["siren"] for r in rows] == ["111111111"]


@pytest.mark.asyncio
async def test_t2_a_full_enough_list_stays_one_request() -> None:
    page = [_hit(f"10000000{i}", f"ACTEUR {i}", "42") for i in range(5)]
    client = _client(_resp(page))
    rows = await list_companies(CompanyDiscoveryFilters(naf_code="24.46Z", headcount_tranches=ETI), 25, client=client)
    assert client.get.await_count == 1
    assert len(rows) == 5


@pytest.mark.asyncio
async def test_t2_without_a_size_target_nothing_changes() -> None:
    client = _client(_resp([_hit("111111111", "SCI X", "NN")]))
    await list_companies(CompanyDiscoveryFilters(naf_code="24.46Z"), 25, client=client)
    assert client.get.await_count == 1
    assert _tranches_sent(client, 0) is None


# ── T.4 — classement : 00/NN en bas, jamais exclus ───────────────────────────


def _cand(name: str, tranche: str | None, score: int, doubts: int = 0) -> dict[str, Any]:
    codes = ["x"] * doubts
    return {
        "name": name,
        "score": score,
        "headcountTranche": tranche,
        "headcountRange": None,
        "qualification": {"verdict": "to_verify" if doubts else "recommended", "code": codes[0] if codes else None,
                          "otherCodes": codes[1:]},
    }


def test_t4_staffed_companies_rank_above_zero_employee_ones_even_with_a_lower_score() -> None:
    from app.routers.discover import _rank_key

    shell = _cand("SPV SOLAIRE", "00", 90)
    unknown_size = _cand("ARGON", "NN", 80)
    real = _cand("FRAMATOME", "53", 40)
    ranked = sorted([shell, unknown_size, real], key=_rank_key, reverse=True)
    assert ranked[0]["name"] == "FRAMATOME"
    # jamais exclues : les deux coquilles restent dans la liste, dans l'ordre de leur score
    assert [c["name"] for c in ranked] == ["FRAMATOME", "SPV SOLAIRE", "ARGON"]


def test_t4_a_staffed_company_with_doubts_still_beats_a_shell_in_the_same_verdict() -> None:
    from app.routers.discover import _rank_key

    doubtful_but_staffed = _cand("BUREAU D'ÉTUDES", "32", 50, doubts=2)
    shell = _cand("SCI", "00", 50, doubts=2)
    assert _rank_key(doubtful_but_staffed) > _rank_key(shell)


def test_t4_an_unknown_tranche_is_not_demoted() -> None:
    from app.routers.discover import _rank_key

    assert _rank_key(_cand("SANS TRANCHE", None, 70)) > _rank_key(_cand("SHELL", "00", 70))
    assert _rank_key(_cand("SANS TRANCHE", None, 70)) == _rank_key(_cand("SANS TRANCHE 2", "", 70))


# ── T.5 — garde de FAMILLE : aucun secteur du mapping ne part sans tranche ───

from app.routers.discover import DiscoverFilters, _registry_filters  # noqa: E402
from app.services.application_sector_naf import APPLICATION_SECTOR_NAF  # noqa: E402

_SECTORS = sorted(APPLICATION_SECTOR_NAF)


def _shell_page() -> httpx.Response:
    """Une page 1 réaliste d'un secteur peuplé de véhicules : 25 coquilles sans salarié."""
    return _resp([_hit(f"9{i:08d}", f"SPV SOLAIRE {i}", "00") for i in range(25)])


def test_t5_the_guard_reads_the_real_mapping() -> None:
    assert len(_SECTORS) > 30
    assert any("," in ",".join(APPLICATION_SECTOR_NAF[s]) for s in _SECTORS)


@pytest.mark.asyncio
@pytest.mark.parametrize("sector", _SECTORS)
async def test_t5_an_eti_profile_query_never_leaves_without_a_tranche(sector: str) -> None:
    filters = DiscoverFilters(nafCode=",".join(APPLICATION_SECTOR_NAF[sector]), headcountMin=250, headcountMax=999)
    client = _client(_shell_page(), _shell_page())
    await list_companies(_registry_filters(filters), 25, client=client)
    assert client.get.await_count >= 1
    for call in client.get.await_args_list:
        assert call.kwargs["params"].get("tranche_effectif_salarie"), f"{sector}: requête sans tranche"


@pytest.mark.asyncio
async def test_t5_the_guard_says_no_when_no_size_is_targeted() -> None:
    """Sait dire NON : sans taille visée (ancien comportement), la requête part sans tranche."""
    filters = DiscoverFilters(nafCode="24.46Z,35.11Z")
    client = _client(_shell_page())
    await list_companies(_registry_filters(filters), 25, client=client)
    assert not client.get.await_args_list[0].kwargs["params"].get("tranche_effectif_salarie")
