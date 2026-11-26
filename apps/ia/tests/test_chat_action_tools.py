"""Les 3 outils d'action manquants du Copilote (restitution V2 §14).

Le rapport demande que le copilote puisse « enrichir un contact, mettre à jour le
CRM, lancer une recherche ». Ces trois outils suivent EXACTEMENT le motif des
deux premiers (`prepare_message_for_contact`, `schedule_reminder_for_contact`) :
l'exécuteur ne fait que des LECTURES, résout l'appartenance et renvoie une
PROPOSITION. C'est le clic de l'utilisateur, côté interface, qui appelle
l'endpoint réel (`POST /contacts/:id/enrich`, `POST /{crm}/export`, `/discover`).

Ce que ces tests verrouillent :
  1. les trois outils sont exposés au modèle et comptés comme outils d'écriture ;
  2. leur exécution renvoie une proposition, JAMAIS un effet (la double Supabase
     fait exploser tout insert/update/upsert/delete) ;
  3. un outil qui ne peut pas s'exécuter le DIT (pas de CRM connecté, contact
     étranger, critères vides) au lieu de proposer une action fantôme ;
  4. le coût réel est annoncé dans la proposition (1 crédit d'enrichissement,
     0 pour l'export CRM et pour Découvrir).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Claire Dubois",
    "title": "DSI",
    "account_id": "22222222-2222-4222-8222-222222222222",
    "email": "claire@example.com",
    "entity": "ACME Digital",
    "linkedin_url": "https://www.linkedin.com/in/claire-dubois",
}


def _sb_that_forbids_writes() -> MagicMock:
    sb = MagicMock()

    def _explode(*_a, **_k):
        raise AssertionError("un outil de proposition ne doit JAMAIS écrire")

    table = MagicMock()
    table.insert.side_effect = _explode
    table.update.side_effect = _explode
    table.upsert.side_effect = _explode
    table.delete.side_effect = _explode
    sb.table.return_value = table
    return sb


async def _run(name: str, tool_input: dict, contact=_CONTACT, **kwargs) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
    ):
        return await execute_chat_tool(
            name, tool_input, user_id="user-1", profile_data=None, **kwargs
        )


async def _run_foreign(name: str, tool_input: dict, **kwargs) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch(
            "app.services.ownership.fetch_owned_contact",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=404, detail="Contact not found"),
        ),
    ):
        return await execute_chat_tool(
            name, tool_input, user_id="user-1", profile_data=None, **kwargs
        )


# ── 1. Registre ─────────────────────────────────────────────────────────────


def test_registry_exposes_the_three_action_tools():
    names = {t["name"] for t in CHAT_TOOLS}
    assert {"enrich_contact", "export_contact_to_crm", "find_accounts"} <= names
    # Ajout ADDITIF : les 4 outils d'origine restent exposés.
    assert {
        "compare_accounts",
        "get_account_briefing",
        "prepare_message_for_contact",
        "schedule_reminder_for_contact",
    } <= names


def test_the_three_action_tools_are_proposal_tools():
    """Comptés comme outils d'écriture : ils débouchent sur un effet, donc ils
    passent par la validation explicite de l'utilisateur."""
    assert {"enrich_contact", "export_contact_to_crm", "find_accounts"} <= WRITE_TOOL_NAMES


def test_action_tool_descriptions_announce_the_confirmation_step():
    for tool in CHAT_TOOLS:
        if tool["name"] in {"enrich_contact", "export_contact_to_crm", "find_accounts"}:
            assert "valid" in tool["description"].lower()
            assert "n'exécute" in tool["description"] or "n'écrit" in tool["description"]


# ── 2. Enrichir un contact ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_enrich_contact_returns_a_proposal_and_writes_nothing():
    out = await _run("enrich_contact", {"contact_id": _CONTACT["id"]})
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "enrich_contact"
    assert proposal["contact_id"] == _CONTACT["id"]
    assert proposal["contact_name"] == "Claire Dubois"
    # L'ancre org part de l'entité du contact — c'est ce que l'endpoint attend.
    assert proposal["organization_name"] == "ACME Digital"
    # Le seul outil qui coûte : le commercial doit le voir AVANT de cliquer.
    assert proposal["cost_credits"] == 1
    assert proposal["credit_kind"] == "enrichment"


@pytest.mark.asyncio
async def test_enrich_contact_falls_back_to_the_account_name_as_org_anchor():
    """Sans `entity` sur la fiche, on retombe sur le nom du COMPTE possédé —
    jamais sur un libellé inventé (cause racine du retour Théo P0)."""
    contact = {**_CONTACT, "entity": None}
    dossiers = [{"account_id": _CONTACT["account_id"], "company_name": "ACME SA"}]
    with patch("app.services.chat_tools._owned_account_dossiers", new_callable=AsyncMock, return_value=dossiers):
        out = await _run("enrich_contact", {"contact_id": _CONTACT["id"]}, contact=contact)
    assert out["proposal"]["organization_name"] == "ACME SA"


