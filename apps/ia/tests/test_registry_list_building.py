"""List-building from the French registry — Découvrir v2, lot « registre ».

Two keyed/keyless sources produce the REGISTRY half of ``DiscoverCandidate``
(agent_docs/discover-v2-contract.md):

* Pappers ``/v2/recherche`` (needs ``PAPPERS_API_KEY``) —
  :func:`app.services.pappers.search_companies_filtered`
* recherche-entreprises.api.gouv.fr (NO key, the fallback) —
  :func:`app.services.data_sources.recherche_entreprises.list_companies`

Contract rules exercised here:

* every new filter is OPTIONAL and absent filters are NEVER serialized;
* a source that is tokenless / rate-limited / erroring returns ``[]`` **and**
  appends a machine-readable ``{source, reason}`` to the caller's ``degraded``
  sink — never a silent swallow, never an invented row;
* a row without a SIREN is dropped (« Pas de SIREN = candidat écarté »).

All HTTP is mocked — no network.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.services.company_filters import (
    HEADCOUNT_TRANCHE_LABELS,
    CompanyDiscoveryFilters,
    DegradeReason,
    department_from_postal_code,
    headcount_label,
    looks_like_public_administration_name,
    tranche_codes_between,
)
from app.services.data_sources import recherche_entreprises as re_src
from app.services.data_sources.recherche_entreprises import fetch_company, list_companies
from app.services.pappers import search_companies_filtered
from app.services.pappers.discovery import to_pappers_search_params

REGISTRY_KEYS = {
    "name",
    "siren",
    "nafCode",
    "sector",
    "city",
    "department",
    "headcountRange",
    "creationDate",
}


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


def _client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=resp)
    return c


def _boom_client(exc: Exception) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=exc)
    return c


def _params_of(mock_client: AsyncMock) -> dict[str, Any]:
    return mock_client.get.await_args.kwargs["params"]


# ── CompanyDiscoveryFilters — validation ─────────────────────────────────────


def test_filters_are_all_optional() -> None:
    """An empty filter object is legal — the current callers pass nothing."""
    f = CompanyDiscoveryFilters()
    assert f.model_dump(exclude_none=True) == {}


def test_filters_normalize_naf_code() -> None:
    assert CompanyDiscoveryFilters(naf_code="6202a").naf_code == "62.02A"
    assert CompanyDiscoveryFilters(naf_code=" 62.02A ").naf_code == "62.02A"
    assert CompanyDiscoveryFilters(naf_code="62").naf_code == "62"


def test_filters_reject_bogus_naf_code() -> None:
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(naf_code="informatique")


def test_filters_accept_corsican_and_dom_departments() -> None:
    assert CompanyDiscoveryFilters(department="2a").department == "2A"
    assert CompanyDiscoveryFilters(department="971").department == "971"
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(department="Rhône")


def test_filters_reject_unknown_headcount_tranche() -> None:
    assert CompanyDiscoveryFilters(headcount_tranche_min="32").headcount_tranche_min == "32"
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(headcount_tranche_min="250-499")


def test_filters_reject_inverted_ranges() -> None:
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(headcount_tranche_min="41", headcount_tranche_max="12")
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(creation_date_min="2020-01-01", creation_date_max="2015-01-01")
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(revenue_min=100, revenue_max=10)


def test_filters_require_iso_dates() -> None:
    assert CompanyDiscoveryFilters(creation_date_min="2015-01-01").creation_date_min == "2015-01-01"
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(creation_date_min="01-01-2015")
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(creation_date_min="2015-13-45")


def test_filters_forbid_unknown_keys() -> None:
    """A typo must 422 rather than be silently ignored."""
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(departement="69")


def test_filters_reject_bad_postal_code_and_section() -> None:
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(postal_code="6900")
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(naf_section="ZZ")
    assert CompanyDiscoveryFilters(naf_section="j").naf_section == "J"


# ── Shared registry helpers ──────────────────────────────────────────────────


def test_department_from_postal_code() -> None:
    assert department_from_postal_code("69003") == "69"
    assert department_from_postal_code("97400") == "974"
    assert department_from_postal_code("20000") == "2A"
    assert department_from_postal_code("20200") == "2B"
    assert department_from_postal_code("") is None
    assert department_from_postal_code("abcde") is None


def test_headcount_label_maps_insee_codes_only() -> None:
    assert headcount_label("32") == HEADCOUNT_TRANCHE_LABELS["32"]
    # « NN » = effectif non renseigné → jamais un libellé inventé.
    assert headcount_label("NN") is None
    assert headcount_label(None) is None


def test_tranche_codes_between_expands_a_range() -> None:
    assert tranche_codes_between("31", "41") == ["31", "32", "41"]
    assert tranche_codes_between("32", "32") == ["32"]
    # Open-ended bounds.
    assert tranche_codes_between("52", None) == ["52", "53"]
    assert tranche_codes_between(None, None) == []


# #3901 — un employeur nommé « Mairie de X »/« Commune de X »… n'est jamais
# l'homonyme privé recherché, quel que soit le succès d'un simple sous-chaîne.
@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Mairie de Still", True),
        ("MAIRIE DE STILL", True),
        ("Commune de Still", True),
        ("Ville de Paris", True),
        ("CCAS de Lyon", True),
        ("Préfecture du Rhône", True),
        ("Conseil départemental du Bas-Rhin", True),
        ("Communauté de communes du Pays de Still", True),
        ("STILL", False),
        ("Still France", False),
        ("Région Est Transport", False),  # pas suivi de de/du/des : un vrai nom d'entreprise
        ("", False),
        (None, False),
    ],
)
def test_looks_like_public_administration_name(name: str | None, expected: bool) -> None:
    assert looks_like_public_administration_name(name) is expected


# ── Pappers — search_companies_filtered ──────────────────────────────────────


def test_pappers_filters_serialize_to_wire_names() -> None:
    """« NAF 62.02 × département 69 × effectif 250-499 × créée après 2015 »."""
    params = to_pappers_search_params(
        CompanyDiscoveryFilters(
            naf_code="62.02A",
            department="69",
            headcount_tranche_min="32",
            headcount_tranche_max="32",
            creation_date_min="2015-01-01",
            on_headquarters_only=True,
            revenue_min=1_000_000,
        )
    )
    wire = params.model_dump(exclude_none=True, by_alias=True)
    assert wire["code_naf"] == "62.02A"
    assert wire["departement"] == "69"
    assert wire["tranche_effectif_min"] == "32"
    assert wire["tranche_effectif_max"] == "32"
    # Pappers dates are JJ-MM-AAAA (see CompanySearchParams) — converted from ISO.
    assert wire["date_creation_min"] == "01-01-2015"
    assert wire["siege"] is True
    assert wire["chiffre_affaires_min"] == "1000000"


def test_pappers_omits_absent_filters() -> None:
    """Absent = never serialized, so the current callers stay byte-identical."""
    wire = to_pappers_search_params(CompanyDiscoveryFilters()).model_dump(
        exclude_none=True, by_alias=True
    )
    assert wire == {}


@pytest.mark.asyncio
async def test_pappers_returns_contract_shaped_rows(monkeypatch) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    payload = {
        "resultats": [
            {
                "siren": "330703844",
                "nom_entreprise": "CAPGEMINI",
                "code_naf": "62.02A",
                "libelle_code_naf": "Conseil en systèmes et logiciels informatiques",
                "date_creation": "1984-06-11",
                "effectif": "250 à 499 salariés",
                "siege": {"ville": "Lyon", "code_postal": "69003"},
            }
        ]
    }
    client = _client(_resp(payload))
    degraded: list[dict[str, str]] = []
    rows = await search_companies_filtered(
        CompanyDiscoveryFilters(naf_code="62.02A", department="69"),
        10,
        degraded=degraded,
        http_client=client,
    )

    assert degraded == []
    assert len(rows) == 1
    row = rows[0]
    assert set(row) >= REGISTRY_KEYS
    assert row["name"] == "CAPGEMINI"
    assert row["siren"] == "330703844"
    assert row["nafCode"] == "62.02A"
    assert row["sector"] == "Conseil en systèmes et logiciels informatiques"
    assert row["city"] == "Lyon"
    assert row["department"] == "69"  # derived from the siège postal code
    assert row["headcountRange"] == "250 à 499 salariés"
    assert row["creationDate"] == "1984-06-11"
    assert row["source"] == "pappers"


@pytest.mark.asyncio
async def test_pappers_sends_limit_and_excludes_ceased(monkeypatch) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    client = _client(_resp({"resultats": []}))
    await search_companies_filtered(CompanyDiscoveryFilters(), 7, http_client=client)
    params = _params_of(client)
    assert params["par_page"] == "7"
    # Ceased companies are excluded unless the caller asks otherwise.
    assert params["entreprise_cessee"] == "false"
    assert params["api_token"] == "k"


@pytest.mark.asyncio
async def test_pappers_drops_rows_without_siren(monkeypatch) -> None:
    """Contract : « Un candidat sans SIREN résolu n'est jamais rendu »."""
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    payload = {"resultats": [{"nom_entreprise": "Sans SIREN"}, {"siren": "552100554", "nom_entreprise": "OK"}]}
    rows = await search_companies_filtered(
        CompanyDiscoveryFilters(), 10, http_client=_client(_resp(payload))
    )
    assert [r["siren"] for r in rows] == ["552100554"]


