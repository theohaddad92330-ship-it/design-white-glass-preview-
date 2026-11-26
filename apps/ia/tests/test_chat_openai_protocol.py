"""Le tour de copilote sur le protocole ``/v1/responses`` d'OpenAI.

``bellum_chat`` est la PREMIÈRE ligne annoncée de la facture IA : jusqu'à trois
appels Sonnet par tour, la conversation entière renvoyée à chaque aller-retour.
``gpt-5.6-luna`` est à ÷10 sur l'entrée et ÷8,3 sur la sortie (tarifs vérifiés le
28/08/2026, ``llm_gateway._OPENAI_PRICING``).

Pourquoi une SECONDE implémentation et pas une variable d'environnement : la
boucle appelle ``client.messages.create`` en direct, donc hors de ``call_claude``
et hors de la passerelle. Aucun ``LLM_ROUTE_*`` ne pouvait l'atteindre. Et le
protocole d'outils d'Anthropic (``stop_reason == "tool_use"``, blocs
``tool_use``/``tool_result``) n'est pas celui d'OpenAI.

Pourquoi ``/v1/responses`` et pas ``/v1/chat/completions``, mesuré en direct sur
les identifiants de production le 28/08/2026 :

* ``/v1/chat/completions`` + outils → **400** : *« Function tools with
  reasoning_effort are not supported for gpt-5.6-luna … use /v1/responses or set
  reasoning_effort to 'none' »* ;
* ``/v1/chat/completions`` + outils + ``reasoning_effort='none'`` → passe, mais
  le modèle NE RAISONNE PLUS ;
* ``/v1/responses`` + outils + ``reasoning={"effort": "low"}`` (et ``"medium"``)
  → passe, outils ET raisonnement.

Ce fichier tient deux promesses distinctes :

1. **L'interrupteur absent est un no-op STRICT.** Sans ``LLM_ROUTE_CHAT``, sans
   ``OPENAI_API_KEY``, ou avec le coupe-circuit ``LLM_GATEWAY_DISABLED``, le tour
   part chez Anthropic et aucun client OpenAI n'est même construit.
2. **Les deux protocoles rendent le MÊME résultat observable** — mêmes noms
   d'outils, mêmes arguments, même liste ``actions``, même texte final, même
   budget, même comptage de coût, mêmes spans.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import anthropic
import openai
import pytest

from app.services import chat_orchestrator
from app.services.chat_tools import CHAT_TOOLS, tools_for

LUNA = "gpt-5.6-luna"


# ── plomberie commune ─────────────────────────────────────────────────────────


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


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
    monkeypatch.delenv("LLM_ROUTE_CHAT", raising=False)
    monkeypatch.delenv("LLM_GATEWAY_ROUTING", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())


@pytest.fixture
def throttled(monkeypatch) -> list[str]:
    """Les seaux de jetons demandés, dans l'ordre."""
    providers: list[str] = []

    def _throttle(provider: str):
        providers.append(provider)
        return _DummyThrottle()

    monkeypatch.setattr(chat_orchestrator, "throttle", _throttle)
    return providers


# ── faux client Anthropic (le chemin d'aujourd'hui) ───────────────────────────


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


class _FakeAnthropic:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _install_anthropic(monkeypatch, responses) -> _FakeAnthropic:
    fake = _FakeAnthropic(responses)
    built: list[dict] = []

    def _factory(**kwargs):
        built.append(kwargs)
        return fake

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", _factory)
    fake.built = built  # type: ignore[attr-defined]
    return fake


def _an_text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _an_tool(name: str, tool_input: dict, block_id: str = "toolu_1") -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _an_usage(inp: int = 1000, out: int = 200) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=inp,
        output_tokens=out,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    )


def _an_resp(stop_reason: str, content: list, *, usage: object | None = None) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage or _an_usage())


# ── faux client OpenAI (le protocole /v1/responses) ───────────────────────────


class _FakeResponseStream:
    """L'itérateur streamé minimal côté OpenAI — un `response.output_text.delta`
    par item texte, PUIS le `response.completed` terminal qui porte la réponse
    complète (LOT STREAM, 12/09/2026)."""

    def __init__(self, response):
        self._response = response

    def __aiter__(self):
        return self._events()

    async def _events(self):
        for item in getattr(self._response, "output", None) or []:
            if getattr(item, "type", None) != "message":
                continue
            for part in getattr(item, "content", None) or []:
                if getattr(part, "type", None) == "output_text":
                    yield SimpleNamespace(type="response.output_text.delta", delta=part.text)
        yield SimpleNamespace(type="response.completed", response=self._response)


