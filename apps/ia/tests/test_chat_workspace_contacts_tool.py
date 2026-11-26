"""#2294 — Laura retrouve un contact à travers TOUS les comptes de l'espace.

« Qui connaît-on chez X », « quel DSI a déjà échangé avec nous » : mesuré le
23/09/2026, aucun outil ne cherchait une personne au-delà du compte ouvert
(`get_account_contacts` exige UN compte, `search_dormant_network` ne rend que
les silencieux). L'outil `search_workspace_contacts` interroge le pont
`/internal/copilot/contacts/search`, qui réutilise la liste de l'écran Contacts
bornée au périmètre de l'appelant — jamais cross-espace.

Ce que ce fichier garde :
1. l'outil RÉPOND avec les comptes trouvés, tels que le pont les rend ;
2. une panne ou un pont éteint devient une ERREUR, jamais une liste vide qui se
   lirait « on ne connaît personne chez X » ;
3. sans critère, on ne liste rien (les derniers contacts créés ne sont pas une
   réponse) ;
4. un rôle hors vocabulaire n'est pas relayé ;
5. aucune adresse ne sort.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"
TOOL = "search_workspace_contacts"


async def _run(payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(TOOL, payload or {}, user_id=USER, profile_data=None)


def _tool() -> dict:
    return next(t for t in chat_tools.CHAT_TOOLS if t["name"] == TOOL)


def test_the_tool_is_declared() -> None:
    names = [t["name"] for t in chat_tools.CHAT_TOOLS]
    assert len(names) > 30, "le catalogue d'outils est vide ou tronqué"
    # Ajouté EN FIN au moment de ce lot (insérer au milieu aurait invalidé le
    # préfixe d'outils mis en cache) — mais d'autres outils rejoignent la fin
    # du catalogue après lui, lot après lot : on teste sa PRÉSENCE, jamais la
    # dernière position, qui n'est garantie qu'au jour où ce lot a été écrit.
    assert TOOL in names


# #2778 — même carte que get_account_contacts (`contact_list`, déjà câblée
# côté schéma et rendu web) : sans l'instruction dans l'outil lui-même, une
# recherche cross-comptes retombait sur une liste en prose, jamais garantie.
def test_description_instructs_the_contact_list_card() -> None:
    assert "carte `contact_list`" in _tool()["description"]


@pytest.mark.asyncio
async def test_output_can_fill_the_contact_list_card(monkeypatch: pytest.MonkeyPatch) -> None:
    """La FORME réellement rendue par le pont (`company_name`/`full_name`/`title`) valide le contrat."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {
            "total": 1,
            "truncated": False,
            "contacts": [
                {
                    "contact_id": "c-1",
                    "account_id": "a-1",
                    "company_name": "Acme",
                    "full_name": "Claire Martin",
                    "title": "DSI",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"query": "DSI"})
    contact = result["contacts"][0]
    card = {
        "type": "contact_list",
        "items": [{"name": contact["full_name"], "role": contact["title"], "company": contact["company_name"]}],
    }
    assert validate_reply_block(card) is not None


def test_the_description_says_whole_workspace_and_forbids_inventing() -> None:
    description = _tool()["description"]
    assert "TOUS les comptes" in description
    assert "prepare_message_for_contact" in description
    assert "n'invente" in description
    # Le canal, jamais l'éditeur (GA-69 côté API) : aucun nom de fournisseur.
    assert "LinkedIn" not in description


def test_a_request_without_any_criterion_asks_for_clarification_first() -> None:
    """#3854 (recette prod 08/10, 2e passe) — « Trouve-moi des contacts », sans
    AUCUN critère, rendait un résultat direct au lieu d'une clarification (volet 1
    non déclenché). L'outil doit maintenant dire explicitement de ne jamais
    s'appeler tous filtres vides, et de demander UNE précision d'abord — même
    règle que `find_accounts` juste avant une redirection."""
    description = _tool()["description"]
    assert "ask_clarification" in description
    assert "tous filtres vides" in description
    # Et le chemin inverse — un critère déjà donné n'a pas besoin de la question.
    assert "n'a pas besoin de cette question" in description
    assert "search_workspace_contacts" in chat_tools.ASK_CLARIFICATION_TOOL["description"]


