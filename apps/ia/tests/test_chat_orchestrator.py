"""Boucle d'orchestration outils du Copilote (restitution V2 §12-14)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.chat_tools import execute_chat_tool
from app.services.rate_limiter import RateLimitTimeout


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _AlwaysRaisingThrottle:
    """#3085 — imite un seau `claude_chat` saturé (deux membres actifs à la
    fois, ou Découvrir qui puise dans le même seau) : le jeton n'arrive jamais."""

    async def __aenter__(self):
        raise RateLimitTimeout("claude_chat", 30.0)

    async def __aexit__(self, *_a):
        return False


class _RateLimitedThrottle:
    """Échoue exactement `fail_times` fois puis redevient un throttle normal."""

    def __init__(self, fail_times: int):
        self._remaining_failures = fail_times

    def __call__(self, _provider):
        if self._remaining_failures > 0:
            self._remaining_failures -= 1
            return _AlwaysRaisingThrottle()
        return _DummyThrottle()


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
            if getattr(block, "type", None) != "text":
                continue
            # `chunks`, quand posé par `_text_chunks`, prouve une diffusion
            # EN PLUSIEURS morceaux — `_text` (un seul chunk) reste le défaut
            # des scénarios qui ne testent pas la diffusion elle-même.
            for chunk in getattr(block, "chunks", None) or [block.text]:
                yield SimpleNamespace(type="text", text=chunk)

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


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=content)


def _text_chunks(*chunks: str) -> SimpleNamespace:
    """Un bloc texte livré en PLUSIEURS deltas — prouve une diffusion réelle,
    pas un seul paquet renommé."""
    return SimpleNamespace(type="text", text="".join(chunks), chunks=list(chunks))


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    # Neutralise le throttle réel (pas de dépendance externe dans le test).
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())


def _install_client(monkeypatch, responses):
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    return fake


@pytest.mark.asyncio
async def test_no_tool_returns_text_and_empty_actions(monkeypatch):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour, voici mon conseil.")])])

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Bonjour, voici mon conseil."
    assert actions == []


@pytest.mark.asyncio
async def test_tool_use_drives_execution_then_final_reply(monkeypatch):
    # 1er tour : le modèle appelle compare_accounts ; 2e tour : réponse texte finale.
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]})]),
            _resp("end_turn", [_text("Attaque le compte A en premier.")]),
        ],
    )
    executed = AsyncMock(return_value={"recommendation": "A"})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executed)

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data={"offers": []}
    )

    assert reply == "Attaque le compte A en premier."
    assert actions == [{"tool": "compare_accounts", "input": {"account_ids": ["a", "b"]}, "status": "done"}]
    executed.assert_awaited_once()
    # L'ownership est passé jusqu'à l'exécuteur.
    assert executed.await_args.kwargs["user_id"] == "u1"


@pytest.mark.asyncio
async def test_tool_error_is_recorded_not_raised(monkeypatch):
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a"]})]),
            _resp("end_turn", [_text("Je n'ai pas pu comparer.")]),
        ],
    )
    monkeypatch.setattr(
        chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"error": "trop peu de comptes"})
    )

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Je n'ai pas pu comparer."
    assert actions == [{"tool": "compare_accounts", "input": {"account_ids": ["a"]}, "status": "error"}]


@pytest.mark.asyncio
async def test_claude_chat_saturation_degrades_tool_round_instead_of_failing(monkeypatch):
    """#3085 — deux membres actifs à la fois sur Laura (ou Laura + Découvrir,
    qui puisent tous deux dans le seau `claude_chat`) peuvent faire attendre un
    jeton au-delà de son échéance PENDANT un round d'outils. Ce round dégrade
    sur le tour final avec ce qui a déjà été récolté ; il ne fait plus échouer
    toute la réponse — jusqu'à ce lot, l'exception du seau n'était pas
    rattrapée à cet endroit."""
    monkeypatch.setattr(chat_orchestrator, "throttle", _RateLimitedThrottle(fail_times=1))
    _install_client(
        monkeypatch,
        [_resp("end_turn", [_text("Je réponds sans outil, le seau claude_chat était saturé.")])],
    )

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Je réponds sans outil, le seau claude_chat était saturé."
    assert actions == []


@pytest.mark.asyncio
async def test_claude_chat_saturation_raises_chat_turn_timeout_not_a_crash(monkeypatch):
    """#3085 — si le seau `claude_chat` reste saturé jusqu'au tour final,
    l'appelant (`chat.py`) reçoit `ChatTurnTimeout` — déjà traduit à l'écran
    par « c'est le temps » — jamais l'exception brute du limiteur de débit."""
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _AlwaysRaisingThrottle())
    _install_client(monkeypatch, [])

    with pytest.raises(chat_orchestrator.ChatTurnTimeout):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)