class _FakeResponses:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        result = self._responses.pop(0)
        if isinstance(result, BaseException):
            raise result
        if kwargs.get("stream"):
            return _FakeResponseStream(result)
        return result


class _FakeOpenAI:
    def __init__(self, responses):
        self.responses = _FakeResponses(responses)


def _install_openai(monkeypatch, responses) -> _FakeOpenAI:
    """Pose la clé, la route, et le faux client. Rend le client."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-test")
    monkeypatch.setenv("LLM_ROUTE_CHAT", f"openai:{LUNA}")
    fake = _FakeOpenAI(responses)
    built: list[dict] = []

    def _factory(**kwargs):
        built.append(kwargs)
        return fake

    monkeypatch.setattr(chat_orchestrator.openai, "AsyncOpenAI", _factory)
    fake.built = built  # type: ignore[attr-defined]
    return fake


def _oa_message(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        type="message",
        role="assistant",
        content=[SimpleNamespace(type="output_text", text=text)],
    )


def _oa_call(name: str, args: dict, call_id: str = "fc_1") -> SimpleNamespace:
    return SimpleNamespace(
        type="function_call",
        name=name,
        arguments=json.dumps(args, ensure_ascii=False),
        call_id=call_id,
        id=f"item_{call_id}",
    )


def _oa_reasoning() -> SimpleNamespace:
    """Un item de raisonnement — présent dans la sortie, jamais rejoué."""
    return SimpleNamespace(type="reasoning", id="rs_1", summary=[])


def _oa_usage(inp: int = 1000, out: int = 200, cached: int = 0) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=inp,
        output_tokens=out,
        input_tokens_details=SimpleNamespace(cached_tokens=cached),
        output_tokens_details=SimpleNamespace(reasoning_tokens=0),
    )


def _oa_resp(output: list, *, usage: object | None = None) -> SimpleNamespace:
    return SimpleNamespace(output=output, usage=usage if usage is not None else _oa_usage())


async def _run(**kwargs) -> tuple[str, list[dict[str, Any]]]:
    base: dict[str, Any] = {"user_id": "u1", "profile_data": None}
    base.update(kwargs)
    return await chat_orchestrator.run_chat_with_tools("sys", "user", **base)


# ── 1. l'interrupteur absent est un no-op STRICT ──────────────────────────────


class TestSwitchOff:
    """Retirer la variable doit restaurer le comportement d'aujourd'hui, à l'octet."""

    @pytest.mark.asyncio
    async def test_sans_route_le_tour_part_chez_anthropic(self, monkeypatch):
        client = _install_anthropic(monkeypatch, [_an_resp("end_turn", [_an_text("ok")])])
        openai_built: list[dict] = []
        monkeypatch.setattr(
            chat_orchestrator.openai,
            "AsyncOpenAI",
            lambda **kw: openai_built.append(kw),  # type: ignore[return-value]
        )

        reply, actions = await _run()

        assert reply == "ok"
        assert actions == []
        assert len(client.messages.calls) == 1
        assert not openai_built, "aucun client OpenAI ne doit même être CONSTRUIT"

    @pytest.mark.asyncio
    async def test_une_route_openai_sans_cle_retombe_sur_anthropic(self, monkeypatch):
        """Sans ``OPENAI_API_KEY``, la route ne s'applique pas — jamais un 401."""
        monkeypatch.setenv("LLM_ROUTE_CHAT", f"openai:{LUNA}")
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        client = _install_anthropic(monkeypatch, [_an_resp("end_turn", [_an_text("ok")])])

        reply, _actions = await _run()

        assert reply == "ok"
        assert client.messages.calls[0]["model"].startswith("claude")

    @pytest.mark.asyncio
    async def test_le_coupe_circuit_de_la_passerelle_ramene_le_tour_chez_anthropic(
        self, monkeypatch
    ):
        """``LLM_GATEWAY_DISABLED=true`` est le bris de glace commun à tout le
        service : il doit valoir ici aussi, sinon le copilote serait le seul
        chemin qu'on ne peut pas rapatrier en incident."""
        _install_openai(monkeypatch, [_oa_resp([_oa_message("luna")])])
        monkeypatch.setenv("LLM_GATEWAY_DISABLED", "true")
        client = _install_anthropic(monkeypatch, [_an_resp("end_turn", [_an_text("claude")])])

        reply, _actions = await _run()

        assert reply == "claude"
        assert len(client.messages.calls) == 1


