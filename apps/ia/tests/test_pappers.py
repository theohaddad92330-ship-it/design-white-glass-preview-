from __future__ import annotations

import os
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.company_filters import DegradeReason
from app.services.pappers import (
    CompanyProfile,
    CompanySearchHit,
    CompanySearchParams,
    PappersAmbiguousMatchError,
    PappersNoResultError,
    PappersUnavailableError,
    get_company,
    search_company,
    search_company_suggestions,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_response(status_code: int = 200, json_data: dict | None = None) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=json_data,
        request=httpx.Request("GET", "https://api.pappers.fr/v2/test"),
    )


def _async_client_returning(*responses: httpx.Response) -> AsyncMock:
    """Build an AsyncMock httpx client whose .get returns `responses` in order."""
    client = AsyncMock(spec=httpx.AsyncClient)
    if len(responses) == 1:
        client.get = AsyncMock(return_value=responses[0])
    else:
        client.get = AsyncMock(side_effect=list(responses))
    return client


SEARCH_RESPONSE_GOOGLE = {
    "resultats": [
        {
            "siren": "443061841",
            "nom_entreprise": "GOOGLE FRANCE",
            "siege": {"ville": "PARIS 9"},
            "libelle_code_naf": "Programmation informatique",
        },
        {
            "siren": "999999999",
            "nom_entreprise": "GOOGLE AUTRE",
        },
    ]
}

DETAIL_RESPONSE_GOOGLE = {
    "siren": "443061841",
    "siret_siege_social": "44306184100047",
    "nom_entreprise": "GOOGLE FRANCE",
    "forme_juridique": "SAS",
    "capital": 1_000_000,
    "devise_capital": "EUR",
    "date_creation": "2002-01-01",
    "statut_consolide": "actif",
    "statut_rcs": "Inscrit",
    "greffe": "Paris",
    "code_naf": "6201Z",
    "libelle_code_naf": "Programmation informatique",
    "domaine_activite": "Conseil et services informatiques",
    "objet_social": "Programmation",
    "effectif": "500 à 999 salariés",
    "effectif_min": 500,
    "effectif_max": 999,
    "tranche_effectif": "41",
    "annee_effectif": 2024,
    "lien_pappers": "https://www.pappers.fr/entreprise/google-france-443061841",
    "entreprise_cessee": False,
    "finances": [
        {"annee": 2022, "chiffre_affaires": 500_000_000, "resultat": 50_000_000, "effectifs": 700},
        {"annee": 2023, "chiffre_affaires": 600_000_000, "resultat": 60_000_000, "effectifs": 750},
        {"annee": 2021, "chiffre_affaires": 400_000_000, "resultat": 40_000_000, "effectifs": 680},
    ],
    "siege": {
        "siret": "44306184100047",
        "adresse_ligne_1": "8 Rue de Londres",
        "code_postal": "75009",
        "ville": "PARIS 9",
        "pays": "France",
        "etablissement_cesse": False,
    },
    "representants": [
        {
            "nom": "Dupont",
            "prenom": "Jean",
            "qualite": "Président",
            "date_de_naissance": "1975-03-15",
        },
        {
            "nom": "Martin",
            "prenom": "Sophie",
            "qualite": "Directrice Générale",
            "date_de_naissance": "1980-07-22",
        },
        {
            "nom": "Durand",
            "prenom": "Paul",
            "qualite": "Administrateur",
        },
    ],
    "etablissements": [
        {
            "siret": "44306184100015",
            "nom_commercial": "Google France HQ",
            "adresse_ligne_1": "8 Rue de Londres",
            "code_postal": "75009",
            "ville": "PARIS 9",
            "siege": True,
        },
    ],
    "beneficiaires_effectifs": [],
}

CARTOGRAPHIE_RESPONSE_GOOGLE = {
    "entreprises": [
        {"id": "e1", "siren": "443061841", "nom_entreprise": "GOOGLE FRANCE"},
        {"id": "e2", "siren": "123456789", "nom_entreprise": "GOOGLE CLOUD FRANCE"},
        {"id": "e3", "siren": "987654321", "nom_entreprise": "ALPHABET HOLDINGS"},
    ],
    "personnes": [
        {"id": "p1", "prenom": "Jean", "nom": "Dupont", "niveau": 1},
    ],
    "liens_entreprises_personnes": ["e1-p1"],
    "liens_entreprises_entreprises": ["e1-e2", "e3-e1"],
}


# ---------------------------------------------------------------------------
# Tests — search_company
# ---------------------------------------------------------------------------


