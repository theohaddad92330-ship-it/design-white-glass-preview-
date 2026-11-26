"""Country packs — pluggable framework + Suisse (Zefix) / Belgique (KBO) / Luxembourg.

Covers, with mocked HTTP (no real network):

* the reusable base (``normalize_country``, ``get_active_pack``, ``COUNTRY_PACKS``
  registry, ``list_supported_countries`` metadata) and the strict **FR no-op**
  contract — the FR path makes ZERO network calls and returns empty; a registered
  non-FR country activates its pack with no env flag (zero-flag policy);
* the Swiss pack: name→UID search + UID detail parsing, SHAB/FOSC signals, hits,
  graceful degradation, and no-op without ``ZEFIX_API_USER/PASSWORD``;
* the Belgian pack: number→detail + name→number resolution parsing (real KBO
  QL/RL + benaming layout via recorded fixtures), establishment-unit filtering,
  hits, and no-op on empty input;
* the Luxembourg pack (``live`` on a DOCUMENTED GLEIF contract since 11/10/2026): identifier helpers, vocabulary/ontology,
  GLEIF name/RCS resolution (recorded payload), the RCS-authority filter that never
  invents a number, graceful degradation and no-op on empty input;
* the US pack: CIK/ticker/name→CIK resolution + submissions parsing (real recorded
  EDGAR payloads), material-filing legal signals, hits, graceful degradation, and
  no-op on empty input;
* the US depth sources: EDGAR full-text search (dated, filing-URL-sourced IT/digital
  mentions) + XBRL companyfacts (factual « données financières SEC (10-K) » block —
  annual-duration filter, restatement dedup, absent tags ⇒ nothing), throttle
  coverage, graceful per-source degradation, and the pipeline-entry injection shape;
* the Canada pack: name/number resolution against the recorded CBR federated-search
  payload, best-match selection, federal-vs-provincial detail URLs, hits, no-op on
  empty input, and the federal detail-page parse (real recorded WET-template HTML —
  status / corporation number / governing legislation / registered office) with
  graceful degradation to the search doc;
* golden non-regression: the real verified UID / BCE / RCS / CIK / Juri_ID
  identifiers stay well-formed.
"""

from __future__ import annotations

import contextlib
import json
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.country_packs import (
    COUNTRY_PACKS,
    collect_country_signals,
    empty_signals,
    get_active_pack,
    list_supported_countries,
    normalize_country,
    suggest_registry_entities,
)
from app.services.country_packs import be as be_mod
from app.services.country_packs import ca as ca_mod
from app.services.country_packs import ch as ch_mod
from app.services.country_packs import lu as lu_mod
from app.services.country_packs import us as us_mod
from app.services.country_packs.be import (
    BelgianPack,
    _best_match,
    _format_bce,
    _is_enterprise_number,
    _normalize_bce,
    _parse_detail,
    _parse_search_results,
)
from app.services.country_packs.ca import (
    CanadaPack,
    _entity_from_doc,
    _is_bn,
    _is_neq,
    _parse_federal_detail,
)
from app.services.country_packs.ca import (
    _best_match as _ca_best_match,
)
from app.services.country_packs.ch import SwissPack, _format_uid, _normalize_uid
from app.services.country_packs.lu import (
    LuxembourgPack,
    _format_rcs,
    _is_rcs_number,
    _normalize_rcs,
)
from app.services.country_packs.us import (
    UsPack,
    _annual_series,
    _entity_from_submissions,
    _filing_url,
    _financial_profile_from_companyfacts,
    _fts_hits_from_payload,
    _is_cik,
    _match_ticker_row,
    _normalize_cik,
    _sec_financials_payload,
    _signals_from_submissions,
)

_GOLDEN = Path(__file__).parent / "golden" / "country"


def _fixture(name: str) -> str:
    return (_GOLDEN / name).read_text(encoding="utf-8")


def _json_resp(payload: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=payload, request=httpx.Request("GET", "https://x"))


def _text_resp(text: str, status: int = 200) -> httpx.Response:
    return httpx.Response(status, text=text, request=httpx.Request("GET", "https://x"))


def _mock_client() -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock()
    c.post = AsyncMock()
    return c


def _clear_ch_creds(mp: pytest.MonkeyPatch) -> None:
    mp.delenv("ZEFIX_API_USER", raising=False)
    mp.delenv("ZEFIX_API_PASSWORD", raising=False)


def _set_ch_creds(mp: pytest.MonkeyPatch) -> None:
    mp.setenv("ZEFIX_API_USER", "u")
    mp.setenv("ZEFIX_API_PASSWORD", "p")


# ── Base / registry ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(None, "FR"), ("", "FR"), ("ch", "CH"), ("  be ", "BE"), ("fra", "FR"), ("x", "FR"), ("12", "FR")],
)
def test_normalize_country(raw: str | None, expected: str) -> None:
    assert normalize_country(raw) == expected


def test_registry_has_all_packs() -> None:
    assert set(COUNTRY_PACKS) == {"CH", "BE", "LU", "US", "CA", "DE", "GB", "ES"}


def test_list_supported_countries_is_deterministic_and_complete() -> None:
    rows = list_supported_countries()
    # Sorted by code, one row per registered pack, every metadata field present.
    assert [r["code"] for r in rows] == ["BE", "CA", "CH", "DE", "ES", "GB", "LU", "US"]
    by_code = {r["code"]: r for r in rows}
    assert by_code["CH"]["status"] == "live"
    assert by_code["BE"]["status"] == "live"
    assert by_code["LU"]["status"] == "live"  # #4016 L13a — sorti de beta (11/10/2026)
    assert by_code["LU"]["contract"] == "documented"
    assert by_code["LU"]["identifierLabel"] == "numéro RCS"
    assert by_code["US"]["status"] == "live"
    assert by_code["US"]["identifierLabel"] == "CIK"
    assert by_code["CA"]["status"] == "live"
    assert by_code["CA"]["identifierLabel"] == "numéro d'entreprise"
    assert by_code["CA"]["languages"] == ["en", "fr"]
    for row in rows:
        assert set(row) == {"code", "country", "languages", "registry", "identifierLabel", "status", "contract"}
        assert row["languages"] and all(isinstance(lang, str) for lang in row["languages"])
        assert row["status"] in {"live", "beta", "planned"}


def test_list_supported_countries_is_network_free_static() -> None:
    """Metadata must never read the environment or hit the network — pure class data."""
    # Two calls with no env set return identical rows (no flag/IO dependence).
    assert list_supported_countries() == list_supported_countries()


def test_get_active_pack_fr_is_none() -> None:
    assert get_active_pack("FR") is None
    assert get_active_pack(None) is None