@pytest.mark.asyncio
async def test_without_any_criterion_nothing_is_listed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    called = False

    async def search(*_a: object, **_k: object) -> dict:
        nonlocal called
        called = True
        return {"contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({})
    assert "error" in result
    assert called is False


# #2852.6-53 — l'enveloppe canonique de résultat d'outil (#2282 « TOOL RESULT
# ENVELOPE », routé HORS LOT vers #2852 le 24-25/09, jamais trié jusqu'ici) :
# un statut NOMMÉ, un code d'erreur stable, un prochain geste — jamais plus un
# texte français comme seul signal.
@pytest.mark.asyncio
async def test_missing_criteria_names_invalid_input_with_a_next_step(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await _run({})
    assert result["status"] == "invalid_input"
    assert result["error_code"] == "missing_search_criteria"
    assert result["suggested_next_step"]


@pytest.mark.asyncio
async def test_bridge_off_names_not_covered_never_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un pont éteint n'est PAS une recherche vide : `not_covered`, jamais
    `empty` — le NO-GO explicite de #2282 (les deux ne se confondent jamais)."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"company": "Acme"})
    assert result["status"] == "not_covered"
    assert result["error_code"] == "bridge_not_configured"


@pytest.mark.asyncio
async def test_bridge_failure_names_provider_error_never_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"query": "DSI"})
    assert result["status"] == "provider_error"
    assert result["error_code"] == "bridge_unavailable"


@pytest.mark.asyncio
async def test_a_real_empty_search_names_empty_with_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"company": "Acme"})
    assert result["status"] == "empty"
    assert result["sources_consulted"] == ["bellum_workspace"]
    assert result["sources_succeeded"] == ["bellum_workspace"]
    assert "error" not in result


@pytest.mark.asyncio
async def test_a_truncated_search_names_partial_with_its_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {
            "total": 57,
            "truncated": True,
            "contacts": [
                {"contact_id": "c-1", "account_id": "a-1", "company_name": "Acme", "full_name": "A", "title": "T"}
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"company": "Acme"})
    assert result["status"] == "partial"
    assert result["partial_reason"]
    assert result["total_found"] == 57
    assert result["returned_count"] == 1


@pytest.mark.asyncio
async def test_a_complete_search_names_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {
            "total": 1,
            "truncated": False,
            "contacts": [
                {"contact_id": "c-1", "account_id": "a-1", "company_name": "Acme", "full_name": "A", "title": "T"}
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"company": "Acme"})
    assert result["status"] == "success"
    assert "partial_reason" not in result


# #213.2/#213.4 (#3207, épopée #3228) — troisième outil câblé, après
# search_market_memory et get_account_contacts : la dédup à l'écriture
# (`contactIdentityKeys`) est déjà PROUVÉE PAR COMPTE (contacts.service.ts:
# bulkInsert, `existing = repo.find({ account_id })`) — jamais entre deux
# comptes distincts, ce que le caveat de cette recherche cross-comptes doit
# nommer plutôt que taire.
@pytest.mark.asyncio
async def test_carries_a_count_contract_deduplicated_per_account_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": 3, "truncated": False, "contacts": [{"contact_id": "c-1"}]}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"query": "DSI"})

    contract = result["count_contract"]
    assert contract["object_type"] == "contact"
    assert contract["scope"] == "espace"
    assert contract["current_or_historical"] == "current"
    assert contract["raw_count"] == 3
    assert contract["deduplicated_count"] == 3
    assert any("compte" in caveat.lower() for caveat in contract["caveats"])
    # PAS de résolution inter-comptes : #213.5, hors de ce lot — « non
    # mesuré » n'est jamais 0.
    assert contract["resolved_count"] is None


@pytest.mark.asyncio
async def test_no_count_contract_when_the_total_is_unmeasured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un `total` illisible reste `None` : pas de count_contract bâti sur une
    valeur non mesurée (même règle que get_account_contacts)."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": None, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"query": "DSI"})
    assert "count_contract" not in result


# #2852.12 (lot V22, suite) — la portée EFFECTIVEMENT appliquée, jamais un
# résumé : explicitement notée « à faire » sur ces trois outils au lot
# précédent.
@pytest.mark.asyncio
async def test_names_the_effective_scope_actually_applied(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"company": "Acme", "role": "technical", "sector": "Industrie"})
    assert result["scope"] == {"company": "Acme", "role": "technical", "sector": "Industrie"}


@pytest.mark.asyncio
async def test_sector_alone_is_a_real_criterion(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2294.2 — un secteur (ou groupe-filiale, ou fraîcheur) SEUL est un
    critère aussi légitime que `company` : sans lui dans la liste, la garde
    "sans critère" ci-dessus rejetait à tort une recherche pourtant bornée."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    called = False

    async def search(*_a: object, **_k: object) -> dict:
        nonlocal called
        called = True
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"sector": "SSII"})
    assert "error" not in result
    assert called is True


@pytest.mark.asyncio
async def test_bridge_off_is_said_never_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"company": "Acme"})
    assert "error" in result
    assert "contacts" not in result


@pytest.mark.asyncio
async def test_bridge_failure_is_an_error_never_nobody(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"query": "DSI"})
    assert "error" in result
    assert "contacts" not in result


