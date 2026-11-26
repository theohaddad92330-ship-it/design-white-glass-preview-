"""#3765 (BEL-LAU-1010) — reste du lot J21 : un tour de Laura rejoué BOUT EN BOUT
(entrée → outil → réponse) sur le VRAI routeur ``/chat/message``, pas seulement
le rendu du pied de réponse sur un contexte CONSTRUIT à la main
(``ReplySourceBasis.test.tsx``, côté web).

Même patron que ``test_chat_market_memory_group_turn_replay_x61.py`` (#3225) :
seul le client Anthropic est simulé (le modèle demande l'outil, puis répond) —
la boucle d'outils RÉELLE (``chat_orchestrator``), le VRAI outil
``search_market_memory`` (``execute_chat_tool``) et le VRAI assemblage du reçu
de connaissance (``build_knowledge_receipt``, ``chat.py``) tournent sans
mock. Ce que ce test prouve, que ``ReplySourceBasis.test.tsx`` ne peut pas
prouver depuis le web : que la couche ``market_memory`` du reçu ET
``context.sources`` (nature ``market_observation``) sortent bien renseignées
du VRAI tour — pas d'un contexte que le test aurait lui-même écrit.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.services import bellum_api, chat_orchestrator, chat_tools

USER = "22222222-2222-4222-8222-222222222222"
ACCOUNT_ID = "6a3d2f1b-2345-4bcd-9ef0-1111111111bb"


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _FakeStream:
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


class _FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)

    def stream(self, **_kwargs):
        return _FakeStream(self._responses.pop(0))


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(
        input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _parse_sse(text: str) -> list[dict]:
    events: list[dict] = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if block.startswith("data:"):
            events.append(json.loads(block[len("data:") :].strip()))
    return events


def test_a_full_turn_that_calls_search_market_memory_feeds_the_real_source_basis(
    monkeypatch, client: TestClient
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())

    # Le portefeuille : une société nommée résolue sans ambiguïté.
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))

    async def _named_like(_company: str, _user_id: str) -> list[dict]:
        return [{"id": ACCOUNT_ID, "company_name": "Sopra Steria"}]

    monkeypatch.setattr(chat_tools, "_accounts_named_like", _named_like)
    monkeypatch.setattr(
        "app.services.ownership.fetch_owned_account",
        AsyncMock(return_value={"id": ACCOUNT_ID, "company_name": "Sopra Steria"}),
    )

    # Le pont mémoire marché : une entrée réellement observée.
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _group(_user_id, **_kwargs):
        return {
            "status": "ok",
            "truncated": False,
            "matches": [{"companyName": "Sopra Steria", "coverage": {"marketPaths": 12}}],
        }

    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", _group)

    # Le modèle : demande l'outil, puis répond avec le tour terminé.
    fake = SimpleNamespace(
        messages=_FakeMessages(
            [
                _resp(
                    "tool_use",
                    [_tool_use("search_market_memory", {"company_name": "Sopra Steria"}, "t1")],
                ),
                _resp("end_turn", [_text("Sopra Steria a été observée récemment dans la mémoire marché.")]),
            ]
        )
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)

    res = client.post(
        "/chat/message",
        json={"message": "Quels sont les signaux récents sur Sopra Steria ?", "user_id": USER},
    )

    assert res.status_code == 200
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    context = done["data"]["context"]

    # Le VRAI outil a tourné (pas un contexte écrit à la main) : le reçu de
    # connaissance porte la couche "market_memory" consultée — la couche que
    # `apps/web/src/features/chat/view/reply-source-basis.ts` lit pour dire
    # « Mémoire marché » dans le fondement de la réponse.
    receipt = context["knowledge_receipt"]
    assert receipt["market_memory"]["status"] == "consulted"

    # Et `context.sources` porte la source CITÉE par l'outil réel
    # (`cited_sources`, `chat_tools.py`), nature `market_observation` —
    # exactement ce que `SOURCE_KIND_FOUNDATION` (reply-source-basis.ts)
    # rapproche de la nature "mémoire marché".
    kinds = [s.get("kind") for s in context.get("sources") or []]
    assert "market_observation" in kinds
    sopra_sources = [s for s in context["sources"] if s.get("kind") == "market_observation"]
    assert any(s.get("label") == "Sopra Steria" for s in sopra_sources)

    # Le tour a bien appelé l'outil (trace de raisonnement, #3198) — la preuve
    # que ceci est un tour outillé, pas un conseil sans lecture.
    assert "search_market_memory" in context["reasoning_trace"]["tools_called"]