def test_get_active_pack_non_fr_country_activates_without_any_env() -> None:
    """Zero-flag policy: targeting a registered country IS the switch — no env var."""
    assert isinstance(get_active_pack("ch"), SwissPack)
    assert isinstance(get_active_pack("BE"), BelgianPack)
    assert isinstance(get_active_pack("lu"), LuxembourgPack)
    assert isinstance(get_active_pack("US"), UsPack)
    assert isinstance(get_active_pack("ca"), CanadaPack)


def test_get_active_pack_unknown_country_is_none() -> None:
    assert get_active_pack("JP") is None


# ── FR no-op (the load-bearing guarantee) ─────────────────────────────────────


@pytest.mark.asyncio
async def test_collect_country_signals_fr_is_strict_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    """FR (default) makes ZERO network calls and returns empty. We arm every pack's
    httpx.AsyncClient with a bomb; the FR path must never construct one."""

    def _boom(*_a: object, **_k: object) -> None:
        raise AssertionError("country pack made a network call on the FR path")

    monkeypatch.setattr(ch_mod.httpx, "AsyncClient", _boom)
    monkeypatch.setattr(be_mod.httpx, "AsyncClient", _boom)
    monkeypatch.setattr(lu_mod.httpx, "AsyncClient", _boom)
    monkeypatch.setattr(us_mod.httpx, "AsyncClient", _boom)
    monkeypatch.setattr(ca_mod.httpx, "AsyncClient", _boom)
    assert await collect_country_signals("FR", "SNCF") == empty_signals("FR")


@pytest.mark.asyncio
async def test_ch_collect_signals_without_creds_is_noop_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """CH is active for its market by default, but Zefix requires Basic-auth creds:
    without them the pack returns empty and never constructs an HTTP client
    (the credential is the only remaining switch)."""
    _clear_ch_creds(monkeypatch)

    def _boom(*_a: object, **_k: object) -> None:
        raise AssertionError("Swiss pack made a network call without Zefix creds")

    monkeypatch.setattr(ch_mod.httpx, "AsyncClient", _boom)
    assert await SwissPack().collect_signals("Swisscom") == empty_signals("CH")


@pytest.mark.asyncio
async def test_collect_country_signals_swallows_pack_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """An unexpected pack error degrades to empty (never breaks research)."""
    monkeypatch.setattr(SwissPack, "collect_signals", AsyncMock(side_effect=RuntimeError("boom")))
    assert await collect_country_signals("CH", "Swisscom") == empty_signals("CH")


# ── Suisse (Zefix) ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ch_no_creds_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_ch_creds(monkeypatch)
    client = _mock_client()
    assert await SwissPack().registry_lookup("Swisscom", client=client) is None
    client.get.assert_not_called()
    client.post.assert_not_called()


@pytest.mark.asyncio
async def test_ch_lookup_by_name_parses_full(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_ch_creds(monkeypatch)
    full = json.loads(_fixture("zefix_companyfull.json"))
    short = {"name": full["name"], "uid": full["uid"], "chid": full["chid"], "legalSeat": full["legalSeat"]}
    client = _mock_client()
    client.post = AsyncMock(return_value=_json_resp([short]))  # /company/search
    client.get = AsyncMock(return_value=_json_resp(full))  # /company/uid detail

    entity = await SwissPack().registry_lookup("ELCA Informatique", client=client)
    assert entity is not None
    assert entity["name"] == "ELCA Informatique SA"
    assert entity["registryId"] == "CHE-105.944.452"
    assert entity["registryIdLabel"] == "UID"
    assert entity["legalForm"] == "Société anonyme"  # DFIEString → fr
    assert entity["seat"] == "Pully"
    assert entity["region"] == "VD"
    assert entity["status"] == "ACTIVE"
    assert entity["detailUrl"] == full["zefixDetailWeb"]
    client.post.assert_awaited_once()
    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_ch_lookup_by_uid_skips_search(monkeypatch: pytest.MonkeyPatch) -> None:
    """A UID query hits the detail endpoint directly — no search POST."""
    _set_ch_creds(monkeypatch)
    full = json.loads(_fixture("zefix_companyfull.json"))
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(full))
    entity = await SwissPack().registry_lookup("CHE-105.944.452", client=client)
    assert entity is not None and entity["registryId"] == "CHE-105.944.452"
    client.post.assert_not_called()
    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_ch_collect_signals_hits_and_legal(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_ch_creds(monkeypatch)
    full = json.loads(_fixture("zefix_companyfull.json"))
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(full))
    out = await SwissPack().collect_signals("ELCA", ident="CHE-105.944.452", client=client)
    assert out["registry"]["registryId"] == "CHE-105.944.452"
    assert out["jobs"] == []  # documented absence (no free CH job API)
    assert len(out["legalSignals"]) == 2  # SHAB/FOSC from sogcPub
    assert out["legalSignals"][0]["type"] == "SHAB/FOSC"
    assert len(out["hits"]) == 1
    hit = out["hits"][0]
    assert hit["source"] == "zefix"
    assert hit["url"] == full["zefixDetailWeb"]
    assert "CHE-105.944.452" in hit["title"]


