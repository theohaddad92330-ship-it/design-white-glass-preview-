"""French company registries — recherche-entreprises (free) and INSEE Sirene.

Both clients swallow every exception into ``None``/``[]``, so upstream drift is
invisible in production. Each test therefore does two things:

1. **Wire contract** — issue the request with the URL/params/headers taken from
   the production module (imported, never retyped) and assert the exact field
   paths the production parser reads.
2. **Parser contract** — feed the live payload through the REAL production
   parser and assert it still yields a usable object. This catches the subtler
   break where the fields exist but no longer mean what the parser assumes.

DECATHLON is the probe: a large, stable, unambiguous French company that will
not disappear, with a SIREN we can assert on.
"""

from __future__ import annotations

from app.services import insee_sirene
from app.services.company_filters import CompanyDiscoveryFilters
from app.services.data_sources import recherche_entreprises as re_client
from tests.contracts import harness

# Decathlon SE — stable, listed in every French registry.
_COMPANY = "DECATHLON"
_SIREN = "500569405"


# ── recherche-entreprises.api.gouv.fr (free, no key) ──────────────────────────


async def test_recherche_entreprises_search_contract():
    provider = re_client.SOURCE_NAME
    endpoint = "GET /search"

    # Exactly the params production sends in `fetch_company` (search.py:60).
    params = {"q": _COMPANY, "page": "1", "per_page": "1"}
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=re_client._BASE,
        params=params,
        timeout=re_client._TIMEOUT_S,
        request_detail=f"{params} → {re_client._BASE}",
    )

    # Envelope: `payload["results"]` must stay a non-empty list of objects.
    harness.expect_nonempty(p, "results", why="recherche_entreprises.py fetch_company")
    harness.expect_field(p, "results.0", dict, why="results[0] is parsed as a dict")

    # Every field `fetch_company` / `_candidate` actually read.
    harness.expect_field(p, "results.0.siren", str, why="required — row dropped without it")
    harness.expect_field(p, "results.0.nom_complet", str, why="→ name")
    harness.expect_field(p, "results.0.activite_principale", str, why="→ nafCode")
    harness.expect_field(p, "results.0.nombre_etablissements", int, why="→ etablissementCount")
    harness.expect_field(p, "results.0.date_creation", str, why="lexicographic ISO date compare")
    harness.expect_field(p, "results.0.siege", dict, why="_candidate reads siege.* for city/dept")

    # Parser contract — the real production function, end to end.
    company = await re_client.fetch_company(_COMPANY)
    harness.expect_parses(
        p,
        parser="recherche_entreprises.fetch_company",
        result=company,
        predicate=bool(company) and bool((company or {}).get("siren")),
        expected=f"a dict carrying a siren for {_COMPANY!r}",
    )
    harness.ok(provider, endpoint, f"siren={company['siren']}")


async def test_recherche_entreprises_filtered_listing_contract():
    """The Découvrir listing path — server-side filter params must stay valid.

    ``list_companies`` sends NAF / department / headcount filters that a schema
    change would reject outright (or, worse, silently ignore).
    """
    provider = re_client.SOURCE_NAME
    endpoint = "GET /search (filtered listing)"

    # Built by the PRODUCTION query builder from the production filter model.
    # Hand-writing these params is what makes a contract test drift: the model's
    # `_normalize_naf` validator rewrites "6201Z" → "62.01Z", and only the
    # dotted form is accepted upstream. Deriving the params guarantees the test
    # exercises the bytes production sends.
    filters = CompanyDiscoveryFilters(naf_code="6201Z", department="59")
    params = re_client._list_query(filters, limit=5)
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=re_client._BASE,
        params=params,
        timeout=re_client._TIMEOUT_S,
        request_detail=f"{params} (filters from _list_query)",
    )
    results = harness.expect_field(p, "results", list, why="list_companies envelope")
    harness.expect_parses(
        p,
        parser="recherche_entreprises.list_companies filters",
        result=len(results),
        predicate=len(results) > 0,
        expected="the NAF+departement filters still return rows (a silently "
        "ignored or rejected filter would empty the Découvrir screen)",
    )
    harness.ok(provider, endpoint, f"{len(results)} rows for NAF 6201Z / dept 59")


# ── INSEE Sirene 3.11 ─────────────────────────────────────────────────────────


async def test_insee_sirene_search_contract():
    """The historized-field query syntax is the fragile part here.

    ``denominationUniteLegale`` must be wrapped in ``periode(...)`` — a bare
    field name is a 400. That is exactly a contract assertion worth pinning.
    """
    provider = "insee-sirene"
    endpoint = "GET /siren"
    harness.require_env(provider, endpoint, "INSEE_API_KEY")

    # URL, headers and query built by the production helpers.
    params = {"q": f'periode(denominationUniteLegale:"{_COMPANY}")', "nombre": "5"}
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=f"{insee_sirene._base_url()}/siren",
        params=params,
        headers=insee_sirene._auth_headers(),
        timeout=insee_sirene._TIMEOUT_S,
        request_detail=f"{params} with header {list(insee_sirene._auth_headers())[0]}",
    )

    harness.expect_nonempty(p, "unitesLegales", why="insee_sirene.search_unites_legales envelope")
    harness.expect_field(p, "unitesLegales.0.siren", str, why="required — row dropped without it")
    harness.expect_field(
        p,
        "unitesLegales.0.periodesUniteLegale",
        list,
        why="_parse_unite assumes [0] is the most recent period",
    )
    harness.expect_field(
        p,
        "unitesLegales.0.periodesUniteLegale.0.etatAdministratifUniteLegale",
        str,
        why="_parse_unite → is_active ('A' = active)",
    )

    # Parser contract, through the real production function.
    units = await insee_sirene.search_unites_legales(_COMPANY, limit=5)
    harness.expect_parses(
        p,
        parser="insee_sirene.search_unites_legales",
        result=units,
        predicate=bool(units) and all(u.siren for u in units),
        expected=f"at least one InseeUniteLegale with a siren for {_COMPANY!r}",
    )
    harness.ok(provider, endpoint, f"{len(units)} unités légales")


async def test_insee_sirene_etablissements_contract():
    """The /siret endpoint feeds the établissement map (city, HQ flag)."""
    provider = "insee-sirene"
    endpoint = "GET /siret"
    harness.require_env(provider, endpoint, "INSEE_API_KEY")

    params = {"q": f"siren:{_SIREN}", "nombre": "5"}
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=f"{insee_sirene._base_url()}/siret",
        params=params,
        headers=insee_sirene._auth_headers(),
        timeout=insee_sirene._TIMEOUT_S,
        request_detail=f"{params}",
    )

    harness.expect_nonempty(p, "etablissements", why="etablissements_by_siren envelope")
    harness.expect_field(p, "etablissements.0.siret", str, why="required — row dropped without it")
    harness.expect_field(
        p,
        "etablissements.0.adresseEtablissement",
        dict,
        why="_parse_etablissement reads libelleCommuneEtablissement / codePostal",
    )
    harness.expect_field(
        p,
        "etablissements.0.etablissementSiege",
        bool,
        why="_parse_etablissement → is HQ",
    )
    harness.ok(provider, endpoint, f"{len(harness.dig(p.payload, 'etablissements'))} établissements")