@pytest.mark.asyncio
async def test_pappers_without_key_degrades_without_network(monkeypatch) -> None:
    monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
    client = _client(_resp({"resultats": []}))
    degraded: list[dict[str, str]] = []
    rows = await search_companies_filtered(
        CompanyDiscoveryFilters(), 10, degraded=degraded, http_client=client
    )
    assert rows == []
    assert degraded == [{"source": "pappers", "reason": DegradeReason.MISSING_API_KEY}]
    client.get.assert_not_awaited()  # tokenless = ZERO network


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "reason"),
    [
        (429, DegradeReason.RATE_LIMITED),
        (401, DegradeReason.UNAUTHORIZED),
        (402, DegradeReason.QUOTA_EXCEEDED),
        (500, DegradeReason.UPSTREAM_ERROR),
    ],
)
async def test_pappers_http_failures_map_to_reasons(monkeypatch, status: int, reason: str) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    degraded: list[dict[str, str]] = []
    rows = await search_companies_filtered(
        CompanyDiscoveryFilters(), 10, degraded=degraded, http_client=_client(_resp({}, status))
    )
    assert rows == []
    assert degraded == [{"source": "pappers", "reason": reason}]


@pytest.mark.asyncio
async def test_pappers_network_error_degrades(monkeypatch) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    degraded: list[dict[str, str]] = []
    rows = await search_companies_filtered(
        CompanyDiscoveryFilters(),
        10,
        degraded=degraded,
        http_client=_boom_client(httpx.ConnectError("boom")),
    )
    assert rows == []
    assert degraded == [{"source": "pappers", "reason": DegradeReason.NETWORK_ERROR}]


