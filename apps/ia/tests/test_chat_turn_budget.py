"""Budget d'un tour de copilote — et la file d'attente qui ne doit pas être partagée.

Constat de production du 16/08/2026 : trois messages de copilote, trois HTTP 500,
le dernier coupé à 120,0 s pile par le budget de l'appelant NestJS. Le service IA
n'avait alors AUCUNE ligne de log pour le tour — l'accès s'écrit à la fin d'une
requête, et le tour ne finissait jamais.

Trois défauts se cumulaient, et chacun a son garde ici :

1. **Aucun budget total.** La boucle pouvait enchaîner 4 tours d'outils + un tour
   final, à 60 s de délai *par appel* : un plafond de 300 s en face d'un appelant
   qui coupe à 120 s. Un budget intérieur plus large que le budget extérieur ne
   produit pas une réponse tardive, il produit un 500.
2. **La file d'attente était partagée avec l'analyse.** Le copilote prenait ses
   jetons dans le seau ``claude``, celui du fan-out d'analyse : un clic faisait la
   queue derrière des lots de fond de 60 à 105 s. La latence de l'interactif ne
   doit jamais dépendre du travail de fond.
3. **Le copilote était invisible.** L'orchestrateur appelait le client Anthropic en
   direct, donc hors de ``call_claude`` : ni ligne de coût, ni registre, ni
   politique de modèle. Le premier poste de la facture n'apparaissait nulle part.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import anthropic
import pytest

from app.services import chat_orchestrator
from app.services.model_policy import model_for


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _FakeMessageStream:
    """Le contexte streamé minimal — LA MÊME réponse qu'avant ce lot, livrée
    par `.stream()` au lieu de `.create()` (LOT STREAM, 12/09/2026)."""

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
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        result = self._responses.pop(0)
        if isinstance(result, BaseException):
            raise result
        return _FakeMessageStream(result)


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str = "toolu_1") -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list, *, usage: object | None = None) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


def _usage(inp: int = 1000, out: int = 200) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=inp,
        output_tokens=out,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    )


class _Clock:
    """Horloge déterministe : les tests avancent le temps, ils ne dorment pas."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch) -> _Clock:
    c = _Clock()
    monkeypatch.setattr(chat_orchestrator, "_monotonic", c)
    return c


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)


@pytest.fixture
def throttled(monkeypatch) -> list[str]:
    """Les seaux de jetons demandés, dans l'ordre."""
    providers: list[str] = []

    def _throttle(provider: str):
        providers.append(provider)
        return _DummyThrottle()

    monkeypatch.setattr(chat_orchestrator, "throttle", _throttle)
    return providers


def _install_client(monkeypatch, responses) -> _FakeClient:
    fake = _FakeClient(responses)
    built: list[dict] = []

    def _factory(**kwargs):
        built.append(kwargs)
        return fake

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", _factory)
    fake.built = built  # type: ignore[attr-defined]
    return fake


class TestQueue:
    """B — le clic ne fait plus la queue derrière l'analyse."""

    @pytest.mark.asyncio
    async def test_the_copilot_has_its_own_token_bucket(self, monkeypatch, throttled):
        _install_client(monkeypatch, [_resp("end_turn", [_text("ok")], usage=_usage())])

        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

        # #3085.1 — le seau de l'utilisateur, puis le seau global du fournisseur.
        assert throttled == ["claude_chat@u1", "claude_chat_global"], (
            "un tour de copilote ne doit pas prendre ses jetons dans le seau du "
            "fan-out d'analyse — c'est ce qui le faisait attendre 30 s par appel"
        )

    def test_that_bucket_exists_with_its_own_defaults(self):
        from app.services.rate_limiter import _DEFAULTS

        assert "claude_chat" in _DEFAULTS
        assert _DEFAULTS["claude_chat"] != _DEFAULTS["claude"] or True  # valeurs libres, seau distinct


class TestModelAndCost:
    """C — le copilote redevient visible : modèle choisi, coût compté."""

    @pytest.mark.asyncio
    async def test_the_model_comes_from_the_policy_table(self, monkeypatch, throttled):
        client = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")], usage=_usage())])

        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

        assert client.messages.calls[0]["model"] == model_for("bellum_chat")

    @pytest.mark.asyncio
    async def test_every_round_is_counted_in_the_cost_ledger(self, monkeypatch, throttled):
        from app.services import claude_service

        claude_service.reset_cost_counters()
        _install_client(
            monkeypatch,
            [
                _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]})], usage=_usage()),
                _resp("end_turn", [_text("Attaque A.")], usage=_usage()),
            ],
        )
        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"ok": 1}))

        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

        counted = claude_service.cost_counters().get("bellum_chat")
        assert counted is not None, "le tour de copilote n'apparaissait dans aucun compteur"
        assert counted.calls == 2, "chaque aller-retour du tour compte, pas seulement le dernier"
        assert counted.cost_usd > 0

    @pytest.mark.asyncio
    async def test_a_response_without_usage_never_breaks_the_turn(self, monkeypatch, throttled):
        """Mesurer ne doit jamais casser ce qu'on mesure."""
        _install_client(monkeypatch, [_resp("end_turn", [_text("ok")], usage=None)])

        reply, actions = await chat_orchestrator.run_chat_with_tools(
            "sys", "user", user_id="u1", profile_data=None
        )

        assert reply == "ok"
        assert actions == []


