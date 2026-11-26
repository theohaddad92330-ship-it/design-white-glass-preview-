"""#2623.1 — Laura enchaîne découvrir → analyser → proposer les contacts.

Mesuré le 20/09/2026 : `start_account_analysis` lance l'analyse et
`prepare_message_for_contact` prépare un message pour un contact déjà NOMMÉ,
mais rien entre les deux ne rendait à Laura QUI approcher sur le compte
qu'elle vient d'analyser — aucun outil, pas seulement un prompt qui
« oublierait » de le proposer. `get_account_contacts` comble ce trou, en
réutilisant le MÊME classement que l'onglet Contacts d'un compte (le pont
`internal/copilot/account/contacts`, `ContactsService.rankForAccount` côté
apps/api) — aucun second calcul.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_account_contacts", tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_the_tool():
    names = {t["name"] for t in CHAT_TOOLS}
    assert "get_account_contacts" in names


# #2778 — la carte `contact_list` existe (schéma, rendu web) mais rien ne
# disait au modèle de la remplir pour get_account_contacts : il retombait sur
# une liste à puces, jamais garantie ni testée. Même défaut que celui déjà
# corrigé pour get_account_briefing (account_card).
def test_description_instructs_the_contact_list_card():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_contacts")
    assert "carte `contact_list`" in tool["description"]


@pytest.mark.asyncio
async def test_output_can_fill_the_contact_list_card(monkeypatch: pytest.MonkeyPatch) -> None:
    """La FORME réellement rendue par l'outil valide contre le contrat de la carte."""

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {
            "contacts": [
                {"contact_id": "c-1", "full_name": "Claire Dubois", "title": "DSI", "group": "decision_maker"}
            ],
            "total": 1,
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})
    contact = result["contacts"][0]
    card = {
        "type": "contact_list",
        "items": [{"name": contact["full_name"], "role": contact["title"]}],
    }
    assert validate_reply_block(card) is not None


@pytest.mark.asyncio
async def test_relays_the_contacts_the_bridge_already_ranked_and_capped(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {
            "contacts": [
                {
                    "contact_id": "c-1",
                    "full_name": "Claire Dubois",
                    "title": "DSI",
                    "group": "decision_maker",
                    "position": 1,
                    "channels": ["email"],
                }
            ],
            "total": 1,
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})
    assert result["contacts"][0]["contact_id"] == "c-1"
    assert result["contacts"][0]["full_name"] == "Claire Dubois"
    assert result["total"] == 1
    assert result["truncated"] is False


# #3219 (#190.2 pour un CONTACT) — la visibilité de contradiction déjà
# branchée côté compte (#190.1/#190.8, `account_preflight.py`) manquait pour
# un contact : le pont (`CopilotBridgeController.accountContacts`) la lit
# désormais avec le MÊME `FieldConflictService`, `entityType: 'contact'`.
def test_description_tells_laura_to_lead_with_an_open_contact_conflict():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_contacts")
    assert "conflicts" in tool["description"]
    assert "mène avec" in tool["description"]


@pytest.mark.asyncio
async def test_relays_open_conflicts_per_contact(monkeypatch: pytest.MonkeyPatch) -> None:
    conflict = {
        "field": "title",
        "entity": {"type": "contact", "id": "c-1"},
        "claims": [
            {"value": "DSI", "source": "pipeline", "at": "2026-09-01T00:00:00.000Z", "authority": 1},
            {"value": "DSI adjointe", "source": "model", "at": "2026-09-20T00:00:00.000Z", "authority": 1},
        ],
        "sourceTypes": ["pipeline", "model"],
        "conflictSince": "2026-09-20T00:00:00.000Z",
        "resolvedBy": "unresolved",
        "chosenValue": None,
    }

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {
            "contacts": [
                {
                    "contact_id": "c-1",
                    "full_name": "Claire Dubois",
                    "title": "DSI",
                    "group": "decision_maker",
                    "position": 1,
                    "channels": ["email"],
                    "conflicts": [conflict],
                }
            ],
            "total": 1,
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})
    assert result["contacts"][0]["conflicts"] == [conflict]


@pytest.mark.asyncio
async def test_a_contact_without_conflict_relays_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {
            "contacts": [
                {
                    "contact_id": "c-1",
                    "full_name": "Claire Dubois",
                    "title": "DSI",
                    "group": "decision_maker",
                    "position": 1,
                    "channels": ["email"],
                    "conflicts": [],
                }
            ],
            "total": 1,
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})
    assert result["contacts"][0]["conflicts"] == []