@pytest.mark.asyncio
async def test_pappers_degradation_works_without_a_sink(monkeypatch) -> None:
    """The ``degraded`` sink is optional — a caller that omits it still gets []."""
    monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
    assert await search_companies_filtered(CompanyDiscoveryFilters(), 10) == []


# ── recherche-entreprises (keyless) — list_companies ─────────────────────────


@pytest.mark.asyncio
async def test_gouv_serializes_native_filters() -> None:
    client = _client(_resp({"results": []}))
    await list_companies(
        CompanyDiscoveryFilters(
            naf_code="62.02A",
            department="69",
            postal_code="69003",
            naf_section="J",
            headcount_tranche_min="31",
            headcount_tranche_max="41",
        ),
        12,
        client=client,
    )
    # DISCOVER-TAILLE T.2 : une liste étroite déclenche une 2e passe ; on lit la 1re.
    params = client.get.await_args_list[0].kwargs["params"]
    assert params["activite_principale"] == "62.02A"
    assert params["departement"] == "69"
    assert params["code_postal"] == "69003"
    assert params["section_activite_principale"] == "J"
    # The gouv.fr API takes an explicit code list, not a min/max range.
    assert params["tranche_effectif_salarie"] == "31,32,41"
    assert params["per_page"] == "12"


