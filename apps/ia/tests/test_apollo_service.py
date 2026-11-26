import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.models.contacts import EnrichPersonRequest
from app.services.apollo import (
    ApolloPlanError,
    ApolloSearchStatus,
    ApolloUnavailableError,
    SearchOutcome,
    _build_enrich_payload,
    _extract_phone,
    _to_search_hit,
    enrich_person,
    search_people,
    search_people_with_status,
)
from app.services.apollo import (
    _to_enrichment_result as _extract_enrichment,
)
from app.services.company_filters import DegradeReason


def _make_search_response(people: list, total: int = 50) -> dict:
    return {
        "people": people,
        "pagination": {"total_entries": total, "total_pages": 2, "page": 1},
    }


def _mock_response(status: int, json_data: dict) -> httpx.Response:
    return httpx.Response(
        status, json=json_data, request=httpx.Request("POST", "https://x.io"),
    )


SAMPLE_PERSON = {
    "first_name": "Jean",
    "last_name": "Dupont",
    "title": "DSI",
    "organization": {"name": "SNCF"},
    "linkedin_url": "https://linkedin.com/in/jeandupont",
    "photo_url": "https://cdn.apollo.io/photos/jean.jpg",
    "city": "Paris",
    "country": "France",
}

SAMPLE_ENRICHED = {
    "email": "jean.dupont@sncf.fr",
    "email_status": "verified",
    "title": "DSI",
    "organization": {"name": "SNCF"},
    "linkedin_url": "https://linkedin.com/in/jeandupont",
    "photo_url": "https://cdn.apollo.io/photos/jean.jpg",
    "city": "Paris",
    "country": "France",
    "phone_numbers": [
        {"type": "direct", "sanitized_number": "+33612345678"},
        {"type": "office", "sanitized_number": "+33145000000"},
    ],
}

SAMPLE_ENRICHED_PERSONAL_EMAIL = {
    # Apollo returns the primary email empty + the revealed one in personal_emails
    "email": "",
    "email_status": "verified",
    "personal_emails": ["marie.curie@gmail.com"],
    "title": "Chercheuse",
    "organization": {"name": "CNRS"},
    "linkedin_url": "https://linkedin.com/in/marie-curie",
    "city": "Paris",
    "country": "France",
}

# A realistic, FULL Apollo People-Match `person` payload (the same shape the API
# already pays for) — used to prove we extract the maximum factual profile.
SAMPLE_ENRICHED_FULL = {
    "first_name": "Amina",
    "last_name": "Benali",
    "name": "Amina Benali",
    "title": "Chief Information Officer",
    "headline": "CIO @ Veolia | Cloud & Cybersecurity | ex-Capgemini",
    "email": "amina.benali@veolia.com",
    "email_status": "verified",
    "personal_emails": ["amina.benali@veolia.com", "amina.b@gmail.com"],
    "linkedin_url": "https://linkedin.com/in/aminabenali",
    "twitter_url": "https://twitter.com/aminabenali",
    "github_url": "https://github.com/aminabenali",
    "facebook_url": "https://facebook.com/amina.benali",
    "photo_url": "https://cdn.apollo.io/photos/amina.jpg",
    "organization": {"name": "Veolia"},
    "city": "Paris",
    "state": "Île-de-France",
    "country": "France",
    "seniority": "c_suite",
    "departments": ["information_technology", "engineering"],
    "subdepartments": ["information_technology_executive"],
    "functions": ["engineering", "information_technology"],
    "phone_numbers": [
        {"type": "mobile", "sanitized_number": "+33611223344", "status": "valid"},
        {"type": "work", "raw_number": "+33 1 45 00 00 00", "status": "no_status"},
    ],
    "employment_history": [
        {
            "organization_name": "Capgemini",
            "title": "IT Director",
            "start_date": "2015-06-01",
            "end_date": "2021-02-01",
            "current": False,
        },
        {
            "organization_name": "Veolia",
            "title": "Chief Information Officer",
            "start_date": "2021-03-01",
            "end_date": None,
            "current": True,
        },
        {
            "organization_name": "Atos",
            "title": "Consultant",
            "start_date": "2010-09-01",
            "end_date": "2015-05-01",
            "current": False,
        },
    ],
    "education": [
        {
            "school_name": "Télécom Paris",
            "degree": "Ingénieur",
            "field_of_study": "Informatique",
            "start_date": "2005-09-01",
            "end_date": "2010-06-01",
        },
        # Second entry names the school under organization_name + field under major.
        {"organization_name": "HEC Paris", "degree": "MBA", "major": "Management"},
    ],
}


# === _extract_contact ===


class TestExtractContact:
    def test_extracts_all_fields_including_country(self) -> None:
        result = _to_search_hit(SAMPLE_PERSON)
        assert result.first_name == "Jean"
        assert result.last_name == "Dupont"
        assert result.title == "DSI"
        assert result.organization_name == "SNCF"
        assert result.linkedin_url == "https://linkedin.com/in/jeandupont"
        assert result.photo_url == "https://cdn.apollo.io/photos/jean.jpg"
        assert result.city == "Paris"
        assert result.country == "France"

    def test_handles_missing_fields(self) -> None:
        result = _to_search_hit({})
        assert result.first_name == ""
        assert result.organization_name == ""
        assert result.country == ""

    def test_organization_name_fallback(self) -> None:
        result = _to_search_hit({"organization_name": "Airbus"})
        assert result.organization_name == "Airbus"