# ── 2. l'interrupteur posé : le protocole OpenAI est réellement pris ──────────


class TestSwitchOn:
    @pytest.mark.asyncio
    async def test_un_tour_sans_outil(self, monkeypatch):
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("Bonjour, voici mon conseil.")])])
        anthropic_built: list[dict] = []
        monkeypatch.setattr(
            chat_orchestrator.anthropic,
            "AsyncAnthropic",
            lambda **kw: anthropic_built.append(kw),  # type: ignore[return-value]
        )

        reply, actions = await _run()

        assert reply == "Bonjour, voici mon conseil."
        assert actions == []
        assert len(client.responses.calls) == 1
        assert client.responses.calls[0]["model"] == LUNA
        assert not anthropic_built, "le tour ne doit pas construire de client Anthropic"

    @pytest.mark.asyncio
    async def test_le_client_ne_rejoue_pas_de_lui_meme(self, monkeypatch):
        """Un budget qu'une bibliothèque peut multiplier par trois n'est pas un
        budget — même arbitrage que côté Anthropic."""
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])

        await _run()

        assert client.built[0]["max_retries"] == 0  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_un_outil_puis_la_reponse_finale(self, monkeypatch):
        client = _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_reasoning(), _oa_call("compare_accounts", {"account_ids": ["a", "b"]})]),
                _oa_resp([_oa_message("Attaque le compte A en premier.")]),
            ],
        )
        executed = AsyncMock(return_value={"recommendation": "A"})
        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executed)

        reply, actions = await _run(profile_data={"offers": []})

        assert reply == "Attaque le compte A en premier."
        assert actions == [
            {"tool": "compare_accounts", "input": {"account_ids": ["a", "b"]}, "status": "done"}
        ]
        executed.assert_awaited_once()
        assert executed.await_args.kwargs["user_id"] == "u1"
        # Le résultat de l'outil est bien renvoyé au modèle, sur SA forme.
        second = client.responses.calls[1]["input"]
        outputs = [i for i in second if isinstance(i, dict) and i.get("type") == "function_call_output"]
        assert len(outputs) == 1
        assert outputs[0]["call_id"] == "fc_1"
        # #1956.3/.7/.8/.15 — le contenu voyage désormais fencé (`_tool_payload`,
        # `chat_orchestrator.py`) : on retire la balise structurelle avant de
        # lire le JSON, on ne teste pas le fence ici (voir
        # `test_chat_tool_result_fencing.py`).
        fenced_output = outputs[0]["output"]
        assert json.loads(
            fenced_output.removeprefix("<tool_result_data>\n").removesuffix("\n</tool_result_data>")
        ) == {"recommendation": "A"}

    @pytest.mark.asyncio
    async def test_deux_tours_doutils(self, monkeypatch):
        client = _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_call("compare_accounts", {"account_ids": ["a", "b"]}, call_id="fc_1")]),
                _oa_resp([_oa_call("get_account_briefing", {"account_id": "a"}, call_id="fc_2")]),
                _oa_resp([_oa_message("Voilà la synthèse.")]),
            ],
        )
        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"ok": 1}))

        reply, actions = await _run()

        assert reply == "Voilà la synthèse."
        assert [a["tool"] for a in actions] == ["compare_accounts", "get_account_briefing"]
        assert len(client.responses.calls) == 3, "deux tours d'outils PUIS le tour final"
        # #2679 — le tour final se fait SANS outil DE TRAVAIL — en proposer un
        # qu'on n'exécutera pas relance la boucle qu'on vient d'arrêter.
        # `offer_reply_options` est l'exception nommée : silencieux et
        # gratuit, il ne coûte ni un round ni un aller-retour de modèle de
        # plus (voir `_FINAL_CALL_TOOLS`).
        assert [tool["name"] for tool in client.responses.calls[-1]["tools"]] == ["offer_reply_options"]

    @pytest.mark.asyncio
    async def test_une_erreur_doutil_est_enregistree_pas_levee(self, monkeypatch):
        _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_call("compare_accounts", {"account_ids": ["a"]})]),
                _oa_resp([_oa_message("Je n'ai pas pu comparer.")]),
            ],
        )
        monkeypatch.setattr(
            chat_orchestrator,
            "execute_chat_tool",
            AsyncMock(return_value={"error": "trop peu de comptes"}),
        )

        reply, actions = await _run()

        assert reply == "Je n'ai pas pu comparer."
        assert actions == [
            {"tool": "compare_accounts", "input": {"account_ids": ["a"]}, "status": "error"}
        ]

    @pytest.mark.asyncio
    async def test_une_clarification_arrete_le_tour(self, monkeypatch):
        client = _install_openai(
            monkeypatch,
            [_oa_resp([_oa_call("ask_clarification", {"question": "Quel compte ?", "options": ["A", "B"]})])],
        )
        monkeypatch.setattr(
            chat_orchestrator,
            "execute_chat_tool",
            AsyncMock(
                return_value={
                    "status": "clarification",
                    "question": "Quel compte ?",
                    "options": ["A", "B"],
                }
            ),
        )

        reply, actions = await _run()

        assert reply == "Quel compte ?"
        assert actions[0]["status"] == "clarification"
        assert len(client.responses.calls) == 1, (
            "poser la question PUIS répondre quand même la rend décorative"
        )

    @pytest.mark.asyncio
    async def test_le_seau_de_jetons_reste_celui_du_copilote(self, monkeypatch, throttled):
        _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])

        await _run()

        # #3085.1 — le seau de l'utilisateur, puis le seau global du fournisseur.
        assert [t.split("@")[0] for t in throttled] == ["claude_chat", "claude_chat_global"], (
            "la latence de l'interactif ne doit jamais dépendre du travail de fond, "
            "quel que soit le fournisseur"
        )