class TestSearchCompany:
    @pytest.mark.asyncio
    async def test_returns_typed_hit(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(_mock_response(200, SEARCH_RESPONSE_GOOGLE))

            hit = await search_company("Google France", http_client=client)

            assert isinstance(hit, CompanySearchHit)
            assert hit.siren == "443061841"
            assert hit.legal_name == "GOOGLE FRANCE"
            assert hit.city == "PARIS 9"
            assert hit.naf_label == "Programmation informatique"
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_enforces_par_page_1_and_filters_cessee(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(_mock_response(200, SEARCH_RESPONSE_GOOGLE))

            await search_company("Google France", http_client=client)

            sent = client.get.call_args[1]["params"]
            assert sent["par_page"] == "1"
            assert sent["entreprise_cessee"] == "false"
            assert sent["precision"] == "standard"
            assert sent["q"] == "Google France"
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_caller_filters_override_defaults(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(_mock_response(200, SEARCH_RESPONSE_GOOGLE))

            await search_company(
                "Google France",
                filters=CompanySearchParams(precision="exacte", postal_code="75009"),
                http_client=client,
            )

            sent = client.get.call_args[1]["params"]
            assert sent["precision"] == "exacte"
            assert sent["code_postal"] == "75009"
            # Defaults still applied where caller did not override.
            assert sent["par_page"] == "1"
            assert sent["entreprise_cessee"] == "false"
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_raises_on_no_results(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(_mock_response(200, {"resultats": []}))

            # « Pas au registre » est un fait sur l'ENTREPRISE, pas sur Pappers :
            # erreur distincte d'une panne de source (cf. PappersUnavailableError).
            with pytest.raises(PappersNoResultError):
                await search_company("Entreprise Inexistante", http_client=client)
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_raises_on_low_similarity(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            response = {
                "resultats": [
                    {"siren": "111111111", "nom_entreprise": "TOTALLY DIFFERENT COMPANY SARL"}
                ]
            }
            client = _async_client_returning(_mock_response(200, response))

            with pytest.raises(PappersAmbiguousMatchError) as excinfo:
                await search_company("Capgemini", http_client=client)

            assert excinfo.value.query == "Capgemini"
            assert excinfo.value.score < 0.55
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_raises_on_api_error(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(_mock_response(500, {"error": "boom"}))

            with pytest.raises(PappersUnavailableError) as excinfo:
                await search_company("Google", http_client=client)
            assert excinfo.value.status == 500
            assert excinfo.value.reason == DegradeReason.UPSTREAM_ERROR
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)


# ---------------------------------------------------------------------------
# Tests — search_company_suggestions
# ---------------------------------------------------------------------------


class TestSearchSuggestions:
    @pytest.mark.asyncio
    async def test_returns_list_of_typed_hits(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(_mock_response(200, SEARCH_RESPONSE_GOOGLE))

            hits = await search_company_suggestions("Google", limit=3, http_client=client)

            assert len(hits) == 2
            assert all(isinstance(h, CompanySearchHit) for h in hits)
            assert hits[0].siren == "443061841"
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_soft_fails_on_api_error(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(_mock_response(500, {"error": "boom"}))

            hits = await search_company_suggestions("Google", http_client=client)

            assert hits == []
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)


# ---------------------------------------------------------------------------
# Tests — get_company
# ---------------------------------------------------------------------------


class TestGetCompany:
    @pytest.mark.asyncio
    async def test_returns_typed_profile(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(
                _mock_response(200, DETAIL_RESPONSE_GOOGLE),
                _mock_response(404, {}),  # cartographie absent
            )

            profile = await get_company("443061841", http_client=client)

            assert isinstance(profile, CompanyProfile)
            assert profile.siren == "443061841"
            assert profile.legal_name == "GOOGLE FRANCE"
            assert profile.legal_form == "SAS"
            assert profile.capital == 1_000_000
            assert profile.activity_label == "6201Z - Programmation informatique"
            assert profile.revenue_latest == 600_000_000  # most recent year (2023)
            assert profile.headquarters.address_line_1 == "8 Rue de Londres"
            assert profile.headquarters.postal_code == "75009"
            assert profile.headquarters.city == "PARIS 9"
            assert profile.headquarters.is_active is True
            assert len(profile.executives) == 3
            assert profile.executives[0].last_name == "Dupont"
            assert profile.executives[0].role == "Président"
            assert profile.branch_count == 1
            assert profile.branches[0].is_headquarters is True
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_derives_c_level_from_role_regex(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(
                _mock_response(200, DETAIL_RESPONSE_GOOGLE),
                _mock_response(404, {}),
            )

            profile = await get_company("443061841", http_client=client)

            # President + Directrice Générale → 2 c_level; "Administrateur" excluded.
            c_level_roles = {e.role for e in profile.c_level}
            assert "Président" in c_level_roles
            assert "Directrice Générale" in c_level_roles
            assert "Administrateur" not in c_level_roles
            # Flag propagated on the full list too.
            non_c_level = [e for e in profile.executives if not e.is_c_level]
            assert all(e.role == "Administrateur" for e in non_c_level)
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_extracts_subsidiaries_from_cartographie(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(
                _mock_response(200, DETAIL_RESPONSE_GOOGLE),
                _mock_response(200, CARTOGRAPHIE_RESPONSE_GOOGLE),
            )

            profile = await get_company("443061841", http_client=client)

            assert profile.corporate_graph is not None
            assert len(profile.corporate_graph.companies) == 3
            # Subsidiaries = what the root actually OWNS, read off the edge
            # direction ("e3-e1" = e3 détient e1). ALPHABET HOLDINGS (987654321)
            # is GOOGLE FRANCE's PARENT — it was counted as a subsidiary, which
            # is how a TF1 dossier ended up listing BOUYGUES among its entities.
            assert len(profile.subsidiaries) == 1
            siren_values = {s.siren for s in profile.subsidiaries}
            assert siren_values == {"123456789"}
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_handles_cartographie_404(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(
                _mock_response(200, DETAIL_RESPONSE_GOOGLE),
                _mock_response(404, {}),
            )

            profile = await get_company("443061841", http_client=client)

            assert profile.corporate_graph is None
            assert profile.subsidiaries == []
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_skips_cartographie_when_disabled(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            client = _async_client_returning(_mock_response(200, DETAIL_RESPONSE_GOOGLE))

            profile = await get_company("443061841", include_graph=False, http_client=client)

            assert profile.corporate_graph is None
            assert client.get.call_count == 1
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_second_call_hits_the_global_cache_and_skips_pappers(self) -> None:
        # The Pappers profile is public + company-scoped, so a repeat (or a teammate)
        # must reuse it globally instead of re-spending a credit (Louis: cache global).
        from unittest.mock import AsyncMock, patch

        from app.services import provider_cache

        class _FakeRedis:
            def __init__(self) -> None:
                self.store: dict[str, str] = {}

            async def get(self, key: str):
                return self.store.get(key)

            async def set(self, key: str, value: str, ex: int | None = None):
                self.store[key] = value

        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            with patch.object(provider_cache, "_redis", AsyncMock(return_value=_FakeRedis())):
                client1 = _async_client_returning(_mock_response(200, DETAIL_RESPONSE_GOOGLE))
                first = await get_company("443061841", include_graph=False, http_client=client1)
                assert client1.get.call_count == 1  # live fetch, then cached

                # Same SIREN again → served from the global cache, no Pappers call.
                client2 = _async_client_returning(_mock_response(200, DETAIL_RESPONSE_GOOGLE))
                second = await get_company("443061841", include_graph=False, http_client=client2)
                assert client2.get.call_count == 0
                assert second.siren == first.siren
                assert second.legal_name == first.legal_name
                assert second.c_level == first.c_level  # derived fields round-trip
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)

    @pytest.mark.asyncio
    async def test_handles_missing_fields(self) -> None:
        os.environ["PAPPERS_API_KEY"] = "test-key"
        try:
            minimal = {"siren": "123456789", "nom_entreprise": "Minimal Corp"}
            client = _async_client_returning(
                _mock_response(200, minimal),
                _mock_response(404, {}),
            )

            profile = await get_company("123456789", http_client=client)

            assert profile.siren == "123456789"
            assert profile.legal_name == "Minimal Corp"
            assert profile.capital is None
            assert profile.revenue_latest is None
            assert profile.executives == []
            assert profile.c_level == []
            assert profile.branches == []
            assert profile.branch_count == 0
            assert profile.headquarters.city is None
            assert profile.activity_label is None
        finally:
            os.environ.pop("PAPPERS_API_KEY", None)


# ---------------------------------------------------------------------------
# Tests — CompanySearchParams serialization
# ---------------------------------------------------------------------------


class TestSearchParams:
    def test_to_query_serializes_with_french_aliases(self) -> None:
        params = CompanySearchParams(
            q="Capgemini",
            per_page=1,
            precision="exacte",
            has_ceased=False,
            postal_code="92000",
            naf_code="62.02A",
            dirigeant_role="Président",
            capital_min="1000000",
            headcount_tranche_min="42",
        )

        out = params.to_query("token-abc")

        assert out["q"] == "Capgemini"
        assert out["par_page"] == "1"
        assert out["precision"] == "exacte"
        assert out["entreprise_cessee"] == "false"
        assert out["code_postal"] == "92000"
        assert out["code_naf"] == "62.02A"
        assert out["qualite_dirigeant"] == "Président"
        assert out["capital_min"] == "1000000"
        assert out["tranche_effectif_min"] == "42"
        assert out["api_token"] == "token-abc"

    def test_to_query_drops_none_fields(self) -> None:
        params = CompanySearchParams(q="ACME", per_page=5)

        out = params.to_query("k")

        # Only the explicit fields + api_token should be present.
        assert set(out.keys()) == {"q", "par_page", "api_token"}


# ---------------------------------------------------------------------------
# Tests — missing API key
# ---------------------------------------------------------------------------


class TestMissingApiKey:
    @pytest.mark.asyncio
    async def test_raises_without_api_key(self) -> None:
        os.environ.pop("PAPPERS_API_KEY", None)

        with pytest.raises(ValueError, match="PAPPERS_API_KEY"):
            await search_company("Google")

        with pytest.raises(ValueError, match="PAPPERS_API_KEY"):
            await get_company("443061841")