# === _extract_phone ===


class TestExtractPhone:
    def test_extracts_direct_phone_first(self) -> None:
        assert _extract_phone(SAMPLE_ENRICHED) == "+33612345678"

    def test_falls_back_to_first_number(self) -> None:
        person = {"phone_numbers": [{"type": "office", "sanitized_number": "+331"}]}
        assert _extract_phone(person) == "+331"

    def test_falls_back_to_sanitized_phone(self) -> None:
        assert _extract_phone({"sanitized_phone": "+339"}) == "+339"

    def test_returns_empty_on_no_data(self) -> None:
        assert _extract_phone({}) == ""


# === _extract_enrichment ===


class TestExtractEnrichment:
    def test_extracts_enrichment_fields(self) -> None:
        result = _extract_enrichment(SAMPLE_ENRICHED)
        assert result.email == "jean.dupont@sncf.fr"
        assert result.email_status == "verified"
        assert result.phone == "+33612345678"
        assert result.organization_name == "SNCF"
        assert result.country == "France"
        # Photo réelle — champ gratuit du même appel payé.
        assert result.photo_url == "https://cdn.apollo.io/photos/jean.jpg"

    def test_photo_absent_stays_none(self) -> None:
        result = _extract_enrichment({"email": "x@y.com", "email_status": "verified"})
        assert result.photo_url is None

    def test_empty_photo_string_normalised_to_none(self) -> None:
        result = _extract_enrichment({"email": "x@y.com", "photo_url": ""})
        assert result.photo_url is None

    def test_falls_back_to_personal_emails_when_email_empty(self) -> None:
        result = _extract_enrichment(SAMPLE_ENRICHED_PERSONAL_EMAIL)
        # Reveal-personal-emails sometimes leaves `email` blank — the
        # revealed address only shows up in `personal_emails[]`.
        assert result.email == "marie.curie@gmail.com"

    def test_unknown_email_status_normalised_to_none(self) -> None:
        result = _extract_enrichment({"email": "x@y.com", "email_status": "weird-value"})
        assert result.email == "x@y.com"
        assert result.email_status is None


# === rich profile extraction (max Apollo data) ===


class TestExtractRichProfile:
    def test_extracts_identity_links_and_taxonomy(self) -> None:
        r = _extract_enrichment(SAMPLE_ENRICHED_FULL)
        assert r.headline == "CIO @ Veolia | Cloud & Cybersecurity | ex-Capgemini"
        assert r.linkedin_url == "https://linkedin.com/in/aminabenali"
        assert r.twitter_url == "https://twitter.com/aminabenali"
        assert r.github_url == "https://github.com/aminabenali"
        assert r.facebook_url == "https://facebook.com/amina.benali"
        assert r.city == "Paris"
        assert r.state == "Île-de-France"
        assert r.country == "France"
        assert r.seniority == "c_suite"
        assert r.departments == ["information_technology", "engineering"]
        assert r.subdepartments == ["information_technology_executive"]
        assert r.functions == ["engineering", "information_technology"]

    def test_career_path_sorted_recent_first_with_dates(self) -> None:
        r = _extract_enrichment(SAMPLE_ENRICHED_FULL)
        # Current role first, then most-recent start_date — regardless of input order.
        assert [e.organization_name for e in r.employment_history] == ["Veolia", "Capgemini", "Atos"]
        assert r.employment_history[0].current is True
        assert r.employment_history[0].title == "Chief Information Officer"
        assert r.employment_history[1].start_date == "2015-06-01"
        assert r.employment_history[1].end_date == "2021-02-01"
        assert r.employment_history[1].current is False

    def test_education_read_defensively(self) -> None:
        r = _extract_enrichment(SAMPLE_ENRICHED_FULL)
        assert r.education[0].school == "Télécom Paris"
        assert r.education[0].degree == "Ingénieur"
        assert r.education[0].field_of_study == "Informatique"
        assert r.education[1].school == "HEC Paris"
        assert r.education[1].field_of_study == "Management"

    def test_phone_numbers_carry_type_and_status(self) -> None:
        r = _extract_enrichment(SAMPLE_ENRICHED_FULL)
        assert r.phone_numbers[0].number == "+33611223344"
        assert r.phone_numbers[0].type == "mobile"
        assert r.phone_numbers[0].status == "valid"
        # Falls back to raw_number when sanitized_number is absent.
        assert r.phone_numbers[1].number == "+33 1 45 00 00 00"

    def test_additional_emails_exclude_the_primary(self) -> None:
        r = _extract_enrichment(SAMPLE_ENRICHED_FULL)
        assert r.personal_emails == ["amina.b@gmail.com"]

    def test_absent_rich_fields_stay_absent_never_invented(self) -> None:
        r = _extract_enrichment({"email": "x@y.com", "email_status": "verified"})
        assert r.headline is None
        assert r.seniority is None
        assert r.state is None
        assert r.twitter_url is None
        assert r.github_url is None
        assert r.facebook_url is None
        assert r.departments == []
        assert r.subdepartments == []
        assert r.functions == []
        assert r.employment_history == []
        assert r.education == []
        assert r.personal_emails == []
        assert r.phone_numbers == []


