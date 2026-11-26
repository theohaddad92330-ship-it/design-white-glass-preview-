"""#1949.23 — décision Louis 13/09 batch 12 : « Enregistrer anonymement
l'intention non reconnue ».

Côté moteur IA, trois choses, et ce fichier tient chacune :

1. Laura SIGNALE une demande qu'elle ne sait pas router, par un outil SILENCIEUX
   (`note_unrouted_request`) — une catégorie, jamais un texte. Le signal ne
   coûte pas un aller-retour de modèle de plus et n'affiche aucune étape.
2. Le routeur transforme ce signal en ``data["unrouted_intent"]`` : la
   catégorie et le texte de la demande MASQUÉ (e-mails, téléphones, secrets,
   IBAN — les deux masquages existants) et TRONQUÉ à 300 caractères. L'outil
   silencieux n'apparaît jamais dans le panneau « ce que Bellum a fait ».
3. Le vocabulaire des catégories est CELUI de ``@bellum/contracts``, relu ici :
   deux langages, une seule liste (GA-26), et la contrainte SQL côté API la
   couvre (GA-12).

L'écriture en base (sans identité, jamais en démo) et la lecture agrégée vivent
côté API — ``apps/api/src/modules/laura-unrouted-intents``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services import chat_orchestrator, chat_tools
from app.services.unrouted_intent import (
    UNROUTED_INTENT_CATEGORIES,
    UNROUTED_INTENT_TEXT_MAX_CHARS,
    UNROUTED_INTENT_TOOL_NAME,
    build_unrouted_intent,
    mask_unrouted_text,
    without_unrouted_actions,
)

USER = "11111111-1111-4111-8111-111111111111"
CONTRACTS_FILE = (
    Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "schemas" / "laura-unrouted-intent.ts"
)

SIGNAL_ACTION = {"tool": UNROUTED_INTENT_TOOL_NAME, "input": {"category": "hors_perimetre"}, "status": "noted"}


# ── 1. Le vocabulaire : une seule liste, deux langages ───────────────────────


def test_the_categories_are_the_contracts_ones() -> None:
    source = CONTRACTS_FILE.read_text(encoding="utf-8")
    match = re.search(r"UNROUTED_INTENT_CATEGORIES = \[([^\]]*)\] as const", source)
    assert match, "la liste des catégories est introuvable dans @bellum/contracts — la garde ne lit rien"
    declared = tuple(re.findall(r"'([^']+)'", match.group(1)))
    assert len(declared) == 3
    assert declared == UNROUTED_INTENT_CATEGORIES


# ── 2. L'outil silencieux ────────────────────────────────────────────────────


def _tool() -> dict:
    return next(tool for tool in chat_tools.CHAT_TOOLS if tool["name"] == UNROUTED_INTENT_TOOL_NAME)


def test_the_tool_is_declared_with_the_categories_and_no_text_field() -> None:
    tool = _tool()
    properties = tool["input_schema"]["properties"]
    assert list(properties) == ["category"], "l'outil ne doit porter AUCUN champ de texte"
    assert tuple(properties["category"]["enum"]) == UNROUTED_INTENT_CATEGORIES
    assert tool["input_schema"]["required"] == ["category"]


def test_the_description_forbids_using_it_instead_of_answering() -> None:
    description = _tool()["description"]
    assert "DANS LA MÊME réponse" in description
    assert "JAMAIS pour une demande que tu sais traiter" in description


def test_nothing_is_ever_inserted_before_it_so_the_cached_tool_prefix_is_kept() -> None:
    """Ce qui compte n'est pas d'être DERNIER, c'est que rien ne s'insère AVANT.

    ⚠️ Ce test disait « dernier », et il est tombé le 14/09/2026 au premier
    outil suivant (`propose_mission_proof`, #2124.49 à .55) — un outil pourtant
    AJOUTÉ EN FIN, c'est-à-dire exactement ce que la règle demande. La règle
    protégée est le PRÉFIXE mis en cache : un outil inséré au milieu le fait
    repayer à chaque tour. Un outil ajouté après ne coûte rien.

    L'index est donc GELÉ : il dit non le jour où quelqu'un insère un outil plus
    haut dans la liste, ce que « dernier » ne voyait pas, et il ne dit plus non
    à un simple ajout en fin, ce qu'il faisait à tort.
    """
    names = [tool["name"] for tool in chat_tools.CHAT_TOOLS]
    assert names.index(UNROUTED_INTENT_TOOL_NAME) == 55


@pytest.mark.parametrize("category", UNROUTED_INTENT_CATEGORIES)
def test_the_executor_notes_a_known_category(category: str) -> None:
    import asyncio

    result = asyncio.run(
        chat_tools.execute_chat_tool(UNROUTED_INTENT_TOOL_NAME, {"category": category}, user_id=USER, profile_data=None)
    )
    assert result == {"status": "noted", "category": category}


def test_the_executor_says_no_to_an_unknown_category() -> None:
    import asyncio

    result = asyncio.run(
        chat_tools.execute_chat_tool(UNROUTED_INTENT_TOOL_NAME, {"category": "meteo"}, user_id=USER, profile_data=None)
    )
    assert "error" in result


# ── 3. Le masquage et la borne ───────────────────────────────────────────────


def test_mask_removes_emails_phones_secrets_and_ibans() -> None:
    raw = (
        "Écris à sarah.durand@acme.fr ou appelle le 06 12 34 56 78 / +33 6 12 34 56 78, "
        "vire sur FR76 3000 6000 0112 3456 7890 189 avec la clé sk-ant-abcdefghijklmnop"
    )
    masked = mask_unrouted_text(raw)
    for leaked in ("sarah.durand", "acme.fr", "06 12 34 56 78", "+33 6", "FR76", "3000 6000", "sk-ant-"):
        assert leaked not in masked, leaked
    assert "Écris à" in masked, "le masque ne doit pas effacer la demande elle-même"


def test_build_reads_the_signal_masks_and_truncates() -> None:
    message = "Réserve-moi un train pour Lyon, mon mail est a.b@c.fr " + "x" * 900
    intent = build_unrouted_intent(message, [SIGNAL_ACTION])
    assert intent is not None
    assert intent["category"] == "hors_perimetre"
    assert len(intent["text"]) == UNROUTED_INTENT_TEXT_MAX_CHARS
    assert "a.b@c.fr" not in intent["text"]
    assert set(intent) == {"category", "text"}, "aucun champ d'identité ne voyage avec le signal"


def test_build_says_no_without_signal_with_an_unknown_category_or_an_empty_message() -> None:
    assert build_unrouted_intent("bonjour", []) is None
    assert build_unrouted_intent("bonjour", [{"tool": "get_account_briefing", "status": "done"}]) is None
    assert build_unrouted_intent("bonjour", [{**SIGNAL_ACTION, "input": {"category": "meteo"}}]) is None
    assert build_unrouted_intent("   ", [SIGNAL_ACTION]) is None


def test_without_unrouted_actions_keeps_everything_else() -> None:
    other = {"tool": "get_account_briefing", "input": {}, "status": "done"}
    assert without_unrouted_actions([SIGNAL_ACTION, other]) == [other]


# ── 4. L'orchestrateur : pas d'aller-retour de plus, pas d'étape affichée ────


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
        for block in self._response.content:
            if block.type == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeStream(self._responses.pop(0))


def _usage() -> SimpleNamespace:
    return SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0, cache_creation_input_tokens=0)


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=_usage())


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


@pytest.fixture
def fake_model(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    for var in ("OPENAI_API_KEY", "LLM_ROUTE_CHAT", "CHAT_TURN_BUDGET_S"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())

    def install(responses):
        messages = _FakeMessages(responses)
        client = SimpleNamespace(messages=messages)
        monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: client)
        return messages

    return install


def test_a_signal_next_to_the_answer_ends_the_turn_without_another_model_call(fake_model) -> None:
    import asyncio

    messages = fake_model(
        [
            _resp(
                "tool_use",
                [
                    _text("Je ne donne pas la météo — en revanche je peux préparer ton rendez-vous à Lyon."),
                    _tool_use(UNROUTED_INTENT_TOOL_NAME, {"category": "hors_perimetre"}, "t1"),
                ],
            )
        ]
    )
    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    reply, actions = asyncio.run(
        chat_orchestrator.run_chat_with_tools(
            "system", "Quel temps à Lyon ?", user_id=USER, profile_data=None, emit=emit
        )
    )

    assert reply.startswith("Je ne donne pas la météo")
    assert len(messages.calls) == 1, "le signal ne doit pas payer un aller-retour de modèle de plus"
    assert actions == [SIGNAL_ACTION]
    assert not [event for event in events if event.get("type") == "step"], "l'outil silencieux n'affiche aucune étape"


def test_a_signal_alongside_a_real_tool_lets_the_loop_run_normally(fake_model) -> None:
    import asyncio

    messages = fake_model(
        [
            _resp(
                "tool_use",
                [
                    _text("Je regarde ce dossier."),
                    _tool_use("get_account_briefing", {"account_id": "acc-1"}, "t1"),
                    _tool_use(UNROUTED_INTENT_TOOL_NAME, {"category": "capacite_absente"}, "t2"),
                ],
            ),
            _resp("end_turn", [_text("Voici ce que je sais du compte.")]),
        ]
    )

    reply, actions = asyncio.run(
        chat_orchestrator.run_chat_with_tools(
            "system", "Exporte ce compte vers mon ERP", user_id=USER, profile_data=None
        )
    )

    assert reply == "Voici ce que je sais du compte."
    assert len(messages.calls) == 2
    assert [action["tool"] for action in actions] == ["get_account_briefing", UNROUTED_INTENT_TOOL_NAME]


# ── 5. Le routeur : le signal part dans `data`, jamais dans le panneau ──────


def _done_event(body: str) -> dict:
    frames = [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]
    done = [frame for frame in frames if frame.get("type") == "done"]
    assert done, body[-400:]
    return done[-1]


def _post(client: TestClient, monkeypatch, actions: list[dict], message: str) -> dict:
    for var in ("OPENAI_API_KEY", "LLM_ROUTE_CHAT", "LLM_GATEWAY_DISABLED", "CHAT_TOOLS_DISABLED"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(
        chat_orchestrator, "run_chat_with_tools", AsyncMock(return_value=("Je ne sais pas faire ça ici.", actions))
    )
    with (
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch("app.services.conversation_service.load_recent_history", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post("/chat/message", json={"user_id": USER, "message": message})
    assert res.status_code == 200
    return _done_event(res.text)


def test_the_router_puts_the_masked_signal_in_data_and_not_in_the_actions(client: TestClient, monkeypatch) -> None:
    other = {"tool": "get_account_briefing", "input": {"account_id": "acc-1"}, "status": "done"}
    done = _post(client, monkeypatch, [SIGNAL_ACTION, other], "Quel temps à Lyon ? écris-moi à a.b@c.fr")

    assert done["success"] is True
    intent = done["data"]["unrouted_intent"]
    assert intent["category"] == "hors_perimetre"
    assert "a.b@c.fr" not in intent["text"]
    assert "Quel temps à Lyon" in intent["text"]
    tools = [action["tool"] for action in done["data"]["context"].get("actions", [])]
    assert UNROUTED_INTENT_TOOL_NAME not in tools
    assert tools == ["get_account_briefing"]


def test_without_signal_the_envelope_has_no_new_key(client: TestClient, monkeypatch) -> None:
    done = _post(client, monkeypatch, [], "Où en est le compte SOCOTEC ?")
    assert "unrouted_intent" not in done["data"]


def test_a_signal_alone_leaves_no_empty_actions_in_the_transparency_panel(client: TestClient, monkeypatch) -> None:
    done = _post(client, monkeypatch, [SIGNAL_ACTION], "Quel temps à Lyon ?")
    assert "actions" not in done["data"]["context"]
    assert done["data"]["unrouted_intent"]["category"] == "hors_perimetre"