@pytest.mark.asyncio
async def test_relays_the_criteria_and_the_accounts_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def search(user_id: str, **kwargs: object) -> dict:
        seen["user_id"] = user_id
        seen.update(kwargs)
        return {
            "total": 3,
            "truncated": True,
            "contacts": [
                {
                    "contact_id": "c-1",
                    "account_id": "a-1",
                    "company_name": "Acme",
                    "full_name": "Claire Martin",
                    "title": "DSI",
                    "decision_role": "technical",
                    "relationship_status": "replied",
                    "has_email": True,
                    "has_network_profile": False,
                },
                {
                    "contact_id": "c-2",
                    "account_id": "a-2",
                    "company_name": "Globex",
                    "full_name": "Marc Durand",
                    "title": "DSI adjoint",
                    "decision_role": "technical",
                    "relationship_status": "meeting",
                    "has_email": False,
                    "has_network_profile": True,
                },
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"query": " DSI ", "role": "technical", "limit": 99})
    assert seen == {
        "user_id": USER,
        "query": "DSI",
        "company": None,
        "role": "technical",
        "limit": 25,
        "sector": None,
        "group_role": None,
        "contacts_fresh_within_months": None,
        "location": None,
    }
    assert [c["company_name"] for c in result["contacts"]] == ["Acme", "Globex"]
    assert result["total"] == 3
    assert result["truncated"] is True
    assert "@" not in str(result)


@pytest.mark.asyncio
async def test_relays_account_filters_sector_group_role_freshness(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2294.2 — les 3 filtres de compte, relayés tels quels jusqu'au pont."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def search(user_id: str, **kwargs: object) -> dict:
        seen["user_id"] = user_id
        seen.update(kwargs)
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    await _run({"company": "Acme", "sector": "SSII", "group_role": "filiale", "contacts_fresh_within_months": 6})
    assert seen["sector"] == "SSII"
    assert seen["group_role"] == "filiale"
    assert seen["contacts_fresh_within_months"] == 6


@pytest.mark.asyncio
async def test_location_alone_is_a_real_criterion(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2367 (LAU-FINAL-035, entrée « territoire ») — un territoire SEUL est
    un critère aussi légitime que `sector` : sans lui dans la liste, la garde
    "sans critère" rejetait à tort une recherche pourtant bornée."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    called = False

    async def search(*_a: object, **_k: object) -> dict:
        nonlocal called
        called = True
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"location": "Toulouse"})
    assert "error" not in result
    assert called is True