# ── 3. les outils : mêmes que l'autre branche, jamais plus ────────────────────


class TestTools:
    def test_la_traduction_lit_un_corpus_non_vide(self):
        """Une garde qui ne lit rien passe au vert pour rien."""
        assert len(CHAT_TOOLS) >= 20
        assert chat_orchestrator._as_openai_tools(CHAT_TOOLS)

    def test_la_traduction_conserve_exactement_les_memes_outils(self):
        """La branche OpenAI ne doit JAMAIS atteindre un outil que la branche
        Anthropic ne peut pas — le catalogue traduit est le MÊME objet, pas une
        seconde source."""
        source = tools_for(["email", "calendar", "crm"])
        translated = chat_orchestrator._as_openai_tools(source)

        assert [t["name"] for t in translated] == [t["name"] for t in source]
        assert all(t["type"] == "function" for t in translated)
        assert all(
            t["parameters"] == s["input_schema"] for t, s in zip(translated, source, strict=True)
        )

    @pytest.mark.asyncio
    async def test_un_outil_dont_le_connecteur_manque_nest_pas_envoye(self, monkeypatch):
        """Le filtre de capacité est en CODE, avant l'appel — il ne peut pas
        dépendre du protocole."""
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])

        await _run(connected_families=[])

        sent = {t["name"] for t in client.responses.calls[0]["tools"]}
        assert "search_mailbox" not in sent
        assert "prepare_mail_draft" not in sent
        assert "list_agenda" not in sent
        assert "export_contact_to_crm" not in sent
        assert "find_needs" in sent, "l'essentiel ne dépend d'aucun connecteur"

    @pytest.mark.asyncio
    async def test_la_clarification_disparait_au_second_tour(self, monkeypatch):
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])

        await _run(clarification_already_asked=True)

        sent = {t["name"] for t in client.responses.calls[0]["tools"]}
        assert "ask_clarification" not in sent

    @pytest.mark.asyncio
    async def test_aucun_outil_decriture_ne_sexecute_de_lui_meme(self, monkeypatch):
        """Laura PROPOSE, elle n'envoie pas. Un outil d'écriture rend une
        proposition à valider — l'entrée porte ``pending_confirmation``."""
        _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_call("prepare_mail_draft", {"contact_id": "c1"})]),
                _oa_resp([_oa_message("Le brouillon est prêt.")]),
            ],
        )
        monkeypatch.setattr(
            chat_orchestrator,
            "execute_chat_tool",
            AsyncMock(
                return_value={"status": "pending_confirmation", "proposal": {"kind": "mail_draft"}}
            ),
        )

        _reply, actions = await _run(connected_families=["email"])

        assert actions[0]["status"] == "pending_confirmation"
        assert actions[0]["proposal"] == {"kind": "mail_draft"}


