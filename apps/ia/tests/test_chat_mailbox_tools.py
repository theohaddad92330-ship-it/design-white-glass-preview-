"""Les outils messagerie / agenda du copilote.

Ce qu'ils défendent, dans l'ordre :

1. **Un outil qui ne peut pas s'exécuter le DIT.** Sans pont configuré, la
   réponse est une erreur lisible — jamais une liste vide, qui se lirait comme
   « ta boîte est vide » et ferait conclure au modèle qu'il n'y a rien à faire.
2. **Le corps des messages ne quitte jamais la messagerie.** L'outil ne remonte
   au modèle que ce dont il a besoin pour rédiger : interlocuteur, objet,
   ancienneté du silence.
3. **Aucun de ces outils n'écrit.** `prepare_mail_draft` rend une PROPOSITION ;
   c'est le clic de l'utilisateur qui dépose le brouillon.
"""

from __future__ import annotations

import pytest

from app.eval.chat_hard_failures import HARD_FAILURE_SPECS, ChatHardFailure
from app.services import bellum_api, chat_tools

# #2899.23 (#2278.18) — ce test EST l'appelant réel de la taxonomie pour ce
# hard failure : il n'existait avant que comme vocabulaire nommé.
_PRIVATE_MESSAGE_BODY_EXPOSED = HARD_FAILURE_SPECS[ChatHardFailure.PRIVATE_MESSAGE_BODY_EXPOSED]


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


def test_bridge_is_a_strict_no_op_without_config() -> None:
    assert bellum_api.is_configured() is False


@pytest.mark.asyncio
async def test_bridge_makes_zero_network_calls_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert await bellum_api.search_mailbox("u1", intent="no_reply") is None
    assert await bellum_api.list_agenda("u1") is None
    assert await bellum_api.find_free_slots("u1") is None
    assert await bellum_api.daily_briefing("u1") is None


@pytest.mark.asyncio
async def test_tools_say_they_cannot_read_rather_than_returning_nothing() -> None:
    for name in ("search_mailbox", "list_agenda", "find_free_slots", "get_daily_briefing"):
        result = await chat_tools.execute_chat_tool(
            name, {"intent": "no_reply"}, user_id="u1", profile_data=None
        )
        assert "error" in result, name
        # Le message doit être compréhensible par un commercial, pas un code.
        assert "Réglages" in result["error"] or "messagerie" in result["error"]


