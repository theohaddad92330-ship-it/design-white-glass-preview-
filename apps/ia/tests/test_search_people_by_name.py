"""#2727 — /discover : chercher une personne par nom et prénom, voir les
homonymes, puis l'ajouter et l'enrichir.

Mesuré au code avant ce lot : Découvrir ne cherchait que des ENTREPRISES
(`discover-contact-rows.ts:176`) ; côté IA, `search_people`/`search_people_with_status`
exigent tous les deux une ANCRE d'organisation (`company_name`) — aucune fonction
ne cherchait par nom seul. `search_people_by_name` comble ce trou en réutilisant
le tier GRATUIT de People-Search (`q_keywords`, jamais `person_titles` par
défaut) : la personne se cherche, le reveal (email/téléphone) reste un geste
séparé et payant via `enrich_person` — inchangé.
"""

import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.apollo import ApolloSearchStatus, search_people_by_name


def _mock_response(status: int, json_data: dict) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x.io"))


MARION_BEDROCK = {
    "first_name": "Marion",
    "last_name": "Sagnard",
    "title": "Responsable Recrutement",
    "organization": {"name": "Bedrock"},
    "city": "Paris",
    "country": "France",
}

MARION_HOMONYM = {
    "first_name": "Marion",
    "last_name": "Sagnard",
    "title": "Consultante RH",
    "organization": {"name": "Une Autre Société"},
    "city": "Lyon",
    "country": "France",
}


class TestSearchPeopleByName:
    @pytest.mark.asyncio
    async def test_missing_api_key_is_a_typed_status_not_an_exception(self) -> None:
        # #2727 critère — « l'écran dit explicitement pourquoi elle est
        # introuvable » : jamais un 500, jamais une exception qui remonte nue.
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("APOLLO_API_KEY", None)
            hits, status = await search_people_by_name(full_name="Marion Sagnard", http_client=mock_client)
        assert hits == []
        assert status == ApolloSearchStatus.UNCONFIGURED
        mock_client.post.assert_not_called()

    @pytest.mark.asyncio
    async def test_finds_homonyms_by_free_text_name(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(
                200, {"people": [MARION_BEDROCK, MARION_HOMONYM], "pagination": {"total_entries": 2}}
            ),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            hits, status = await search_people_by_name(full_name="Marion Sagnard", http_client=mock_client)

        assert status == ApolloSearchStatus.OK
        assert [h.organization_name for h in hits] == ["Bedrock", "Une Autre Société"]
        payload = mock_client.post.call_args.kwargs["json"]
        assert payload["q_keywords"] == "Marion Sagnard"
        assert "q_organization_name" not in payload
        # Jamais de rôle par défaut : une recherche de PERSONNE cible un nom, pas
        # la bande de titres `DEFAULT_TITLES` qu'une recherche d'organisation sans
        # ciblage applique (elle re-scoperait sur les décideurs IT et écarterait
        # Marion Sagnard, RH).
        assert "person_titles" not in payload

    @pytest.mark.asyncio
    async def test_organization_name_narrows_the_search_when_known(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, {"people": [MARION_BEDROCK], "pagination": {"total_entries": 1}}),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            await search_people_by_name(
                full_name="Marion Sagnard", organization_name="Bedrock", http_client=mock_client
            )
        payload = mock_client.post.call_args.kwargs["json"]
        assert payload["q_organization_name"] == "Bedrock"

    @pytest.mark.asyncio
    async def test_no_match_is_empty_not_an_error(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, {"people": [], "pagination": {"total_entries": 0}}),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            hits, status = await search_people_by_name(full_name="Personne Inconnue", http_client=mock_client)
        assert hits == []
        assert status == ApolloSearchStatus.EMPTY

    @pytest.mark.asyncio
    async def test_blank_name_short_circuits_without_a_network_call(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            hits, status = await search_people_by_name(full_name="   ", http_client=mock_client)
        assert hits == []
        assert status == ApolloSearchStatus.EMPTY
        mock_client.post.assert_not_called()

    @pytest.mark.asyncio
    async def test_apollo_down_is_a_distinct_status(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(return_value=_mock_response(500, {}))
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            hits, status = await search_people_by_name(full_name="Marion Sagnard", http_client=mock_client)
        assert hits == []
        assert status == ApolloSearchStatus.DOWN