# ── 4. le budget, et ce qu'un dépassement doit produire ───────────────────────


class TestBudget:
    @pytest.mark.asyncio
    async def test_le_budget_restant_borne_chaque_appel(self, monkeypatch, clock):
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])
        monkeypatch.setenv("CHAT_TURN_BUDGET_S", "20")

        await _run()

        assert client.responses.calls[0]["timeout"] <= 20.0

    @pytest.mark.asyncio
    async def test_un_tour_doutils_qui_deborde_repond_quand_meme(self, monkeypatch, clock):
        client = _install_openai(
            monkeypatch,
            [
                openai.APITimeoutError(request=None),  # type: ignore[arg-type]
                _oa_resp([_oa_message("Je réponds sans avoir pu tout vérifier.")]),
            ],
        )

        reply, _actions = await _run()

        assert reply == "Je réponds sans avoir pu tout vérifier."
        # #2679 — même exception que ci-dessus.
        assert [tool["name"] for tool in client.responses.calls[-1]["tools"]] == ["offer_reply_options"]

    @pytest.mark.asyncio
    async def test_un_depassement_du_tour_final_est_nomme(self, monkeypatch, clock):
        _install_openai(
            monkeypatch,
            [
                openai.APITimeoutError(request=None),  # type: ignore[arg-type]
                openai.APITimeoutError(request=None),  # type: ignore[arg-type]
            ],
        )

        with pytest.raises(chat_orchestrator.ChatTurnTimeout):
            await _run()

    @pytest.mark.asyncio
    async def test_un_budget_epuise_arrete_les_tours_doutils(self, monkeypatch, clock):
        client = _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_call("compare_accounts", {"account_ids": ["a", "b"]})]),
                _oa_resp([_oa_message("Voilà ce que j'ai pu voir.")]),
            ],
        )

        async def _slow_tool(*_a, **_kw):
            clock.now += 80.0
            return {"ok": 1}

        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _slow_tool)

        reply, actions = await _run()

        assert reply == "Voilà ce que j'ai pu voir."
        assert len(actions) == 1
        assert len(client.responses.calls) == 2
        # #2679 — même exception que ci-dessus.
        assert [tool["name"] for tool in client.responses.calls[-1]["tools"]] == ["offer_reply_options"]


# ── 5. le coût : déplacer la facture, pas la perdre de vue ────────────────────


class TestCost:
    @pytest.mark.asyncio
    async def test_chaque_aller_retour_est_compte_au_tarif_openai(self, monkeypatch):
        from app.services import claude_service

        claude_service.reset_cost_counters()
        _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_call("compare_accounts", {"account_ids": ["a", "b"]})], usage=_oa_usage(1000, 200)),
                _oa_resp([_oa_message("Attaque A.")], usage=_oa_usage(1200, 150)),
            ],
        )
        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"ok": 1}))

        await _run()

        counted = claude_service.cost_counters().get("bellum_chat")
        assert counted is not None, "déplacer le poste n°1 dans un angle mort défait l'objectif"
        assert counted.calls == 2
        assert counted.model == LUNA
        assert counted.unpriced_calls == 0
        # Tarif Luna vérifié le 28/08 : 0,20 $/M en entrée, 1,20 $/M en sortie.
        attendu = (2200 * 0.20 + 350 * 1.20) / 1_000_000
        assert counted.cost_usd == pytest.approx(attendu)

    @pytest.mark.asyncio
    async def test_le_registre_par_run_porte_le_bon_fournisseur(self, monkeypatch):
        """``provider_costs`` répond à « lequel a monté quand la facture monte » :
        un appel OpenAI rangé sous ``anthropic`` rend la réponse structurellement
        fausse."""
        from app.services import cost_ledger

        recorded: list[tuple] = []
        monkeypatch.setattr(
            cost_ledger,
            "record",
            lambda provider, prompt, **kw: recorded.append((provider, prompt, kw)),
        )
        _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")], usage=_oa_usage(10, 5))])

        await _run()

        assert recorded
        assert recorded[0][0] == "openai"
        assert recorded[0][1] == "bellum_chat"

    @pytest.mark.asyncio
    async def test_lentree_mise_en_cache_est_comptee_a_part(self, monkeypatch):
        """OpenAI compte les jetons cachés DANS ``input_tokens`` ; les facturer au
        plein tarif d'entrée sur-facturerait de 10× chez Luna."""
        from app.services import claude_service

        claude_service.reset_cost_counters()
        _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")], usage=_oa_usage(1000, 100, cached=800))])

        await _run()

        counted = claude_service.cost_counters()["bellum_chat"]
        assert counted.input_tokens == 200, "l'entrée comptée est le RESTE non caché"
        assert counted.cache_read_tokens == 800
        attendu = (200 * 0.20 + 800 * 0.02 + 100 * 1.20) / 1_000_000
        assert counted.cost_usd == pytest.approx(attendu)

    @pytest.mark.asyncio
    async def test_une_reponse_sans_usage_ne_casse_jamais_le_tour(self, monkeypatch):
        _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")], usage=None)])

        reply, actions = await _run()

        assert reply == "ok"
        assert actions == []