@pytest.mark.asyncio
async def test_ch_search_http_error_degrades(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_ch_creds(monkeypatch)
    client = _mock_client()
    client.post = AsyncMock(return_value=_json_resp({}, status=500))
    assert await SwissPack().registry_lookup("Swisscom", client=client) is None


@pytest.mark.asyncio
async def test_ch_search_empty_degrades(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_ch_creds(monkeypatch)
    client = _mock_client()
    client.post = AsyncMock(return_value=_json_resp([]))
    assert await SwissPack().registry_lookup("Nonexistent GmbH", client=client) is None


def test_ch_uid_helpers() -> None:
    assert _normalize_uid("CHE-105.944.452") == "CHE105944452"
    assert _format_uid("CHE105944452") == "CHE-105.944.452"


def test_ch_vocabulary_and_ontology() -> None:
    voc = SwissPack().local_vocabulary()
    assert voc["country"] == "Suisse"
    assert "Zefix" in voc["prompt_fragment"]
    assert "UID" in voc["prompt_fragment"]
    assert "canton" in SwissPack().entity_ontology()["regionalAxis"]


# ── Belgique (KBO) ────────────────────────────────────────────────────────────


def test_be_number_helpers() -> None:
    assert _normalize_bce("202239951") == "0202239951"
    assert _normalize_bce("0202.239.951") == "0202239951"
    assert _format_bce("0202239951") == "0202.239.951"
    assert _is_enterprise_number("0202.239.951") is True
    assert _is_enterprise_number("2138471007") is False  # establishment unit
    assert _is_enterprise_number("12345") is False


def test_be_parse_detail_fixture() -> None:
    entity = _parse_detail(_fixture("kbo_detail.html"), "0202239951")
    assert entity is not None
    assert entity["name"] == "PROXIMUS"
    assert entity["registryId"] == "0202.239.951"
    assert entity["registryIdLabel"] == "numéro BCE"
    assert entity["status"] == "Actif"
    assert entity["seat"].startswith("Boulevard du Roi Albert II")
    assert entity["legalForm"] == "Société anonyme de droit public"
    assert entity["establishments"] == 186
    assert entity["detailUrl"].endswith("ondernemingsnummer=0202239951&lang=fr")


def test_be_parse_search_results_filters_establishments() -> None:
    rows = _parse_search_results(_fixture("kbo_search_results.html"))
    numbers = [n for n, _ in rows]
    assert "0202239951" in numbers  # enterprise kept
    assert "2138471007" not in numbers  # establishment unit dropped
    assert _best_match(rows, "Proximus") == "0202239951"


@pytest.mark.asyncio
async def test_be_empty_query_no_network() -> None:
    client = _mock_client()
    assert await BelgianPack().registry_lookup("", client=client) is None
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_be_lookup_by_number(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_text_resp(_fixture("kbo_detail.html")))
    entity = await BelgianPack().registry_lookup("0202.239.951", client=client)
    assert entity is not None and entity["name"] == "PROXIMUS"
    client.get.assert_awaited_once()  # number → single detail GET, no search


@pytest.mark.asyncio
async def test_be_resolve_by_name(monkeypatch: pytest.MonkeyPatch) -> None:
    """Name → search result page → best enterprise number → detail page."""
    client = _mock_client()
    client.get = AsyncMock(
        side_effect=[_text_resp(_fixture("kbo_search_results.html")), _text_resp(_fixture("kbo_detail.html"))]
    )
    entity = await BelgianPack().registry_lookup("Proximus", client=client)
    assert entity is not None
    assert entity["registryId"] == "0202.239.951"
    assert client.get.await_count == 2


@pytest.mark.asyncio
async def test_be_collect_signals_hits(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_text_resp(_fixture("kbo_detail.html")))
    out = await BelgianPack().collect_signals("0202.239.951", client=client)
    assert out["registry"]["registryId"] == "0202.239.951"
    assert out["jobs"] == []  # documented absence (no free BE job API)
    assert len(out["hits"]) == 1
    assert out["hits"][0]["source"] == "kbo"
    assert "0202.239.951" in out["hits"][0]["title"]


@pytest.mark.asyncio
async def test_be_detail_http_error_degrades(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_text_resp("", status=500))
    assert await BelgianPack().registry_lookup("0202.239.951", client=client) is None


def test_be_vocabulary_and_ontology() -> None:
    voc = BelgianPack().local_vocabulary()
    assert voc["country"] == "Belgique"
    assert "BCE" in voc["prompt_fragment"] or "KBO" in voc["prompt_fragment"]
    assert "NACE-BEL" in BelgianPack().entity_ontology()["activityCodes"]


# ── Luxembourg (RCS via GLEIF) — #4016 L13a : contrat DOCUMENTÉ, non vérifié ──


def test_lu_rcs_helpers() -> None:
    assert _is_rcs_number("B19669") is True
    assert _is_rcs_number("B 19669") is True  # space-tolerant
    assert _is_rcs_number("b19669") is True  # case-insensitive
    assert _is_rcs_number("Proximus") is False  # a name is not an RCS number
    assert _is_rcs_number("19669") is False  # missing the B prefix
    assert _normalize_rcs("B 19669") == "B19669"
    assert _format_rcs("B19669") == "B19669"  # already canonical
    assert _normalize_rcs("Proximus Luxembourg") == ""  # a name mints no bogus B-number


def test_lu_metadata_is_live_on_documented_contract() -> None:
    """#4016 L13a (décision Louis 11/10/2026) — LU sort de ``beta`` : la résolution
    passe par l'API publique DOCUMENTÉE de GLEIF (aucune clé). Le contrat n'a pas
    été recetté en production : ``contract == "documented"`` le DIT."""
    meta = LuxembourgPack().metadata()
    assert meta["code"] == "LU"
    assert meta["status"] == "live"
    assert meta["contract"] == "documented"
    assert meta["identifierLabel"] == "numéro RCS"
    assert "fr" in meta["languages"]


def test_verified_packs_say_verified() -> None:
    """Les packs dont la source a été vérifiée restent ``verified`` — le badge ne
    s'allume que sur ce qui ne l'est pas."""
    assert SwissPack().metadata()["contract"] == "verified"
    assert BelgianPack().metadata()["contract"] == "verified"
    assert UsPack().metadata()["contract"] == "verified"


def test_pack_contracts_match_the_contracts_package_table() -> None:
    """#4016 L13a — ``REGISTRY_CONTRACT_BY_COUNTRY`` (packages/contracts) est le miroir
    que l'API et l'écran lisent pour le badge et pour le « sans débit ». Il ne doit
    JAMAIS diverger du ``contract`` déclaré par chaque pack."""
    import re

    ts = (
        Path(__file__).resolve().parents[3] / "packages/contracts/src/schemas/registry-contract.ts"
    ).read_text(encoding="utf-8")
    table = dict(re.findall(r"^\s+([A-Z]{2}): '(verified|documented)',$", ts, flags=re.M))
    assert table, "la table du paquet contrats est illisible — la garde ne lit rien"
    declared = {row["code"]: row["contract"] for row in list_supported_countries()}
    assert table == declared


def test_lu_vocabulary_and_ontology() -> None:
    voc = LuxembourgPack().local_vocabulary()
    assert voc["country"] == "Luxembourg"
    assert "RCS" in voc["prompt_fragment"]
    assert "B19669" in voc["prompt_fragment"]  # RCS identifier example present
    onto = LuxembourgPack().entity_ontology()
    assert "SOPARFI" in onto["legalForms"]  # the holding-vs-operating filter cue


@pytest.mark.asyncio
async def test_lu_lookup_by_name_resolves_rcs_from_gleif() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("gleif_lu_cactus.json"))))
    entity = await LuxembourgPack().registry_lookup("Cactus", client=client)
    assert entity is not None
    assert entity["registryId"] == "B65282"  # the ACTIVE exact-ish match, never an inactive shell
    assert entity["name"] == "CACTUS S.A."
    assert entity["country"] == "LU"
    assert entity["registryIdLabel"] == "numéro RCS"
    assert entity["seat"] == "BERTRANGE"
    assert entity["status"] == "active"
    assert entity["legalForm"] == "SA"
    assert entity["contract"] == "documented"
    assert entity["detailUrl"].startswith("https://search.gleif.org/#/record/")
    params = client.get.call_args.kwargs["params"]
    assert params["filter[entity.legalAddress.country]"] == "LU"
    assert params["filter[entity.legalName]"] == "Cactus"


@pytest.mark.asyncio
async def test_lu_lookup_by_rcs_queries_the_rcs_authority() -> None:
    client = _mock_client()
    payload = json.loads(_fixture("gleif_lu_cactus.json"))
    payload["data"] = payload["data"][:1]
    client.get = AsyncMock(return_value=_json_resp(payload))
    entity = await LuxembourgPack().registry_lookup("B 65282", client=client)
    assert entity is not None and entity["registryId"] == "B65282"
    params = client.get.call_args.kwargs["params"]
    assert params["filter[entity.registeredAs]"] == "B65282"
    assert params["filter[entity.registeredAt.id]"] == "RA000432"  # Luxembourg RCS authority