@pytest.mark.asyncio
async def test_mailbox_search_never_forwards_message_bodies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_search(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "intent": "no_reply",
            "truncated": False,
            "threads": [
                {
                    "threadId": "t1",
                    "subject": "Proposition",
                    "counterpart": "jean@acme.com",
                    "daysSinceLastMessage": 12,
                    "awaitingReply": True,
                    "unread": False,
                    "hasAttachments": True,
                    # Un champ que le pont ne devrait jamais relayer au modèle.
                    "secretBody": "contenu confidentiel du message",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "search_mailbox", fake_search)
    result = await chat_tools.execute_chat_tool(
        "search_mailbox", {"intent": "no_reply"}, user_id="u1", profile_data=None
    )

    assert result["threads"][0]["counterpart"] == "jean@acme.com"
    assert result["threads"][0]["days_since_last_message"] == 12
    assert "secretBody" not in result["threads"][0], (
        f"Hard failure #2899 : {ChatHardFailure.PRIVATE_MESSAGE_BODY_EXPOSED.value} — "
        f"{_PRIVATE_MESSAGE_BODY_EXPOSED.fr}"
    )


@pytest.mark.asyncio
async def test_mailbox_search_forwards_the_already_computed_thread_compilation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#2394.7/.8/.10/.11/.12/.13 — `presentThreads` (mailbox.service.ts)
    calcule déjà le compte, l'état, la priorité et l'engagement de chaque
    fil ; le pont les rend, et l'outil ne doit plus les jeter."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_search(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "intent": "no_reply",
            "truncated": False,
            "threads": [
                {
                    "threadId": "t1",
                    "subject": "Proposition",
                    "counterpart": "jean@acme.com",
                    "daysSinceLastMessage": 12,
                    "awaitingReply": True,
                    "unread": False,
                    "hasAttachments": True,
                    "otherParticipants": ["marie@acme.com"],
                    "contactId": "contact-1",
                    "account": {"id": "acc-1", "name": "ACME", "via": "domain"},
                    "state": "awaiting_reply",
                    "priorityLevel": 4,
                    "priorityReason": "awaiting_reply_late",
                    "commercialState": "waiting_on_them",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "search_mailbox", fake_search)
    result = await chat_tools.execute_chat_tool(
        "search_mailbox", {"intent": "no_reply"}, user_id="u1", profile_data=None
    )

    thread = result["threads"][0]
    assert thread["account"] == {"id": "acc-1", "name": "ACME", "via": "domain"}
    assert thread["other_participants"] == ["marie@acme.com"]
    assert thread["contact_id"] == "contact-1"
    assert thread["state"] == "awaiting_reply"
    assert thread["priority_level"] == 4
    assert thread["commercial_state"] == "waiting_on_them"
    # #2394.13 — dérivée de la même raison stable, jamais une seconde source.
    assert thread["suggested_action"] == "relancer"
    # #2394.8 — la preuve nomme sur quoi la classification s'appuie.
    assert "state" in thread["basis"]


@pytest.mark.asyncio
async def test_mailbox_search_refuses_an_intent_the_contract_does_not_know(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await chat_tools.execute_chat_tool(
        "search_mailbox", {"intent": "licornes"}, user_id="u1", profile_data=None
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_agenda_drops_cancelled_events(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_agenda(*_args: object, **_kwargs: object) -> tuple[dict[str, object], None, None]:
        events = [
            {"id": "a", "summary": "Client", "start": "2026-08-05T09:00:00Z", "isExternal": True, "cancelled": False},
            {"id": "b", "summary": "Annulé", "start": "2026-08-05T10:00:00Z", "isExternal": True, "cancelled": True},
        ]
        return {"events": events, "unavailable": []}, None, None

    monkeypatch.setattr(bellum_api, "agenda_window", fake_agenda)
    result = await chat_tools.execute_chat_tool("list_agenda", {}, user_id="u1", profile_data=None)
    assert [event["summary"] for event in result["events"]] == ["Client"]


@pytest.mark.asyncio
async def test_free_slots_says_when_there_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_slots(*_args: object, **_kwargs: object) -> list[dict[str, object]]:
        return []

    monkeypatch.setattr(bellum_api, "find_free_slots", fake_slots)
    result = await chat_tools.execute_chat_tool("find_free_slots", {}, user_id="u1", profile_data=None)
    # Une liste vide SANS explication laisserait le modèle inventer un créneau.
    assert result["slots"] == []
    assert "note" in result


@pytest.mark.asyncio
async def test_briefing_forwards_block_states(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_briefing(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "agenda": {"state": "ready", "needsPreparation": [{}], "conflicts": []},
            "mail": {"state": "not_connected", "awaitingReply": [], "positiveReplies": []},
            "accountsToWatch": [{"companyName": "ACME"}],
            "actions": [],
        }

    monkeypatch.setattr(bellum_api, "daily_briefing", fake_briefing)
    result = await chat_tools.execute_chat_tool("get_daily_briefing", {}, user_id="u1", profile_data=None)

    # C'est CE champ qui empêche « rien à faire aujourd'hui » quand une source manque.
    assert result["mailbox_state"] == "not_connected"
    assert result["agenda_state"] == "ready"
    assert result["accounts_to_watch"] == ["ACME"]


@pytest.mark.asyncio
async def test_x63_the_declared_business_role_reaches_the_briefing_the_turn_reads(monkeypatch) -> None:
    """#3386 (recette prod 02/10) — « Que dois-je faire cette semaine ? » : le
    rôle métier déclaré (`sellerRole`) arrive jusqu'à la lecture du brief, qui
    le réordonne (c76). Sans rôle déclaré, l'appel reste byte-identique."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: list[dict[str, object]] = []

    async def fake_briefing(_user_id: str, **kwargs: object) -> dict[str, object]:
        seen.append(dict(kwargs))
        return {"agenda": {}, "mail": {}, "accountsToWatch": [], "actions": []}

    monkeypatch.setattr(bellum_api, "daily_briefing", fake_briefing)
    await chat_tools.execute_chat_tool(
        "get_daily_briefing", {}, user_id="u1", profile_data={"sellerRole": "Business Manager"}
    )
    await chat_tools.execute_chat_tool(
        "get_daily_briefing", {}, user_id="u1", profile_data={"sellerRole": "Directeur d'agence"}
    )
    await chat_tools.execute_chat_tool("get_daily_briefing", {}, user_id="u1", profile_data=None)
    assert seen == [{"business_role": "Business Manager"}, {"business_role": "Directeur d'agence"}, {}]


@pytest.mark.asyncio
async def test_x63_the_bridge_sends_the_business_role_only_when_declared(monkeypatch) -> None:
    posted: list[dict[str, object]] = []

    async def fake_post(path: str, body: dict[str, object]) -> dict[str, object]:
        posted.append({"path": path, **body})
        return {}

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    await bellum_api.daily_briefing("u1")
    await bellum_api.daily_briefing("u1", business_role="Business Manager")
    assert posted[0] == {"path": "/internal/copilot/briefing", "userId": "u1"}
    assert posted[1] == {"path": "/internal/copilot/briefing", "userId": "u1", "businessRole": "Business Manager"}


@pytest.mark.asyncio
async def test_prepare_mail_draft_only_proposes() -> None:
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "jean@acme.com", "subject": "Suite à notre échange", "body": "Bonjour Jean,"},
        user_id="u1",
        profile_data=None,
    )
    assert result["status"] == "pending_confirmation"
    assert result["proposal"]["action"] == "prepare_mail_draft"
    assert result["proposal"]["cost_credits"] == 0


@pytest.mark.asyncio
async def test_prepare_mail_draft_tells_laura_the_draft_is_prepared_never_sent() -> None:
    # #4060 (R12, 15/10) — la carte du brouillon s'affichait, et Laura écrivait dessous
    # « Je n'ai pas préparé ni envoyé de brouillon » : le message générique de l'enveloppe
    # (« Action préparée, PAS exécutée ») se lisait comme « rien de préparé ». Un brouillon
    # RENDU est dit PRÉPARÉ (jamais « pas préparé »), et jamais ENVOYÉ : le commercial envoie.
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "jean@acme.com", "subject": "Suite à notre échange", "body": "Bonjour Jean,"},
        user_id="u1",
        profile_data=None,
    )
    note = result["proposal"]["note_pour_laura"]
    assert "préparé" in note and "affiché" in note
    assert "n'a pas été envoyé" in note or "pas envoyé" in note
    assert "jamais" in note and "pas préparé" in note  # la phrase fautive est nommée pour être interdite


@pytest.mark.asyncio
async def test_prepare_mail_draft_refuses_an_incomplete_draft() -> None:
    for payload in (
        {"to": "pas-une-adresse", "subject": "x", "body": "y"},
        {"to": "jean@acme.com", "subject": "", "body": "y"},
        {"to": "jean@acme.com", "subject": "x", "body": ""},
    ):
        result = await chat_tools.execute_chat_tool(
            "prepare_mail_draft", payload, user_id="u1", profile_data=None
        )
        assert "error" in result


@pytest.mark.asyncio
async def test_prepare_mail_draft_refuses_a_body_with_a_leaked_hypothesis_announcement() -> None:
    # #3248.3 (recette prod 29/09) — « Je pars sur Je partirai sur… » : l'annonce
    # d'hypothèse de Laura ne doit jamais atteindre un brouillon destiné à un tiers.
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {
            "to": "dsi@laposte.fr",
            "subject": "Votre transformation SI",
            "body": "Je pars sur Je partirai sur le siège parisien. Bonjour, je vous contacte au sujet de votre DSI.",
        },
        user_id="u1",
        profile_data=None,
    )
    assert "error" in result and "proposal" not in result


@pytest.mark.asyncio
async def test_prepare_mail_draft_refuses_a_truncated_signoff() -> None:
    # #3248.4 (recette prod 29/09) — « pour L. » tronqué.
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {
            "to": "dsi@laposte.fr",
            "subject": "Votre transformation SI",
            "body": "Bonjour, je vous contacte au sujet de votre DSI. Bien à vous, pour L.",
        },
        user_id="u1",
        profile_data=None,
    )
    assert "error" in result and "proposal" not in result


@pytest.mark.asyncio
async def test_prepare_mail_draft_forwards_a_declared_tone() -> None:
    """#2104.26 — le ton n'apparaît QUE si le modèle l'a déclaré, jamais déduit."""
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "jean@acme.com", "subject": "Suite à notre échange", "body": "Bonjour Jean,", "tone": "direct"},
        user_id="u1",
        profile_data=None,
    )
    assert result["proposal"]["tone"] == "direct"


@pytest.mark.asyncio
async def test_prepare_mail_draft_without_a_tone_carries_none() -> None:
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "jean@acme.com", "subject": "Suite à notre échange", "body": "Bonjour Jean,"},
        user_id="u1",
        profile_data=None,
    )
    assert "tone" not in result["proposal"]


def test_new_tools_are_registered_and_the_draft_one_needs_confirmation() -> None:
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert {
        "search_mailbox",
        "list_agenda",
        "find_free_slots",
        "get_daily_briefing",
        "prepare_mail_draft",
    } <= names
    assert "prepare_mail_draft" in chat_tools.WRITE_TOOL_NAMES
    # Les outils de LECTURE ne demandent pas de confirmation : ils ne font rien.
    assert "search_mailbox" not in chat_tools.WRITE_TOOL_NAMES


def test_no_tool_description_names_a_vendor() -> None:
    """Doctrine du 02/08 : le copilote nomme la CAPACITÉ, jamais l'éditeur."""
    forbidden = ("gmail", "outlook", "google", "microsoft", "office 365", "exchange")
    for tool in chat_tools.CHAT_TOOLS:
        blob = f"{tool['name']} {tool['description']}".lower()
        for vendor in forbidden:
            assert vendor not in blob, f"{tool['name']} nomme {vendor}"