# ── 6. le raisonnement : ce que /v1/responses permet de garder ────────────────


class TestReasoning:
    @pytest.mark.asyncio
    async def test_le_raisonnement_part_avec_les_outils(self, monkeypatch):
        """C'est la RAISON du choix de ``/v1/responses`` : sur
        ``/v1/chat/completions``, garder les outils imposait
        ``reasoning_effort='none'``, donc éteindre le raisonnement."""
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])

        await _run()

        # #4016 L7 (décision Louis 11/10/2026) — le défaut passe de `low` à `medium`.
        assert client.responses.calls[0]["reasoning"] == {"effort": "medium"}
        assert client.responses.calls[0]["tools"]

    @pytest.mark.asyncio
    async def test_leffort_se_regle_sans_redeploiement(self, monkeypatch):
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])
        monkeypatch.setenv("CHAT_REASONING_EFFORT", "medium")

        await _run()

        assert client.responses.calls[0]["reasoning"] == {"effort": "medium"}

    @pytest.mark.asyncio
    async def test_off_retire_le_parametre_pour_un_modele_qui_ne_raisonne_pas(self, monkeypatch):
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])
        monkeypatch.setenv("CHAT_REASONING_EFFORT", "off")

        await _run()

        assert "reasoning" not in client.responses.calls[0]

    @pytest.mark.asyncio
    async def test_la_conversation_ne_reste_pas_chez_le_fournisseur(self, monkeypatch):
        """``store=False`` : le corps d'un tour de copilote n'a aucune raison de
        vivre dans l'historique d'un fournisseur au-delà de l'appel."""
        client = _install_openai(monkeypatch, [_oa_resp([_oa_message("ok")])])

        await _run()

        assert client.responses.calls[0]["store"] is False


# ── 7. parité stricte entre les deux protocoles ───────────────────────────────


class TestParite:
    """Le même scénario, joué des deux côtés, doit rendre le même observable."""

    _SCENARIO_TOOL = "compare_accounts"
    _SCENARIO_ARGS = {"account_ids": ["a", "b"]}
    _SCENARIO_TEXT = "Attaque le compte A en premier."

    @pytest.mark.asyncio
    async def test_meme_texte_memes_actions(self, monkeypatch):
        monkeypatch.setattr(
            chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"recommendation": "A"})
        )

        _install_anthropic(
            monkeypatch,
            [
                _an_resp("tool_use", [_an_tool(self._SCENARIO_TOOL, self._SCENARIO_ARGS)]),
                _an_resp("end_turn", [_an_text(self._SCENARIO_TEXT)]),
            ],
        )
        anthropic_result = await _run()

        _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_call(self._SCENARIO_TOOL, self._SCENARIO_ARGS)]),
                _oa_resp([_oa_message(self._SCENARIO_TEXT)]),
            ],
        )
        openai_result = await _run()

        assert openai_result == anthropic_result

    @pytest.mark.asyncio
    async def test_meme_type_derreur_quand_le_budget_saute(self, monkeypatch, clock):
        _install_anthropic(
            monkeypatch,
            [
                anthropic.APITimeoutError(request=None),  # type: ignore[arg-type]
                anthropic.APITimeoutError(request=None),  # type: ignore[arg-type]
            ],
        )
        with pytest.raises(chat_orchestrator.ChatTurnTimeout):
            await _run()

        _install_openai(
            monkeypatch,
            [
                openai.APITimeoutError(request=None),  # type: ignore[arg-type]
                openai.APITimeoutError(request=None),  # type: ignore[arg-type]
            ],
        )
        with pytest.raises(chat_orchestrator.ChatTurnTimeout):
            await _run()