# #213.2/#213.4 (#3207, épopée #3228) — DÉJÀ LÀ : `total` compte des contacts
# déjà déduplipliqués par identité résolue à l'écriture (contactIdentityKeys,
# contacts.service.ts:4438/:4785, les deux SEULES portes d'écriture de la
# table) — jamais une personne comptée trois fois sur CE compte.


@pytest.mark.asyncio
async def test_carries_a_count_contract_already_deduplicated_per_account(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [{"contact_id": "c-1", "full_name": "Claire Dubois"}], "total": 1, "truncated": False}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})

    contract = result["count_contract"]
    assert contract["object_type"] == "contact"
    assert contract["scope"] == "compte"
    assert contract["current_or_historical"] == "current"
    assert contract["raw_count"] == 1
    # DÉJÀ dédupliqué à l'écriture : raw == deduplicated, jamais tu — un
    # caveat nomme pourquoi plutôt qu'un silence qui laisserait deviner.
    assert contract["deduplicated_count"] == 1
    assert any("dédupliqué" in caveat.lower() for caveat in contract["caveats"])
    # PAS de résolution inter-comptes (groupe/filiale) : #213.5, hors de ce
    # lot — « non mesuré » n'est jamais 0.
    assert contract["resolved_count"] is None


@pytest.mark.asyncio
async def test_no_count_contract_when_the_total_is_unmeasured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un `total` illisible reste `None` (règle déjà en place) : pas de
    count_contract bâti sur une valeur non mesurée."""

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [], "total": None, "truncated": False}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})

    assert result["total"] is None
    assert "count_contract" not in result


@pytest.mark.asyncio
async def test_relays_truncated_without_a_second_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [{"contact_id": f"c-{i}"} for i in range(5)], "total": 8, "truncated": True}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})
    assert len(result["contacts"]) == 5
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_still_reports_a_real_empty_list_never_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : un compte sans aucun contact éligible rend une liste vide, jamais une erreur."""

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [], "total": 0, "truncated": False}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})
    assert result["contacts"] == []
    assert "error" not in result


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_account(monkeypatch: pytest.MonkeyPatch) -> None:
    """NON : un compte étranger ou introuvable ne rend jamais une liste."""

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-x"})
    assert "error" in result
    assert "contacts" not in result


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await _run({})
    assert "error" in result