@pytest.mark.asyncio
async def test_lu_lookup_never_invents_an_rcs() -> None:
    """Un enregistrement sans numéro RCS, ou d'une AUTRE autorité, ne fait aucune
    identité — jamais un numéro deviné."""
    client = _mock_client()
    payload = json.loads(_fixture("gleif_lu_cactus.json"))
    for row in payload["data"]:
        row["attributes"]["entity"]["registeredAt"]["id"] = "RA000999"
    client.get = AsyncMock(return_value=_json_resp(payload))
    assert await LuxembourgPack().registry_lookup("Cactus", client=client) is None


@pytest.mark.asyncio
async def test_lu_lookup_http_error_degrades_to_none() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp({"errors": []}, status=503))
    assert await LuxembourgPack().registry_lookup("Cactus", client=client) is None


@pytest.mark.asyncio
async def test_lu_lookup_empty_query_no_network() -> None:
    client = _mock_client()
    assert await LuxembourgPack().registry_lookup("  ", client=client) is None
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_lu_collect_signals_carries_the_registry_only() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("gleif_lu_cactus.json"))))
    out = await LuxembourgPack().collect_signals("Cactus", client=client)
    assert out["registry"] is not None and out["registry"]["registryId"] == "B65282"
    # Aucune offre, aucune annonce RESA inventée : la source documentée ne les porte pas.
    assert out["jobs"] == [] and out["legalSignals"] == []


# ── États-Unis (SEC EDGAR) ────────────────────────────────────────────────────


def test_us_cik_helpers() -> None:
    assert _is_cik("0001352010") is True
    assert _is_cik("1352010") is True
    assert _is_cik("CIK 1352010") is True
    assert _is_cik("cik0001352010") is True
    assert _is_cik("EPAM") is False  # a ticker is not a CIK
    assert _is_cik("EPAM Systems") is False
    assert _normalize_cik("1352010") == "0001352010"
    assert _normalize_cik("CIK 1352010") == "0001352010"
    assert _normalize_cik("EPAM Systems") == ""  # a name mints no bogus CIK


def test_us_match_ticker_row() -> None:
    rows = list(json.loads(_fixture("edgar_company_tickers.json")).values())
    assert _match_ticker_row(rows, "EPAM")["cik_str"] == 1352010  # exact ticker
    assert _match_ticker_row(rows, "epam systems, inc.")["cik_str"] == 1352010  # exact title
    assert _match_ticker_row(rows, "Cognizant")["cik_str"] == 1058290  # title startswith
    assert _match_ticker_row(rows, "Business Machines")["cik_str"] == 51143  # title contains
    assert _match_ticker_row(rows, "Nonexistent Corp LLC") is None
    assert _match_ticker_row([], "EPAM") is None


def test_us_parse_submissions_fixture() -> None:
    payload = json.loads(_fixture("edgar_submissions.json"))
    entity = _entity_from_submissions(payload)
    assert entity is not None
    assert entity["name"] == "EPAM Systems, Inc."
    assert entity["registryId"] == "0001352010"
    assert entity["registryIdLabel"] == "CIK"
    assert entity["region"] == "DE"  # Delaware incorporation ≠ operating HQ
    assert entity["seat"] == "NEWTOWN, PA"
    assert entity["detailUrl"].endswith("CIK=0001352010")


def test_us_signals_filter_material_forms() -> None:
    payload = json.loads(_fixture("edgar_submissions.json"))
    signals = _signals_from_submissions(payload)
    # Fixture holds SCHEDULE 13G/A, 8-K, 4, 10-Q, DEF 14A, 10-K — ownership noise
    # (13G/A, Form 4) is excluded, material forms kept in recent-first order.
    assert [s["type"] for s in signals] == ["SEC 8-K", "SEC 10-Q", "SEC DEF 14A", "SEC 10-K"]
    assert signals[0]["date"] == "2026-05-26"
    assert all(s["date"] for s in signals)


@pytest.mark.asyncio
async def test_us_empty_query_no_network() -> None:
    client = _mock_client()
    assert await UsPack().registry_lookup("", client=client) is None
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_us_lookup_by_cik_skips_ticker_mapping() -> None:
    """A CIK query goes straight to the submissions endpoint — no tickers fetch."""
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("edgar_submissions.json"))))
    entity = await UsPack().registry_lookup("CIK 1352010", client=client)
    assert entity is not None and entity["registryId"] == "0001352010"
    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_us_lookup_by_name_resolves_via_tickers() -> None:
    """Name/ticker → company_tickers.json → CIK → submissions detail (two GETs)."""
    client = _mock_client()
    client.get = AsyncMock(
        side_effect=[
            _json_resp(json.loads(_fixture("edgar_company_tickers.json"))),
            _json_resp(json.loads(_fixture("edgar_submissions.json"))),
        ]
    )
    entity = await UsPack().registry_lookup("EPAM Systems", client=client)
    assert entity is not None
    assert entity["name"] == "EPAM Systems, Inc."
    assert entity["registryId"] == "0001352010"
    assert client.get.await_count == 2


@pytest.mark.asyncio
async def test_us_collect_signals_hits_and_legal() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("edgar_submissions.json"))))
    out = await UsPack().collect_signals("EPAM", ident="0001352010", client=client)
    assert out["registry"]["registryId"] == "0001352010"
    assert out["jobs"] == []  # documented absence (no free per-company US job API)
    assert len(out["legalSignals"]) == 4  # material forms only
    assert out["legalSignals"][0]["type"] == "SEC 8-K"
    assert len(out["hits"]) == 1
    hit = out["hits"][0]
    assert hit["source"] == "sec_edgar"
    assert "CIK 0001352010" in hit["title"]
    assert "Services-Computer Programming" in hit["description"]


@pytest.mark.asyncio
async def test_us_private_company_resolves_to_none() -> None:
    """A non-SEC-registrant (private company) yields None — the documented EDGAR
    limitation — never a fabricated identity."""
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("edgar_company_tickers.json"))))
    assert await UsPack().registry_lookup("Some Private Consulting LLC", client=client) is None
    client.get.assert_awaited_once()  # only the mapping fetch — no submissions call


@pytest.mark.asyncio
async def test_us_http_error_degrades() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp({}, status=403))
    assert await UsPack().registry_lookup("EPAM", client=client) is None


# ── Autocomplete suggest (recherche multi-pays #494) ──────────────────────────