@pytest.mark.asyncio
async def test_execute_chat_tool_guards_too_few_accounts():
    out = await execute_chat_tool("compare_accounts", {"account_ids": ["only-one"]}, user_id="u1", profile_data=None)
    assert "error" in out


@pytest.mark.asyncio
async def test_execute_chat_tool_unknown_tool():
    out = await execute_chat_tool("delete_everything", {}, user_id="u1", profile_data=None)
    assert out["error"].startswith("Outil inconnu")


@pytest.mark.asyncio
async def test_execute_chat_tool_dispatches_compare(monkeypatch):
    called = {}

    async def fake_compare(req):
        called["ids"] = req.account_ids
        called["user"] = req.user_id
        return {"success": True, "data": {"ranking": ["a", "b"]}}

    import app.routers.compare as compare_mod

    monkeypatch.setattr(compare_mod, "compare_accounts", fake_compare)

    out = await execute_chat_tool("compare_accounts", {"account_ids": ["a", "b"]}, user_id="u9", profile_data=None)

    assert out == {"ranking": ["a", "b"]}
    assert called == {"ids": ["a", "b"], "user": "u9"}


# ── LOT STREAM — Laura diffuse (12/09/2026) ──────────────────────────────────
#
# Le test central du lot : un COMPTE et un ORDRE, jamais une durée. « Au moins
# un fragment de texte a été émis AVANT que la réponse complète ne soit
# disponible » — vrai sous n'importe quelle charge machine, parce que rien
# ici ne dort : c'est la boucle `async for` du transport streamé qui livre les
# deltas un par un, PUIS rend le tour complet. Garde GA-307.


@pytest.mark.asyncio
async def test_deltas_arrive_before_the_turn_completes_and_concatenate_to_the_reply(monkeypatch):
    _install_client(monkeypatch, [_resp("end_turn", [_text_chunks("Bon", "jour, ", "voici ", "mon conseil.")])])
    received: list[dict] = []

    async def emit(event: dict) -> None:
        # PREUVE PAR ORDRE : au moment où un delta arrive, le tour n'est pas
        # encore terminé — `run_chat_with_tools` n'a pas encore rendu la main.
        # Un test qui ne ferait que compter les deltas APRÈS coup ne prouverait
        # rien sur le MOMENT où ils arrivent ; celui-ci les capture EN DIRECT,
        # depuis l'intérieur du tour.
        received.append(event)

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, emit=emit
    )

    assert reply == "Bonjour, voici mon conseil."
    assert actions == []
    deltas = [e for e in received if e["type"] == "delta"]
    # AU MOINS deux fragments distincts (jamais un seul paquet renommé
    # "delta") : c'est ce qui distingue une VRAIE diffusion d'un buffer qui
    # se ferait passer pour un flux.
    assert len(deltas) >= 2, f"un seul fragment ne prouve rien : {deltas}"
    assert "".join(d["text"] for d in deltas) == reply


@pytest.mark.asyncio
async def test_a_tool_call_emits_a_step_before_it_is_recorded_in_actions(monkeypatch):
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]})]),
            _resp("end_turn", [_text("Attaque le compte A en premier.")]),
        ],
    )
    order: list[str] = []

    async def fake_tool(_name, _input, **_kwargs):
        order.append("tool_executed")
        return {"recommendation": "A"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", fake_tool)

    async def emit(event: dict) -> None:
        if event["type"] == "step":
            order.append(f"step:{event['label']}")

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, emit=emit
    )

    assert reply == "Attaque le compte A en premier."
    assert actions[0]["tool"] == "compare_accounts"
    # Le step ARRIVE avant l'exécution — jamais un « c'est fait » déguisé en
    # « je m'y mets ». Le libellé nomme la CAPACITÉ, jamais l'outil brut.
    assert order == ["step:Comparaison de tes comptes…", "tool_executed"]


@pytest.mark.asyncio
async def test_an_emitter_that_never_streams_is_byte_identical(monkeypatch):
    """`emit=None` (le défaut) doit rendre EXACTEMENT ce que rendait ce même
    scénario avant ce lot — c'est la garantie de repli : un appelant qui ne
    diffuse pas ne voit STRICTEMENT rien changer."""
    _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour, voici mon conseil.")])])

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Bonjour, voici mon conseil."
    assert actions == []