# #3908 — plusieurs tranches NON CONTIGUËS cochées ensemble : `headcount_tranches`
# (déjà l'union) part sur le fil à la place de l'intervalle unique, qui
# remonterait aussi la tranche intermédiaire jamais cochée.
@pytest.mark.asyncio
async def test_gouv_prefers_the_explicit_union_over_the_min_max_envelope() -> None:
    client = _client(_resp({"results": []}))
    await list_companies(
        CompanyDiscoveryFilters(
            naf_code="62.02A",
            # Si le fournisseur lisait encore min/max ici, il enverrait
            # l'enveloppe 11-41 (donc aussi 21/22/31) — l'union explicite doit
            # gagner.
            headcount_tranche_min="11",
            headcount_tranche_max="41",
            headcount_tranches=["11", "12", "32", "41"],
        ),
        12,
        client=client,
    )
    params = client.get.await_args_list[0].kwargs["params"]
    assert params["tranche_effectif_salarie"] == "11,12,32,41"


@pytest.mark.asyncio
async def test_gouv_omits_absent_filters() -> None:
    client = _client(_resp({"results": []}))
    await list_companies(CompanyDiscoveryFilters(naf_code="62.02A"), 5, client=client)
    params = _params_of(client)
    assert set(params) == {"activite_principale", "page", "per_page"}


@pytest.mark.asyncio
async def test_gouv_returns_contract_shaped_rows() -> None:
    payload = {
        "results": [
            {
                "siren": "552100554",
                "nom_complet": "SOPRA STERIA GROUP",
                "activite_principale": "62.02A",
                "libelle_activite_principale": "Conseil en systèmes et logiciels informatiques",
                "tranche_effectif_salarie": "52",
                "date_creation": "1968-01-01",
                "siege": {
                    "libelle_commune": "ANNECY",
                    "departement": "74",
                    "code_postal": "74000",
                    "etat_administratif": "A",
                },
            }
        ]
    }
    degraded: list[dict[str, str]] = []
    rows = await list_companies(
        CompanyDiscoveryFilters(naf_code="62.02A"), 5, degraded=degraded, client=_client(_resp(payload))
    )
    assert degraded == []
    row = rows[0]
    assert set(row) >= REGISTRY_KEYS
    assert row["name"] == "SOPRA STERIA GROUP"
    assert row["siren"] == "552100554"
    assert row["nafCode"] == "62.02A"
    assert row["sector"] == "Conseil en systèmes et logiciels informatiques"
    assert row["city"] == "ANNECY"
    assert row["department"] == "74"
    assert row["headcountRange"] == HEADCOUNT_TRANCHE_LABELS["52"]
    assert row["creationDate"] == "1968-01-01"
    assert row["source"] == "recherche-entreprises"


@pytest.mark.asyncio
async def test_gouv_drops_sirenless_and_ceased_rows() -> None:
    payload = {
        "results": [
            {"nom_complet": "Sans SIREN"},
            {"siren": "111111111", "nom_complet": "Cessée", "siege": {"etat_administratif": "C"}},
            {"siren": "222222222", "nom_complet": "Active", "siege": {"etat_administratif": "A"}},
        ]
    }
    rows = await list_companies(CompanyDiscoveryFilters(naf_code="62"), 5, client=_client(_resp(payload)))
    assert [r["siren"] for r in rows] == ["222222222"]