@pytest.mark.asyncio
async def test_us_suggest_wraps_registry_lookup() -> None:
    """The default ``suggest`` wraps the pack's registry resolution into a
    suggestion list — a resolved entity carries its CIK, so « apple »/« EPAM »
    become a real autocomplete hit (fixes « Apple Inc introuvable »)."""
    client = _mock_client()
    client.get = AsyncMock(
        side_effect=[
            _json_resp(json.loads(_fixture("edgar_company_tickers.json"))),
            _json_resp(json.loads(_fixture("edgar_submissions.json"))),
        ]
    )
    out = await UsPack().suggest("EPAM Systems", client=client)
    assert len(out) == 1
    assert out[0]["registryId"] == "0001352010"
    assert out[0]["registryIdLabel"] == "CIK"
    assert out[0]["country"] == "US"


@pytest.mark.asyncio
async def test_us_suggest_empty_query_no_network() -> None:
    client = _mock_client()
    assert await UsPack().suggest("", client=client) == []
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_us_suggest_unresolved_returns_empty() -> None:
    """A non-SEC-registrant resolves to nothing → no suggestion (never fabricated)."""
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("edgar_company_tickers.json"))))
    assert await UsPack().suggest("Some Private Consulting LLC", client=client) == []


@pytest.mark.asyncio
async def test_suggest_registry_entities_fr_is_noop() -> None:
    """The pipeline entry point is a strict no-op for FR / unknown countries — the
    French autocomplete keeps using recherche-entreprises, no pack is consulted."""
    assert await suggest_registry_entities("FR", "capgemini") == []
    assert await suggest_registry_entities(None, "capgemini") == []
    assert await suggest_registry_entities("ZZ", "capgemini") == []


@pytest.mark.asyncio
async def test_suggest_registry_entities_lu_resolves_via_documented_source(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4016 L13a — LU n'est plus dégradé : sa suggestion passe par la source
    documentée (ici simulée) et rend l'identité RCS, jamais une société inventée."""
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("gleif_lu_cactus.json"))))
    monkeypatch.setattr(lu_mod.httpx, "AsyncClient", lambda *_a, **_k: client)
    out = await suggest_registry_entities("LU", "Cactus")
    assert out[0]["registryId"] == "B65282"  # the active exact match first
    assert all(e["contract"] == "documented" for e in out)
    assert len(out) <= 5


def test_us_vocabulary_and_ontology() -> None:
    voc = UsPack().local_vocabulary()
    assert voc["country"] == "États-Unis"
    assert "SEC EDGAR" in voc["prompt_fragment"]
    assert "CIK" in voc["prompt_fragment"]
    assert "Delaware" in voc["prompt_fragment"]  # incorporation ≠ HQ caveat
    assert "MSA" in voc["prompt_fragment"] and "SOW" in voc["prompt_fragment"]
    onto = UsPack().entity_ontology()
    assert "LLC" in onto["legalForms"]
    assert "EIN" in onto["identifier"]  # EIN documented as NOT public


# ── États-Unis — profondeur EDGAR (full-text search + XBRL companyfacts) ──────


def test_us_filing_url_from_fts_id() -> None:
    """``_id`` (``adsh:filename``) + CIK → the real Archives filing URL (verified
    live 2026-07-16); any malformed shape yields ``""`` — never a guessed URL."""
    url = _filing_url("0001352010-26-000015:epam-20251231.htm", ["0001352010"])
    assert url == "https://www.sec.gov/Archives/edgar/data/1352010/000135201026000015/epam-20251231.htm"
    assert _filing_url("no-colon-here", ["0001352010"]) == ""
    assert _filing_url("0001352010-26-000015:doc.htm", []) == ""
    assert _filing_url("", ["0001352010"]) == ""
    assert _filing_url("bad:doc.htm", ["not-a-cik"]) == ""


def test_us_fts_parse_fixture() -> None:
    """Recorded EDGAR full-text-search payload (EPAM × « cybersecurity ») → dated,
    filing-URL-sourced, web-block-ready hits in payload (relevance) order."""
    payload = json.loads(_fixture("edgar_fts_results.json"))
    hits = _fts_hits_from_payload(payload, "cybersecurity")
    assert len(hits) == 3
    first = hits[0]
    assert first["url"] == "https://www.sec.gov/Archives/edgar/data/1352010/000135201026000015/epam-20251231.htm"
    assert first["date"] == "2026-02-26"
    assert first["type"] == "SEC 10-K"
    assert "cybersecurity" in first["title"] and "2026-02-26" in first["title"]
    assert first["category"] == "other" and first["source"] == "sec_edgar_fts"
    assert "EPAM Systems" in first["description"]
    # The 8-K exhibit keeps its root form as the signal type + its own document URL.
    assert hits[1]["type"] == "SEC 8-K"
    assert hits[1]["url"].endswith("000135201023000035/exhibit991_pressrelease.htm")
    # Every hit is dated and sourced — the mission's hard requirement.
    assert all(h["date"] and h["url"] for h in hits)


def test_us_fts_malformed_payload_is_empty() -> None:
    assert _fts_hits_from_payload({}, "cybersecurity") == []
    assert _fts_hits_from_payload({"hits": {}}, "x") == []
    assert _fts_hits_from_payload({"hits": {"hits": [{"_id": "a:b"}]}}, "x") == []  # no _source
    assert _fts_hits_from_payload(None, "x") == []


def test_us_annual_series_duration_filter_and_dedup() -> None:
    """Accenture fixture: entries tagged ``form=10-K, fp=FY`` include QUARTERLY
    periods (real payload) — only ~1-year durations are annual revenue; restated
    values (same period end refiled in later 10-Ks) dedup to the latest filing."""
    payload = json.loads(_fixture("edgar_companyfacts_acn.json"))
    series = _annual_series(payload["facts"]["us-gaap"]["Revenues"], "USD")
    assert [s["val"] for s in series] == [69672977000, 64896464000, 64111745000]
    assert [s["end"] for s in series] == ["2025-08-31", "2024-08-31", "2023-08-31"]
    assert series[2]["filed"] == "2025-10-10"  # restatement: latest filed wins
    # The FY-tagged 3-month entries (17.6 B$ Q4) never leak into the annual series.
    assert all(s["val"] < 70000000000 for s in series)


def test_us_financial_profile_fixture() -> None:
    """EPAM fixture: the revenue tag with the FRESHEST annual data wins (the legacy
    ``Revenues`` tag stops in 2017); every value is a real recorded 10-K fact."""
    payload = json.loads(_fixture("edgar_companyfacts.json"))
    profile = _financial_profile_from_companyfacts(payload)
    assert profile is not None
    revs = profile["revenues"]
    assert [r["end"] for r in revs] == ["2025-12-31", "2024-12-31", "2023-12-31"]
    assert revs[0]["val"] == 5457056000 and revs[0]["filed"] == "2026-02-26"
    assert profile["netIncome"][0] == {"end": "2025-12-31", "val": 377678000, "filed": "2026-02-26"}
    shares = profile["sharesOutstanding"]
    assert shares["val"] == 52244451 and shares["end"] == "2026-04-30"