@pytest.mark.asyncio
async def test_enrich_contact_without_any_org_anchor_is_refused():
    """`POST /contacts/:id/enrich` exige une `organization_name` : sans ancre, le
    clic serait refusé côté API. On le DIT plutôt que d'afficher un bouton
    condamné d'avance."""
    contact = {**_CONTACT, "entity": None}
    with patch("app.services.chat_tools._owned_account_dossiers", new_callable=AsyncMock, return_value=[]):
        out = await _run("enrich_contact", {"contact_id": _CONTACT["id"]}, contact=contact)
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_enrich_contact_on_a_foreign_contact_yields_no_proposal():
    out = await _run_foreign("enrich_contact", {"contact_id": "33333333-3333-4333-8333-333333333333"})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_enrich_contact_requires_a_contact_id():
    out = await _run("enrich_contact", {})
    assert "error" in out and "proposal" not in out


# ── 3. Pousser un contact vers le CRM ───────────────────────────────────────


@pytest.mark.asyncio
async def test_export_to_crm_returns_a_proposal_naming_the_connected_crm():
    out = await _run(
        "export_contact_to_crm",
        {"contact_id": _CONTACT["id"]},
        crm_connected=True,
        crm_provider="hubspot",
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "export_contact_to_crm"
    assert proposal["provider"] == "hubspot"
    assert proposal["contact_name"] == "Claire Dubois"
    assert proposal["contact_email"] == "claire@example.com"
    assert proposal["contact_title"] == "DSI"
    assert proposal["company"] == "ACME Digital"
    assert proposal["linkedin_url"] == _CONTACT["linkedin_url"]
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_export_to_crm_says_it_when_no_crm_is_connected():
    """Aucun CRM branché ⇒ l'outil le DIT. Une proposition d'export vers un CRM
    inexistant serait une action fantôme."""
    out = await _run("export_contact_to_crm", {"contact_id": _CONTACT["id"]}, crm_connected=False)
    assert "proposal" not in out
    assert "CRM" in out["error"]


@pytest.mark.asyncio
async def test_export_to_crm_without_a_provider_name_is_refused():
    """Connecté mais provider illisible : on refuse plutôt que d'annoncer un
    export vers « votre CRM » que le clic ne saurait pas router."""
    out = await _run("export_contact_to_crm", {"contact_id": _CONTACT["id"]}, crm_connected=True, crm_provider="")
    assert "proposal" not in out and "error" in out


@pytest.mark.asyncio
async def test_export_to_crm_on_a_foreign_contact_yields_no_proposal():
    out = await _run_foreign(
        "export_contact_to_crm",
        {"contact_id": "33333333-3333-4333-8333-333333333333"},
        crm_connected=True,
        crm_provider="hubspot",
    )
    assert "error" in out and "proposal" not in out


# ── 4. Lancer une recherche Découvrir ───────────────────────────────────────


@pytest.mark.asyncio
async def test_find_accounts_returns_a_proposal_with_normalised_criteria():
    out = await _run(
        "find_accounts",
        {
            "sectors": ["finance", "IT", "licorne"],
            "department": "75",
            "headcount": "250-999",
            "signals": ["hiring", "telepathie"],
            "keywords": "migration cloud",
        },
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "find_accounts"
    # Les valeurs inconnues du rail de filtres sont écartées, pas transmises :
    # un critère que l'écran ne sait pas appliquer ne doit pas être annoncé.
    assert proposal["sectors"] == ["it", "finance"]
    assert proposal["signals"] == ["hiring"]
    assert proposal["department"] == "75"
    assert proposal["headcount"] == "250-999"
    assert proposal["keywords"] == "migration cloud"
    # Explorer est gratuit — la proposition doit le dire.
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_find_accounts_carries_the_context_mode_onto_its_proposal():
    """#2454.4 — le mode DÉCLARÉ sous le composeur (#2453) voyage jusqu'au lien
    Découvrir, pour que le passage de Laura vers Découvrir CONSERVE le mode
    que la personne a sous les yeux au moment où elle clique. Résolu SERVEUR
    (`context_mode=` de `execute_chat_tool`, jamais un champ que le modèle
    compose lui-même — `tool_input` ne le porte pas)."""
    out = await _run(
        "find_accounts",
        {"sectors": ["finance"]},
        context_mode="neutral",
    )
    assert out["proposal"]["context_mode"] == "neutral"


@pytest.mark.asyncio
async def test_find_accounts_omits_context_mode_when_the_caller_has_none():
    """Dit NON : sans mode déclaré, la proposition ne porte aucune clé
    `context_mode` — comportement byte-identique à avant #2454.4 pour tout
    appelant qui ne le connaît pas encore."""
    out = await _run("find_accounts", {"sectors": ["finance"]})
    assert "context_mode" not in out["proposal"]


@pytest.mark.asyncio
async def test_find_accounts_drops_an_unknown_headcount_range():
    out = await _run("find_accounts", {"sectors": ["health"], "headcount": "beaucoup"})
    assert "headcount" not in out["proposal"]


@pytest.mark.asyncio
async def test_find_accounts_carries_a_region_code_onto_its_proposal():
    """#3392 (reste, recette prod 30/09) — « la carte Découvrir n'a pas le
    filtre région AURA ». `84` est le code INSEE d'Auvergne-Rhône-Alpes
    (`_DISCOVER_REGIONS`, même liste que `REGISTRY_REGIONS` côté web) : une
    région seule, sans secteur ni département, doit rester un critère
    exploitable — pas un dump national."""
    out = await _run("find_accounts", {"region": ["84"]})
    assert out["status"] == "pending_confirmation"
    assert out["proposal"]["region"] == ["84"]


@pytest.mark.asyncio
async def test_find_accounts_drops_an_unknown_region_code():
    """Une valeur hors des 18 codes INSEE n'est pas transmise — même règle
    que `headcount`/`sectors` : un critère que l'écran ne sait pas appliquer
    n'est jamais annoncé comme s'il l'était."""
    out = await _run("find_accounts", {"sectors": ["health"], "region": ["Auvergne-Rhône-Alpes"]})
    assert "region" not in out["proposal"]
    assert out["proposal"]["sectors"] == ["health"]


@pytest.mark.asyncio
async def test_find_accounts_region_alone_does_not_refuse_the_search():
    """Avant ce lot, `region` n'existait dans aucune des trois portes (le
    schéma de l'outil, le calcul du critère « exploitable », la proposition
    renvoyée) : une région seule tombait dans le même refus qu'une recherche
    réellement vide."""
    out = await _run("find_accounts", {"region": ["84"]})
    assert "error" not in out


@pytest.mark.asyncio
async def test_find_accounts_refuses_an_empty_search():
    """Aucun critère exploitable ⇒ pas de proposition : « lancer Découvrir sur
    rien » n'est pas une action."""
    out = await _run("find_accounts", {"sectors": ["licorne"], "department": "   "})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_find_accounts_never_proposes_keywords_without_an_intent_signal():
    """Retour bêta #1180 — « les filtres ne s'appliquent pas ».

    Le champ « Mots-clés » de Découvrir n'est lu QUE par la source `hiring` du
    mode Signaux (`discover_signals.py`). Le copilote produisait pourtant des
    liens `/discover?...&keywords=aéronautique,+défense` SANS aucun signal : le
    critère central de la demande partait dans un champ que la recherche allait
    ignorer. On ne transmet donc plus des mots-clés orphelins — et on DIT
    pourquoi, pour que la réponse l'explique au lieu de les faire disparaître.
    """
    out = await _run(
        "find_accounts",
        {"sectors": ["industry"], "department": "31", "keywords": "aéronautique, défense"},
    )
    proposal = out["proposal"]
    assert "keywords" not in proposal
    # Le reste de la recherche tient debout — on ne refuse pas le tour.
    assert proposal["sectors"] == ["industry"]
    assert proposal["department"] == "31"
    # …et l'abandon est NOMMÉ, mots-clés compris : une disparition silencieuse
    # est exactement le défaut qu'on corrige.
    assert "aéronautique, défense" in out["keywords_not_applied"]


@pytest.mark.asyncio
async def test_find_accounts_keeps_keywords_when_a_signal_carries_them():
    """Avec un signal d'intention coché, les mots-clés mordent : on les garde,
    et rien n'est signalé comme écarté."""
    out = await _run("find_accounts", {"signals": ["hiring"], "keywords": "data"})
    assert out["proposal"]["keywords"] == "data"
    assert "keywords_not_applied" not in out


@pytest.mark.asyncio
async def test_find_accounts_refuses_a_search_made_only_of_orphan_keywords():
    """Des mots-clés seuls, sans signal, ne sont plus un critère : proposer la
    recherche quand même reviendrait à ouvrir Découvrir sur rien."""
    out = await _run("find_accounts", {"keywords": "aéronautique"})
    assert "error" in out and "proposal" not in out
    assert "signal" in out["error"].lower()


@pytest.mark.asyncio
async def test_find_accounts_never_touches_the_database():
    """Une recherche Découvrir ne lit aucun compte du portefeuille : elle prépare
    des critères. Aucun appel Supabase ne doit partir."""
    with patch("app.services.supabase_client.get_supabase") as get_sb:
        out = await execute_chat_tool(
            "find_accounts",
            {"sectors": ["it"]},
            user_id="user-1",
            profile_data=None,
        )
    assert out["status"] == "pending_confirmation"
    get_sb.assert_not_called()


# ── 5. Les propositions traversent l'orchestrateur ──────────────────────────


@pytest.mark.asyncio
async def test_orchestrator_threads_the_crm_state_to_the_tools(monkeypatch):
    """L'état CRM réel (résolu server-side par le chat-context NestJS) doit
    atteindre l'exécuteur : sans lui, `export_contact_to_crm` proposerait un
    export vers un CRM que l'utilisateur n'a pas connecté."""
    from types import SimpleNamespace

    from app.services import chat_orchestrator

    class _Throttle:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class _Stream:
        def __init__(self, response):
            self._response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            for block in getattr(self._response, "content", None) or []:
                if getattr(block, "type", None) == "text":
                    yield SimpleNamespace(type="text", text=block.text)

        async def get_final_message(self):
            return self._response

    class _Client:
        def __init__(self, responses):
            self.messages = SimpleNamespace(stream=self._stream)
            self._responses = list(responses)

        def _stream(self, **_kw):
            return _Stream(self._responses.pop(0))

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    executor = AsyncMock(return_value={"status": "pending_confirmation", "proposal": {"action": "x"}})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executor)
    responses = [
        SimpleNamespace(
            stop_reason="tool_use",
            content=[
                SimpleNamespace(
                    type="tool_use",
                    name="export_contact_to_crm",
                    input={"contact_id": _CONTACT["id"]},
                    id="toolu_1",
                )
            ],
        ),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Je peux l'envoyer.")]),
    ]
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: _Client(responses))

    _reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="user-1",
        profile_data=None,
        crm_connected=True,
        crm_provider="salesforce",
    )

    assert actions[0]["status"] == "pending_confirmation"
    assert executor.await_args.kwargs["crm_connected"] is True
    assert executor.await_args.kwargs["crm_provider"] == "salesforce"