@pytest.mark.asyncio
async def test_gouv_applies_creation_date_range_client_side() -> None:
    """The gouv.fr API has no creation-date filter — we post-filter rather than
    return rows the caller explicitly excluded. A row with no date can't be
    proven to match, so it is dropped (never assumed in-range)."""
    payload = {
        "results": [
            {"siren": "111111111", "nom_complet": "Trop vieille", "date_creation": "2010-05-01"},
            {"siren": "222222222", "nom_complet": "Dans la fenêtre", "date_creation": "2018-05-01"},
            {"siren": "333333333", "nom_complet": "Date inconnue"},
        ]
    }
    rows = await list_companies(
        CompanyDiscoveryFilters(naf_code="62", creation_date_min="2015-01-01"),
        5,
        client=_client(_resp(payload)),
    )
    assert [r["siren"] for r in rows] == ["222222222"]


@pytest.mark.asyncio
async def test_gouv_flags_filters_it_cannot_honour() -> None:
    """Capital, objet social, publications n'ont pas d'équivalent gouv.fr : le jeu
    rendu serait PLUS LARGE que demandé, donc l'appelant est prévenu plutôt que
    trompé.

    ⚠️ Ce test portait sur `revenue_min`, qui a CHANGÉ de camp — mesuré le
    04/09/2026, `ca_min=50000000` fait tomber la base NAF 30.30Z de 745 à 38.
    Le critère financier est désormais honoré ; c'est le capital qui ne l'est pas.
    """
    degraded: list[dict[str, str]] = []
    rows = await list_companies(
        CompanyDiscoveryFilters(naf_code="62.02A", capital_min=50_000),
        5,
        degraded=degraded,
        client=_client(_resp({"results": []})),
    )
    assert rows == []
    # Cadrée `capability` : la source a RÉPONDU, elle n'a juste pas su exprimer
    # le critère — le jeu rendu est plus large, pas plus court. Et elle nomme
    # lequel, pour que l'appelant ne devine pas.
    assert {
        "source": "recherche-entreprises",
        "reason": DegradeReason.UNSUPPORTED_FILTERS,
        "kind": "capability",
        "fields": ["capital_min"],
    } in degraded


@pytest.mark.asyncio
async def test_gouv_pushes_revenue_legal_category_and_company_size_upstream() -> None:
    """Les trois critères qui ont changé de camp partent NATIVEMENT dans l'URL.

    Sans cette vérification, on aurait pu les retirer d'`_UNSUPPORTED_FIELDS`
    sans les sérialiser : la source aurait alors déclaré couvrir un critère
    qu'elle n'envoie pas — un résultat plus large, présenté comme exact. C'est
    le défaut le plus cher du dépôt : du code juste que personne n'appelle.
    """
    seen: dict[str, str] = {}
    client = AsyncMock(spec=httpx.AsyncClient)

    async def _capture(url: str, **kwargs: object) -> httpx.Response:
        seen.update(kwargs.get("params") or {})  # type: ignore[arg-type]
        return _resp({"results": []})

    client.get = _capture

    await list_companies(
        CompanyDiscoveryFilters(
            naf_code="62.02A",
            revenue_min=5_000_000,
            revenue_max=50_000_000,
            legal_category="5710",
            company_category=["PME", "ETI"],
            departments=["31", "33"],
        ),
        5,
        degraded=[],
        client=client,
    )

    assert seen["ca_min"] == "5000000"
    assert seen["ca_max"] == "50000000"
    assert seen["nature_juridique"] == "5710"
    # Le registre OU les valeurs d'une liste — mesuré : `departement=31,33` rend
    # 142 quand 31 seul en rend 97 et 33 seul 45.
    assert seen["categorie_entreprise"] == "PME,ETI"
    assert seen["departement"] == "31,33"


@pytest.mark.asyncio
async def test_gouv_accepts_several_regions_at_once() -> None:
    """#2642.1 — le rail coche PLUSIEURS régions (IDF + Occitanie) : le registre
    en accepte nativement une liste, sur le même modèle que ``departments``
    (mesuré le 21/09/2026 : ``region=11,76`` rend 341 quand 11 seul en rend 220
    et 76 seul 156 sur la base NAF 30.30Z)."""
    seen: dict[str, str] = {}
    client = AsyncMock(spec=httpx.AsyncClient)

    async def _capture(url: str, **kwargs: object) -> httpx.Response:
        seen.update(kwargs.get("params") or {})  # type: ignore[arg-type]
        return _resp({"results": []})

    client.get = _capture

    await list_companies(
        CompanyDiscoveryFilters(naf_code="30.30Z", regions=["11", "76"]),
        5,
        degraded=[],
        client=client,
    )

    assert seen["region"] == "11,76"