# ── 8. la trace : un tour reste observable, quel que soit le protocole ────────


class TestObservabilite:
    @pytest.mark.asyncio
    async def test_chaque_outil_reste_un_span_nomme(self, monkeypatch):
        spans: list[str] = []

        class _Span:
            def __init__(self, name: str, **_kwargs: object) -> None:
                spans.append(name)

            def __enter__(self):
                return self

            def __exit__(self, *_a):
                return False

        monkeypatch.setattr(chat_orchestrator.langfuse_client, "span", _Span)
        _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_call("compare_accounts", {"account_ids": ["a", "b"]})]),
                _oa_resp([_oa_message("ok")]),
            ],
        )
        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"ok": 1}))

        await _run()

        assert spans == ["tool:compare_accounts"]


# ── 9. la route vit dans la MÊME famille que les autres ───────────────────────


class TestRoute:
    def test_le_chat_est_une_tache_de_la_passerelle(self):
        """Pas un second vocabulaire : ``LLM_ROUTE_CHAT``, comme
        ``LLM_ROUTE_STRATEGY``. Un réglage vit à un seul endroit."""
        from app.services import llm_gateway as gw

        assert "chat" in gw.CANONICAL_TASKS
        assert gw.canonical_task("bellum_chat") == "chat"

    def test_la_route_par_defaut_reste_anthropic(self, monkeypatch):
        from app.services import llm_gateway as gw

        monkeypatch.delenv("LLM_ROUTE_CHAT", raising=False)
        assert gw.resolve_route("bellum_chat") == gw.Route(gw.PROVIDER_ANTHROPIC, None)

    def test_la_resolution_du_dispatch_vit_a_un_seul_endroit(self, monkeypatch):
        """``complete()`` et l'orchestrateur du copilote lisent la MÊME
        dérivation : deux chemins qui la refont divergent."""
        from app.services import llm_gateway as gw

        monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-test")
        monkeypatch.setenv("LLM_ROUTE_CHAT", f"openai:{LUNA}")
        provider, model = gw.resolve_dispatch("bellum_chat", "claude-sonnet-5")
        assert provider.name == gw.PROVIDER_OPENAI
        assert model == LUNA

        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        provider, model = gw.resolve_dispatch("bellum_chat", "claude-sonnet-5")
        assert provider.name == gw.PROVIDER_ANTHROPIC
        assert model == "claude-sonnet-5", (
            "sur un repli, un identifiant de modèle étranger ne doit jamais fuir "
            "dans l'appel Anthropic"
        )


# ── #3495 — crédit du fournisseur routé épuisé : Laura bascule sur Anthropic ──


def _quota_error(code: str) -> openai.RateLimitError:
    import httpx

    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    return openai.RateLimitError(
        "You have no credits remaining",
        response=httpx.Response(429, request=request),
        body={"error": {"code": code, "message": "You have no credits remaining"}},
    )