def test_us_financial_profile_absent_tags_is_none() -> None:
    """No XBRL facts (private filer / missing tags) ⇒ ``None`` — absent = nothing,
    JAMAIS d'extrapolation."""
    assert _financial_profile_from_companyfacts({}) is None
    assert _financial_profile_from_companyfacts({"facts": {}}) is None
    assert _financial_profile_from_companyfacts({"facts": {"us-gaap": {}, "dei": {}}}) is None
    # A tag present but with no usable annual entry contributes nothing.
    assert (
        _financial_profile_from_companyfacts(
            {"facts": {"us-gaap": {"Revenues": {"units": {"USD": [{"end": "2025-12-31", "val": 1}]}}}}}
        )
        is None
    )


def test_us_sec_financials_payload_from_fixtures() -> None:
    """Structured, PERSISTABLE snapshot (``raw_analysis.us_sec_financials``, #540
    volet A) from the real EPAM XBRL fixture + a recorded FTS payload: dated annual
    revenues + net income, CIK + 10-K filings link, dated full-text filings. Every
    value is a real recorded fact — JAMAIS inventé."""
    profile = _financial_profile_from_companyfacts(json.loads(_fixture("edgar_companyfacts.json")))
    fts = _fts_hits_from_payload(json.loads(_fixture("edgar_fts_results.json")), "cybersecurity")
    payload = _sec_financials_payload(profile, fts, "0001352010")
    assert payload is not None
    assert payload["cik"] == "0001352010"
    assert payload["filingUrl"].endswith("CIK=0001352010&type=10-K")
    assert payload["detailUrl"].endswith("CIK=0001352010")
    assert payload["revenues"][0] == {"end": "2025-12-31", "val": 5457056000, "filed": "2026-02-26"}
    assert payload["netIncome"][0]["val"] == 377678000
    assert payload["sharesOutstanding"]["val"] == 52244451
    # Dated full-text filings, each sourced by its real filing URL (never guessed).
    assert payload["filings"]
    assert all(f["date"] and f["url"] and f["form"] for f in payload["filings"])
    assert payload["filings"][0]["form"] == "10-K"


def test_us_sec_financials_payload_absent_is_none() -> None:
    """No XBRL profile AND no filings ⇒ ``None`` — absent = rien, jamais inventé."""
    assert _sec_financials_payload(None, [], "0001352010") is None
    assert _sec_financials_payload({}, [], "0001352010") is None


def _us_deep_client() -> AsyncMock:
    """Mock client routing each SEC endpoint to its recorded fixture."""
    subs = json.loads(_fixture("edgar_submissions.json"))
    facts = json.loads(_fixture("edgar_companyfacts.json"))
    fts = json.loads(_fixture("edgar_fts_results.json"))

    async def _route(url: str, **_kw: object) -> httpx.Response:
        if "data.sec.gov/submissions" in url:
            return _json_resp(subs)
        if "companyfacts" in url:
            return _json_resp(facts)
        if "search-index" in url:
            return _json_resp(fts)
        raise AssertionError(f"unexpected URL {url}")

    client = _mock_client()
    client.get = AsyncMock(side_effect=_route)
    return client


@pytest.mark.asyncio
async def test_us_collect_signals_deep_financials_and_fts() -> None:
    """The deep US dossier: identity hit + « données financières SEC (10-K) » block
    + dated full-text-search filing hits, all URL-deduped and web-block-ready."""
    client = _us_deep_client()
    out = await UsPack().collect_signals("EPAM", ident="0001352010", client=client)
    hits = out["hits"]
    urls = [h["url"] for h in hits]
    assert len(urls) == len(set(urls))  # deduped by URL
    # 1 identity + 1 financial + 2 deduped FTS filings (per-query cap, same fixture ×3 queries)
    assert len(hits) == 4
    fin = next(h for h in hits if h["source"] == "sec_edgar_xbrl")
    assert fin["url"].endswith("CIK=0001352010&type=10-K")
    assert "10-K" in fin["description"] and "2026-02-26" in fin["description"]
    assert "5 457 M$" in fin["description"]  # FY2025 revenue, real recorded fact
    assert "exercice clos 2025-12-31" in fin["description"]
    assert "52 244 451" in fin["description"]  # shares outstanding
    fts = [h for h in hits if h["source"] == "sec_edgar_fts"]
    assert len(fts) == 2
    assert fts[0]["date"] == "2026-02-26"  # recent-first
    assert all(h["url"].startswith("https://www.sec.gov/Archives/edgar/data/1352010/") for h in fts)
    # FTS filings double as dated legal signals (sourced by the filing URL).
    fts_legal = [s for s in out["legalSignals"] if s.get("url")]
    assert len(fts_legal) == 2 and all(s["date"] and s["type"].startswith("SEC ") for s in fts_legal)
    # Web-block contract: every hit carries the exact keys phase-1 injects.
    for h in hits:
        assert {"title", "url", "description", "category", "source"} <= set(h)


@pytest.mark.asyncio
async def test_us_collect_signals_persists_sec_financials() -> None:
    """The deep US dossier carries a structured ``secFinancials`` snapshot the
    pipeline lifts into ``raw_analysis.us_sec_financials`` (#540 volet A) — the
    same recorded 10-K facts as the prompt hit, now shaped for the fiche compte."""
    client = _us_deep_client()
    out = await UsPack().collect_signals("EPAM", ident="0001352010", client=client)
    fin = out["secFinancials"]
    assert fin["cik"] == "0001352010"
    assert fin["filingUrl"].endswith("CIK=0001352010&type=10-K")
    assert fin["revenues"][0]["end"] == "2025-12-31" and fin["revenues"][0]["val"] == 5457056000
    assert fin["netIncome"][0]["val"] == 377678000
    assert fin["sharesOutstanding"]["val"] == 52244451
    # Dated full-text filings ride along, deduped by URL (same fixture ×3 queries).
    assert len(fin["filings"]) == 2
    assert all(f["date"] and f["url"] for f in fin["filings"])


@pytest.mark.asyncio
async def test_us_collect_signals_absent_financials_omits_key() -> None:
    """Companyfacts + FTS down (403/timeout) ⇒ NO ``secFinancials`` key at all —
    nothing invented, the fiche compte block simply hides itself."""
    subs = json.loads(_fixture("edgar_submissions.json"))

    async def _route(url: str, **_kw: object) -> httpx.Response:
        if "data.sec.gov/submissions" in url:
            return _json_resp(subs)
        if "companyfacts" in url:
            return _json_resp({}, status=403)
        raise httpx.ConnectTimeout("efts unreachable")

    client = _mock_client()
    client.get = AsyncMock(side_effect=_route)
    out = await UsPack().collect_signals("EPAM", ident="0001352010", client=client)
    assert "secFinancials" not in out


