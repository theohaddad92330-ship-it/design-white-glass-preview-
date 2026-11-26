"""Apollo Organization Enrichment — logo + firmographie factuelle.

Parsing sur fixtures réelles (shape documenté organizations/enrich), no-op strict
sans clé (zéro réseau), échec gracieux (None), cache 30 j par domaine : un hit est
servi du cache, un miss n'est jamais caché.
"""

from __future__ import annotations

import fakeredis.aioredis
import httpx
import pytest

from app.services import apollo_org
from app.services.apollo_org import (
    ApolloOrgEnrichment,
    _to_org_enrichment,
    enrich_organization,
)

# Fixture calquée sur la réponse documentée d'Apollo `organizations/enrich`
# (docs.apollo.io/reference/organization-enrichment) — sous-ensemble lu.
SAMPLE_ORG = {
    "id": "54a1234567890abcdef01234",
    "name": "Vinci",
    "primary_domain": "vinci.com",
    "logo_url": "https://zenprospect-production.s3.amazonaws.com/logos/vinci.png",
    "estimated_num_employees": 272000,
    "industry": "construction",
    "founded_year": 1899,
    "linkedin_url": "http://www.linkedin.com/company/vinci",
    "twitter_url": "https://twitter.com/vinci",
    "annual_revenue_printed": "68.8B",
    "total_funding_printed": "$1.2B",
    "latest_funding_stage": "Series C",
    "latest_funding_round_date": "2021-02-01T00:00:00.000+00:00",
    "current_technologies": [
        {"uid": "salesforce", "name": "Salesforce", "category": "CRM"},
        {"uid": "aws", "name": "AWS", "category": "Cloud"},
        {"uid": "salesforce2", "name": "salesforce", "category": "CRM"},  # dup (case)
    ],
    "technology_names": ["Salesforce", "AWS", "Workday"],
    "short_description": "VINCI is a global player in concessions and construction.",
    "raw_address": "1973 boulevard de la Défense, 92000 Nanterre, France",
    "city": "Nanterre",
    "state": "Île-de-France",
    "country": "France",
    "postal_code": "92000",
    "phone": "+33 1 47 16 35 00",
    "publicly_traded_symbol": "DG",
    "publicly_traded_exchange": "EPA",
    "departmental_head_count": {
        "engineering": 12000,
        "operations": 40000,
        "finance": 3000,
        "unknown": 0,  # dropped (non-positive)
        "human_resources": None,  # dropped (non-int)
    },
    "keywords": ["construction", "concessions", "infrastructure", "construction"],  # dup
    "owned_by_organization": {"id": "x", "name": "VINCI SA"},
    "retail_location_count": 42,
}


def _mock_response(status: int, json_data: dict | None = None, text: str | None = None) -> httpx.Response:
    request = httpx.Request("GET", apollo_org.APOLLO_ORG_ENRICH_URL)
    if text is not None:
        return httpx.Response(status, text=text, request=request)
    return httpx.Response(status, json=json_data or {}, request=request)


async def _wrap(client):
    return client


async def _none():
    return None


# === _to_org_enrichment (parsing pur) ===