class TestQuotaExhausted:
    """Question de recette dans /chat : « Donne-moi les 3 points clés de ce compte. »
    Avec OpenAI à court de crédit, la réponse vient d'Anthropic, sans mention technique."""

    @pytest.fixture(autouse=True)
    def _clean_breaker(self):
        from app.services import llm_gateway

        llm_gateway.reset_provider_exhausted()
        yield
        llm_gateway.reset_provider_exhausted()

    @pytest.mark.asyncio
    async def test_quota_epuise_le_tour_est_repondu_par_anthropic(self, monkeypatch, caplog):
        from app.services import llm_gateway

        openai_client = _install_openai(monkeypatch, [_quota_error("insufficient_quota")])
        anthropic_client = _install_anthropic(monkeypatch, [_an_resp("end_turn", [_an_text("Réponse Anthropic")])])

        with caplog.at_level("ERROR", logger="app.services.llm_gateway"):
            reply, _ = await _run()

        assert reply == "Réponse Anthropic"
        assert len(openai_client.responses.calls) == 1  # jamais réessayé
        assert len(anthropic_client.messages.calls) == 1
        assert llm_gateway.is_provider_exhausted("openai")
        assert any("llm_provider_quota_exhausted" in r.getMessage() for r in caplog.records)

    @pytest.mark.asyncio
    async def test_disjoncteur_le_tour_suivant_ne_touche_plus_le_fournisseur(self, monkeypatch):
        openai_client = _install_openai(monkeypatch, [_quota_error("credit_balance_exhausted")])
        _install_anthropic(
            monkeypatch,
            [_an_resp("end_turn", [_an_text("un")]), _an_resp("end_turn", [_an_text("deux")])],
        )
        assert (await _run())[0] == "un"
        assert (await _run())[0] == "deux"
        assert len(openai_client.responses.calls) == 1

    @pytest.mark.asyncio
    async def test_un_429_de_debit_garde_le_comportement_actuel(self, monkeypatch):
        import httpx
        from app.services import llm_gateway

        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        rate = openai.RateLimitError(
            "Rate limit reached",
            response=httpx.Response(429, request=request),
            body={"error": {"code": "rate_limit_exceeded", "message": "Rate limit reached"}},
        )
        _install_openai(monkeypatch, [rate])
        anthropic_client = _install_anthropic(monkeypatch, [_an_resp("end_turn", [_an_text("ne doit pas partir")])])

        with pytest.raises(openai.RateLimitError):
            await _run()
        assert anthropic_client.messages.calls == []
        assert not llm_gateway.is_provider_exhausted("openai")

    @pytest.mark.asyncio
    async def test_quota_epuise_apres_un_outil_le_tour_continue_chez_anthropic(self, monkeypatch, caplog):
        """#3495.6 — le crédit tombe au 2e aller-retour, APRÈS un tour d'outils :
        Anthropic reprend avec le résultat de l'outil déjà obtenu (rejoué en
        blocs tool_use / tool_result), l'outil n'est pas relancé."""
        from app.services import llm_gateway

        openai_client = _install_openai(
            monkeypatch,
            [
                _oa_resp([_oa_message("Je regarde."), _oa_call("compare_accounts", {"account_ids": ["a", "b"]})]),
                _quota_error("insufficient_quota"),
            ],
        )
        anthropic_client = _install_anthropic(
            monkeypatch, [_an_resp("end_turn", [_an_text("Attaque le compte A.")])]
        )
        executed = AsyncMock(return_value={"recommendation": "A"})
        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executed)

        with caplog.at_level("ERROR", logger="app.services.llm_gateway"):
            reply, actions = await _run(profile_data={"offers": []})

        assert reply == "Attaque le compte A."
        executed.assert_awaited_once()
        assert len(openai_client.responses.calls) == 2
        assert llm_gateway.is_provider_exhausted("openai")
        assert any("llm_provider_quota_exhausted" in r.getMessage() for r in caplog.records)
        sent = anthropic_client.messages.calls[0]["messages"]
        assert sent[0] == {"role": "user", "content": "user"}
        assistant = sent[1]
        assert assistant["role"] == "assistant"
        assert [b["type"] for b in assistant["content"]] == ["text", "tool_use"]
        assert assistant["content"][1]["id"] == "fc_1"
        assert assistant["content"][1]["input"] == {"account_ids": ["a", "b"]}
        result = sent[2]["content"][0]
        assert result["type"] == "tool_result" and result["tool_use_id"] == "fc_1"
        assert "recommendation" in result["content"]

    @pytest.mark.asyncio
    async def test_un_429_de_debit_apres_un_outil_remonte_toujours(self, monkeypatch):
        import httpx

        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        rate = openai.RateLimitError(
            "Rate limit reached",
            response=httpx.Response(429, request=request),
            body={"error": {"code": "rate_limit_exceeded", "message": "Rate limit reached"}},
        )
        _install_openai(
            monkeypatch,
            [_oa_resp([_oa_call("compare_accounts", {"account_ids": ["a"]})]), rate],
        )
        anthropic_client = _install_anthropic(monkeypatch, [_an_resp("end_turn", [_an_text("non")])])
        monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={}))

        with pytest.raises(openai.RateLimitError):
            await _run(profile_data={"offers": []})
        assert anthropic_client.messages.calls == []