@pytest.mark.asyncio
async def test_us_deep_sources_degrade_gracefully() -> None:
    """FTS + companyfacts down (403/timeout) ⇒ the identity hit and the submissions
    legal signals still come back — a deep source never sinks the pack."""
    subs = json.loads(_fixture("edgar_submissions.json"))

    async def _route(url: str, **_kw: object) -> httpx.Response:
        if "data.sec.gov/submissions" in url:
            return _json_resp(subs)
        if "companyfacts" in url:
            return _json_resp({}, status=403)
        raise httpx.ConnectTimeout("efts unreachable")

    client = _mock_client()
    client.get = AsyncMock(side_effect=_route)
    out = await UsPack().collect_signals("EPAM", ident="0001352010", client=client)
    assert out["registry"]["registryId"] == "0001352010"
    assert len(out["hits"]) == 1  # identity only — nothing invented
    assert out["hits"][0]["source"] == "sec_edgar"
    assert len(out["legalSignals"]) == 4  # submissions-borne material forms intact


@pytest.mark.asyncio
async def test_us_deep_requests_all_ride_the_sec_throttle(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every SEC request (submissions + companyfacts + each FTS query) goes through
    ``throttle("sec_edgar")`` — the 10 req/s fair-access cap covers the new depth."""
    providers: list[str] = []

    def _recording_throttle(provider: str) -> contextlib.nullcontext:
        providers.append(provider)
        return contextlib.nullcontext()

    monkeypatch.setattr(us_mod, "throttle", _recording_throttle)
    client = _us_deep_client()
    await UsPack().collect_signals("EPAM", ident="0001352010", client=client)
    assert providers == ["sec_edgar"] * client.get.await_count
    assert client.get.await_count == 2 + len(us_mod._FTS_IT_QUERIES)  # subs + facts + 1/query


@pytest.mark.asyncio
async def test_us_deep_hits_reach_the_pipeline_entry(monkeypatch: pytest.MonkeyPatch) -> None:
    """`collect_country_signals("US", …)` — the ONE phase-1 entry — surfaces the
    financial + FTS hits in the exact shape the web block injects into the prompts."""
    client = _us_deep_client()
    client.aclose = AsyncMock()
    monkeypatch.setattr(us_mod.httpx, "AsyncClient", lambda **_kw: client)
    out = await collect_country_signals("US", "EPAM", ident="0001352010")
    assert {h["source"] for h in out["hits"]} == {"sec_edgar", "sec_edgar_xbrl", "sec_edgar_fts"}
    client.aclose.assert_awaited_once()  # the pack owns (and closes) its client


# ── Canada (CBR / MRAS) ───────────────────────────────────────────────────────


def test_ca_identifier_helpers() -> None:
    assert _is_neq("1142478016") is True  # CGI Inc. — real NEQ
    assert _is_neq("18052956") is False  # federal corporation number, not a NEQ
    assert _is_neq("2142478016") is False  # NEQ starts with 11
    assert _is_bn("891148553") is True  # bare 9-digit BN
    assert _is_bn("847871746RC0001") is True  # BN + RC program suffix
    assert _is_bn("12345") is False
    assert _is_bn("1142478016") is False  # a NEQ is not a BN


def test_ca_parse_search_fixture_and_best_match() -> None:
    docs = json.loads(_fixture("cbr_search_results.json"))["docs"]
    best = _ca_best_match(docs, "CGI INC")
    assert best is not None
    entity = _entity_from_doc(best)
    assert entity is not None
    assert entity["name"] == "CGI INC."
    assert entity["registryId"] == "1142478016"  # the Québec NEQ (head office)
    assert entity["registryIdLabel"] == "numéro d'entreprise"
    assert entity["region"] == "QC"
    assert entity["status"] == "Active"
    assert entity["seat"].startswith("MONTRÉAL")
    # Non-federal jurisdiction ⇒ hit links to the official CBR results page.
    assert entity["detailUrl"].startswith("https://ised-isde.canada.ca/cbr-rec/en/search/results?search=")


def test_ca_entity_federal_detail_url() -> None:
    """Jurisdiction CC (Corporations Canada) gets the verified per-entity page."""
    entity = _entity_from_doc(
        {
            "Company_Name": "Open Text Corporation",
            "Juri_ID": "18052956",
            "Jurisdiction": "CC",
            "Entity_Type": "Business Corporation",
            "City": "Waterloo",
            "Reg_office_province": "Ontario",
            "Status_State": "Active",
        }
    )
    assert entity is not None
    assert entity["detailUrl"] == "https://ised-isde.canada.ca/cc/lgcy/fdrlCrpDtls.html?corpId=18052956&lang=eng"
    assert entity["region"] == "CC"


@pytest.mark.asyncio
async def test_ca_empty_query_no_network() -> None:
    client = _mock_client()
    assert await CanadaPack().registry_lookup("", client=client) is None
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_ca_lookup_by_name() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("cbr_search_results.json"))))
    entity = await CanadaPack().registry_lookup("CGI INC.", client=client)
    assert entity is not None and entity["registryId"] == "1142478016"
    client.get.assert_awaited_once()
    # The search is keyword-based, Active-filtered and 0-page-indexed.
    params = client.get.await_args.kwargs["params"]
    assert params["fq"] == "keyword:{CGI INC.} AND Status_State:Active"
    assert params["page"] == "0"


@pytest.mark.asyncio
async def test_ca_lookup_by_number_same_path() -> None:
    """A NEQ / corporation-number query rides the same keyword search (verified live)."""
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("cbr_search_results.json"))))
    entity = await CanadaPack().registry_lookup("1142478016", client=client)
    assert entity is not None
    assert entity["registryId"] == "1142478016"  # first doc — the API's own best match


@pytest.mark.asyncio
async def test_ca_collect_signals_hits() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("cbr_search_results.json"))))
    out = await CanadaPack().collect_signals("CGI INC.", client=client)
    assert out["registry"]["registryId"] == "1142478016"
    assert out["jobs"] == []  # documented gate (Job Bank feed = agreement-only)
    assert out["legalSignals"] == []  # no verified free per-company gazette
    assert len(out["hits"]) == 1
    hit = out["hits"][0]
    assert hit["source"] == "cbr"
    assert "1142478016" in hit["title"]
    assert "constituée le 1981-09-29" in hit["description"]


@pytest.mark.asyncio
async def test_ca_search_http_error_degrades() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp({}, status=500))
    assert await CanadaPack().registry_lookup("CGI", client=client) is None


@pytest.mark.asyncio
async def test_ca_search_empty_degrades() -> None:
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp({"totalResults": 0, "count": 0, "docs": []}))
    assert await CanadaPack().registry_lookup("Nonexistent Corp", client=client) is None


# ── Canada — page détail fédérale (Corporations Canada, HTML légal) ───────────


def test_ca_parse_federal_detail_fixture() -> None:
    """Real recorded ``fdrlCrpDtls.html`` capture (Open Text Corporation) → clean,
    stable fields off the WET-template label grid + registered-office panel.
    ``Not Available`` values are dropped — absent = nothing, never a placeholder."""
    detail = _parse_federal_detail(_fixture("ca_federal_detail.html"))
    assert detail["corporateName"] == "Open Text Corporation"
    assert detail["status"] == "Active"
    assert detail["corporationNumber"] == "1805295-6"
    assert detail["governingLegislation"] == "Canada Business Corporations Act - 2026-07-01"
    assert detail["registeredOffice"] == "275 Frank Tompa Dr, Waterloo ON N2L 0A1, Canada"
    assert "businessNumber" not in detail  # "Not Available" on the real page


def test_ca_parse_federal_detail_malformed_is_empty() -> None:
    assert _parse_federal_detail("") == {}
    assert _parse_federal_detail("<html><body>nothing here</body></html>") == {}


_CC_SEARCH_PAYLOAD = {
    "totalResults": 1,
    "count": 1,
    "docs": [
        {
            "Registry_Source": "CC",
            "Jurisdiction": "CC",
            "Juri_ID": "18052956",
            "Company_Name": "Open Text Corporation",
            "Entity_Type": "Business Corporation",
            "City": "Waterloo",
            "Reg_office_province": "Ontario",
            "Status_State": "Active",
            "Date_Incorporated": "1991-06-26",
        }
    ],
}


def _ca_federal_client(detail_resp: httpx.Response | None = None) -> AsyncMock:
    detail = detail_resp if detail_resp is not None else _text_resp(_fixture("ca_federal_detail.html"))

    async def _route(url: str, **_kw: object) -> httpx.Response:
        if "cbr/srch/api" in url:
            return _json_resp(_CC_SEARCH_PAYLOAD)
        if "fdrlCrpDtls.html" in url:
            return detail
        raise AssertionError(f"unexpected URL {url}")

    client = _mock_client()
    client.get = AsyncMock(side_effect=_route)
    return client


@pytest.mark.asyncio
async def test_ca_collect_signals_federal_enriches_from_detail_page() -> None:
    """A federal (CC) entity gets its official detail page parsed into the hit:
    registered-office address + governing legislation, dated and sourced."""
    client = _ca_federal_client()
    out = await CanadaPack().collect_signals("Open Text Corporation", client=client)
    assert out["registry"]["registryId"] == "18052956"
    assert client.get.await_count == 2  # search + ONE detail fetch
    hit = out["hits"][0]
    assert "275 Frank Tompa Dr, Waterloo ON N2L 0A1, Canada" in hit["description"]
    assert "Canada Business Corporations Act" in hit["description"]
    assert "constituée le 1991-06-26" in hit["description"]


@pytest.mark.asyncio
async def test_ca_collect_signals_detail_failure_degrades_to_search_doc() -> None:
    """Detail page down (500) ⇒ the hit still comes back, built from the search doc
    alone — the extra depth never sinks the pack."""
    client = _ca_federal_client(detail_resp=_text_resp("boom", status=500))
    out = await CanadaPack().collect_signals("Open Text Corporation", client=client)
    assert out["registry"]["registryId"] == "18052956"
    assert len(out["hits"]) == 1
    assert "constituée le 1991-06-26" in out["hits"][0]["description"]
    assert "Frank Tompa" not in out["hits"][0]["description"]


@pytest.mark.asyncio
async def test_ca_collect_signals_provincial_never_fetches_detail() -> None:
    """Non-CC jurisdictions have no verified per-entity page — exactly ONE request
    (the federated search), byte-identical behaviour to before."""
    client = _mock_client()
    client.get = AsyncMock(return_value=_json_resp(json.loads(_fixture("cbr_search_results.json"))))
    out = await CanadaPack().collect_signals("CGI INC.", client=client)
    assert out["registry"]["region"] == "QC"
    client.get.assert_awaited_once()


def test_ca_vocabulary_and_ontology() -> None:
    voc = CanadaPack().local_vocabulary()
    assert voc["country"] == "Canada"
    assert "NEQ" in voc["prompt_fragment"]
    assert "Corporations Canada" in voc["prompt_fragment"]
    assert "Loi 96" in voc["prompt_fragment"]  # FR-CA obligation in Québec
    assert voc["languages"] == ["en", "fr"]
    onto = CanadaPack().entity_ontology()
    assert "Extra-provincial corporation" in onto["legalForms"]
    assert "NEQ" in onto["identifier"]


# ── Golden identifier non-regression ──────────────────────────────────────────


def test_golden_ch_uids_wellformed() -> None:
    data = json.loads(_fixture("ch.json"))
    accounts = data["accounts"]
    assert len(accounts) >= 3
    for acc in accounts:
        assert ch_mod._UID_RE.fullmatch(acc["uid"]), acc
        assert _format_uid(acc["uid"]) == acc["uid"]  # already canonical


def test_golden_be_numbers_are_enterprise() -> None:
    data = json.loads(_fixture("be.json"))
    accounts = data["accounts"]
    assert len(accounts) >= 3
    for acc in accounts:
        assert _is_enterprise_number(acc["bce"]), acc
        assert _format_bce(acc["bce"]) == acc["bce"]  # already canonical dotted form


def test_golden_lu_rcs_wellformed() -> None:
    data = json.loads(_fixture("lu.json"))
    accounts = data["accounts"]
    assert len(accounts) >= 3
    for acc in accounts:
        assert _is_rcs_number(acc["rcs"]), acc  # real verified RCS numbers (B<digits>)
        assert _format_rcs(acc["rcs"]) == acc["rcs"]  # already canonical (no spaces)


def test_golden_us_ciks_wellformed() -> None:
    data = json.loads(_fixture("us.json"))
    accounts = data["accounts"]
    assert len(accounts) >= 3
    for acc in accounts:
        assert _is_cik(acc["cik"]), acc  # real verified CIKs
        assert len(acc["cik"]) == 10  # canonical 10-digit zero-padded form
        assert _normalize_cik(acc["cik"]) == acc["cik"]  # already canonical
        assert acc["ticker"].isupper() and acc["ticker"].isalpha(), acc


def test_golden_ca_ids_wellformed() -> None:
    data = json.loads(_fixture("ca.json"))
    accounts = data["accounts"]
    assert len(accounts) >= 3
    jurisdictions = set()
    for acc in accounts:
        jurisdictions.add(acc["jurisdiction"])
        juri_id = acc["juriId"]
        assert juri_id.isdigit(), acc  # NEQ / federal / Ontario numbers are numeric
        if acc["jurisdiction"] == "QC":
            assert _is_neq(juri_id), acc  # a QC id is a canonical NEQ
        if acc["bn"] is not None:
            assert _is_bn(acc["bn"]), acc  # CRA Business Number shape
    # The fixture proves the FEDERATED reach: federal (CC) + provinces.
    assert "CC" in jurisdictions and {"QC", "ON"} & jurisdictions