@pytest.mark.asyncio
async def test_a_broken_stream_propagates_instead_of_hanging_or_swallowing(monkeypatch):
    """Garde GA-308 — le repli : un flux qui casse EN COURS (pas un timeout SDK
    nommé — une vraie coupure réseau) ne doit ni pendre ni rendre une réponse
    inventée. Il remonte, exactement comme le faisait une exception `.create()`
    avant ce lot — c'est `chat.py` qui la transforme en réponse honnête (couvert côté
    routeur par `test_chat.py`)."""

    class _BrokenStream:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            yield SimpleNamespace(type="text", text="Je co")
            raise ConnectionError("connexion perdue en plein flux")

        async def get_final_message(self):  # pragma: no cover - jamais atteint
            raise AssertionError("ne doit pas être appelé après une coupure")

    class _BrokenMessages:
        def stream(self, **_kwargs):
            return _BrokenStream()

    monkeypatch.setattr(
        chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: SimpleNamespace(messages=_BrokenMessages())
    )

    with pytest.raises(ConnectionError):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)


# ── #1923 — une ambiguïté produit UNE question, jamais un BLOCAGE ─────────────
#
# `_ONE_HYPOTHESIS` (`laura_role_and_voice.py`) demande depuis #1923.2-.5 que
# Laura annonce l'hypothèse qu'elle prend par défaut AVANT de demander une
# précision (« Je pars sur Lyon. Tu peux corriger. »). Le prompt le demandait,
# le modèle l'écrivait — et l'orchestrateur le JETAIT : le chemin d'arrêt d'une
# clarification renvoyait la QUESTION SEULE comme texte de réponse
# (`_run_tool_round` : `return actions, results, (str(output.get("question")…`).
# Résultat à l'écran : une question nue, aucune hypothèse, rien de commencé —
# le blocage exact que #1923 voulait retirer. C'est le défaut n°1 du dépôt
# (« du code juste que personne n'appelle »), pris par l'autre bout : une
# consigne juste dont la sortie était effacée en aval.
#
# La question, elle, n'est pas perdue : elle part dans la CARTE
# (`actions[…]["clarification"]`, lue par `chat.py` → `context["clarification"]`)
# avec ses options cliquables. La répéter dans le texte l'écrirait deux fois.


@pytest.mark.asyncio
async def test_clarification_keeps_the_hypothesis_laura_already_announced(monkeypatch):
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _text("Je pars sur Lyon et un démarrage sous 30 jours. Tu peux corriger."),
                    _tool_use(
                        "ask_clarification",
                        {"question": "Sur quel territoire ?", "options": ["Lyon", "Toute la France"]},
                    ),
                ],
            )
        ],
    )

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Je pars sur Lyon et un démarrage sous 30 jours. Tu peux corriger."
    assert len(actions) == 1
    assert actions[0]["status"] == "clarification"
    # La question reste portée par la carte, avec ses options cliquables.
    assert actions[0]["clarification"] == {
        "question": "Sur quel territoire ?",
        "options": ["Lyon", "Toute la France"],
    }


