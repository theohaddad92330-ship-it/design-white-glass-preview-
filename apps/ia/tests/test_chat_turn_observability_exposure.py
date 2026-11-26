"""#3196.6 (reste, LAU-FINAL-202, épopée #3236) — l'observabilité du tour à
CHAQUE sortie, pas SEULEMENT quand le budget manque, et son exposition HORS
des journaux Python.

Le lot du 28/09 (3cbe1a511) journalisait les huit champs nommés par l'issue
au SEUL point où le budget d'outils est épuisé (``chat_orchestrator.py``,
juste avant le dernier appel sans outil). Un tour qui répond proprement, pose
une clarification, ou s'arrête sur un signal silencieux n'était JAMAIS
observé. Cette suite prouve la couverture des TROIS autres sorties.

`observability_sink` (même patron que `collected`, #1957.12) : une liste de
l'APPELANT, remplie par référence — PAS un ajout au tuple ``(reply,
actions)``, qui casserait le contrat documenté d'``actions`` (« une entrée
par outil RÉELLEMENT exécuté », lu par ``turn_outcome`` et par la quasi-
totalité de la suite de tests de l'orchestrateur — une première version de
cette tranche l'apprenait à ses dépens, voir la revue).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator
from app.services.chat_turn_plan import TurnObservability, turn_observability_as_dict

USER = "11111111-1111-4111-8111-111111111111"


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _FakeMessageStream:
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
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install_client(monkeypatch, responses) -> None:
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


async def _run_turn(sink: list[TurnObservability]):
    return await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, observability_sink=sink
    )


# ── les trois sorties propres, en plus de celle déjà couverte (budget épuisé) ──


@pytest.mark.asyncio
async def test_a_clean_answer_without_any_tool_call_carries_observability(monkeypatch):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour Louis.")])])
    sink: list[TurnObservability] = []
    reply, actions = await _run_turn(sink)

    assert reply == "Bonjour Louis."
    # Le contrat d'`actions` ne change pas : aucun outil réel n'a été appelé.
    assert actions == []
    assert len(sink) == 1
    assert sink[0].budget_exhausted is False
    assert sink[0].degraded_answer is False
    assert sink[0].job_created is False
    assert sink[0].completed_steps == 0  # aucun round d'outils n'a eu lieu


@pytest.mark.asyncio
async def test_a_clarification_carries_observability(monkeypatch):
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [_text("Je pars sur Lyon."), _tool_use("ask_clarification", {"question": "Quel périmètre ?"}, "t1")],
            )
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return {"status": "clarification", "question": tool_input["question"]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    sink: list[TurnObservability] = []
    await _run_turn(sink)

    assert len(sink) == 1
    assert sink[0].budget_exhausted is False
    assert sink[0].degraded_answer is False


@pytest.mark.asyncio
async def test_a_silent_signal_round_carries_observability(monkeypatch):
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [_text("Je note et je continue."), _tool_use("note_thread_context", {"note": "x"}, "t1")],
            )
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return {"status": "noted"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    sink: list[TurnObservability] = []
    await _run_turn(sink)

    assert len(sink) == 1
    assert sink[0].budget_exhausted is False


@pytest.mark.asyncio
async def test_without_a_sink_nothing_changes(monkeypatch):
    """Un appelant qui ne passe pas `observability_sink` (`None`, le défaut)
    garde le comportement d'avant cette tranche à l'octet."""
    _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None
    )
    assert reply == "ok"
    assert actions == []


# ── la sérialisation, telle que `app/routers/chat.py` la pose sur `context` ──


def test_turn_observability_as_dict_carries_the_nine_named_fields():
    # #3861.5 (lot X04) : neuvième champ, `capability_fallback` — le repli vers un
    # modèle économique se dit dans la trace, jamais en silence.
    observability = TurnObservability(
        execution_plan="mode_approfondi",
        planned_steps=4,
        completed_steps=2,
        skipped_steps=2,
        parallel_calls=3,
        budget_exhausted=True,
        degraded_answer=True,
        job_created=False,
    )
    assert turn_observability_as_dict(observability) == {
        "execution_plan": "mode_approfondi",
        "planned_steps": 4,
        "completed_steps": 2,
        "skipped_steps": 2,
        "parallel_calls": 3,
        "budget_exhausted": True,
        "degraded_answer": True,
        "job_created": False,
        "capability_fallback": False,
    }