class TestToOrgEnrichment:
    def test_extracts_all_factual_fields(self) -> None:
        result = _to_org_enrichment(SAMPLE_ORG, "vinci.com")
        # Apollo's own org id — the strong People-Search scope key (retour Théo P0).
        assert result.organization_id == "54a1234567890abcdef01234"
        assert result.domain == "vinci.com"
        assert result.logo_url == "https://zenprospect-production.s3.amazonaws.com/logos/vinci.png"
        assert result.estimated_num_employees == 272000
        assert result.industry == "construction"
        assert result.founded_year == 1899
        assert result.linkedin_url == "http://www.linkedin.com/company/vinci"
        assert result.twitter_url == "https://twitter.com/vinci"
        assert result.annual_revenue_printed == "68.8B"
        assert result.total_funding_printed == "$1.2B"
        assert result.latest_funding_stage == "Series C"
        assert result.latest_funding_round_date == "2021-02-01"
        # current_technologies d'abord, dédupliqué case-insensitive.
        assert result.technologies == ["Salesforce", "AWS"]
        # Extras factuels du même appel (zéro crédit supplémentaire).
        assert result.short_description == "VINCI is a global player in concessions and construction."
        assert result.raw_address == "1973 boulevard de la Défense, 92000 Nanterre, France"
        assert result.city == "Nanterre"
        assert result.state == "Île-de-France"
        assert result.country == "France"
        assert result.postal_code == "92000"
        assert result.phone == "+33 1 47 16 35 00"
        assert result.publicly_traded_symbol == "DG"
        assert result.publicly_traded_exchange == "EPA"
        # Effectifs par département : positifs seulement, triés desc, 0/None retirés.
        assert result.departmental_head_count == {"operations": 40000, "engineering": 12000, "finance": 3000}
        # Keywords dédupliqués.
        assert result.keywords == ["construction", "concessions", "infrastructure"]
        # Société mère depuis owned_by_organization.name.
        assert result.parent_organization == "VINCI SA"
        assert result.retail_location_count == 42

    @pytest.mark.parametrize("round_date", [None, "", "recently", "2021-13-45"])
    def test_undated_funding_is_withdrawn_never_shown_as_recent(self, round_date: object) -> None:
        # #3917.a — un financement SANS date lisible est retiré (montant ET stade),
        # jamais affiché comme s'il était récent.
        org = {"total_funding_printed": "$1.2B", "latest_funding_stage": "Series C"}
        if round_date is not None:
            org["latest_funding_round_date"] = round_date
        result = _to_org_enrichment(org, "x.fr")
        assert result.total_funding_printed is None
        assert result.latest_funding_stage is None
        assert result.latest_funding_round_date is None

    def test_dated_funding_is_kept_with_its_date(self) -> None:
        org = {"latest_funding_stage": "Series A", "latest_funding_round_date": "2024-03-15"}
        result = _to_org_enrichment(org, "x.fr")
        assert result.latest_funding_stage == "Series A"
        assert result.latest_funding_round_date == "2024-03-15"
        assert result.model_dump(by_alias=True, exclude_none=True)["latestFundingRoundDate"] == "2024-03-15"

    def test_absent_fields_stay_absent(self) -> None:
        # Champ absent chez Apollo = absent ici — JAMAIS de valeur inventée.
        result = _to_org_enrichment({"name": "Petite Boîte"}, "petite.fr")
        assert result.domain == "petite.fr"
        assert result.organization_id is None
        assert result.logo_url is None
        assert result.estimated_num_employees is None
        assert result.industry is None
        assert result.founded_year is None
        assert result.linkedin_url is None
        assert result.twitter_url is None
        assert result.total_funding_printed is None
        assert result.latest_funding_stage is None
        assert result.latest_funding_round_date is None
        assert result.annual_revenue_printed is None
        assert result.technologies is None
        assert result.short_description is None
        assert result.raw_address is None
        assert result.city is None
        assert result.state is None
        assert result.country is None
        assert result.postal_code is None
        assert result.phone is None
        assert result.publicly_traded_symbol is None
        assert result.publicly_traded_exchange is None
        assert result.departmental_head_count is None
        assert result.keywords is None
        assert result.parent_organization is None
        assert result.retail_location_count is None

    def test_short_description_falls_back_to_seo(self) -> None:
        result = _to_org_enrichment({"seo_description": "Blurb SEO."}, "x.io")
        assert result.short_description == "Blurb SEO."

    def test_address_composed_from_components_when_no_raw(self) -> None:
        result = _to_org_enrichment(
            {"street_address": "1 rue X", "postal_code": "75001", "city": "Paris", "country": "France"},
            "x.io",
        )
        assert result.raw_address == "1 rue X, 75001 Paris, France"

    def test_phone_from_primary_phone_object(self) -> None:
        result = _to_org_enrichment({"primary_phone": {"number": "+33 1 23 45 67 89"}}, "x.io")
        assert result.phone == "+33 1 23 45 67 89"

    def test_parent_from_plain_string(self) -> None:
        result = _to_org_enrichment({"parent": "Holding SA"}, "x.io")
        assert result.parent_organization == "Holding SA"

    def test_technologies_falls_back_to_flat_names(self) -> None:
        result = _to_org_enrichment({"technology_names": ["React", "GCP", "", "React"]}, "x.io")
        assert result.technologies == ["React", "GCP"]

    def test_technologies_bounded(self) -> None:
        many = {"technology_names": [f"Tech{i}" for i in range(50)]}
        result = _to_org_enrichment(many, "x.io")
        assert result.technologies is not None
        assert len(result.technologies) == 12

    def test_garbage_numbers_normalised_to_none(self) -> None:
        result = _to_org_enrichment(
            {"estimated_num_employees": 0, "founded_year": True},  # type: ignore[typeddict-item]
            "x.io",
        )
        assert result.estimated_num_employees is None
        assert result.founded_year is None

    def test_camelcase_wire_dump_omits_absent_fields(self) -> None:
        # Le dump alias camelCase = le wire persisté dans raw_analysis /
        # accounts.apollo_enrichment (AnalysisApolloOrgEnrichment côté TS).
        dumped = _to_org_enrichment(SAMPLE_ORG, "vinci.com").model_dump(by_alias=True, exclude_none=True)
        assert dumped["organizationId"] == "54a1234567890abcdef01234"
        assert dumped["logoUrl"].endswith("vinci.png")
        assert dumped["estimatedNumEmployees"] == 272000
        assert dumped["foundedYear"] == 1899
        assert dumped["linkedinUrl"] == "http://www.linkedin.com/company/vinci"
        assert dumped["totalFundingPrinted"] == "$1.2B"
        assert dumped["latestFundingStage"] == "Series C"
        # New camelCase aliases mirror AnalysisApolloOrgEnrichment (TS contract).
        assert dumped["shortDescription"].startswith("VINCI")
        assert dumped["rawAddress"].endswith("France")
        assert dumped["postalCode"] == "92000"
        assert dumped["publiclyTradedSymbol"] == "DG"
        assert dumped["publiclyTradedExchange"] == "EPA"
        assert dumped["departmentalHeadCount"]["operations"] == 40000
        assert dumped["keywords"] == ["construction", "concessions", "infrastructure"]
        assert dumped["parentOrganization"] == "VINCI SA"
        assert dumped["retailLocationCount"] == 42
        sparse = _to_org_enrichment({"name": "X"}, "x.io").model_dump(by_alias=True, exclude_none=True)
        assert set(sparse.keys()) == {"domain"}