@pytest.mark.asyncio
async def test_gouv_empty_filter_set_degrades() -> None:
    client = _client(_resp({"results": []}))
    degraded: list[dict[str, str]] = []
    rows = await list_companies(CompanyDiscoveryFilters(), 5, degraded=degraded, client=client)
    assert rows == []
    assert degraded == [{"source": "recherche-entreprises", "reason": DegradeReason.EMPTY_QUERY}]
    client.get.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "reason"),
    [(429, DegradeReason.RATE_LIMITED), (500, DegradeReason.UPSTREAM_ERROR)],
)
async def test_gouv_http_failures_map_to_reasons(status: int, reason: str) -> None:
    degraded: list[dict[str, str]] = []
    rows = await list_companies(
        CompanyDiscoveryFilters(naf_code="62"), 5, degraded=degraded, client=_client(_resp({}, status))
    )
    assert rows == []
    assert degraded == [{"source": "recherche-entreprises", "reason": reason}]


@pytest.mark.asyncio
async def test_gouv_network_error_degrades() -> None:
    degraded: list[dict[str, str]] = []
    rows = await list_companies(
        CompanyDiscoveryFilters(naf_code="62"),
        5,
        degraded=degraded,
        client=_boom_client(httpx.ConnectError("boom")),
    )
    assert rows == []
    assert degraded == [{"source": "recherche-entreprises", "reason": DegradeReason.NETWORK_ERROR}]


@pytest.mark.asyncio
async def test_gouv_invalid_payload_degrades() -> None:
    degraded: list[dict[str, str]] = []
    rows = await list_companies(
        CompanyDiscoveryFilters(naf_code="62"), 5, degraded=degraded, client=_client(_resp("nope"))
    )
    assert rows == []
    assert degraded == [{"source": "recherche-entreprises", "reason": DegradeReason.INVALID_RESPONSE}]


@pytest.mark.asyncio
async def test_gouv_single_company_enrich_is_unchanged() -> None:
    """Regression guard: ``fetch_company`` must keep its single-hit behaviour."""
    payload = {"results": [{"siren": "775577018", "nom_complet": "CREDIT MUTUEL ARKEA"}]}
    client = _client(_resp(payload))
    out = await fetch_company("Crédit Mutuel Arkéa", client=client)
    assert out is not None and out["siren"] == "775577018"
    assert _params_of(client) == {"q": "Crédit Mutuel Arkéa", "page": "1", "per_page": "1"}


def test_gouv_module_exposes_its_source_name() -> None:
    assert re_src.SOURCE_NAME == "recherche-entreprises"


# ── Router — GET stays compatible, POST carries the full surface ─────────────


def test_get_discover_without_new_params_is_unchanged(client: TestClient) -> None:
    """Byte-identical behaviour for the current caller: only ``code_naf`` (when
    given) reaches Pappers, nothing else is injected."""
    from unittest.mock import patch

    with patch(
        "app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]
    ) as suggest:
        res = client.get("/companies/discover?q=programmation&naf_code=62.01Z")

    assert res.status_code == 200
    params = suggest.await_args.kwargs["filters"]
    assert params.model_dump(exclude_none=True, by_alias=True) == {
        "code_naf": "62.01Z",
        "precision": "approximative",
    }


def test_get_discover_forwards_new_filters(client: TestClient) -> None:
    from unittest.mock import patch

    with patch(
        "app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]
    ) as suggest:
        res = client.get(
            "/companies/discover?q=esn&naf_code=62.02A&department=69"
            "&headcount_tranche_min=32&headcount_tranche_max=32&creation_date_min=2015-01-01"
        )

    assert res.status_code == 200
    wire = suggest.await_args.kwargs["filters"].model_dump(exclude_none=True, by_alias=True)
    assert wire["departement"] == "69"
    assert wire["tranche_effectif_min"] == "32"
    assert wire["date_creation_min"] == "01-01-2015"