# ── LOT (15/10) DATA-B.5 — jamais une carte à 1 crédit pour ce que la fiche a déjà ───────────────


@pytest.mark.asyncio
async def test_enrich_contact_with_email_already_known_proposes_phone_only():
    """La fiche porte l'e-mail, pas le téléphone : la carte ne demande que le téléphone (`only`)."""
    out = await _run("enrich_contact", {"contact_id": _CONTACT["id"]}, contact={**_CONTACT, "phone": None})
    proposal = out["proposal"]
    assert proposal["only"] == "phone"
    assert proposal["cost_credits"] == 1


@pytest.mark.asyncio
async def test_enrich_contact_with_phone_already_known_proposes_email_only():
    contact = {**_CONTACT, "email": None, "phone": "+33 1 23 45 67 89"}
    out = await _run("enrich_contact", {"contact_id": _CONTACT["id"]}, contact=contact)
    assert out["proposal"]["only"] == "email"


@pytest.mark.asyncio
async def test_enrich_contact_with_nothing_known_keeps_the_historic_both_coordinates_card():
    contact = {**_CONTACT, "email": None, "phone": None}
    out = await _run("enrich_contact", {"contact_id": _CONTACT["id"]}, contact=contact)
    assert "only" not in out["proposal"]
    assert out["proposal"]["cost_credits"] == 1


@pytest.mark.asyncio
async def test_enrich_contact_asked_coordinate_already_on_the_card_yields_no_proposal():
    """« Trouve l'e-mail de Claire » alors que la fiche l'a : aucune carte payante, on le DIT."""
    out = await _run("enrich_contact", {"contact_id": _CONTACT["id"], "only": "email"}, contact={**_CONTACT, "phone": None})
    assert "proposal" not in out and "error" not in out
    assert out["status"] == "nothing_to_enrich"


@pytest.mark.asyncio
async def test_enrich_contact_with_both_coordinates_known_yields_no_proposal():
    out = await _run("enrich_contact", {"contact_id": _CONTACT["id"]}, contact={**_CONTACT, "phone": "+33 1 23 45 67 89"})
    assert "proposal" not in out
    assert out["status"] == "nothing_to_enrich"


@pytest.mark.asyncio
async def test_enrich_contact_explicit_only_is_carried_when_missing():
    contact = {**_CONTACT, "email": None, "phone": None}
    out = await _run("enrich_contact", {"contact_id": _CONTACT["id"], "only": "phone"}, contact=contact)
    assert out["proposal"]["only"] == "phone"