@pytest.mark.asyncio
async def test_relays_location_territoire(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def search(user_id: str, **kwargs: object) -> dict:
        seen.update(kwargs)
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    await _run({"company": "Acme", "location": " Toulouse "})
    assert seen["location"] == "Toulouse"


@pytest.mark.asyncio
async def test_an_unknown_group_role_is_not_relayed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Deux valeurs fermées (`groupe`/`filiale`) — comme `role`, un texte hors
    vocabulaire n'est pas relayé plutôt que de faire échouer tout le tour."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def search(user_id: str, **kwargs: object) -> dict:
        seen.update(kwargs)
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    await _run({"company": "Acme", "group_role": "conglomerate"})
    assert seen["group_role"] is None


@pytest.mark.asyncio
async def test_an_unknown_role_is_not_relayed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def search(user_id: str, **kwargs: object) -> dict:
        seen.update(kwargs)
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    result = await _run({"company": "Acme", "role": "boss"})
    assert seen["role"] is None
    # Une absence ne fait AUCUNE ligne : liste vide, total 0 — jamais un contact deviné.
    # `total=0` est une valeur MESURÉE (zéro résultat réel), distincte de
    # `None` (non mesuré) : un count_contract est donc bâti (#213.2/#213.4).
    # #3343 — le zéro porte la consigne de second passage (testée à part).
    assert result.pop("second_pass_directive")["criterion"] == "company"
    # #4057 — le zéro sur une entreprise porte aussi la carte de recherche de personnes (testée à part).
    assert "propose_people_search" in result.pop("people_search_directive")
    assert result == {
        "contacts": [],
        "total": 0,
        "truncated": False,
        "status": "empty",
        "result_type": "contact_list",
        "total_found": 0,
        "returned_count": 0,
        "presented_count": 0,
        "sources_consulted": ["bellum_workspace"],
        "sources_succeeded": ["bellum_workspace"],
        "scope": {"company": "Acme"},
        "count_contract": {
            "metric_name": "contacts_de_l_espace",
            "object_type": "contact",
            "unique_key": "workspace_contacts:company=Acme",
            "scope": "espace",
            "entity_scope": "company=Acme",
            "period": None,
            "current_or_historical": "current",
            "source_layers": ["bellum_workspace"],
            "raw_count": 0,
            "deduplicated_count": 0,
            "resolved_count": None,
            "confidence": None,
            "coverage": None,
            "suppression_threshold": None,
            "caveats": [
                "Déjà dédupliqué par identité résolue (nom, e-mail, profil) à l'écriture, mais "
                "SEULEMENT DANS chaque compte — une même personne visible sur deux comptes "
                "distincts (deux clients, ou un groupe et sa filiale) compte une fois par compte, "
                "jamais fusionnée entre eux."
            ],
        },
    }


@pytest.mark.asyncio
async def test_bridge_posts_to_the_search_capability(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    async def post(path: str, payload: dict[str, object], **_k: object) -> dict:
        seen["path"] = path
        seen["payload"] = payload
        return {"contacts": []}

    monkeypatch.setattr(bellum_api, "_post", post)
    await bellum_api.workspace_contacts(USER, query="DSI", company=None, role=None, limit=10)
    assert seen["path"] == "/internal/copilot/contacts/search"
    # Aucun champ `None` n'est envoyé : le DTO côté API est `.strict()`.
    assert seen["payload"] == {"userId": USER, "query": "DSI", "limit": 10}


@pytest.mark.asyncio
async def test_bridge_posts_the_account_filters_camel_cased(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2294.2 — sector/groupRole/contactsFreshWithinMonths, dans la forme
    CAMEL CASE attendue par `CopilotContactsSearchDto` (comme `query`/`company`)."""
    seen: dict[str, object] = {}

    async def post(path: str, payload: dict[str, object], **_k: object) -> dict:
        seen["payload"] = payload
        return {"contacts": []}

    monkeypatch.setattr(bellum_api, "_post", post)
    await bellum_api.workspace_contacts(
        USER,
        query="DSI",
        company=None,
        role=None,
        limit=10,
        sector="SSII",
        group_role="filiale",
        contacts_fresh_within_months=6,
    )
    assert seen["payload"] == {
        "userId": USER,
        "query": "DSI",
        "limit": 10,
        "sector": "SSII",
        "groupRole": "filiale",
        "contactsFreshWithinMonths": 6,
    }


@pytest.mark.asyncio
async def test_bridge_posts_location_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2367 (territoire) — `location` est déjà le nom attendu côté API
    (`CopilotContactsSearchDto.location`) : aucune traduction, contrairement à
    `group_role` → `groupRole`."""
    seen: dict[str, object] = {}

    async def post(path: str, payload: dict[str, object], **_k: object) -> dict:
        seen["payload"] = payload
        return {"contacts": []}

    monkeypatch.setattr(bellum_api, "_post", post)
    await bellum_api.workspace_contacts(USER, query=None, company=None, role=None, limit=10, location="Toulouse")
    assert seen["payload"] == {"userId": USER, "limit": 10, "location": "Toulouse"}


# #4287.11 — « relance les 2 derniers contacts » : aucun outil ne triait les contacts par dernière interaction
# datée ; Laura répondait « je ne peux pas identifier les deux plus récents ». `recent_first` est un critère à lui seul.
@pytest.mark.asyncio
async def test_recent_first_is_a_criterion_on_its_own_and_is_relayed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict = {}

    async def search(*_a: object, **kwargs: object) -> dict:
        seen.update(kwargs)
        return {
            "total": 2,
            "truncated": False,
            "contacts": [
                {"contact_id": "c-9", "account_id": "a-1", "company_name": "Acme", "full_name": "Claire Martin",
                 "last_action_at": "2026-10-18T09:00:00.000Z"},
                {"contact_id": "c-8", "account_id": "a-2", "company_name": "Beta", "full_name": "Paul Durand",
                 "last_action_at": "2026-10-12T09:00:00.000Z"},
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    out = await _run({"recent_first": True, "limit": 2})
    assert "error" not in out
    assert seen.get("recent_first") is True
    assert [c["contact_id"] for c in out["contacts"]] == ["c-9", "c-8"]
    assert out["scope"]["recent_first"] is True if "scope" in out else True


@pytest.mark.asyncio
async def test_recent_first_empty_says_no_dated_interaction(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(*_a: object, **_k: object) -> dict:
        return {"total": 0, "truncated": False, "contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    out = await _run({"recent_first": True, "limit": 2})
    assert "error" not in out
    # Un vide NOMMÉ : aucune interaction datée, jamais un vide muet ni des contacts non datés.
    assert "interaction" in str(out.get("recent_empty_directive", "")).lower()


def test_recent_first_is_in_the_schema() -> None:
    assert "recent_first" in _tool()["input_schema"]["properties"]