def test_get_discover_rejects_invalid_filter(client: TestClient) -> None:
    res = client.get("/companies/discover?q=esn&department=Rh%C3%B4ne")
    assert res.status_code == 422


_PAPPERS_ROW = {
    "source": "pappers",
    "name": "CAPGEMINI",
    "siren": "330703844",
    "nafCode": "62.02A",
    "sector": "Conseil",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "250 à 499 salariés",
    "creationDate": "1984-06-11",
}

_GOUV_ROW = {
    "source": "recherche-entreprises",
    "name": "SOPRA STERIA GROUP",
    "siren": "552100554",
    "nafCode": "62.02A",
    "sector": "Conseil",
    "city": "ANNECY",
    "department": "74",
    "headcountRange": "5 000 à 9 999 salariés",
    "creationDate": "1968-01-01",
}


def test_post_discover_returns_registry_rows_and_degraded(client: TestClient) -> None:
    """Critères que le registre gratuit exprime en entier → il passe EN PREMIER.

    Activité + géo + taille : les deux sources lisent le même SIRENE/RNE et
    rendent la même forme de ligne. Payer Pappers à l'appel pour une réponse
    identique était du coût pur — Pappers reste le filet de sécurité en dessous.
    """
    from unittest.mock import patch

    with (
        patch(
            "app.routers.companies.list_companies", new_callable=AsyncMock, return_value=[_GOUV_ROW]
        ) as gouv,
        patch(
            "app.routers.companies.search_companies_filtered", new_callable=AsyncMock
        ) as pappers,
    ):
        res = client.post(
            "/companies/discover",
            json={
                "limit": 10,
                "filters": {"naf_code": "62.02A", "department": "69", "headcount_tranche_min": "32"},
            },
        )

    assert res.status_code == 200
    body = res.json()
    assert body["companies"] == [_GOUV_ROW]
    assert body["degraded"] == []
    # The normalized criteria actually applied travel back to the caller.
    assert body["query"]["naf_code"] == "62.02A"
    assert gouv.await_args.args[1] == 10
    pappers.assert_not_awaited()


def test_post_discover_keeps_pappers_first_for_financial_criteria(client: TestClient) -> None:
    """Un critère que le registre gratuit ne porte PAS (le CAPITAL) → Pappers
    reste en tête. Le gratuit rendrait un ensemble plus large que demandé, ce
    qui répondrait à une autre question.

    ⚠️ Ce test portait sur le chiffre d'affaires, qui a changé de camp : mesuré
    le 04/09/2026, `ca_min` filtre bel et bien (745 → 38 sur NAF 30.30Z). Le
    garder ici aurait fait payer Pappers pour une recherche que la source
    gratuite sait faire — c'est-à-dire l'inverse de ce que ce test protège.
    """
    from unittest.mock import patch

    with (
        patch(
            "app.routers.companies.search_companies_filtered",
            new_callable=AsyncMock,
            return_value=[_PAPPERS_ROW],
        ) as pappers,
        patch("app.routers.companies.list_companies", new_callable=AsyncMock) as gouv,
    ):
        res = client.post(
            "/companies/discover",
            json={"filters": {"naf_code": "62.02A", "capital_min": 50_000}},
        )

    assert res.status_code == 200
    assert res.json()["companies"] == [_PAPPERS_ROW]
    pappers.assert_awaited_once()
    gouv.assert_not_awaited()


def test_post_discover_falls_back_to_pappers_when_the_free_source_is_empty(
    client: TestClient,
) -> None:
    """Le gratuit d'abord, mais un écran vide ne vaut pas l'économie : quand il
    ne trouve rien, Pappers mérite son crédit."""
    from unittest.mock import patch

    with (
        patch(
            "app.routers.companies.list_companies", new_callable=AsyncMock, return_value=[]
        ) as gouv,
        patch(
            "app.routers.companies.search_companies_filtered",
            new_callable=AsyncMock,
            return_value=[_PAPPERS_ROW],
        ) as pappers,
    ):
        res = client.post("/companies/discover", json={"filters": {"naf_code": "62.02A"}})

    assert res.status_code == 200
    assert res.json()["companies"] == [_PAPPERS_ROW]
    gouv.assert_awaited_once()
    pappers.assert_awaited_once()


