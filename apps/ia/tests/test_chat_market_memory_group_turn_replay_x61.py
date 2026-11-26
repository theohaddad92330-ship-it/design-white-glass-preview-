"""#3225 (recette prod 02/10, Y14) — « Que dit la mémoire marché sur le groupe La Poste et ses
filiales ? » : le TOUR entier rejoué (``/chat/message`` → modèle simulé → vrai outil
``search_market_memory`` → pont simulé), avec la phrase exacte de l'issue.

Cause : dans /chat « espace entier » le modèle n'a AUCUN identifiant de compte à passer en
``company_id`` ; il n'appelait donc jamais l'axe identité et la réponse ne portait ni
« lue (N chemins) » / « rien observé » ni « aucune filiale déclarée ». Corrigé deux fois :
l'outil accepte ``company_name`` (rapproché dans le portefeuille), et la ligne par entité est
posée DÉTERMINISTEMENT sous la réponse quand le modèle l'a omise.

Question exacte à poser en recette (/chat, espace entier) : « Que dit la mémoire marché sur le
groupe La Poste et ses filiales ? » puis « Qu'est-ce qu'on a observé sur le groupe La Poste ? » —
chaque réponse doit porter « La Poste — lue (N chemins) » ou « rien observé » et, sans filiale
déclarée, « Aucune filiale déclarée sur ce compte ».
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.services import bellum_api, chat_orchestrator, chat_tools
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
POSTE_ID = "5f2c1e0a-1234-4abc-9def-0000000000aa"


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


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _portfolio(monkeypatch, rows: list[dict], account: dict | None = None) -> None:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))

    async def _named_like(_company: str, _user_id: str) -> list[dict]:
        return rows

    monkeypatch.setattr(chat_tools, "_accounts_named_like", _named_like)
    monkeypatch.setattr(
        "app.services.ownership.fetch_owned_account",
        AsyncMock(return_value=account or {"id": POSTE_ID, "company_name": "La Poste"}),
    )


def _bridge(monkeypatch, matches: list[dict]) -> list[dict]:
    asked: list[dict] = []

    async def _group(_user_id, **kwargs):
        asked.append(kwargs)
        return {"status": "ok", "truncated": False, "matches": matches}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "market_memory_context_for_group", _group)
    return asked


@pytest.mark.asyncio
async def test_company_name_resolves_the_account_in_the_portfolio(monkeypatch) -> None:
    _portfolio(monkeypatch, [{"id": POSTE_ID, "company_name": "La Poste"}])
    asked = _bridge(monkeypatch, [{"companyName": "La Poste", "coverage": {"marketPaths": 30}}])

    result = await execute_chat_tool("search_market_memory", {"company_name": "La Poste"}, user_id=USER, profile_data=None)

    assert asked and asked[0]["root_account_id"] == POSTE_ID
    assert result["per_entity"][0]["line"] == "lue (30 chemins)"
    assert result["no_declared_subsidiaries"] is True


@pytest.mark.asyncio
async def test_an_ambiguous_company_name_is_never_guessed(monkeypatch) -> None:
    _portfolio(
        monkeypatch,
        [{"id": POSTE_ID, "company_name": "La Poste"}, {"id": "5f2c1e0a-1234-4abc-9def-0000000000bb", "company_name": "La Poste"}],
    )
    asked = _bridge(monkeypatch, [])

    result = await execute_chat_tool("search_market_memory", {"company_name": "La Poste"}, user_id=USER, profile_data=None)

    assert "error" in result and not asked
    assert len(result["account_candidates"]) == 2


@pytest.mark.asyncio
async def test_an_unknown_company_name_is_a_clear_error(monkeypatch) -> None:
    _portfolio(monkeypatch, [])
    asked = _bridge(monkeypatch, [])

    result = await execute_chat_tool("search_market_memory", {"company_name": "Zzz"}, user_id=USER, profile_data=None)

    assert "error" in result and not asked


@pytest.mark.parametrize(
    "question",
    [
        "Que dit la mémoire marché sur le groupe La Poste et ses filiales ?",
        "Qu'est-ce qu'on a observé sur le groupe La Poste ?",
    ],
)
def test_the_full_turn_says_one_line_per_entity_even_when_the_model_does_not(
    monkeypatch, client: TestClient, question: str
) -> None:
    _portfolio(monkeypatch, [{"id": POSTE_ID, "company_name": "La Poste"}])
    _bridge(monkeypatch, [{"companyName": "La Poste", "coverage": {"marketPaths": 30}}])
    fake = SimpleNamespace(
        messages=_FakeMessages(
            [
                _resp("tool_use", [_tool_use("search_market_memory", {"company_name": "La Poste"}, "t1")]),
                _resp("end_turn", [_text("Je n'ai pas encore mesuré les filiales séparément.")]),
            ]
        )
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)

    res = client.post(
        "/chat/message",
        json={"message": question, "user_id": USER},
    )

    assert res.status_code == 200
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    reply = done["data"]["reply"]
    assert "La Poste — lue (30 chemins)" in reply
    assert "aucune filiale déclarée" in reply.lower()


def test_the_addendum_never_repeats_what_the_model_already_said() -> None:
    from app.services.market_memory_group_addendum import group_reading_addendum

    output = json.dumps(
        {
            "per_entity": [
                {"company_name": "La Poste", "relation": "root", "observed": True, "market_paths": 30, "line": "lue (30 chemins)"},
                {"company_name": "Docaposte", "relation": "filiale", "observed": False, "market_paths": None, "line": "rien observé"},
            ],
            "no_declared_subsidiaries": False,
        },
        ensure_ascii=False,
    )
    said = "La Poste : lue (30 chemins). Docaposte : rien observé."
    assert group_reading_addendum(said, [output], "fr") == ""
    out = group_reading_addendum("Synthèse.", [output], "fr")
    assert "La Poste — lue (30 chemins)" in out and "Docaposte — rien observé" in out
    assert "Docaposte — nothing observed" in group_reading_addendum("Summary.", [output], "en")