# === enrich_organization (gating + réseau + gracieux) ===


class TestEnrichOrganization:
    @pytest.mark.asyncio
    async def test_no_api_key_is_a_strict_noop(self, monkeypatch) -> None:
        monkeypatch.delenv("APOLLO_API_KEY", raising=False)

        class _Boom(httpx.AsyncClient):
            async def get(self, *a, **kw):  # pragma: no cover — must never run
                raise AssertionError("network call attempted without APOLLO_API_KEY")

        assert await enrich_organization("vinci.com", http_client=_Boom()) is None

    @pytest.mark.asyncio
    async def test_no_domain_is_a_noop(self, monkeypatch) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        assert await enrich_organization(None) is None
        assert await enrich_organization("   ") is None

    @pytest.mark.asyncio
    async def test_hit_returns_typed_enrichment(self, monkeypatch) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        monkeypatch.setattr(apollo_org, "_org_cache_redis", _none)

        async def _get(*_a, **_kw):
            return _mock_response(200, {"organization": SAMPLE_ORG})

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        result = await enrich_organization("vinci.com", http_client=client)
        assert result is not None
        assert result.logo_url is not None
        assert result.estimated_num_employees == 272000
        await client.aclose()

    @pytest.mark.asyncio
    async def test_miss_returns_none(self, monkeypatch) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        monkeypatch.setattr(apollo_org, "_org_cache_redis", _none)

        async def _get(*_a, **_kw):
            return _mock_response(200, {"organization": None})

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        assert await enrich_organization("inconnue.fr", http_client=client) is None
        await client.aclose()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [403, 429, 500])
    async def test_http_failure_degrades_to_none(self, monkeypatch, status: int) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        monkeypatch.setattr(apollo_org, "_org_cache_redis", _none)

        async def _get(*_a, **_kw):
            return _mock_response(status, {"error": "nope"})

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        assert await enrich_organization("vinci.com", http_client=client) is None
        await client.aclose()

    @pytest.mark.asyncio
    async def test_non_json_200_degrades_to_none(self, monkeypatch) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        monkeypatch.setattr(apollo_org, "_org_cache_redis", _none)

        async def _get(*_a, **_kw):
            return _mock_response(200, text="<html>cdn interstitial</html>")

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        assert await enrich_organization("vinci.com", http_client=client) is None
        await client.aclose()

    @pytest.mark.asyncio
    async def test_network_error_degrades_to_none(self, monkeypatch) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        monkeypatch.setattr(apollo_org, "_org_cache_redis", _none)

        async def _get(*_a, **_kw):
            raise httpx.ConnectError("boom")

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        assert await enrich_organization("vinci.com", http_client=client) is None
        await client.aclose()