def test_post_discover_falls_back_to_keyless_source(client: TestClient) -> None:
    """Pappers tokenless/rate-limited → the keyless registry takes over and BOTH
    the fallback rows and the degradation reason reach the caller.

    Le critère ``capital_min`` place Pappers en tête (le registre gratuit ne
    porte pas le capital) : c'est bien la branche « Pappers d'abord » qui dégrade.
    """
    from unittest.mock import patch

    async def _pappers(_filters, _limit, *, degraded=None, **_kw):
        if degraded is not None:
            degraded.append({"source": "pappers", "reason": DegradeReason.MISSING_API_KEY})
        return []

    with (
        patch("app.routers.companies.search_companies_filtered", side_effect=_pappers),
        patch(
            "app.routers.companies.list_companies", new_callable=AsyncMock, return_value=[_GOUV_ROW]
        ) as gouv,
    ):
        res = client.post(
            "/companies/discover",
            json={"filters": {"naf_code": "62.02A", "capital_min": 50_000}},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["companies"] == [_GOUV_ROW]
    assert body["degraded"] == [{"source": "pappers", "reason": DegradeReason.MISSING_API_KEY}]
    gouv.assert_awaited_once()


def test_post_discover_rejects_unknown_filter_key(client: TestClient) -> None:
    res = client.post("/companies/discover", json={"filters": {"departement": "69"}})
    assert res.status_code == 422


# ── La barrière d'achat a besoin du registre ENTIER (tome 3, recette live) ──


@pytest.mark.asyncio
async def test_list_row_carries_the_barrier_inputs() -> None:
    """La catégorie INSEE et le nombre d'établissements OUVERTS traversent.

    Trouvé en recette : la barrière d'achat s'affichait « non estimable » sur
    TOUS les candidats de Découvrir. Deux proxies sur six seulement étaient
    mesurables, parce que cette projection — celle que l'écran utilise —
    jetait `categorie_entreprise` et `nombre_etablissements_ouverts`, que le
    registre publie pourtant sur chaque ligne. Les champs étaient bien
    threadés dans le routeur ; ils n'arrivaient simplement jamais jusqu'à lui.
    """
    row = {
        "siren": "760800060",
        "nom_complet": "BACCARAT",
        "categorie_entreprise": "ETI",
        "tranche_effectif_salarie": "41",
        "nombre_etablissements": 18,
        "nombre_etablissements_ouverts": 7,
        "siege": {"libelle_commune": "BACCARAT", "departement": "54"},
    }
    out = await list_companies(CompanyDiscoveryFilters(q="baccarat"), client=_client(_resp({"results": [row]})))
    assert out[0]["sizeClass"] == "ETI"
    # Les établissements OUVERTS, jamais le total : 18 inclut ceux qui ont
    # fermé, et les compter rendrait « décentralisée » une entreprise dont les
    # sites n'existent plus — ce qui BAISSE la barrière estimée.
    assert out[0]["establishmentCount"] == 7


@pytest.mark.asyncio
async def test_a_missing_open_establishment_count_is_not_replaced_by_the_total() -> None:
    """Sans le compte des établissements ouverts, le proxy reste NON MESURÉ.

    Retomber sur le total ferait passer une valeur fausse pour une mesure — et
    dans le sens qui ouvre la porte, ce qui est le pire des deux sens."""
    row = {
        "siren": "760800060",
        "nom_complet": "BACCARAT",
        "nombre_etablissements": 18,
        "siege": {},
    }
    out = await list_companies(CompanyDiscoveryFilters(q="baccarat"), client=_client(_resp({"results": [row]})))
    assert out[0]["establishmentCount"] is None