# #2791 (recette écran 28/09/2026) — « comité d'achat Roche » (Pharma) : Laura
# ne citait que des rôles génériques (`decision_role`, dix catégories fixes,
# jamais de nom de siège sectoriel). #2988... pardon, #2791/N8 (27/09) avait
# posé `sector_committee_seats` dans `get_account_preflight`, mais Laura
# appelle `get_account_contacts` pour « qui est au comité d'achat » — un outil
# DIFFÉRENT, jamais touché par ce lot. Même fonction partagée
# (`sector_committee_seats`, GA-26), câblée jusqu'ici aussi.
class TestSectorNamedSeats:
    @pytest.mark.asyncio
    async def test_names_pharma_seats_when_the_bridge_relays_the_sector(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _account_contacts(*_a: object, **_k: object) -> dict:
            return {
                "contacts": [{"contact_id": "c-1", "full_name": "Claire Dubois", "title": "DSI"}],
                "total": 1,
                "truncated": False,
                "account_sector": "Industrie pharmaceutique",
            }

        monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
        result = await _run({"account_id": "a-1"})
        assert result["sector_buying_roles"] == {
            "known": True,
            "sector": "Industrie pharmaceutique",
            "named_seats": ["Affaires réglementaires", "Assurance qualité (QA)", "Pharmacovigilance"],
        }

    @pytest.mark.asyncio
    async def test_names_no_seat_for_an_unresolved_sector_a_fact_not_an_unknown(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def _account_contacts(*_a: object, **_k: object) -> dict:
            return {"contacts": [], "total": 0, "truncated": False, "account_sector": None}

        monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
        result = await _run({"account_id": "a-1"})
        assert result["sector_buying_roles"] == {"known": True, "named_seats": []}

    @pytest.mark.asyncio
    async def test_names_no_seat_for_a_sector_without_a_known_pack(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _account_contacts(*_a: object, **_k: object) -> dict:
            return {"contacts": [], "total": 0, "truncated": False, "account_sector": "Édition logicielle"}

        monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
        result = await _run({"account_id": "a-1"})
        assert result["sector_buying_roles"] == {"known": True, "named_seats": []}


def test_description_names_the_sector_specific_seats() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_contacts")
    assert "sect" in tool["description"].lower()


# #2852.6-53 (lot V22, suite) — même enveloppe canonique que
# search_workspace_contacts/search_workspace_accounts/get_accounts_by_owner,
# câblée sur un quatrième outil réel.
class TestToolResultEnvelope:
    @pytest.mark.asyncio
    async def test_missing_account_id_names_invalid_input(self) -> None:
        result = await _run({})
        assert result["status"] == "invalid_input"
        assert result["error_code"] == "missing_account_id"
        assert result["suggested_next_step"]

    @pytest.mark.asyncio
    async def test_bridge_off_names_not_covered_never_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
        result = await _run({"account_id": "a-1"})
        assert result["status"] == "not_covered"
        assert result["error_code"] == "bridge_not_configured"

    @pytest.mark.asyncio
    async def test_bridge_failure_names_provider_error_never_empty(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _account_contacts(*_a: object, **_k: object) -> None:
            return None

        monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
        result = await _run({"account_id": "a-1"})
        assert result["status"] == "provider_error"
        assert result["error_code"] == "bridge_unavailable"

    @pytest.mark.asyncio
    async def test_foreign_or_missing_account_names_empty_never_a_distinct_permission_code(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Même décision que #2852.34 : un compte étranger ou inventé reste
        `empty` — jamais un statut distinct qui révélerait qu'il existe."""

        async def _account_contacts(*_a: object, **_k: object) -> dict:
            return {"error": "account_not_found"}

        monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
        result = await _run({"account_id": "a-x"})
        assert result["status"] == "empty"
        assert "error_code" not in result

    @pytest.mark.asyncio
    async def test_a_real_empty_list_names_empty_with_sources(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _account_contacts(*_a: object, **_k: object) -> dict:
            return {"contacts": [], "total": 0, "truncated": False}

        monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
        result = await _run({"account_id": "a-1"})
        assert result["status"] == "empty"
        assert result["sources_consulted"] == ["bellum_workspace"]
        assert result["sources_succeeded"] == ["bellum_workspace"]

    @pytest.mark.asyncio
    async def test_a_truncated_list_names_partial_with_its_reason(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _account_contacts(*_a: object, **_k: object) -> dict:
            return {"contacts": [{"contact_id": f"c-{i}"} for i in range(5)], "total": 8, "truncated": True}

        monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
        result = await _run({"account_id": "a-1"})
        assert result["status"] == "partial"
        assert result["partial_reason"]
        assert result["total_found"] == 8
        assert result["returned_count"] == 5

    @pytest.mark.asyncio
    async def test_a_complete_list_names_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _account_contacts(*_a: object, **_k: object) -> dict:
            return {"contacts": [{"contact_id": "c-1"}], "total": 1, "truncated": False}

        monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
        result = await _run({"account_id": "a-1"})
        assert result["status"] == "success"
        assert "partial_reason" not in result


# #3229 (recette prod 01/10) — « Périmètre de recherche » absent sur une
# réponse contacts : le rapport de couverture n'était construit que par
# `search_workspace_contacts`, jamais par la lecture d'UN compte.
@pytest.mark.asyncio
async def test_a_truncated_account_list_carries_a_coverage_report_with_only_detected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [{"contact_id": "c-1", "full_name": "Claire Dubois"}], "total": 37, "truncated": True}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    out = await _run({"account_id": "acc-1"})

    report = out["coverage_report"]
    assert report["detected"] == 37
    # Non mesuré : jamais 0 (GA-18/19), et aucun taux sur une lecture d'espace.
    assert report["resolved"] is None and report["estimated_coverage"] is None


@pytest.mark.asyncio
async def test_an_unreadable_total_or_empty_account_has_no_coverage_report(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [], "total": 0, "truncated": False}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    out = await _run({"account_id": "acc-1"})

    assert "coverage_report" not in out


@pytest.mark.asyncio
async def test_a_complete_account_list_never_claims_zero_classified(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [{"contact_id": "c-1", "group": "decision_maker"}], "total": 1, "truncated": False}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    report = (await _run({"account_id": "acc-1"}))["coverage_report"]

    assert report["detected"] == 1 and report["resolved"] is None and report["enriched"] is None


@pytest.mark.asyncio
async def test_3229_one_source_for_the_announced_count_and_the_cards(monkeypatch: pytest.MonkeyPatch) -> None:
    """Recette prod 01/10 : Laura annonçait 5 contacts quand 3 cartes s'affichaient.
    L'outil porte le NOMBRE À ANNONCER (= les lignes rendues) à côté du total."""

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {
            "contacts": [{"contact_id": f"c-{i}", "full_name": f"N{i}"} for i in range(3)],
            "total": 37,
            "truncated": True,
        }

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})
    assert result["presented_count"] == len(result["contacts"]) == 3
    assert result["total"] == 37


@pytest.mark.asyncio
async def test_3229_workspace_search_also_carries_the_presented_count(monkeypatch: pytest.MonkeyPatch) -> None:
    """Recette Y3 02/10 (espace entier) : « 5 contacts lus » pour 3 cartes — même source, même champ."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _workspace_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [{"contact_id": f"c-{i}", "full_name": f"N{i}"} for i in range(5)], "total": 1965}

    monkeypatch.setattr(bellum_api, "workspace_contacts", _workspace_contacts)
    result = await execute_chat_tool(
        "search_workspace_contacts", {"company": "Société Générale", "role": "DSI"}, user_id=USER, profile_data=None
    )
    assert result["presented_count"] == len(result["contacts"]) == 5


# ── #2533 / #2547 (recette prod 07/10) ──────────────────────────────────────
# UNEO : « Qui dois-je contacter à la DSI de UNEO ? » → « pas de fiche DSI
# vérifiée », alors que la fiche listait Caroline Jaouen, Directrice des SI,
# e-mail vérifié. L'outil ne rendait que les cinq premiers, sans la coordonnée.


def test_2533_schema_offers_the_function_and_the_per_company_limit():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_contacts")
    props = tool["input_schema"]["properties"]
    assert "function" in props
    assert "maximum 10" in props["limit"]["description"]


@pytest.mark.asyncio
async def test_2533_forwards_function_and_limit_to_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict = {}

    async def _account_contacts(user_id: str, account_id: str, **kwargs: object) -> dict:
        seen.update(kwargs)
        return {"contacts": [], "total": 72, "truncated": False}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    await _run({"account_id": "a-1", "function": "DSI", "limit": 25})
    assert seen == {"title_query": "DSI", "limit": 10}


@pytest.mark.asyncio
async def test_2533_uneo_like_relays_the_it_director_with_verified_email_in_clear(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {
            "contacts": [
                {
                    "contact_id": "c-38",
                    "full_name": "Caroline Jaouen",
                    "title": "Directrice des Systèmes d'information",
                    "email": "caroline.jaouen@uneo.fr",
                    "email_verified": True,
                    "phone": None,
                    "channels": ["email"],
                }
            ],
            "total": 72,
            "truncated": False,
            "title_query": "DSI",
            "matched": 1,
        }

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1", "function": "DSI"})
    contact = result["contacts"][0]
    assert contact["full_name"] == "Caroline Jaouen"
    assert contact["email"] == "caroline.jaouen@uneo.fr"
    assert contact["email_verified"] is True
    assert result["requested_function"] == "DSI"


@pytest.mark.asyncio
async def test_2533_function_absent_is_named_never_approximated(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [], "total": 72, "truncated": False, "title_query": "Directeur des achats", "matched": 0}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1", "function": "Directeur des achats"})
    assert result["contacts"] == []
    assert result["requested_function"] == "Directeur des achats"
    assert "Directeur des achats" in result["function_not_found"]


@pytest.mark.asyncio
async def test_4016_4e_estimated_email_is_relayed_with_its_badge(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4016.4e — une adresse estimée voyage vers le modèle AVEC son drapeau ; l'outil le lui dit."""

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {
            "contacts": [
                {
                    "contact_id": "c-1",
                    "full_name": "Camille Roux",
                    "email": "c.roux@acme.fr",
                    "email_verified": False,
                    "email_estimated": True,
                    "email_estimated_on": "2026-10-11",
                    "channels": ["email"],
                },
                {"contact_id": "c-2", "full_name": "Paul Durand", "email": "p.durand@acme.fr", "channels": ["email"]},
            ],
            "total": 2,
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    result = await _run({"account_id": "a-1"})
    assert result["contacts"][0]["email_estimated"] is True
    assert result["contacts"][0]["email_estimated_on"] == "2026-10-11"
    assert "email_estimated" not in result["contacts"][1]


def test_4016_4e_tool_description_names_the_estimated_flag() -> None:
    from app.services.chat_tools import GET_ACCOUNT_CONTACTS_TOOL

    description = GET_ACCOUNT_CONTACTS_TOOL["description"]
    assert "email_estimated" in description
    assert "estimée" in description