@pytest.mark.asyncio
async def test_clarification_without_text_still_answers_with_the_question(monkeypatch):
    """Le témoin du cas voisin LÉGITIME : sans texte du modèle, la question
    reste la réponse — le comportement d'avant, à l'octet. Une réponse vide
    serait un tour sans issue (`_record_turn_outcome`)."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [_tool_use("ask_clarification", {"question": "Quel territoire ?", "options": ["Lyon", "Paris"]})],
            )
        ],
    )

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Quel territoire ?"
    assert actions[0]["status"] == "clarification"


# ── #2269.14 / #2269.15 / #2269.16 — une demande trop large livre une TRANCHE ─
#
# Deux chemins forcent une réponse SANS que le modèle ait fini : le budget de
# TEMPS (`out_of_time`) et l'épuisement de `_MAX_TOOL_ROUNDS` alors qu'un appel
# d'outil restait en attente. Avant ce lot, seul le premier recevait une note —
# le second forçait une réponse muette sur la coupe, exactement le symptôme
# mesuré absent le 17/09 (aucune tranche annoncée, aucune couverture dite,
# aucune proposition de continuer). Les deux chemins doivent porter la MÊME
# consigne : retire `_PARTIAL_TRANCHE_NOTE` de la boucle et ces deux tests
# rougissent.


def _note_reached_the_model(messages: list[dict], note: str) -> bool:
    """`_append_user_note` ouvre soit un tour `user` neuf (``content`` = la
    note, une simple chaîne — le cas d'un tour sans AUCUN round d'outil),
    soit rejoint le dernier tour `user` déjà en liste de blocs (après un
    round). Les deux formes sont légitimes ; le test lit les deux."""
    for message in messages:
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str) and note in content:
            return True
        if isinstance(content, list) and any(
            isinstance(block, dict) and note in block.get("text", "") for block in content
        ):
            return True
    return False


@pytest.mark.asyncio
async def test_rounds_exhausted_with_pending_tool_calls_notes_a_partial_tranche(monkeypatch):
    """Deux rounds d'outils (le plafond `_MAX_TOOL_ROUNDS`) qui n'aboutissent
    JAMAIS à une réponse texte — la demande dépasse ce qu'un tour peut couvrir,
    sans qu'aucun budget de TEMPS ne soit en cause. Le tour final forcé doit
    porter la consigne de tranche, pour que le modèle ne présente pas ce
    sous-ensemble comme un tout."""
    assert chat_orchestrator._MAX_TOOL_ROUNDS == 2, "le scénario suppose deux rounds d'outils"
    fake = _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]}, "toolu_1")]),
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["c", "d"]}, "toolu_2")]),
            _resp("end_turn", [_text("Voici les 8 premiers comptes lus, sur un total inconnu.")]),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"recommendation": "A"}))

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Voici les 8 premiers comptes lus, sur un total inconnu."
    assert len(actions) == 2
    # Le tour final (3e appel) est celui qui doit porter la consigne de tranche.
    final_messages = fake.messages.calls[-1]["messages"]
    # R22-LG — un geste simple : rien ne continue derrière lui, la consigne de livraison (jamais
    # « je poursuis », jamais un sous-ensemble présenté comme un tout) remplace celle de tranche.
    assert _note_reached_the_model(final_messages, chat_orchestrator._FINAL_DELIVERY_NOTE), (
        "le tour final doit porter la consigne de livraison"
    )


@pytest.mark.asyncio
async def test_rounds_exhausted_still_offers_reply_options(monkeypatch):
    """#2679 — recette prod du 23/09 (sha servi ed9d0881e) : « Prépare-moi un
    message pour relancer » épuisait ses deux rounds sur du travail réel
    (retrouver le contact, lire son historique) puis demandait son canal
    (mail, LinkedIn, téléphone) au tour final — celui qui passait `tools=None`.
    Le modèle ne pouvait alors PLUS appeler `offer_reply_options`, quelle que
    soit la consigne du prompt : l'outil n'était même plus sur la table. La
    précision revenait en texte nu, sans aucun bouton.

    Le tour final continue de refuser tout AUTRE outil (aucune recherche, aucune
    écriture de plus) : lui seul, silencieux et gratuit, doit y survivre."""
    assert chat_orchestrator._MAX_TOOL_ROUNDS == 2, "le scénario suppose deux rounds d'outils"
    fake = _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]}, "toolu_1")]),
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["c", "d"]}, "toolu_2")]),
            _resp(
                "tool_use",
                [
                    _text("Je prépare le message. Sur quel canal ?"),
                    _tool_use(
                        "offer_reply_options",
                        {
                            "precisions": [
                                {
                                    "question": "Sur quel canal ?",
                                    "options": ["E-mail", "LinkedIn", "Téléphone"],
                                }
                            ]
                        },
                        "toolu_3",
                    ),
                ],
            ),
        ],
    )

    async def fake_execute_chat_tool(name: str, tool_input: dict, **_kwargs) -> dict:
        # `offer_reply_options` est pur et déterministe (aucune dépendance
        # externe) : on le laisse tourner pour de vrai, seuls les outils de
        # travail (`compare_accounts`) restent bouchonnés.
        if name == "offer_reply_options":
            return await execute_chat_tool(name, tool_input, user_id="u1", profile_data=None)
        return {"recommendation": "A"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(side_effect=fake_execute_chat_tool))

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Je prépare le message. Sur quel canal ?"
    reply_option_entries = [action for action in actions if action.get("reply_options")]
    assert reply_option_entries, "la précision du tour final doit produire des reply_options"
    assert reply_option_entries[0]["reply_options"] == [
        {"question": "Sur quel canal ?", "options": ["E-mail", "LinkedIn", "Téléphone"]}
    ]
    # Le tour final n'offre QUE `offer_reply_options` — aucun autre outil de
    # travail ne doit y revenir, sinon la garantie de `_PARTIAL_TRANCHE_NOTE`
    # (« tu n'as plus de tour d'outil ») serait fausse.
    final_call_tools = fake.messages.calls[-1]["tools"]
    assert [tool["name"] for tool in final_call_tools] == ["offer_reply_options"]


@pytest.mark.asyncio
async def test_rounds_exhausted_with_a_final_answer_is_not_an_error(monkeypatch, caplog):
    """BELLUM-IA-9 — les `_MAX_TOOL_ROUNDS` épuisés, le tour final SANS outil de
    travail rend un texte à partir des résultats déjà lus : l'utilisateur a sa
    réponse, ce n'est plus un défaut. Un `warning` (jamais un `logger.error`,
    donc jamais Sentry) garde le fait observable."""
    assert chat_orchestrator._MAX_TOOL_ROUNDS == 2, "le scénario suppose deux rounds d'outils"
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]}, "toolu_1")]),
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["c", "d"]}, "toolu_2")]),
            _resp("end_turn", [_text("Voici les 8 premiers comptes lus, sur un total inconnu.")]),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"recommendation": "A"}))

    with caplog.at_level("WARNING", logger="app.services.chat_orchestrator"):
        reply, _actions = await chat_orchestrator.run_chat_with_tools(
            "sys", "user", user_id="u1", profile_data=None
        )

    assert reply.startswith("Voici les 8 premiers comptes")
    loop_records = [r for r in caplog.records if "Boucle outil" in r.getMessage()]
    assert len(loop_records) == 1, "un round exhaustif doit le dire EXACTEMENT une fois, pas par round"
    assert loop_records[0].levelname == "WARNING"


@pytest.mark.asyncio
async def test_rounds_exhausted_without_any_final_text_alerts_a_tool_loop(monkeypatch, caplog):
    """#2442.15 / BELLUM-IA-9 — l'épuisement des `_MAX_TOOL_ROUNDS` ET un tour
    final qui ne rend AUCUN texte : l'utilisateur ne reçoit rien. C'est le seul
    cas qui reste un défaut (`logger.error`, même chemin de capture Sentry que
    `_record_turn_outcome`, jamais `capture_exception` en direct)."""
    assert chat_orchestrator._MAX_TOOL_ROUNDS == 2, "le scénario suppose deux rounds d'outils"
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]}, "toolu_1")]),
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["c", "d"]}, "toolu_2")]),
            _resp("end_turn", []),
            _resp("end_turn", []),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"recommendation": "A"}))

    with caplog.at_level("WARNING", logger="app.services.chat_orchestrator"):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    errors = [r for r in caplog.records if "Boucle outil" in r.getMessage() and r.levelname == "ERROR"]
    assert len(errors) == 1


@pytest.mark.asyncio
async def test_rounds_exhausted_empty_final_is_retried_once_before_any_error(monkeypatch, caplog):
    """#4453 / BELLUM-IA-9 — le tour final forcé rend UN texte vide (le modèle n'appelle que l'outil de
    pistes, ou s'arrête net) : on redemande UNE fois la rédaction, avec la consigne existante
    (`_EMPTY_AFTER_TOOLS_NOTE`). Une réponse arrive ⇒ aucun `logger.error`, donc aucun événement Sentry."""
    fake = _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["a", "b"]}, "toolu_1")]),
            _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": ["c", "d"]}, "toolu_2")]),
            _resp("end_turn", []),
            _resp("end_turn", [_text("Voici ce que j'ai lu sur les quatre comptes.")]),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"recommendation": "A"}))

    with caplog.at_level("WARNING", logger="app.services.chat_orchestrator"):
        reply, _actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Voici ce que j'ai lu sur les quatre comptes."
    assert len(fake.messages.calls) == 4
    assert not [r for r in caplog.records if r.levelname == "ERROR"]


@pytest.mark.asyncio
async def test_out_of_time_does_not_alert_a_tool_loop(monkeypatch, caplog):
    """L'autre chemin vers la même tranche partielle — le budget de TEMPS,
    zéro round consommé — n'est PAS une boucle outil : le modèle n'a même pas
    eu l'occasion d'appeler un outil. Confondre les deux ferait sonner
    l'alerte sur un budget serré, pas sur un modèle qui boucle."""
    _install_client(monkeypatch, [_resp("end_turn", [_text("Voici ce que j'ai déjà.")])])
    monkeypatch.setattr(chat_orchestrator, "_turn_budget_s", lambda: 0.0)

    with caplog.at_level("ERROR", logger="app.services.chat_orchestrator"):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert not any("Boucle outil" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_out_of_time_also_notes_a_partial_tranche(monkeypatch):
    """L'autre chemin vers le même symptôme : le budget de TEMPS manque avant
    même un premier round. La même consigne de tranche doit s'appliquer — ce
    n'est pas réservé à l'épuisement des rounds."""
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Voici ce que j'ai déjà.")])])
    monkeypatch.setattr(chat_orchestrator, "_turn_budget_s", lambda: 0.0)

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Voici ce que j'ai déjà."
    assert actions == []
    final_messages = fake.messages.calls[-1]["messages"]
    # R22-LG — sans suite de fond (geste simple), la consigne de livraison, pas « je poursuis ».
    assert _note_reached_the_model(final_messages, chat_orchestrator._FINAL_DELIVERY_NOTE), (
        "un tour à court de temps doit aussi porter la consigne de livraison"
    )


# #2146.9 (via #2898) — le routeur (`laura_router.decide_action`) lance
# LAUNCH_JOB dès que le palier (#2248) mesure une demande qui suppose
# plusieurs recherches croisées (analyse de compte, plan à plusieurs étapes,
# familles d'outils lourds) : le prompt système porte alors la même sorte de
# consigne que « CAPACITÉS ABSENTES » pour EXPLAIN_LIMIT — la décision a un
# APPELANT réel, pas seulement une valeur calculée que personne ne lit.
@pytest.mark.asyncio
async def test_a_multi_step_plan_request_gets_the_launch_job_prompt_hint(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Voici le plan.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        tier_request="fais-moi un plan d'action sur 90 jours pour le groupe Thales",
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "PLUSIEURS RECHERCHES CROISÉES" in system_sent


@pytest.mark.asyncio
async def test_an_ordinary_request_gets_no_launch_job_prompt_hint(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, tier_request="ouvre la fiche Airbus"
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "PLUSIEURS RECHERCHES CROISÉES" not in system_sent


# #3708.2 — recette prod 08/10 : avec le CRM EXCLU pour ce fil (« Outils et
# sources »), le bloc EXPLAIN_LIMIT ci-dessus nommait quand même « crm » comme
# une capacité ABSENTE — contredisant `excluded_sources_block`, qui dit la
# vraie raison (un choix, pas une déconnexion). Le modèle suivait le message
# le plus bas dans le prompt (« capacité absente… ») et répondait « ton CRM
# n'est pas disponible… rétablir l'accès depuis Intégrations » au lieu de
# « source exclue pour ce fil ».
@pytest.mark.asyncio
async def test_an_excluded_family_is_never_named_as_a_missing_capability(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Je ne peux pas consulter ton CRM ce tour.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        # Le CRM a déjà été retiré de `connected_families` par
        # `ChatRequest._apply_excluded_families` — c'est l'état que
        # l'orchestrateur reçoit réellement. `email`/`calendar` restent
        # branchés : seul le CRM manque, et seulement par exclusion.
        connected_families=["email", "calendar"],
        excluded_families=["crm"],
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "CAPACITÉS ABSENTES" not in system_sent


@pytest.mark.asyncio
async def test_a_genuinely_missing_capability_still_gets_named(monkeypatch):
    """Une famille jamais branchée (pas exclue) reste nommée « absente »."""
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Je ne peux pas lire ta messagerie.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, connected_families=["crm"]
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "CAPACITÉS ABSENTES" in system_sent
    assert "email" in system_sent


@pytest.mark.asyncio
async def test_excluded_and_genuinely_missing_capabilities_are_separated(monkeypatch):
    """CRM exclu (choix) + messagerie jamais branchée (absence réelle) dans le
    même tour : seule la messagerie entre dans le bloc « capacités absentes »."""
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Voici ce que je peux faire.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        connected_families=[],
        excluded_families=["crm"],
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "CAPACITÉS ABSENTES" in system_sent
    assert "crm" not in system_sent.split("CAPACITÉS ABSENTES")[1].split(".")[0]
    assert "email" in system_sent


# #214.6 (épopée #3229) — LA MÊME branche LAUNCH_JOB porte aussi la consigne
# de la demande TROP LARGE (LAU-FINAL-214) : les meilleurs vérifiés, le reste
# en job, la couverture par palier, jamais un mot absolu non justifié.
@pytest.mark.asyncio
async def test_a_multi_step_plan_request_also_gets_the_broad_request_hint(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Voici le plan.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        tier_request="fais-moi un plan d'action sur 90 jours pour le groupe Thales",
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "POPULATION LARGE" in system_sent
    assert "MEILLEURS résultats VÉRIFIÉS" in system_sent


@pytest.mark.asyncio
async def test_the_broad_request_hint_follows_the_interface_language(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Here is the plan.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        tier_request="fais-moi un plan d'action sur 90 jours pour le groupe Thales",
        interface_language="en",
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "LARGE POPULATION" in system_sent
    assert "POPULATION LARGE" not in system_sent


# #2146.10 (via #2898) — le routeur lance OPEN_SURFACE dès que le palier
# (#2248) mesure une demande VOLUMINEUSE (longue, à plusieurs questions, ou en
# liste de plusieurs volets) plutôt qu'une recherche croisée — `OPEN_SURFACE`
# gagne enfin un consommateur réel dans `chat_orchestrator.py` (avant ce lot,
# `routing.action == OPEN_SURFACE` n'était lu nulle part ici).
@pytest.mark.asyncio
async def test_a_long_request_gets_the_open_surface_prompt_hint(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Voici.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        tier_request="?".join(["question"] * 4),
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "INSPECTION VOLUMINEUSE" in system_sent
    assert "propose_guided_action" in system_sent


@pytest.mark.asyncio
async def test_an_ordinary_request_gets_no_open_surface_prompt_hint(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour.")])])

    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, tier_request="ouvre la fiche Airbus"
    )

    system_sent = str(fake.messages.calls[0]["system"])
    assert "INSPECTION VOLUMINEUSE" not in system_sent


# #2146.13 (via #2898) — la garde de contenu (`chat_content_guards.
# violates_manual_navigation_instruction`) tourne réellement sur CHAQUE
# réponse, câblée dans `_record_turn_outcome` : le SEUL point par lequel
# toute réponse de Laura passe. Preuve par CASSURE : un modèle fictif qui
# répondrait avec la phrase fautive de #2146 doit être JOURNALISÉ.
@pytest.mark.asyncio
async def test_a_manual_navigation_reply_is_logged_as_a_violation(monkeypatch, caplog):
    _install_client(
        monkeypatch,
        [_resp("end_turn", [_text("Va dans Comptes, puis Découvrir, puis sélectionne Thales.")])],
    )

    with caplog.at_level("ERROR", logger="app.services.chat_orchestrator"):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert any("navigation manuelle" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_an_ordinary_reply_is_not_logged_as_a_navigation_violation(monkeypatch, caplog):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Voici le compte Thales.")])])

    with caplog.at_level("ERROR", logger="app.services.chat_orchestrator"):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert not any("navigation manuelle" in r.getMessage() for r in caplog.records)


# #3190 (LAU-FINAL-196) — le PRE-RESPONSE COMMERCIAL VERIFIER tourne
# RÉELLEMENT au point où `run_chat_with_tools` rend sa réponse finale (même
# preuve que le test de #2146.13 ci-dessus : un texte fautif fabriqué, pas
# seulement l'absence de faute sur un texte déjà correct).
@pytest.mark.asyncio
async def test_a_template_style_reply_is_logged_by_the_commercial_verifier(monkeypatch, caplog):
    _install_client(
        monkeypatch,
        [_resp("end_turn", [_text("Voici une analyse exhaustive du compte Thales.")])],
    )

    with caplog.at_level("WARNING", logger="app.services.chat_orchestrator"):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert any("commercial verifier" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_an_ordinary_reply_is_not_logged_by_the_commercial_verifier(monkeypatch, caplog):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Voici le compte Thales.")])])

    with caplog.at_level("WARNING", logger="app.services.chat_orchestrator"):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert not any("commercial verifier" in r.getMessage() for r in caplog.records)


# #2276.37 — la profondeur de raisonnement suit le palier choisi par demande
# (#2248, `chat_model_routing.choose_chat_tier`) au lieu d'un réglage global
# unique. Le palier RAPIDE garde le défaut d'avant (`low`) : aucune demande
# déjà classée `fast` ne change de comportement. Le palier PROFOND lève
# l'effort à `medium`. Un réglage opérateur explicite (`CHAT_REASONING_EFFORT`,
# y compris `off`) reste prioritaire dans les deux cas — c'est le disjoncteur
# documenté ("réglable à chaud"), pas un second classifieur.
#
# ⚠️ #4016 L7 (décision Louis 11/10/2026) — le défaut passe de `low` à
# `medium` : sans réglage opérateur, aucune demande ne raisonne plus en `low`.
# Le palier profond reste à `medium` (le monter à `high` serait un réglage à
# mesurer contre `CHAT_TURN_BUDGET_S`, pas une décision prise ici).
def test_reasoning_kwargs_without_tier_defaults_to_medium(monkeypatch):
    monkeypatch.delenv("CHAT_REASONING_EFFORT", raising=False)
    assert chat_orchestrator._reasoning_kwargs() == {"reasoning": {"effort": "medium"}}


def test_reasoning_kwargs_fast_tier_defaults_to_medium(monkeypatch):
    monkeypatch.delenv("CHAT_REASONING_EFFORT", raising=False)
    assert chat_orchestrator._reasoning_kwargs("fast") == {"reasoning": {"effort": "medium"}}


def test_reasoning_kwargs_operator_can_still_lower_to_low(monkeypatch):
    monkeypatch.setenv("CHAT_REASONING_EFFORT", "low")
    assert chat_orchestrator._reasoning_kwargs("fast") == {"reasoning": {"effort": "low"}}


def test_reasoning_kwargs_deep_tier_raises_effort_to_medium(monkeypatch):
    monkeypatch.delenv("CHAT_REASONING_EFFORT", raising=False)
    assert chat_orchestrator._reasoning_kwargs("deep") == {"reasoning": {"effort": "medium"}}


def test_reasoning_kwargs_operator_override_wins_over_deep_tier(monkeypatch):
    monkeypatch.setenv("CHAT_REASONING_EFFORT", "high")
    assert chat_orchestrator._reasoning_kwargs("deep") == {"reasoning": {"effort": "high"}}


def test_reasoning_kwargs_off_disables_regardless_of_tier(monkeypatch):
    monkeypatch.setenv("CHAT_REASONING_EFFORT", "off")
    assert chat_orchestrator._reasoning_kwargs("deep") == {}


def test_make_turns_threads_the_chosen_tier_into_the_openai_transport(monkeypatch):
    """#2276.37 — le palier résolu par `resolve_chat_route` (#2248) doit
    atteindre le transport OpenAI, seul à porter `reasoning`. Sans ça, la
    demande était bien classée `deep` (#2248) mais l'effort restait figé.

    Le palier lui-même est monkeypatché (pas le routage réel par variables
    d'env) : ce test vérifie le FIL entre la décision et le transport, pas la
    classification, déjà couverte par `tests/test_chat_model_routing.py`."""
    from app.services.chat_model_routing import ChatRoute, ChatTierDecision

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(
        chat_orchestrator,
        "resolve_chat_route",
        lambda *_a, **_k: ChatRoute("chat_deep", "bellum_chat_deep", ChatTierDecision("deep", "explicit_depth")),
    )
    monkeypatch.setattr(
        chat_orchestrator.llm_gateway,
        "resolve_dispatch",
        lambda *_a, **_k: (SimpleNamespace(name=chat_orchestrator.PROVIDER_OPENAI), "gpt-5-test"),
    )
    transport = chat_orchestrator._make_turns(
        system_prompt="sys",
        max_tokens=100,
        tier_request="explique-moi ça en profondeur",
        tier_context=None,
    )
    assert isinstance(transport, chat_orchestrator._OpenAITurns)
    assert transport._tier == "deep"


@pytest.mark.asyncio
async def test_empty_end_turn_after_failed_tools_forces_a_written_answer(monkeypatch, caplog):
    """BELLUM-IA-M — « Tour de copilote SANS ISSUE (… 2 outil(s) appelé(s)) ». BELLUM-IA-9 ne couvre PAS ce
    chemin : il ne change que le journal de l'ÉPUISEMENT des rounds. Ici le modèle appelle ses outils (en
    échec : aucun statut productif), puis TERMINE son tour sans écrire un mot — la sortie naturelle rendait
    une réponse vide, donc `no_outcome`. Le correctif : un texte vide après des outils n'est pas une fin, il
    est renvoyé au tour final sans outil de travail, qui force la rédaction."""
    fake = _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use("compare_accounts", {"account_ids": ["a"]}, "toolu_1"),
                    _tool_use("compare_accounts", {"account_ids": ["b"]}, "toolu_2"),
                ],
            ),
            _resp("end_turn", []),
            _resp("end_turn", [_text("Les deux lectures ont échoué : je n'ai rien à te rapporter.")]),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(side_effect=RuntimeError("source KO")))

    with caplog.at_level("WARNING", logger="app.services.chat_orchestrator"):
        reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Les deux lectures ont échoué : je n'ai rien à te rapporter."
    assert len(actions) == 2
    assert len(fake.messages.calls) == 3, "un tour final de rédaction doit suivre la fin vide"
    assert [tool["name"] for tool in fake.messages.calls[-1]["tools"]] == ["offer_reply_options"]
    assert not [r for r in caplog.records if r.levelname == "ERROR"], "une réponse a été rédigée : aucun SANS ISSUE"
