"""INSEE Sirene client — multi-entity disambiguation + NAF-62 IT detection.

All HTTP is mocked; no live INSEE calls. Without a key the client is a no-op.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import insee_sirene
from app.services.insee_sirene import (
    InseeUniteLegale,
    _normalize,
    closed_establishments,
    denomination_history,
    enrich_entities_naf,
    find_it_entities,
    former_denominations,
    group_it_entities,
    is_it_naf,
    legal_category_by_siren,
    naf_by_sirens,
    search_unites_legales,
    sites_for_siren,
    to_entity_dict,
    unite_legale_by_siren,
    unites_legales_by_sirens,
)


def _resp(json_data: dict, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://api.insee.fr/x"))


def _client(*responses: httpx.Response) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=list(responses) if len(responses) > 1 else None)
    if len(responses) == 1:
        client.get = AsyncMock(return_value=responses[0])
    return client


# Sirene-shaped payload: a confederation name returning several unités légales,
# one of them the IT arm (NAF 6201Z).
_CREDIT_MUTUEL_PAYLOAD = {
    "unitesLegales": [
        {
            "siren": "775577018",
            "trancheEffectifsUniteLegale": "52",
            "periodesUniteLegale": [
                {"denominationUniteLegale": "CREDIT MUTUEL ARKEA", "activitePrincipaleUniteLegale": "6419Z", "etatAdministratifUniteLegale": "A"}
            ],
        },
        {
            "siren": "312730431",
            "trancheEffectifsUniteLegale": "53",
            "periodesUniteLegale": [
                {"denominationUniteLegale": "EURO-INFORMATION", "activitePrincipaleUniteLegale": "6201Z", "etatAdministratifUniteLegale": "A"}
            ],
        },
        {
            "siren": "999999999",
            "periodesUniteLegale": [
                {"denominationUniteLegale": "EX BANQUE FERMEE", "activitePrincipaleUniteLegale": "6202A", "etatAdministratifUniteLegale": "C"}
            ],
        },
    ]
}


@pytest.mark.parametrize("code", ["6201Z", "6202A", "62.02B", "6209Z", "6311Z", "62 03 Z"])
def test_it_naf_codes(code: str) -> None:
    assert is_it_naf(code)


@pytest.mark.parametrize("code", ["6419Z", "6512Z", "4711D", "", None, "6312Z"])
def test_non_it_naf_codes(code: str | None) -> None:
    assert not is_it_naf(code)


@pytest.mark.asyncio
async def test_search_returns_empty_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INSEE_API_KEY", raising=False)
    # No client touched at all when there's no key.
    assert await search_unites_legales("Crédit Mutuel") == []


@pytest.mark.asyncio
async def test_search_parses_unites(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_CREDIT_MUTUEL_PAYLOAD))
    out = await search_unites_legales("Crédit Mutuel", client=client)
    assert {u.siren for u in out} == {"775577018", "312730431", "999999999"}
    euro = next(u for u in out if u.siren == "312730431")
    assert euro.denomination == "EURO-INFORMATION"
    assert euro.naf_code == "6201Z"
    assert euro.naf_is_it is True
    assert euro.is_active is True
    # The closed entity is parsed but flagged inactive.
    assert next(u for u in out if u.siren == "999999999").is_active is False


@pytest.mark.asyncio
async def test_find_it_entities_filters_naf_and_active(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_CREDIT_MUTUEL_PAYLOAD))
    it = await find_it_entities("Crédit Mutuel", client=client)
    # Only the active IT arm — Arkéa (NAF 6419Z bank) and the closed one excluded.
    assert [u.siren for u in it] == ["312730431"]
    assert it[0].denomination == "EURO-INFORMATION"


@pytest.mark.asyncio
async def test_search_404_is_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp({}, status=404))
    assert await search_unites_legales("Inconnu SARL", client=client) == []


@pytest.mark.asyncio
async def test_search_swallows_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    # A registry hiccup must degrade to empty, never raise into research.
    assert await search_unites_legales("X", client=client) == []


@pytest.mark.asyncio
async def test_naf_by_sirens_maps_codes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_CREDIT_MUTUEL_PAYLOAD))
    out = await naf_by_sirens(["775577018", "312730431"], client=client)
    assert out["312730431"] == "6201Z"  # Euro-Information (IT)
    assert out["775577018"] == "6419Z"  # Arkéa (bank)


@pytest.mark.asyncio
async def test_naf_by_sirens_empty_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INSEE_API_KEY", raising=False)
    assert await naf_by_sirens(["775577018"]) == {}


# ── #2284.17 — catégorie juridique INSEE (client final) ──────────────────────

_COMMUNE_PAYLOAD = {
    "unitesLegales": [
        {
            "siren": "217500016",
            "periodesUniteLegale": [
                {
                    "denominationUniteLegale": "COMMUNE DE PARIS",
                    "activitePrincipaleUniteLegale": "8411Z",
                    "etatAdministratifUniteLegale": "A",
                    "categorieJuridiqueUniteLegale": "7210",
                }
            ],
        }
    ]
}


@pytest.mark.asyncio
async def test_unites_legales_by_sirens_carries_legal_category(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_COMMUNE_PAYLOAD))
    out = await unites_legales_by_sirens(["217500016"], client=client)
    assert out["217500016"].legal_category == "7210"


@pytest.mark.asyncio
async def test_legal_category_by_siren_returns_the_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_COMMUNE_PAYLOAD))
    assert await legal_category_by_siren("217500016", client=client) == "7210"


@pytest.mark.asyncio
async def test_legal_category_by_siren_none_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INSEE_API_KEY", raising=False)
    assert await legal_category_by_siren("217500016") is None


@pytest.mark.asyncio
async def test_legal_category_by_siren_none_without_siren(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    assert await legal_category_by_siren(None) is None
    assert await legal_category_by_siren("") is None


@pytest.mark.asyncio
async def test_legal_category_by_siren_unknown_siren_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp({}, status=404))
    assert await legal_category_by_siren("999999999", client=client) is None


# ── #2284.33/.58 — dénominations antérieures (registre légal, jamais une
# correction CRM) ─────────────────────────────────────────────────────────

_RENAMED_PAYLOAD = {
    "unitesLegales": [
        {
            "siren": "552100554",
            "periodesUniteLegale": [
                {
                    "denominationUniteLegale": "AIR FRANCE-KLM",
                    "activitePrincipaleUniteLegale": "5110Z",
                    "etatAdministratifUniteLegale": "A",
                    "categorieJuridiqueUniteLegale": "5710",
                },
                {
                    "denominationUniteLegale": "AIR FRANCE-KLM",
                    "activitePrincipaleUniteLegale": "5110Z",
                    "etatAdministratifUniteLegale": "A",
                    "categorieJuridiqueUniteLegale": "5710",
                },
                {
                    "denominationUniteLegale": "SOCIETE AIR FRANCE",
                    "activitePrincipaleUniteLegale": "5110Z",
                    "etatAdministratifUniteLegale": "A",
                    "categorieJuridiqueUniteLegale": "5710",
                },
            ],
        }
    ]
}


@pytest.mark.asyncio
async def test_unites_legales_by_sirens_carries_former_names(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_RENAMED_PAYLOAD))
    out = await unites_legales_by_sirens(["552100554"], client=client)
    unit = out["552100554"]
    assert unit.denomination == "AIR FRANCE-KLM"
    # Une seule ancienne dénomination : les deux premières périodes partagent
    # le même nom (pas de changement entre elles), la troisième diffère.
    assert unit.former_names == ("SOCIETE AIR FRANCE",)


@pytest.mark.asyncio
async def test_no_name_change_means_no_former_names(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_CREDIT_MUTUEL_PAYLOAD))
    out = await unites_legales_by_sirens(["312730431"], client=client)
    assert out["312730431"].former_names == ()


@pytest.mark.asyncio
async def test_unite_legale_by_siren_returns_the_full_unit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_RENAMED_PAYLOAD))
    unit = await unite_legale_by_siren("552100554", client=client)
    assert unit is not None
    assert unit.former_names == ("SOCIETE AIR FRANCE",)


@pytest.mark.asyncio
async def test_unite_legale_by_siren_none_without_siren(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    assert await unite_legale_by_siren(None) is None
    assert await unite_legale_by_siren("") is None


@pytest.mark.asyncio
async def test_enrich_entities_naf_flags_it_by_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_CREDIT_MUTUEL_PAYLOAD))
    entities = [
        {"name": "Crédit Mutuel Arkéa", "siren": "775577018"},
        {"name": "Euro-Information", "siren": "312730431"},
        {"name": "No-SIREN entity"},
    ]
    flagged = await enrich_entities_naf(entities, client=client)
    assert flagged == 1
    by = {e["name"]: e for e in entities}
    # The IT arm is flagged authoritatively by NAF 6201Z…
    assert by["Euro-Information"]["isItEntity"] is True
    assert by["Euro-Information"]["nafCode"] == "6201Z"
    # …the bank is stamped with its NAF but NOT flagged IT.
    assert by["Crédit Mutuel Arkéa"]["nafCode"] == "6419Z"
    assert by["Crédit Mutuel Arkéa"].get("isItEntity") in (None, False)


# #4294.7 — « secteur public » relié à une SOURCE : la catégorie juridique INSEE (7xxx) est posée sur l'entité
# avec le NAF, car un hôpital public (NAF 8610Z) n'est pas dans la division 84 mais EST une personne publique.
_PUBLIC_ENTITIES_PAYLOAD = {
    "unitesLegales": [
        {"siren": "263500025", "periodesUniteLegale": [
            {"denominationUniteLegale": "CH DE TEST", "activitePrincipaleUniteLegale": "8610Z",
             "categorieJuridiqueUniteLegale": "7364", "etatAdministratifUniteLegale": "A"}
        ]},
        {"siren": "552120222", "periodesUniteLegale": [
            {"denominationUniteLegale": "SOCIETE PRIVEE", "activitePrincipaleUniteLegale": "6201Z",
             "categorieJuridiqueUniteLegale": "5710", "etatAdministratifUniteLegale": "A"}
        ]},
        {"siren": "123456789", "periodesUniteLegale": [
            {"denominationUniteLegale": "MUETTE", "activitePrincipaleUniteLegale": "7022Z",
             "etatAdministratifUniteLegale": "A"}
        ]},
    ]
}


@pytest.mark.asyncio
async def test_enrich_entities_stamps_legal_category_when_registry_knows_it(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_PUBLIC_ENTITIES_PAYLOAD))
    entities = [
        {"name": "CH de test", "siren": "263500025"},
        {"name": "Société privée", "siren": "552120222"},
        {"name": "Muette", "siren": "123456789"},
    ]
    await enrich_entities_naf(entities, client=client)
    by = {e["name"]: e for e in entities}
    assert by["CH de test"]["legalCategory"] == "7364"
    assert by["CH de test"]["nafCode"] == "8610Z"
    assert by["Société privée"]["legalCategory"] == "5710"
    # Registre muet sur la catégorie : la clé est ABSENTE (non mesuré), jamais "" ni "0".
    assert "legalCategory" not in by["Muette"]


@pytest.mark.asyncio
async def test_enrich_no_siren_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    assert await enrich_entities_naf([{"name": "X"}]) == 0


_EURO_INFO_PAYLOAD = {
    "unitesLegales": [
        {"siren": "312730674", "periodesUniteLegale": [
            {"denominationUniteLegale": "EURO-INFORMATION", "activitePrincipaleUniteLegale": "6203Z", "etatAdministratifUniteLegale": "A"}
        ]},
        {"siren": "408172021", "periodesUniteLegale": [
            {"denominationUniteLegale": "EURO INFORMATION", "activitePrincipaleUniteLegale": "4651Z", "etatAdministratifUniteLegale": "A"}
        ]},
    ]
}


@pytest.mark.asyncio
async def test_group_seed_surfaces_credit_mutuel_it_arm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_EURO_INFO_PAYLOAD))
    ents = await group_it_entities("Crédit Mutuel", client=client)
    # Only the NAF-62 Euro-Information surfaces (the NAF-46 namesake is filtered).
    assert [e["siren"] for e in ents] == ["312730674"]
    assert ents[0]["isItEntity"] is True
    assert ents[0]["type"] == "GIE informatique"


@pytest.mark.asyncio
async def test_group_seed_matches_branch_too(monkeypatch: pytest.MonkeyPatch) -> None:
    # "Crédit Mutuel Arkéa" still matches the "credit mutuel" group key.
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_EURO_INFO_PAYLOAD))
    ents = await group_it_entities("Crédit Mutuel Arkéa", client=client)
    assert [e["siren"] for e in ents] == ["312730674"]


@pytest.mark.asyncio
async def test_group_seed_unknown_group_is_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    # Unknown group → early return, the registry is never even queried.
    assert await group_it_entities("OVHcloud") == []


_SIRET_PAYLOAD = {
    "etablissements": [
        {"siret": "X2", "etablissementSiege": False, "adresseEtablissement": {"libelleCommuneEtablissement": "LILLE", "codePostalEtablissement": "59000"}, "periodesEtablissement": [{"etatAdministratifEtablissement": "A"}]},
        {"siret": "X1", "etablissementSiege": True, "adresseEtablissement": {"libelleCommuneEtablissement": "STRASBOURG", "codePostalEtablissement": "67000"}, "trancheEffectifsEtablissement": "NN", "periodesEtablissement": [{"etatAdministratifEtablissement": "A"}]},
        {"siret": "X3", "etablissementSiege": False, "adresseEtablissement": {"libelleCommuneEtablissement": "LILLE", "codePostalEtablissement": "59001"}, "periodesEtablissement": [{"etatAdministratifEtablissement": "A"}]},
        {"siret": "X4", "etablissementSiege": False, "adresseEtablissement": {"libelleCommuneEtablissement": "PARIS"}, "periodesEtablissement": [{"etatAdministratifEtablissement": "F"}]},
    ]
}


@pytest.mark.asyncio
async def test_sites_active_siege_first_deduped(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_SIRET_PAYLOAD))
    sites = await sites_for_siren("775577018", client=client)
    cities = [s["city"] for s in sites]
    assert cities[0] == "STRASBOURG"  # siège floats to the top
    assert sites[0]["type"] == "siège" and sites[0]["importance"] == "strategique"
    assert "PARIS" not in cities  # closed (état F) excluded
    assert cities.count("LILLE") == 1  # deduped by city
    # #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : aucune source ne se nomme.
    assert all("source officielle" in s["notes"] for s in sites)


@pytest.mark.asyncio
async def test_sites_carry_postal_code_as_a_field(monkeypatch: pytest.MonkeyPatch) -> None:
    # #4326 — le code postal voyageait seulement dans `notes` : l'écran n'en
    # déduisait aucune région (« - »). Il est maintenant un champ à part.
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    sites = await sites_for_siren("775577018", client=_client(_resp(_SIRET_PAYLOAD)))
    by_city = {s["city"]: s for s in sites}
    assert by_city["STRASBOURG"]["postal_code"] == "67000"


@pytest.mark.asyncio
async def test_sites_empty_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INSEE_API_KEY", raising=False)
    assert await sites_for_siren("775577018") == []


def test_normalize_strips_accents_and_case() -> None:
    assert _normalize("Crédit  MUTUEL") == "credit mutuel"
    assert _normalize("  Éléphant ") == "elephant"


def test_to_entity_dict_flags_it() -> None:
    unite = InseeUniteLegale(
        siren="312730431",
        denomination="EURO-INFORMATION",
        naf_code="6201Z",
        naf_is_it=True,
        headcount_range="53",
        legal_category="5599",
        is_active=True,
    )
    d = to_entity_dict(unite)
    assert d["isItEntity"] is True
    assert d["type"] == "GIE informatique"
    assert d["siren"] == "312730431"
    assert d["source"] == "insee"


# ── #2995/SRC8 — registre légal historique ──────────────────────────────────

_HISTORY_PAYLOAD = {
    "uniteLegale": {
        "siren": "552049447",
        "periodesUniteLegale": [
            {
                "denominationUniteLegale": "SNCF VOYAGEURS",
                "categorieJuridiqueUniteLegale": "5599",
                "etatAdministratifUniteLegale": "A",
                "dateDebut": "2020-01-01",
                "dateFin": None,
            },
            {
                "denominationUniteLegale": "SNCF MOBILITES",
                "categorieJuridiqueUniteLegale": "5599",
                "etatAdministratifUniteLegale": "A",
                "dateDebut": "2015-01-01",
                "dateFin": "2019-12-31",
            },
        ],
    }
}


@pytest.mark.asyncio
async def test_denomination_history_empty_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INSEE_API_KEY", raising=False)
    assert await denomination_history("552049447") == []


@pytest.mark.asyncio
async def test_denomination_history_empty_on_bad_siren(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    assert await denomination_history("123") == []


@pytest.mark.asyncio
async def test_denomination_history_parses_periods(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_HISTORY_PAYLOAD))
    history = await denomination_history("552049447", client=client)
    assert [p.denomination for p in history] == ["SNCF VOYAGEURS", "SNCF MOBILITES"]
    assert history[1].date_fin == "2019-12-31"
    assert history[0].date_fin is None


@pytest.mark.asyncio
async def test_denomination_history_404_is_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp({}, status=404))
    assert await denomination_history("552049447", client=client) == []


@pytest.mark.asyncio
async def test_denomination_history_swallows_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await denomination_history("552049447", client=client) == []


def test_former_denominations_drops_current_and_legal_form_only_changes() -> None:
    history = [insee_sirene._parse_period(p) for p in _HISTORY_PAYLOAD["uniteLegale"]["periodesUniteLegale"]]
    former = former_denominations(history)
    assert [p.denomination for p in former] == ["SNCF MOBILITES"]


def test_former_denominations_empty_when_single_period() -> None:
    assert former_denominations([]) == []


@pytest.mark.asyncio
async def test_closed_establishments_filters_inactive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "test-key")
    client = _client(_resp(_SIRET_PAYLOAD))
    closed = await closed_establishments("775577018", client=client)
    assert [e.siret for e in closed] == ["X4"]
    assert closed[0].city == "PARIS"


@pytest.mark.asyncio
async def test_closed_establishments_empty_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INSEE_API_KEY", raising=False)
    assert await closed_establishments("775577018") == []


def test_auth_header_configurable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSEE_API_KEY", "abc")
    monkeypatch.delenv("INSEE_API_KEY_HEADER", raising=False)
    headers = insee_sirene._auth_headers()
    assert headers["X-INSEE-Api-Key-Integration"] == "abc"
    monkeypatch.setenv("INSEE_API_KEY_HEADER", "Authorization")
    assert "Authorization" in insee_sirene._auth_headers()
