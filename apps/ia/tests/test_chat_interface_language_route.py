"""# Recette du 13/09 — interface en anglais, réponse en français.

Mesuré en production (API et IA au SHA ``f62f2d6a9``) : ``POST /ia/chat`` avec
``interfaceLanguage: 'en'``, ``history: []``, aucun compte, et le message
français « RECETTE — 2026-09-13 — en une phrase, combien de comptes je suis en
ce moment ? » rendait « Tu suis actuellement **27 comptes analysés**. », deux
tours de suite.

``test_advisor_interface_language.py`` appelle ``build_system_prompt`` à la
main : il prouve ce que le constructeur fait d'un argument, pas ce que le
MODÈLE reçoit. Ce fichier rejoue la route ``/chat/message`` avec le corps
EXACT que l'API envoie (``ia.client.ts::chatBody``) et relit le ``system``
réellement posé sur l'appel Anthropic, sur les DEUX chemins :

* le chemin nominal (orchestrateur d'outils, ``messages.stream``) — avec
  ``connected_families: []``, comme un espace sans messagerie/agenda/CRM, donc
  avec la mention « CAPACITÉS ABSENTES » que l'orchestrateur ajoute ;
* le chemin du kill-switch ``CHAT_TOOLS_DISABLED`` (``call_claude`` →
  ``messages.create``).

Aucun appel de modèle : seul le client Anthropic est remplacé, tout le reste
(routeur, construction du prompt, orchestrateur, segmentation du cache) est le
vrai code.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import anthropic
import pytest
from fastapi.testclient import TestClient

from app.services.claude_service import CACHE_SEGMENT_BREAK
from tests.test_advisor_interface_language import orders_french

_MESSAGE = "RECETTE — 2026-09-13 — en une phrase, combien de comptes je suis en ce moment ?"


def _api_body(interface_language: str | None) -> dict:
    """Le corps de ``apps/api/src/modules/ia/ia.client.ts::chatBody`` pour le
    geste mesuré : fil neuf, aucun compte actif, aucun historique."""
    body: dict = {
        "user_id": "u-recette",
        "workspace_id": "ws-1",
        "message": _MESSAGE,
        "account_id": "",
        "history": [],
        "account_data": {},
        "contacts_summary": "",
        "plan_summary": "",
        "accounts_summary": "SNCF — Transport — 7/10\nEDF — Énergie — 6/10",
        "profile_data": {"companyName": "MonESN"},
        "pinned_facts": [],
        "user_preferences": {},
        "conversation_summary": "",
        "account_feedback": "",
        "crm_connected": False,
        "crm_provider": "",
        "crm_presence": "",
        "tools_summary": "",
        "first_name": "Louis",
        "document_ids": [],
        "connected_families": [],
        "clarification_asked": False,
        "conversation_id": "c0ffee00-0000-4000-8000-000000000013",
    }
    if interface_language is not None:
        body["interface_language"] = interface_language
    return body


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


def _fake_anthropic(calls: list[dict]):
    """Un client Anthropic qui ENREGISTRE ce qu'on lui envoie et répond une
    phrase — sur ``messages.stream`` (orchestrateur) comme sur
    ``messages.create`` (``call_claude``)."""
    text = "You follow 27 accounts."
    usage = SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    response = SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)], usage=usage)

    class _Stream:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            yield SimpleNamespace(type="text", text=text)

        async def get_final_message(self):
            return response

    class _Messages:
        def stream(self, **kw):
            calls.append(kw)
            return _Stream()

        async def create(self, **kw):
            calls.append(kw)
            return response

    class _Client:
        def __init__(self, **_kw):
            self.messages = _Messages()

    return _Client


def _system_sent_to_the_model(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, body: dict, *, tools: bool
) -> list[str]:
    """Poste ``body`` sur ``/chat/message`` et rend le ``system`` du PREMIER
    appel modèle, bloc par bloc (le texte de chaque bloc ``cache_control``)."""
    from app.services import chat_orchestrator, claude_service

    for var in ("OPENAI_API_KEY", "LLM_ROUTE_CHAT", "LLM_GATEWAY_DISABLED", "CHAT_TOOLS_DISABLED"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    if not tools:
        monkeypatch.setenv("CHAT_TOOLS_DISABLED", "1")

    calls: list[dict] = []
    with (
        patch.object(anthropic, "AsyncAnthropic", _fake_anthropic(calls)),
        patch.object(chat_orchestrator, "throttle", lambda _p: _DummyThrottle()),
        patch.object(claude_service, "throttle", lambda _p: _DummyThrottle()),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch(
            "app.services.conversation_service.load_recent_history",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/chat/message", json=body)

    assert res.status_code == 200
    assert '"type": "done"' in res.text and '"success": true' in res.text, res.text[-400:]
    assert calls, "aucun appel modèle n'a été fait — le test ne lit rien"
    system = calls[0]["system"]
    assert isinstance(system, list), f"system attendu en blocs mis en cache, reçu {type(system)}"
    return [block["text"] for block in system]


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch"])
def test_the_english_directive_reaches_the_model_and_no_french_order_does(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tools: bool
) -> None:
    """MAILLON b — le transport IA : pour un corps ``interface_language: "en"``,
    le ``system`` posé sur l'appel modèle porte la consigne anglaise, et aucune
    phrase n'y ordonne le français."""
    blocks = _system_sent_to_the_model(client, monkeypatch, _api_body("en"), tools=tools)
    text = "".join(blocks)

    assert len(blocks) == 3, "invariant / stable-par-session / volatil"
    assert CACHE_SEGMENT_BREAK not in text, "le marqueur de cache ne doit jamais atteindre le modèle"
    assert "Answer in English" in text
    assert "Réponds en français" not in text
    assert orders_french(text) == []


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch"])
def test_the_english_directive_opens_the_session_segment_and_closes_the_prompt(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tools: bool
) -> None:
    """LA CAUSE — la POSITION et la PRIORITÉ de la consigne.

    Avant le correctif, la consigne anglaise était UNE phrase (« Answer in
    English, directly and helpfully… ») collée à la fin du segment de profil —
    mesuré sur ce corps : à 93 % d'un ``system`` de 29 207 caractères, après
    26 831 caractères de règles françaises et avant 1 936 caractères de contexte
    français (portefeuille, capacités absentes) —, puis un message utilisateur
    en français. Elle ne disait pas qu'elle valait
    MÊME quand le message est en français : le modèle suivait la langue du
    message.

    La consigne doit ouvrir le segment de session (le premier texte lu après les
    règles invariantes) ET être rappelée comme DERNIER texte du prompt système
    — y compris derrière la mention « CAPACITÉS ABSENTES » de l'orchestrateur.
    """
    from app.prompts.bellum_advisor import _LANGUAGE_HEADS, _LANGUAGE_REMINDERS

    blocks = _system_sent_to_the_model(client, monkeypatch, _api_body("en"), tools=tools)

    assert blocks[1].lstrip().startswith(_LANGUAGE_HEADS["en"]), blocks[1][:300]
    assert blocks[-1].rstrip().endswith(_LANGUAGE_REMINDERS["en"]), blocks[-1][-400:]
    if tools:
        # La mention de l'orchestrateur est bien là — AVANT le rappel.
        last = blocks[-1]
        assert "CAPACITÉS ABSENTES" in last
        assert last.index("CAPACITÉS ABSENTES") < last.rindex(_LANGUAGE_REMINDERS["en"])


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch"])
def test_the_english_directive_says_it_holds_even_for_a_message_written_in_french(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tools: bool
) -> None:
    """La consigne tranche le conflit que le modèle tranchait seul : le message
    est en français, les consignes citent des phrases et des intitulés français."""
    from app.prompts.bellum_advisor import _LANGUAGE_HEADS

    head = _LANGUAGE_HEADS["en"]
    blocks = _system_sent_to_the_model(client, monkeypatch, _api_body("en"), tools=tools)
    assert head in blocks[1]
    assert "even when" in head and "French" in head
    # Les intitulés que la carte structurée du web reconnaît en anglais
    # (`StructuredReply.tsx::RECOGNIZED_TITLES` : goal / hook / use case).
    for heading in ("**Goal:**", "**Hook:**", "**Use case:**"):
        assert heading in head, heading


@pytest.mark.parametrize("tools", [True, False], ids=["outils", "kill-switch"])
@pytest.mark.parametrize("language", ["fr", None], ids=["fr", "absent"])
def test_a_french_interface_gets_the_system_of_before(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tools: bool, language: str | None
) -> None:
    """Interface française (ou onglet d'avant #1958.8) : le ``system`` est
    celui d'avant le correctif — la consigne française à la fin du segment de
    profil, aucune consigne anglaise, aucun rappel en fin de prompt."""
    blocks = _system_sent_to_the_model(client, monkeypatch, _api_body(language), tools=tools)
    text = "".join(blocks)

    assert blocks[1].rstrip().endswith("Réponds en français, de manière directe et utile.")
    assert "Answer in English" not in text
    assert "LANGUAGE" not in text
    if tools:
        assert blocks[-1].rstrip().endswith("« ton CRM ».")