# === search_people ===


class TestSearchPeople:
    @pytest.mark.asyncio
    async def test_raises_without_api_key(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("APOLLO_API_KEY", None)
            with pytest.raises(ValueError, match="APOLLO_API_KEY"):
                await search_people("SNCF")

    @pytest.mark.asyncio
    async def test_single_page_returns_contacts_with_country(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 3, total=3)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", http_client=mock_client)

        assert len(results) == 3
        assert results[0].country == "France"
        assert results[0].organization_name == "SNCF"
        mock_client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_captures_free_tier_availability_flags(self) -> None:
        # Apollo's free People-Search returns has_email / has_direct_phone booleans
        # (not values). We carry them so the auto-enrich spends a credit only where
        # an email exists, and the UI can badge "email dispo" before revealing.
        person = {**SAMPLE_PERSON, "has_email": True, "has_direct_phone": False}
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([person], total=1)),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", http_client=mock_client)
        assert results[0].has_email is True
        assert results[0].has_phone is False

    @pytest.mark.asyncio
    async def test_direct_phone_maybe_is_not_a_phone(self) -> None:
        # Live payload: `has_direct_phone` is a STRING — "Yes" or "Maybe: please
        # request direct dial via people/bulk_match". A plain bool() made "maybe"
        # true, so every contact looked reachable by phone (66 real / 100 at
        # Dassault Aviation) and the flag stopped telling us anything.
        maybe = {**SAMPLE_PERSON, "has_direct_phone": "Maybe: please request direct dial via people/bulk_match"}
        yes = {**SAMPLE_PERSON, "has_direct_phone": "Yes"}
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([maybe, yes], total=2)),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", http_client=mock_client)
        assert results[0].has_phone is False
        assert results[1].has_phone is True

    @pytest.mark.asyncio
    async def test_carries_the_masked_last_name(self) -> None:
        # The search tier ships no `last_name` at all — only `last_name_obfuscated`
        # ("Mo***y"). Carried verbatim so the dossier can say "Séverine M." while
        # the real surname stays behind the People-Match.
        person = {
            "id": "54a2617474686933187f271e",
            "first_name": "Severine",
            "last_name_obfuscated": "Mo***y",
            "title": "Responsable de la Communication Interne",
            "organization": {"name": "Dassault Aviation"},
            "has_email": True,
        }
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([person], total=1)),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("Dassault Aviation", http_client=mock_client)
        assert results[0].last_name == ""
        assert results[0].last_name_obfuscated == "Mo***y"
        assert results[0].id == "54a2617474686933187f271e"

    @pytest.mark.asyncio
    async def test_scope_threads_locations_and_seniorities_into_payload(self) -> None:
        # S6 re-run scope — geo + seniority narrow the Apollo query (écarte l'offshore).
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON], total=1)),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            await search_people(
                "Société Générale",
                person_titles=["RSSI"],
                locations=["France"],
                seniorities=["director", "c_suite"],
                http_client=mock_client,
            )
        payload = mock_client.post.call_args.kwargs["json"]
        assert payload["person_titles"] == ["RSSI"]
        assert payload["person_locations"] == ["France"]
        assert payload["person_seniorities"] == ["director", "c_suite"]

    @pytest.mark.asyncio
    async def test_no_scope_keeps_the_payload_wide(self) -> None:
        # Backward-compat: without scope, no geo/seniority keys are sent.
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON], total=1)),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            await search_people("SNCF", http_client=mock_client)
        payload = mock_client.post.call_args.kwargs["json"]
        assert "person_locations" not in payload
        assert "person_seniorities" not in payload

    @pytest.mark.asyncio
    async def test_no_targeting_falls_back_to_default_titles(self) -> None:
        # No titles AND no seniorities → the built-in IT decider list is sent, so a
        # bare call still scopes to deciders (backward-compat).
        from app.services.apollo import DEFAULT_TITLES

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON], total=1)),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            await search_people("SNCF", http_client=mock_client)
        payload = mock_client.post.call_args.kwargs["json"]
        assert payload["person_titles"] == DEFAULT_TITLES

    @pytest.mark.asyncio
    async def test_seniority_band_search_omits_the_title_filter(self) -> None:
        # WIDE default (no personas / no scope): a seniority-band search must send
        # `person_seniorities` and NO `person_titles`. Sending a title list here
        # would AND with the bands and collapse "hundreds of directors at SNCF"
        # back to the ~10 people holding one of a dozen exact French titles — the
        # exact root cause of the 8-10-contacts symptom.
        bands = ["c_suite", "vp", "head", "director", "manager"]
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([], total=0)),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            await search_people("SNCF", person_titles=None, seniorities=bands, http_client=mock_client)
        payload = mock_client.post.call_args.kwargs["json"]
        assert payload["person_seniorities"] == bands
        assert "person_titles" not in payload

    @pytest.mark.asyncio
    async def test_paginates_across_multiple_pages(self) -> None:
        # per_page=100, total=150 → page1 returns 100, page2 returns 50.
        page1 = _make_search_response([SAMPLE_PERSON] * 100, total=150)
        page2 = _make_search_response([SAMPLE_PERSON] * 50, total=150)

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(side_effect=[
            _mock_response(200, page1),
            _mock_response(200, page2),
        ])

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", max_pages=5, http_client=mock_client)

        assert len(results) == 150
        assert mock_client.post.call_count == 2

    @pytest.mark.asyncio
    async def test_paginates_when_total_is_top_level(self) -> None:
        # `mixed_people/api_search` ships `total_entries` at the top level and no
        # `pagination` object (the real prod shape). Pagination must still work:
        # the old code read `pagination.total_entries` → 0 → stopped after page 1
        # (100 contacts max), silently dropping everyone past the first page.
        page1 = {"people": [SAMPLE_PERSON] * 100, "total_entries": 150}
        page2 = {"people": [SAMPLE_PERSON] * 50, "total_entries": 150}

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(side_effect=[
            _mock_response(200, page1),
            _mock_response(200, page2),
        ])

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", max_pages=5, http_client=mock_client)

        assert len(results) == 150
        assert mock_client.post.call_count == 2

    @pytest.mark.asyncio
    async def test_stops_on_empty_people(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([], total=0)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", http_client=mock_client)

        assert results == []
        mock_client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_stops_on_api_error(self) -> None:
        # #2543.3 — a genuine credential failure (401/403 without the plan-block
        # marker) is a NAMED source failure, not "0 contacts at this company".
        # It must never collapse into a bare []: it now raises, so the caller's
        # existing `except ValueError` (phase2_contacts.py) surfaces it as a
        # RECOVERABLE_FAILURE/SourceHealth.DOWN envelope instead of a silent
        # empty dossier.
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(403, {"error": "forbidden"}),
        )

        with (
            patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}),
            pytest.raises(ApolloUnavailableError, match="auth_failed"),
        ):
            await search_people("SNCF", http_client=mock_client)

    @pytest.mark.asyncio
    async def test_degrades_on_non_json_200(self) -> None:
        # #2543.3 — a 200 with a non-JSON body (CDN/proxy interstitial) is a
        # source failure (DOWN), not a genuine empty result — it must raise
        # rather than let a JSONDecodeError-shaped outage read as "nobody here".
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=httpx.Response(
                200, content=b"<html>502 Bad Gateway</html>", request=httpx.Request("POST", "https://x.io")
            ),
        )

        with (
            patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}),
            pytest.raises(ApolloUnavailableError, match="down"),
        ):
            await search_people("SNCF", http_client=mock_client)

    @pytest.mark.asyncio
    async def test_uses_custom_titles(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([], total=0)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            await search_people("SNCF", person_titles=["CEO", "CFO"], http_client=mock_client)

        sent_payload = mock_client.post.call_args.kwargs["json"]
        assert sent_payload["person_titles"] == ["CEO", "CFO"]

    @pytest.mark.asyncio
    async def test_max_pages_respected(self) -> None:
        """Even if total > pages*per_page, stop at max_pages."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 100, total=500)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", max_pages=2, http_client=mock_client)

        assert len(results) == 200
        assert mock_client.post.call_count == 2

    @pytest.mark.asyncio
    async def test_sends_per_page_100(self) -> None:
        """Confirms we send the Apollo cap of 100 — not the previous 25 default."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([], total=0)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            await search_people("SNCF", http_client=mock_client)

        sent_payload = mock_client.post.call_args.kwargs["json"]
        assert sent_payload["per_page"] == 100


# === Sortie de statut sur le wrapper legacy (#2543.5a) =======================


class TestSearchPeopleOutcome:
    @pytest.mark.asyncio
    async def test_outcome_out_param_captures_status_and_total_entries(self) -> None:
        """#2543.5a — ``search_people`` garde son contrat liste (chaque
        appelant/mock existant continue de fonctionner à l'identique), mais quand
        on lui passe un ``SearchOutcome``, il le remplit avec le statut typé + la
        population annoncée que ``search_people_with_status`` a mesurés — sans
        appel Apollo supplémentaire (une seule requête part)."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 6, total=6)),
        )
        outcome = SearchOutcome()

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("ARQUUS", http_client=mock_client, outcome=outcome)

        assert len(results) == 6
        assert mock_client.post.call_count == 1
        assert outcome.status == ApolloSearchStatus.OK
        assert outcome.total_entries == 6

    @pytest.mark.asyncio
    async def test_outcome_absent_keeps_the_legacy_call_byte_identical(self) -> None:
        """Un appelant qui ne passe pas d'``outcome`` garde le comportement
        d'avant à l'octet près — rien ne change pour lui."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 2, total=2)),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", http_client=mock_client)
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_outcome_captures_plan_blocked_without_raising(self) -> None:
        """PLAN_BLOCKED ne lève jamais (repli Brave+Claude attendu derrière) —
        mais l'outcome doit quand même le nommer, jamais un OK/EMPTY deviné."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(403, {"error_code": "API_INACCESSIBLE"}),
        )
        outcome = SearchOutcome()
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("SNCF", http_client=mock_client, outcome=outcome)
        assert results == []
        assert outcome.status == ApolloSearchStatus.PLAN_BLOCKED
        assert outcome.total_entries is None


# === Précédence des ancres d'organisation (#2543.1/#2543.2/#2543.4) ==========


class TestOrgAnchorPrecedence:
    @pytest.mark.asyncio
    async def test_the_three_anchors_never_ride_the_same_request(self) -> None:
        """#2543.1 — id + domaine + nom donnés ensemble ne doivent JAMAIS être
        ANDés dans la même requête Apollo : un seul appel part, avec UNE seule
        ancre (la plus forte : l'id). Avant le correctif, les trois clés
        apparaissaient toutes dans le même payload — c'est le rouge que ce test
        aurait donné."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            # 30 personnes distinctes : au-dessus du seuil « maigre » (CEDRIC-FIX C.2), une
            # seule requête part — ce test porte sur l'EXCLUSIVITÉ de l'ancre, pas sur le repli.
            return_value=_mock_response(
                200,
                _make_search_response([{**SAMPLE_PERSON, "id": f"p{i}"} for i in range(30)], total=30),
            ),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            await search_people_with_status(
                "ARQUUS (VOLVO GROUP GOVERNMENTAL SALES, RENAULT TRUCKS DEFENSE)",
                organization_ids=["org_123"],
                organization_domains=["arquus-defense.com"],
                http_client=mock_client,
            )

        assert mock_client.post.call_count == 1
        sent_payload = mock_client.post.call_args.kwargs["json"]
        assert sent_payload.get("organization_ids") == ["org_123"]
        assert "q_organization_domains_list" not in sent_payload
        assert "q_organization_name" not in sent_payload

    @pytest.mark.asyncio
    async def test_a_sparse_id_anchor_falls_back_to_the_domain(self) -> None:
        """#2543.1/#2543.2 — l'ancre id rend 5 contacts pile (le cas ARQUUS
        mesuré le 18/09/2026, sous ``_ORG_ANCHOR_FALLBACK_MIN``) : la passe
        suivante (domaine seul) est tentée, et son résultat — meilleur — est
        gardé. Chaque requête reste mono-ancre."""
        id_response = _mock_response(200, _make_search_response([SAMPLE_PERSON] * 5, total=5))
        domain_response = _mock_response(200, _make_search_response([SAMPLE_PERSON] * 40, total=40))
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(side_effect=[id_response, domain_response])

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, status, total_entries = await search_people_with_status(
                "ARQUUS",
                organization_ids=["org_123"],
                organization_domains=["arquus-defense.com"],
                http_client=mock_client,
            )

        assert mock_client.post.call_count == 2
        first_payload = mock_client.post.call_args_list[0].kwargs["json"]
        second_payload = mock_client.post.call_args_list[1].kwargs["json"]
        assert first_payload.get("organization_ids") == ["org_123"]
        assert "q_organization_domains_list" not in first_payload
        assert second_payload.get("q_organization_domains_list") == ["arquus-defense.com"]
        assert "organization_ids" not in second_payload
        assert len(contacts) == 40
        assert status == ApolloSearchStatus.OK
        assert total_entries == 40

    @pytest.mark.asyncio
    async def test_a_thin_group_entity_unions_the_exact_anchors(self) -> None:
        """CEDRIC-FIX C.2 — SAFRAN AIRCRAFT ENGINES : l'ancre id rend 18 personnes
        (> 5, donc l'ancienne règle s'arrêtait là) alors que le domaine en connaît
        davantage. Sous le seuil « maigre » (25), l'ancre exacte suivante est
        tentée et les deux jeux FUSIONNENT (jamais le « meilleur des deux »)."""

        def people(prefix: str, n: int) -> list[dict]:
            return [{**SAMPLE_PERSON, "id": f"{prefix}{i}", "linkedin_url": ""} for i in range(n)]

        by_id = people("p", 18)
        by_domain = people("p", 10) + people("q", 20)  # 10 déjà connus + 20 nouveaux
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            side_effect=[
                _mock_response(200, _make_search_response(by_id, total=18)),
                _mock_response(200, _make_search_response(by_domain, total=30)),
            ]
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, status, _total = await search_people_with_status(
                "SAFRAN AIRCRAFT ENGINES",
                organization_ids=["org_sae"],
                organization_domains=["safran-aircraft-engines.com"],
                http_client=mock_client,
            )

        assert mock_client.post.call_count == 2
        assert len(contacts) == 38  # 18 + 20, les 10 communs comptés une fois
        assert len({c.id for c in contacts}) == 38
        assert status == ApolloSearchStatus.OK

    @pytest.mark.asyncio
    async def test_an_anchor_at_the_thin_threshold_is_sufficient(self) -> None:
        """SAIT DIRE NON — à 25 personnes l'ancre suffit : aucune requête de plus
        (le coût d'une analyse ne bouge que pour les comptes maigres)."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(
                200,
                _make_search_response(
                    [{**SAMPLE_PERSON, "id": f"p{i}"} for i in range(25)], total=25
                ),
            )
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, _status, _total = await search_people_with_status(
                "SNCF",
                organization_ids=["org_1"],
                organization_domains=["sncf.fr"],
                http_client=mock_client,
            )
        assert mock_client.post.call_count == 1
        assert len(contacts) == 25

    @pytest.mark.asyncio
    async def test_a_sufficient_id_anchor_never_tries_the_weaker_ones(self) -> None:
        """Pas de dépense supplémentaire quand l'ancre la plus forte suffit
        déjà — le repli est ORDONNÉ, pas systématique."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 50, total=50)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, status, total_entries = await search_people_with_status(
                "SNCF",
                organization_ids=["org_1"],
                organization_domains=["sncf.fr"],
                http_client=mock_client,
            )

        assert mock_client.post.call_count == 1
        assert len(contacts) == 50
        assert total_entries == 50

    @pytest.mark.asyncio
    async def test_total_entries_is_carried_not_only_logged(self) -> None:
        """#2543.4 — la population ANNONCÉE par la source est rendue, même
        quand on en a retenu moins (ici : une seule page sur 340 annoncés)."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 5, total=340)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            _contacts, _status, total_entries = await search_people_with_status(
                "SNCF", max_pages=1, http_client=mock_client,
            )

        assert total_entries == 340

    @pytest.mark.asyncio
    async def test_a_named_failure_never_becomes_an_empty_result(self) -> None:
        """#2543.3 — un statut d'échec typé (ici RATE_LIMITED) ne redevient
        jamais une simple liste vide indiscernable d'un compte sans personne :
        ``search_people_with_status`` le nomme dans son statut de retour."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(429, {"error": "rate limited"}),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, status, total_entries = await search_people_with_status(
                "SNCF", http_client=mock_client,
            )

        assert contacts == []
        assert status == ApolloSearchStatus.RATE_LIMITED
        assert total_entries is None


