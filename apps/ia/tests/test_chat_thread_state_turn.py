"""#1927 — l'état du fil TRAVERSE le tour : API → IA → prompt, et IA → API.

⚠️ pydantic ignore les clés inconnues à l'entrée : un champ ajouté au corps
sans être déclaré au modèle arrive « envoyé » et n'est jamais lu. Ces tests
prouvent le trajet complet, sur le vrai routeur et la vraie boucle d'outils :

* 1927.7 — le test du retour : un 2e tour « seulement à Paris » GARDE les
  critères du 1er, en passant par le fil (état sérialisé puis relu) ;
* 1927.8 — l'état part dans le prompt, dans le segment VOLATIL (jamais mis en
  cache) ;
* 1927.6 — une question déjà posée dans le fil retire l'outil de clarification,
  sans dépendre du drapeau envoyé par le navigateur ;
* sans état : comportement byte-identique (même prompt, aucune clé ajoutée à
  la réponse, mêmes actions).
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.models.chat import ChatRequest
from app.prompts.thread_state import THREAD_STATE_HEADER
from app.services import chat_orchestrator
from app.services.chat_thread_state import ThreadStateCollector, thread_state_from_wire
from app.services.claude_service import CACHE_SEGMENT_BREAK

# #2224 — l'instant FIGÉ des deux appels ci-dessous. `current_time_block()`
# (app/prompts/current_time.py) lit l'horloge RÉELLE quand aucun `now` n'est
# fourni — exactement le chemin que `chat.py` emprunte en production. Le test
# `..._are_unchanged` compare deux prompts système octet pour octet entre deux
# appels HTTP successifs : sans ce gel, une seconde qui s'écoule entre les
# deux (probable sous charge CI) fait diverger le bloc « DATE ET HEURE
# COURANTES » — pas l'état du fil — et le test devient FLAKY plutôt que rouge
# pour la bonne raison. Même geste déjà posé dans
# `test_chat_reminder_from_a_name.py::FROZEN_NOW`.
_FROZEN_NOW = datetime(2026, 9, 14, 12, 34, 56, tzinfo=timezone(timedelta(hours=2)))

_FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "thread_state_wire.json").read_text(encoding="utf-8"))
# L'EN-TÊTE réel du bloc, et non « ÉTAT DU FIL » tout court : les CONSIGNES du
# segment invariant nomment ce bloc, et une garde qui chercherait le seul nom
# confondrait la consigne avec la donnée.
_HEADER = THREAD_STATE_HEADER


# ── La fausse boucle Anthropic (même motif que test_chat_orchestrator.py) ────


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
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        # Copie des messages au moment de l'appel : la boucle les étend ensuite.
        self.calls.append({**kwargs, "messages": json.loads(json.dumps(kwargs["messages"], default=str))})
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str = "toolu_1") -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=None)


@pytest.fixture
def _loop(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())

    def install(responses) -> _FakeClient:
        fake = _FakeClient(responses)
        monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
        return fake

    return install


def _tool_results(call: dict) -> list[dict]:
    # LOT (15/10) DATA-C — la coupure de cache 1 h se pose sur le DERNIER bloc
    # envoyé (résultat d'outil ou note) : c'est une marque de transport, pas du
    # contenu — on la retire avant de comparer.
    return [
        {key: value for key, value in block.items() if key != "cache_control"}
        for block in call["messages"][-1]["content"]
        if block.get("type") == "tool_result"
    ]


# ── 1927.7 — le test du retour, à travers le fil ─────────────────────────────


@pytest.mark.asyncio
async def test_a_second_turn_that_refines_keeps_the_criteria_of_the_first(_loop):
    # Tour 1 : « trouve-moi des ETI industrielles en Haute-Garonne ».
    _loop(
        [
            _resp("tool_use", [_tool_use("find_accounts", {"sectors": ["industry"], "department": "31", "headcount": "250-999"})]),
            _resp("end_turn", [_text("Recherche préparée.")]),
        ]
    )
    first = ThreadStateCollector()
    await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None, thread=first)
    wire = json.loads(json.dumps(first.state.to_wire()))  # ce que l'API stocke puis renvoie

    # Tour 2 : « seulement à Paris » — le modèle n'envoie QUE ce qui change.
    fake = _loop(
        [
            _resp("tool_use", [_tool_use("find_accounts", {"refine": True, "department": "75"})]),
            _resp("end_turn", [_text("Recherche affinée.")]),
        ]
    )
    second = ThreadStateCollector(thread_state_from_wire(wire))
    _reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=second
    )

    assert actions[0]["proposal"] == {
        "action": "find_accounts",
        "cost_credits": 0,
        "sectors": ["industry"],
        "department": "75",
        "headcount": "250-999",
    }
    # Le modèle APPREND ce qui a été gardé : sinon il annoncerait une recherche
    # « à Paris » sans dire qu'elle reste industrielle et de taille ETI.
    # #1956.3/.7/.8/.15 — le contenu voyage désormais fencé (`_tool_payload`,
    # `chat_orchestrator.py`) : on retire la balise structurelle avant de lire
    # le JSON, on ne teste pas le fence ici (voir `test_chat_tool_result_fencing.py`).
    fenced_content = _tool_results(fake.messages.calls[1])[0]["content"]
    payload = json.loads(fenced_content.removeprefix("<tool_result_data>\n").removesuffix("\n</tool_result_data>"))
    assert payload["refinement"]["previous_found"] is True
    assert payload["refinement"]["kept"] == {"sectors": ["industry"], "headcount": "250-999"}
    assert second.state.to_wire()["searches"][0]["criteria"]["department"] == "75"


@pytest.mark.asyncio
async def test_a_refine_in_a_later_round_of_the_same_turn_sees_the_earlier_round(_loop):
    _loop(
        [
            _resp("tool_use", [_tool_use("find_accounts", {"sectors": ["finance"], "department": "69"})]),
            _resp("tool_use", [_tool_use("find_accounts", {"refine": True, "signals": ["hiring"]}, "toolu_2")]),
            _resp("end_turn", [_text("ok")]),
        ]
    )
    thread = ThreadStateCollector()
    _reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None, thread=thread)
    assert actions[1]["proposal"]["sectors"] == ["finance"]
    assert actions[1]["proposal"]["department"] == "69"
    assert actions[1]["proposal"]["signals"] == ["hiring"]


@pytest.mark.asyncio
async def test_a_round_that_resolves_an_account_reports_a_positive_marginal_gain(_loop, monkeypatch):
    """#189.7 (épopée #3218, lot E3 28/09 suite) — `deepening_gain.
    record_round_gain` est appelé pour de vrai depuis la boucle d'outils
    RÉELLE (`chat_orchestrator.run_chat_with_tools`), avec le gain RÉEL du
    round (un compte nouvellement résolu ici, via `thread.state`), jamais une
    valeur inventée pour ce test. Aucun round n'est arrêté par cette mesure :
    la boucle va à son terme normal (`end_turn`), inchangée."""
    _loop(
        [
            _resp("tool_use", [_tool_use("get_account_briefing", {"account_id": "a1"})]),
            _resp("end_turn", [_text("Voici TF1.")]),
        ]
    )

    async def _fake_execute(name, _tool_input, **_kwargs):
        assert name == "get_account_briefing"
        return {"account_id": "a1", "company_name": "TF1"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_execute)

    recorded: list[tuple[int, int]] = []
    monkeypatch.setattr(
        chat_orchestrator,
        "record_round_gain",
        lambda *, round_index, gain: recorded.append((round_index, gain)),
    )

    thread = ThreadStateCollector()
    await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None, thread=thread)

    # UN round, UNE entité neuve (le compte a1) : gain = 1, jamais deviné.
    assert recorded == [(0, 1)]
    assert thread.state.objects[0].id == "a1"


@pytest.mark.asyncio
async def test_a_productive_round_announces_the_next_deepening_pass(_loop, monkeypatch):
    """#189.1 (épopée #3218, lot E1 30/09) — le moteur d'approfondissement est
    appelé par la VRAIE boucle : un round qui a résolu un compte (gain > 0)
    fait annoncer PASS 1 au modèle (note dans le message du round suivant) ET à
    l'écran (événement `step`), sans aucun geste de l'utilisateur."""
    fake = _loop(
        [
            _resp("tool_use", [_tool_use("get_account_briefing", {"account_id": "a1"})]),
            _resp("end_turn", [_text("Voici TF1.")]),
        ]
    )

    async def _fake_execute(name, _tool_input, **_kwargs):
        return {"account_id": "a1", "company_name": "TF1"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_execute)
    events: list[dict] = []

    async def _emit(event):
        events.append(event)

    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=ThreadStateCollector(), emit=_emit
    )
    assert "Approfondissement — vérification ciblée" in [e.get("label") for e in events if e["type"] == "step"]
    assert "PASS 1" in json.dumps(fake.messages.calls[1]["messages"], ensure_ascii=False)


@pytest.mark.asyncio
async def test_a_sterile_round_stops_the_deepening_on_marginal_gain(_loop, monkeypatch):
    """#189.7 — un round qui n'apporte RIEN (gain 0) n'est pas suivi d'un
    autre : le tour passe à la réponse finale SANS outils, budget de temps
    intact. Le critère sait aussi dire NON (test précédent : gain > 0 continue)."""
    fake = _loop(
        [
            _resp("tool_use", [_tool_use("get_account_briefing", {"account_id": "a1"})]),
            _resp("tool_use", [_tool_use("get_account_briefing", {"account_id": "a2"}, "toolu_2")]),
            _resp("end_turn", [_text("Rien de neuf.")]),
        ]
    )

    async def _fake_execute(name, _tool_input, **_kwargs):
        return {"note": "rien"}  # aucune entité, décision ni piste

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_execute)
    reply, _actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=ThreadStateCollector()
    )
    # Round 1 (outil) puis arrêt : l'appel 2 est le tour final, sans outils.
    assert len(fake.messages.calls) == 2
    final_tools = {t["name"] for t in fake.messages.calls[1].get("tools") or []}
    assert "get_account_briefing" not in final_tools  # plus d'outil DE TRAVAIL


@pytest.mark.asyncio
async def test_resolving_an_account_by_name_does_not_stop_the_turn_before_reading_it(_loop, monkeypatch):
    """Recette prod 07/10 (fix/demo-0810-r2b-laura), cid 59870f89 — « Quels
    signaux commerciaux récents chez Arquus ? » : round 0 =
    `search_workspace_accounts` (seul appel interne journalisé côté API), puis
    « approfondissement arrêté (marginal_gain) » — `cited_objects` ignore cet
    outil, gain 0, la lecture des signaux n'a JAMAIS eu lieu et Laura a dit ne
    pas avoir pu lire la fiche. Une lecture neuve qui rend des données est un
    apport : le round suivant (les signaux) doit partir."""
    fake = _loop(
        [
            _resp("tool_use", [_tool_use("search_workspace_accounts", {"query": "Arquus"})]),
            _resp("tool_use", [_tool_use("get_account_signals", {"account_id": "3d58"}, "toolu_2")]),
            _resp("end_turn", [_text("Trois signaux du jour.")]),
        ]
    )
    executed: list[str] = []

    async def _fake_execute(name, _tool_input, **_kwargs):
        executed.append(name)
        if name == "search_workspace_accounts":
            return {"accounts": [{"id": "3d58", "name": "Arquus"}], "count": 1}
        return {"signals": [{"type": "actualite_commerciale", "date": "2026-10-07"}]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_execute)
    reply, _actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=ThreadStateCollector()
    )
    assert executed == ["search_workspace_accounts", "get_account_signals"]
    assert len(fake.messages.calls) == 3
    assert reply == "Trois signaux du jour."


@pytest.mark.asyncio
async def test_resolving_uneo_does_not_stop_the_turn_before_reading_its_dsi_contacts(_loop, monkeypatch):
    """Recette prod 07/10 soir, cid 568fe096 — « Qui dois-je contacter à la DSI
    de UNEO ? » : `search_workspace_accounts` seul, « round=0 marginal_gain=0 »,
    arrêt — `get_account_contacts` jamais appelé, Caroline Jaouen (DSI, e-mail
    vérifié sur la fiche) citée sans fonction ni coordonnées."""
    fake = _loop(
        [
            _resp("tool_use", [_tool_use("search_workspace_accounts", {"query": "UNEO"})]),
            _resp(
                "tool_use",
                [_tool_use("get_account_contacts", {"account_id": "u1", "function": "DSI"}, "toolu_2")],
            ),
            _resp("end_turn", [_text("Caroline Jaouen, DSI.")]),
        ]
    )
    executed: list[str] = []

    async def _fake_execute(name, _tool_input, **_kwargs):
        executed.append(name)
        if name == "search_workspace_accounts":
            return {"accounts": [{"account_id": "u1", "company_name": "UNEO"}], "total": 1}
        return {"contacts": [{"full_name": "Caroline Jaouen", "title": "Directrice des Systèmes d'information"}]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_execute)
    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=ThreadStateCollector()
    )
    assert executed == ["search_workspace_accounts", "get_account_contacts"]
    assert len(fake.messages.calls) == 3


@pytest.mark.asyncio
async def test_a_thread_note_round_does_not_stop_the_search_that_follows(_loop, monkeypatch):
    """Recette prod 07/10, cid 2d6a7480 — « entreprises industrielles en
    Bourgogne-Franche-Comté avec des signaux » : round 0 = `note_thread_context`
    seul, gain 0, arrêt — aucune recherche lancée, « je n'ai pas pu exécuter la
    recherche »."""
    fake = _loop(
        [
            _resp("tool_use", [_tool_use("note_thread_context", {"goal": "industriels BFC avec signaux"})]),
            _resp("tool_use", [_tool_use("search_workspace_accounts", {"region": "BFC"}, "toolu_2")]),
            _resp("end_turn", [_text("Voici les comptes.")]),
        ]
    )
    executed: list[str] = []

    async def _fake_execute(name, tool_input, **_kwargs):
        executed.append(name)
        if name == "note_thread_context":
            return {"status": "thread_note", "goal": tool_input["goal"]}
        return {"accounts": [{"id": "a9", "name": "Industriel BFC"}]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_execute)
    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=ThreadStateCollector()
    )
    assert executed == ["note_thread_context", "search_workspace_accounts"]
    assert len(fake.messages.calls) == 3


@pytest.mark.asyncio
async def test_x63_a_productive_turn_leaves_its_deepening_trace_on_the_observability(_loop, monkeypatch):
    """#3218 (recette prod 02/10) — l'événement `step` est TRANSITOIRE (effacé
    au premier fragment de texte) : rien ne restait dans le DOM. La trace
    survit au tour, sur `turn_observability.deepening`, que l'écran lit."""
    _loop(
        [
            _resp("tool_use", [_tool_use("get_account_briefing", {"account_id": "a1"})]),
            _resp("end_turn", [_text("Voici TF1.")]),
        ]
    )

    async def _fake_execute(name, _tool_input, **_kwargs):
        return {"account_id": "a1", "company_name": "TF1"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_execute)
    sink: list = []
    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=ThreadStateCollector(), observability_sink=sink
    )
    from app.services.chat_turn_plan import turn_observability_as_dict

    wire = turn_observability_as_dict(sink[-1])
    assert wire["deepening"] == [{"kind": "pass", "pass": 1}]


@pytest.mark.asyncio
async def test_x63_a_sterile_stop_is_named_and_is_not_a_budget_failure(_loop, monkeypatch):
    """#3218 — l'ARRÊT par gain marginal nul est visible (critère d'arrêt
    nommé) et n'est PAS présenté comme « délai atteint / mode dégradé »."""
    _loop(
        [
            _resp("tool_use", [_tool_use("get_account_briefing", {"account_id": "a1"})]),
            _resp("end_turn", [_text("Rien de neuf.")]),
        ]
    )

    async def _fake_execute(name, _tool_input, **_kwargs):
        return {"note": "rien"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_execute)
    sink: list = []
    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=ThreadStateCollector(), observability_sink=sink
    )
    from app.services.chat_turn_plan import turn_observability_as_dict

    wire = turn_observability_as_dict(sink[-1])
    assert wire["deepening"] == [{"kind": "stop", "reason": "marginal_gain"}]
    assert wire["budget_exhausted"] is False
    assert wire["degraded_answer"] is False


def test_x63_without_deepening_the_wire_is_byte_identical():
    from app.services.chat_turn_plan import TurnObservability, turn_observability_as_dict

    wire = turn_observability_as_dict(TurnObservability("default", 2, 1, 1, 1, False, False, False))
    assert "deepening" not in wire


@pytest.mark.asyncio
async def test_without_refine_the_loop_is_byte_identical_with_or_without_a_collector(_loop):
    responses = lambda: [  # noqa: E731 — deux boucles, deux jeux de réponses neufs
        _resp("tool_use", [_tool_use("find_accounts", {"sectors": ["industry"], "department": "31"})]),
        _resp("end_turn", [_text("Recherche préparée.")]),
    ]
    bare = _loop(responses())
    reply_a, actions_a = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)
    with_thread = _loop(responses())
    reply_b, actions_b = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None, thread=ThreadStateCollector()
    )
    assert (reply_a, actions_a) == (reply_b, actions_b)
    assert _tool_results(bare.messages.calls[1]) == _tool_results(with_thread.messages.calls[1])


# ── Le routeur : API → IA → prompt, et IA → API ─────────────────────────────


def _post(client: TestClient, body: dict, side_effect=None):
    captured: dict = {}

    async def _fake_run(system, user, **kwargs):
        captured["system"] = system
        captured["kwargs"] = kwargs
        if side_effect:
            side_effect(kwargs)
        return ("Réponse.", [])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Et lui ?", "user_id": "u1", **body})
    events = [json.loads(b[len("data:") :]) for b in res.text.strip().split("\n\n") if b.startswith("data:")]
    return captured, events[-1]


def test_the_request_model_keeps_the_thread_state_it_receives():
    request = ChatRequest(message="x", user_id="u1", thread_state=_FIXTURE)
    assert request.thread_state == _FIXTURE


def test_the_thread_state_reaches_the_prompt_in_the_volatile_segment_only(client: TestClient):
    captured, terminal = _post(client, {"thread_state": _FIXTURE})
    system = captured["system"]
    segments = system.split(CACHE_SEGMENT_BREAK)
    assert _HEADER in segments[-1]
    assert "Le compte dont on parle : ACME Industrie" in segments[-1]
    assert all(_HEADER not in segment for segment in segments[:-1])
    assert terminal["success"] is True


def test_without_a_thread_state_the_prompt_and_the_response_are_unchanged(client: TestClient):
    # #2224 — horloge figée : voir le commentaire sur `_FROZEN_NOW`.
    with patch("app.prompts.current_time.now_in_reference_timezone", return_value=_FROZEN_NOW):
        captured_absent, terminal_absent = _post(client, {})
        captured_empty, terminal_empty = _post(client, {"thread_state": {}})
    assert captured_absent["system"] == captured_empty["system"]
    assert _HEADER not in captured_absent["system"]
    assert "thread_state" not in terminal_absent["data"]
    assert "thread_state" not in terminal_empty["data"]


def test_what_the_tools_rendered_this_turn_travels_back_to_the_api(client: TestClient):
    def _tools_ran(kwargs):
        kwargs["thread"].record(
            "get_account_briefing", {"account_id": "acc-9"}, {"account_id": "acc-9", "company_name": "Groupe Vallée"}
        )

    _captured, terminal = _post(client, {"thread_state": _FIXTURE}, side_effect=_tools_ran)
    state = terminal["data"]["thread_state"]
    assert state["focus"][0] == {"kind": "account", "id": "acc-9", "label": "Groupe Vallée"}
    # L'état d'AVANT est prolongé, pas remplacé.
    assert {"kind": "consultant", "id": "t-1", "label": "Alice Martin"} in state["objects"]


def test_a_question_already_asked_in_the_thread_withdraws_the_clarification_tool(client: TestClient):
    captured, _ = _post(client, {"thread_state": _FIXTURE, "clarification_asked": False})
    assert captured["kwargs"]["clarification_already_asked"] is True

    no_question = {**_FIXTURE, "questions": []}
    captured, _ = _post(client, {"thread_state": no_question, "clarification_asked": False})
    assert captured["kwargs"]["clarification_already_asked"] is False

    # Le drapeau historique du navigateur reste lu : on ÉLARGIT, on ne retire rien.
    captured, _ = _post(client, {"clarification_asked": True})
    assert captured["kwargs"]["clarification_already_asked"] is True


# ── #1980 × #1927.8 — le rappel de langue reste le DERNIER texte du prompt ──


def test_in_an_english_interface_the_thread_state_lands_before_the_language_reminder(client: TestClient):
    """Recette du 13/09 (#1980) : hors français, un rappel de langue FERME le
    prompt système, et ce qui s'ajoute après sa construction se pose AVANT lui
    (`append_before_language_reminder`). L'état du fil est ajouté par le
    routeur, en français : collé derrière le rappel, il redevenait le dernier
    texte lu par le modèle d'une personne en interface anglaise — le défaut
    exact que #1980 a corrigé pour « CAPACITÉS ABSENTES »."""
    from app.prompts.bellum_advisor import _LANGUAGE_REMINDERS

    captured, _terminal = _post(client, {"thread_state": _FIXTURE, "interface_language": "en"})
    system = captured["system"]
    reminder = _LANGUAGE_REMINDERS["en"]
    assert system.endswith(f"\n\n{reminder}"), "le rappel de langue n'est plus le dernier texte du prompt"
    tail = system.split(CACHE_SEGMENT_BREAK)[-1]
    assert _HEADER in tail, "l'état du fil a quitté le segment volatil"
    assert tail.index(_HEADER) < tail.index(reminder)


def test_in_a_french_interface_the_thread_state_still_closes_the_prompt(client: TestClient):
    """Témoin : sans rappel de langue (français), la concaténation est celle
    d'avant #1980, octet pour octet — l'état du fil reste le dernier texte."""
    from app.prompts.thread_state import format_thread_state_block

    captured, _terminal = _post(client, {"thread_state": _FIXTURE})
    assert captured["system"].endswith(format_thread_state_block(thread_state_from_wire(_FIXTURE)))


# ── #1995 — les DEUX TOURS : le contact que Laura a nommé revient avec son id ──
#
# Recette en production du 14/09/2026, sur le correctif précédent (8ba95252a) :
#
#   Louis  — Rappelle-moi de relancer THALES demain
#   Laura  — Pour quel contact chez THALES ? • Sandrine Pata • Gerald Oualid
#   Louis  — Sandrine Pata a 9h30
#   Laura  — Je n'ai pas encore l'identifiant de sa fiche contact.
#
# Au tour 1 l'API résout « THALES » dans le message et envoie `contacts_summary`
# AVEC les identifiants ; au tour 2 le message ne nomme plus le compte, donc
# `ChatContextService` ne résout rien et `contactsSummary` est `null`
# (`apps/api/src/modules/ia-proxy/chat-context.service.ts:227-235`). Le seul
# véhicule d'un tour à l'autre est l'ÉTAT DU FIL — il ne portait pas les contacts
# que Laura venait de NOMMER.

_THALES_CONTACTS = (
    "Sandrine Pata - Directrice des systèmes d'information - economic - contact_id: c-uuid-1\n"
    "Gerald Oualid - RSSI - technical - contact_id: c-uuid-2"
)


def _laura_asks_which_contact(*options: str):
    def _ran(kwargs):
        kwargs["thread"].record(
            "ask_clarification",
            {"question": "Pour quel contact chez THALES ?", "options": list(options)},
            {
                "status": "clarification",
                "question": "Pour quel contact chez THALES dois-je préparer le rappel de demain ?",
                "options": list(options),
            },
        )

    return _ran


def test_1995_the_contact_laura_named_reaches_the_next_turn_with_its_identifier(client: TestClient):
    _captured, terminal = _post(
        client,
        {"contacts_summary": _THALES_CONTACTS},
        side_effect=_laura_asks_which_contact(
            "Sandrine Pata — réactivation de l'historique CRM",
            "Gerald Oualid — cybersécurité",
        ),
    )
    state = terminal["data"]["thread_state"]
    assert {"kind": "contact", "id": "c-uuid-1", "label": "Sandrine Pata"} in state["objects"]

    # Tour 2 : « Sandrine Pata a 9h30 ». Le message ne nomme plus THALES, donc
    # l'API n'envoie AUCUN résumé de contacts — c'est la situation de la recette.
    captured, _terminal = _post(client, {"thread_state": state})
    system = captured["system"]
    assert "Sandrine Pata [contact, id c-uuid-1]" in system
    assert "Gerald Oualid [contact, id c-uuid-2]" in system
    # C'est l'argument que `schedule_reminder_for_contact` exige : sans lui, le
    # tour 2 se termine par « je n'ai pas encore l'identifiant de sa fiche ».
    assert "c-uuid-1" in system


def test_1995_a_name_laura_never_proposed_gets_no_identifier(client: TestClient):
    """Témoin — si Laura n'a pas eu la personne sous les yeux, rien ne se
    fabrique : le tour suivant redemande, il n'invente pas un identifiant."""
    _captured, terminal = _post(
        client,
        {"contacts_summary": _THALES_CONTACTS},
        side_effect=_laura_asks_which_contact("Claire Dubois — appel d'offres", "Un autre contact THALES"),
    )
    state = terminal["data"]["thread_state"]
    assert state["objects"] == []
    assert state["last_list"] is None

    captured, _terminal = _post(client, {"thread_state": state})
    system = captured["system"]
    # La QUESTION posée reste dans l'état (on ne la repose pas) : le nom écrit
    # par Laura y figure donc. Ce qui ne doit pas exister, c'est un identifiant.
    assert "Claire Dubois" in system
    assert "[contact, id" not in system