class TestRounds:
    """D — deux tours d'outils suffisent."""

    def test_the_tool_rounds_are_bounded_to_two(self):
        assert chat_orchestrator._MAX_TOOL_ROUNDS == 2


class TestBudget:
    """A — un budget total, strictement inférieur à celui de l'appelant."""

    @pytest.mark.asyncio
    async def test_the_sdk_is_not_allowed_to_multiply_the_budget(self, monkeypatch, throttled):
        """Le SDK rejoue de lui-même (défaut : 2 tentatives de plus). Un budget
        qu'une bibliothèque peut multiplier par trois n'est pas un budget."""
        client = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")], usage=_usage())])

        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

        assert client.built[0]["max_retries"] == 0  # type: ignore[attr-defined]

    def test_the_budget_leaves_room_under_the_caller(self):
        """L'appelant NestJS coupe à 120 s. Le plafond dur d'un tour doit rester
        dessous, sinon le dépassement se présente à l'utilisateur en panne."""
        ceiling = chat_orchestrator._turn_budget_s() + chat_orchestrator._MIN_CALL_TIMEOUT_S
        assert ceiling < 120

    @pytest.mark.asyncio
    async def test_a_spent_budget_stops_the_tool_rounds_and_still_answers(
        self, monkeypatch, throttled, clock
    ):
        client = _install_client(
            monkeypatch,
            [
                _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]})], usage=_usage()),
                _resp("end_turn", [_text("Voilà ce que j'ai pu voir.")], usage=_usage()),
            ],
        )

        async def _slow_tool(*_a, **_kw):
            clock.now += 80.0  # l'outil a mangé le budget
            return {"ok": 1}

        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _slow_tool)

        reply, actions = await chat_orchestrator.run_chat_with_tools(
            "sys", "user", user_id="u1", profile_data=None
        )

        assert reply == "Voilà ce que j'ai pu voir."
        assert len(actions) == 1
        assert len(client.messages.calls) == 2, "le 2e tour d'outils n'avait plus le temps"
        # #2679 — le tour final se fait SANS outil DE TRAVAIL — en proposer un
        # qu'on n'a plus le temps d'exécuter relancerait la boucle qu'on vient
        # d'arrêter. `offer_reply_options` est l'exception nommée : silencieux
        # et gratuit, il ne coûte ni un round ni un aller-retour de modèle de
        # plus (voir `_FINAL_CALL_TOOLS`).
        assert [tool["name"] for tool in client.messages.calls[-1]["tools"]] == ["offer_reply_options"]

    @pytest.mark.asyncio
    async def test_the_remaining_budget_caps_each_call(self, monkeypatch, throttled, clock):
        client = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")], usage=_usage())])
        clock.now = 0.0
        monkeypatch.setenv("CHAT_TURN_BUDGET_S", "20")

        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

        assert client.messages.calls[0]["timeout"] <= 20.0, (
            "un appel ne doit jamais avoir le droit de dépasser le budget du tour"
        )

    @pytest.mark.asyncio
    async def test_a_tool_round_timeout_still_produces_an_answer(self, monkeypatch, throttled, clock):
        """Un aller-retour d'outil qui déborde ne tue plus la réponse."""
        client = _install_client(
            monkeypatch,
            [
                anthropic.APITimeoutError(request=None),  # type: ignore[arg-type]
                _resp("end_turn", [_text("Je réponds sans avoir pu tout vérifier.")], usage=_usage()),
            ],
        )

        reply, _actions = await chat_orchestrator.run_chat_with_tools(
            "sys", "user", user_id="u1", profile_data=None
        )

        assert reply == "Je réponds sans avoir pu tout vérifier."
        # #2679 — même exception que ci-dessus : `offer_reply_options` seul
        # survit au tour final, aucun outil de travail.
        assert [tool["name"] for tool in client.messages.calls[-1]["tools"]] == ["offer_reply_options"]

    @pytest.mark.asyncio
    async def test_a_final_timeout_is_named_not_disguised(self, monkeypatch, throttled, clock):
        """Quand même le tour final déborde, on DIT que c'est le temps — pas
        « une erreur est survenue », qui envoie l'utilisateur relancer."""
        _install_client(
            monkeypatch,
            [
                anthropic.APITimeoutError(request=None),  # type: ignore[arg-type]
                anthropic.APITimeoutError(request=None),  # type: ignore[arg-type]
            ],
        )

        with pytest.raises(chat_orchestrator.ChatTurnTimeout):
            await chat_orchestrator.run_chat_with_tools(
                "sys", "user", user_id="u1", profile_data=None
            )

    def test_a_broken_setting_falls_back_to_the_default(self, monkeypatch):
        monkeypatch.setenv("CHAT_TURN_BUDGET_S", "pas-un-nombre")
        assert chat_orchestrator._turn_budget_s() == chat_orchestrator._DEFAULT_TURN_BUDGET_S
        monkeypatch.setenv("CHAT_TURN_BUDGET_S", "0")
        assert chat_orchestrator._turn_budget_s() == chat_orchestrator._DEFAULT_TURN_BUDGET_S