# === #3911.1 — homonyme d'entreprise : ancre faible ⇒ contact à vérifier =====


class TestEmployerUnverifiedFlag:
    @pytest.mark.asyncio
    async def test_name_only_anchor_flags_hits_as_employer_unverified(self) -> None:
        """Aucun id ni domaine à proposer : Apollo n'a que le nom en texte
        libre pour ancrer la recherche — flou, deux homonymes le passent tous
        les deux. Les contacts qui en reviennent doivent porter le signal."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 10, total=10)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, _status, _total = await search_people_with_status(
                "ARQUUS",
                http_client=mock_client,
            )

        assert len(contacts) == 10
        assert all(c.employer_unverified for c in contacts)

    @pytest.mark.asyncio
    async def test_an_id_anchor_never_flags_its_hits(self) -> None:
        """L'id Apollo est une ancre EXACTE — son résultat est déjà rattaché
        sans ambiguïté, jamais marqué « à vérifier »."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 10, total=10)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, _status, _total = await search_people_with_status(
                "ARQUUS",
                organization_ids=["org_123"],
                http_client=mock_client,
            )

        assert len(contacts) == 10
        assert not any(c.employer_unverified for c in contacts)

    @pytest.mark.asyncio
    async def test_a_domain_anchor_never_flags_its_hits(self) -> None:
        """Le domaine du compte est une ancre EXACTE elle aussi — même
        garantie que l'id."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, _make_search_response([SAMPLE_PERSON] * 10, total=10)),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, _status, _total = await search_people_with_status(
                "ARQUUS",
                organization_domains=["arquus-defense.com"],
                http_client=mock_client,
            )

        assert len(contacts) == 10
        assert not any(c.employer_unverified for c in contacts)

    @pytest.mark.asyncio
    async def test_falling_back_past_a_sparse_id_anchor_flags_the_weaker_result(self) -> None:
        """#2543.1/#2543.2 : l'id ne rend que 5 contacts (sous le seuil), la
        tentative suivante (domaine) en rend 40 et gagne — ancre toujours
        exacte, toujours pas de marque. Mais si la SEULE ancre connue est le
        nom, la bascule inverse doit se voir."""
        id_response = _mock_response(200, _make_search_response([SAMPLE_PERSON] * 5, total=5))
        name_response = _mock_response(200, _make_search_response([SAMPLE_PERSON] * 40, total=40))
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(side_effect=[id_response, name_response])

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            contacts, _status, _total = await search_people_with_status(
                "ARQUUS",
                organization_ids=["org_123"],
                http_client=mock_client,
            )

        assert len(contacts) == 40
        assert all(c.employer_unverified for c in contacts)


# === enrich_person ===


class TestEnrichPerson:
    @pytest.mark.asyncio
    async def test_raises_without_api_key(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("APOLLO_API_KEY", None)
            with pytest.raises(ValueError, match="APOLLO_API_KEY"):
                await enrich_person(
                    first_name="Jean", last_name="Dupont", organization_name="SNCF",
                )

    @pytest.mark.asyncio
    async def test_returns_enriched_data(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, {"person": SAMPLE_ENRICHED}),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            result = await enrich_person(
                first_name="Jean",
                last_name="Dupont",
                organization_name="SNCF",
                http_client=mock_client,
            )

        assert result.matched is True
        assert result.email == "jean.dupont@sncf.fr"
        # Phone reveal is out of scope (requires webhook) — extracted from
        # the response if present, but never asked for via reveal_phone_number.
        assert result.phone == "+33612345678"
        assert result.country == "France"

    @pytest.mark.asyncio
    async def test_returns_empty_on_no_match(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, {"person": None}),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            result = await enrich_person(
                first_name="Nobody",
                last_name="Unknown",
                organization_name="Fake Corp",
                http_client=mock_client,
            )

        assert result.matched is False
        assert result.email is None
        assert result.phone is None

    @pytest.mark.asyncio
    async def test_raises_on_api_error(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(402, {"error": "payment required"}),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            # Still a ValueError — ``ApolloUnavailableError`` subclasses it so no
            # pre-existing handler changed behaviour — but it now carries WHY.
            # A 402 is Apollo's credits running out, which the seller can act on;
            # the old flat "Apollo enrichment failed" string could not say that.
            with pytest.raises(ValueError) as exc:
                await enrich_person(
                    first_name="Jean",
                    last_name="Dupont",
                    organization_name="SNCF",
                    http_client=mock_client,
                )

        assert isinstance(exc.value, ApolloUnavailableError)
        assert exc.value.reason == DegradeReason.QUOTA_EXCEEDED
        assert exc.value.status == 402

    @pytest.mark.asyncio
    async def test_sends_name_payload_with_email_reveal(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, {"person": SAMPLE_ENRICHED}),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "key-123"}):
            await enrich_person(
                first_name="Marie",
                last_name="Curie",
                organization_name="CNRS",
                http_client=mock_client,
            )

        call = mock_client.post.call_args
        assert call.kwargs["json"] == {
            "first_name": "Marie",
            "last_name": "Curie",
            "organization_name": "CNRS",
            "reveal_personal_emails": True,
        }
        assert call.kwargs["headers"]["x-api-key"] == "key-123"

    @pytest.mark.asyncio
    async def test_sends_name_payload_without_last_name(self) -> None:
        """Mononym / unsplittable name: first_name + org is a valid match
        key. The payload omits last_name entirely rather than sending an
        empty string (which Apollo would treat as a literal filter)."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, {"person": SAMPLE_ENRICHED}),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "key-123"}):
            await enrich_person(
                first_name="Beshara",
                organization_name="Acme",
                http_client=mock_client,
            )

        sent = mock_client.post.call_args.kwargs["json"]
        assert sent == {
            "first_name": "Beshara",
            "organization_name": "Acme",
            "reveal_personal_emails": True,
        }
        assert "last_name" not in sent

    @pytest.mark.asyncio
    async def test_linkedin_url_takes_priority_over_name(self) -> None:
        """When linkedin_url is provided, it short-circuits the fuzzy
        name+org match — Apollo's most reliable lookup key."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(200, {"person": SAMPLE_ENRICHED}),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "key-123"}):
            await enrich_person(
                linkedin_url="https://linkedin.com/in/jeandupont",
                first_name="Jean",
                last_name="Dupont",
                organization_name="SNCF",
                http_client=mock_client,
            )

        sent = mock_client.post.call_args.kwargs["json"]
        assert sent == {
            "linkedin_url": "https://linkedin.com/in/jeandupont",
            "reveal_personal_emails": True,
        }
        # No name/org fallback junk in the payload — clean call.
        assert "first_name" not in sent
        assert "organization_name" not in sent

    @pytest.mark.asyncio
    async def test_raises_without_any_match_key(self) -> None:
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            with pytest.raises(ValueError, match="match key"):
                await enrich_person()

    @pytest.mark.asyncio
    async def test_partial_name_without_org_is_rejected(self) -> None:
        """A partial triplet (e.g. first_name only) is a misuse — fail
        fast rather than send a useless call to Apollo."""
        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            with pytest.raises(ValueError, match="match key"):
                await enrich_person(first_name="Jean")

    @pytest.mark.asyncio
    async def test_plan_inaccessible_raises_apollo_plan_error(self) -> None:
        """403 + API_INACCESSIBLE is a plan/key permission issue, not a
        transient backend failure — surface it distinctly so the UI can
        prompt for an upgrade instead of showing a generic 502."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(
                403,
                {
                    "error": "api/v1/people/match is not accessible with this api_key on a free plan.",
                    "error_code": "API_INACCESSIBLE",
                },
            ),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}), pytest.raises(ApolloPlanError):
            await enrich_person(
                first_name="Jean",
                last_name="Dupont",
                organization_name="SNCF",
                http_client=mock_client,
            )