# === Cache 30 j (1 crédit Apollo / domaine) ===


class TestOrgEnrichCache:
    @pytest.mark.asyncio
    async def test_hit_served_from_cache(self, monkeypatch) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr(apollo_org, "_org_cache_redis", lambda: _wrap(fake))

        calls = {"n": 0}

        async def _uncached(domain, api_key, http_client=None):
            calls["n"] += 1
            return ApolloOrgEnrichment(domain=domain, logo_url="https://x/logo.png")

        monkeypatch.setattr(apollo_org, "_enrich_organization_uncached", _uncached)

        r1 = await enrich_organization("vinci.com")
        r2 = await enrich_organization("vinci.com")
        assert r1 is not None and r1.logo_url == "https://x/logo.png"
        assert r2 is not None and r2.logo_url == "https://x/logo.png"
        assert calls["n"] == 1  # 2e appel servi du cache — pas de 2e crédit Apollo

    @pytest.mark.asyncio
    async def test_miss_is_not_cached(self, monkeypatch) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr(apollo_org, "_org_cache_redis", lambda: _wrap(fake))

        calls = {"n": 0}

        async def _uncached(domain, api_key, http_client=None):
            calls["n"] += 1
            return None

        monkeypatch.setattr(apollo_org, "_enrich_organization_uncached", _uncached)

        assert await enrich_organization("inconnue.fr") is None
        assert await enrich_organization("inconnue.fr") is None
        assert calls["n"] == 2  # un miss se retente (la donnée Apollo s'améliore)

    @pytest.mark.asyncio
    async def test_no_redis_is_a_silent_noop(self, monkeypatch) -> None:
        monkeypatch.setenv("APOLLO_API_KEY", "k")
        monkeypatch.setattr(apollo_org, "_org_cache_redis", _none)

        async def _uncached(domain, api_key, http_client=None):
            return ApolloOrgEnrichment(domain=domain)

        monkeypatch.setattr(apollo_org, "_enrich_organization_uncached", _uncached)
        result = await enrich_organization("vinci.com")
        assert result is not None and result.domain == "vinci.com"


# ── Chiffre d'affaires numérique (#818 : confronter Apollo au registre) ───────
#
# Le front compare le CA Apollo au chiffre DÉPOSÉ au registre pour signaler un
# écart. Il lui faut donc un nombre : « $1.2B » n'est pas comparable. Le champ
# pré-imprimé reste à côté, inchangé.


def test_le_ca_numerique_est_repris_tel_quel():
    org = {"id": "1", "name": "ACME", "annual_revenue": 1200000.0, "annual_revenue_printed": "$1.2M"}
    out = _to_org_enrichment(org, "acme.com")
    assert out.annual_revenue == 1200000.0
    assert out.annual_revenue_printed == "$1.2M"


def test_un_ca_absent_reste_absent():
    """Present-only : sans chiffre chez Apollo, aucun écart ne sera calculé —
    plutôt qu'un 0 qui s'afficherait comme un fait."""
    out = _to_org_enrichment({"id": "1", "name": "ACME"}, "acme.com")
    assert out.annual_revenue is None


def test_un_ca_a_zero_ou_non_numerique_n_est_pas_un_chiffre():
    assert _to_org_enrichment({"id": "1", "name": "A", "annual_revenue": 0}, "a.com").annual_revenue is None
    assert _to_org_enrichment({"id": "1", "name": "A", "annual_revenue": "1.2M"}, "a.com").annual_revenue is None
    assert _to_org_enrichment({"id": "1", "name": "A", "annual_revenue": True}, "a.com").annual_revenue is None


def test_le_ca_sort_en_camelCase_sur_le_fil():
    """Le contrat TS lit `annualRevenue` — l'alias doit être posé, sinon le champ
    voyage sous un nom que le front ne lit pas."""
    out = _to_org_enrichment({"id": "1", "name": "A", "annual_revenue": 42.0}, "a.com")
    assert out.model_dump(by_alias=True, exclude_none=True)["annualRevenue"] == 42.0