class TestSearchPlanBlocked:
    @pytest.mark.asyncio
    async def test_search_returns_empty_on_plan_block(self) -> None:
        """When Apollo returns 403 API_INACCESSIBLE, search must return an
        empty list (not raise) — the contacts pipeline relies on Brave+Claude
        fallback when the master-only endpoint is unavailable."""
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(
                403,
                {
                    "error": "api/v1/mixed_people/api_search is not accessible with this api_key on a free plan.",
                    "error_code": "API_INACCESSIBLE",
                },
            ),
        )

        with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
            results = await search_people("Doctolib", http_client=mock_client)

        assert results == []


# === Apollo id → reliable enrich (search tier obfuscates last_name) ===========


class TestEnrichByApolloId:
    """Apollo's People-Search obfuscates last_name + hides email/LinkedIn on the
    search tier, but returns a stable person ``id``. Enriching BY ID is the only
    reliable key — a first_name+org match returns matched:True with an EMPTY
    record (the QONTO "Aucune personne trouvée" bug)."""

    def test_to_search_hit_captures_apollo_id(self) -> None:
        hit = _to_search_hit({"id": "54a50c547468693209291d78", "first_name": "Julien", "title": "Head of Eng"})
        assert hit.id == "54a50c547468693209291d78"
        assert hit.last_name == ""  # obfuscated → empty, id carries identity

    def test_to_search_hit_missing_id_is_empty(self) -> None:
        assert _to_search_hit({"first_name": "Julien"}).id == ""

    def test_build_payload_prefers_id_over_everything(self) -> None:
        payload = _build_enrich_payload(
            apollo_id="pid123",
            linkedin_url="https://linkedin.com/in/x",
            first_name="Julien",
            last_name="Datour",
            organization_name="Qonto",
        )
        assert payload == {"id": "pid123", "reveal_personal_emails": True}

    @pytest.mark.asyncio
    async def test_enrich_by_id_sends_id_payload(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(
            return_value=_mock_response(
                200,
                {"person": {"first_name": "Julien", "last_name": "Datour",
                            "email": "julien.datour@qonto.com", "email_status": "verified",
                            "linkedin_url": "http://linkedin.com/in/juliendatour", "title": "Head of Eng"}},
            ),
        )
        with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}):
            result = await enrich_person(apollo_id="54a50c547468693209291d78", http_client=mock_client)

        assert mock_client.post.call_args.kwargs["json"] == {
            "id": "54a50c547468693209291d78",
            "reveal_personal_emails": True,
        }
        assert result.matched is True
        assert result.last_name == "Datour"
        assert result.email == "julien.datour@qonto.com"
        assert result.linkedin_url == "http://linkedin.com/in/juliendatour"

    @pytest.mark.asyncio
    async def test_enrich_id_wins_over_name(self) -> None:
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post = AsyncMock(return_value=_mock_response(200, {"person": {"first_name": "X"}}))
        with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}):
            await enrich_person(
                apollo_id="pid", first_name="Julien", organization_name="Qonto", http_client=mock_client,
            )
        assert mock_client.post.call_args.kwargs["json"] == {"id": "pid", "reveal_personal_emails": True}

    def test_enrich_request_accepts_apollo_id_alone(self) -> None:
        req = EnrichPersonRequest(apollo_id="pid123", first_name="Julien")
        assert req.apollo_id == "pid123"

    def test_enrich_request_still_requires_a_key(self) -> None:
        with pytest.raises(ValueError, match="apollo_id OR linkedin_url"):
            EnrichPersonRequest(first_name="Julien")  # no org anchor, no id, no linkedin


# ─────────────────────────────────────────────────────────────────────────
# #2604.2 — `contact_enrich.enrich_top_deciders` appelle `enrich_person` SANS
# `http_client`, jusqu'à `CONTACTS_ENRICH_TOP_N` (15 par défaut) fois EN
# PARALLÈLE via `asyncio.gather` : avant ce correctif, `_enrich_person_uncached`
# retombait sur `httpx.AsyncClient()` construit puis refermé À CHAQUE appel —
# même défaut mesuré par #2604.1/#2604.2 (2-79ms synchrones avant le premier
# `await`), mais absent du balayage `data_sources/` du 18/09 (apollo.py est
# hors de ce dossier). Même correctif, même registre (GA-26) :
# `get_shared_client` de `app/services/data_sources/_http_pool.py`.
# ─────────────────────────────────────────────────────────────────────────


def _track_apollo_client_constructions(monkeypatch: pytest.MonkeyPatch) -> list[httpx.AsyncClient]:
    built: list[httpx.AsyncClient] = []
    original_init = httpx.AsyncClient.__init__

    def _tracking_init(self: httpx.AsyncClient, *a: object, **kw: object) -> None:
        built.append(self)
        original_init(self, *a, **kw)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", _tracking_init)
    return built


@pytest.mark.asyncio
async def test_enrich_person_reuses_one_http_client_across_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """L'appelant réel (`contact_enrich.enrich_top_deciders`) ne fournit jamais
    de `http_client` — c'est CE chemin-là (le repli) qui doit réutiliser un
    client de process plutôt que d'en construire un par contact."""
    from app.services.data_sources import _http_pool

    monkeypatch.setitem(_http_pool._clients, "apollo", None)
    built = _track_apollo_client_constructions(monkeypatch)
    monkeypatch.setattr(
        httpx.AsyncClient, "post", AsyncMock(return_value=_mock_response(200, {"person": None})),
    )

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}):
        await enrich_person(apollo_id="Mesure2604Un")
        await enrich_person(apollo_id="Mesure2604Deux")

    assert len(built) == 1, "un nouveau client HTTP a été construit à chaque appel au lieu d'être réutilisé"
