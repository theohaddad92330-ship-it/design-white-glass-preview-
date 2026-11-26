"""LOT 3, Défaut B — les outils d'un même round s'exécutaient en SÉRIE.

`chat_orchestrator.py` faisait ``for call in turn.tool_calls: await
execute_chat_tool(...)`` : quand le modèle demande TROIS outils indépendants
dans un seul message ``tool_use``, on payait la SOMME des latences au lieu du
MAXIMUM — avec ``_PER_CALL_TIMEOUT_S = 60`` et ``_TOOL_ROUND_RESERVE_S = 25``,
un round à trois outils lents épuisait la réserve à lui seul.

⚠️ NE PAS PARALLÉLISER AVEUGLÉMENT : le dépôt a des outils d'ÉCRITURE
(propositions — `WRITE_TOOL_NAMES` — et `start_account_analysis`, qui débite un
crédit et lance un job réel sans passer par `_proposal`). Ce fichier prouve
DEUX choses à la fois :

1. des LECTURES indépendantes partent ENSEMBLE (pas l'une après l'autre) —
   preuve par COMPTE DE SIMULTANÉITÉ (un compteur en vol, son maximum), jamais
   par une durée : *le meilleur budget est un compte, pas une durée* — une
   durée ne se reproduit pas sous charge, et cette suite tourne aux côtés
   d'autres agents sur la même machine ;
2. l'ORDRE des résultats rendus au modèle reste celui de ``turn.tool_calls``,
   quelle que soit l'ordonnance d'exécution (``record_round`` en dépend) ;
3. une ÉCRITURE reste séquentielle et À SA PLACE — jamais mêlée à un autre
   appel, lecture ou écriture, dans le même ``asyncio.gather``.

Garde GA-296.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator

USER = "11111111-1111-4111-8111-111111111111"


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


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list, *, usage: object | None = None) -> SimpleNamespace:
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


def _usage() -> SimpleNamespace:
    return SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)


@pytest.fixture(autouse=True)
def _throttle_passthrough(monkeypatch):
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install_client(monkeypatch, responses) -> _FakeClient:
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    return fake


async def _run_turn():
    return await chat_orchestrator.run_chat_with_tools("sys", "user", user_id=USER, profile_data=None)


# ── 1. Des lectures indépendantes partent ENSEMBLE ──────────────────────────


@pytest.mark.asyncio
async def test_independent_reads_start_together_not_one_after_another(monkeypatch) -> None:
    """Preuve par COMPTE DE SIMULTANÉITÉ — jamais par une durée.

    Un compteur partagé, incrémenté à l'ENTRÉE de chaque exécution d'outil et
    décrémenté à la SORTIE, retient le MAXIMUM atteint. `asyncio.sleep` ne
    sert qu'à ouvrir une fenêtre de chevauchement — la coroutine suspend
    réellement, ce qui laisse les deux autres s'exécuter avant qu'aucune ne
    reprenne. C'est déterministe sur un event loop mono-thread : les TROIS
    lectures incrémentent le compteur avant que la première ne reprenne de
    son `sleep`, quelle que soit la charge de la machine — aucun seuil de
    temps, aucun flag possible sous charge.

    Avec la boucle séquentielle d'AVANT, le deuxième appel ne démarre
    qu'après la fin complète du premier : le maximum resterait à 1."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use("get_account_briefing", {"account_id": "a"}, "t1"),
                    _tool_use("get_account_briefing", {"account_id": "b"}, "t2"),
                    _tool_use("get_account_briefing", {"account_id": "c"}, "t3"),
                ],
                usage=_usage(),
            ),
            _resp("end_turn", [_text("ok")], usage=_usage()),
        ],
    )
    in_flight = 0
    peak = 0

    async def _fake_tool(name, tool_input, **_kwargs):
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)  # ouvre la fenêtre de chevauchement, rien de plus
        in_flight -= 1
        return {"account_id": tool_input["account_id"]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)

    reply, actions = await _run_turn()

    assert reply == "ok"
    assert [a["tool"] for a in actions] == ["get_account_briefing"] * 3
    assert all(a["status"] == "done" for a in actions), actions
    assert peak == 3, f"maximum en vol simultané : {peak} (attendu 3 — les lectures ne sont pas parties ensemble)"


# ── 2. L'ordre des résultats reste celui de tool_calls ──────────────────────


@pytest.mark.asyncio
async def test_results_keep_the_tool_calls_order_regardless_of_completion_order(monkeypatch) -> None:
    """« b » finit en premier, « c » en second, « a » en dernier — et pourtant
    les résultats rendus au modèle (``actions``) restent dans l'ordre a, b, c
    : c'est celui de ``turn.tool_calls``, dont ``record_round`` dépend."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use("get_account_briefing", {"account_id": "a"}, "t1"),
                    _tool_use("get_account_briefing", {"account_id": "b"}, "t2"),
                    _tool_use("get_account_briefing", {"account_id": "c"}, "t3"),
                ],
                usage=_usage(),
            ),
            _resp("end_turn", [_text("ok")], usage=_usage()),
        ],
    )
    delays = {"a": 0.03, "b": 0.01, "c": 0.02}

    async def _fake_tool(name, tool_input, **_kwargs):
        await asyncio.sleep(delays[tool_input["account_id"]])
        return {"account_id": tool_input["account_id"]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)

    _reply, actions = await asyncio.wait_for(_run_turn(), timeout=2.0)

    assert [a["input"]["account_id"] for a in actions] == ["a", "b", "c"]


# ── 3. Une écriture reste séquentielle, et jamais mêlée à une autre ─────────


@pytest.mark.asyncio
async def test_a_write_tool_never_runs_alongside_another_call(monkeypatch) -> None:
    """Une écriture (ici une PROPOSITION, `prepare_message_for_contact`) ne
    doit JAMAIS partager un `asyncio.gather` avec un voisin — ni une lecture,
    ni une autre écriture. Compteur d'appels EN VOL : il doit valoir 1 pendant
    toute la durée de l'écriture."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use("get_account_briefing", {"account_id": "a"}, "t1"),
                    _tool_use(
                        "prepare_message_for_contact",
                        {"contact_id": "c1", "channel": "email"},
                        "t2",
                    ),
                    _tool_use("get_account_briefing", {"account_id": "b"}, "t3"),
                ],
                usage=_usage(),
            ),
            _resp("end_turn", [_text("ok")], usage=_usage()),
        ],
    )
    in_flight = 0
    max_in_flight_during_write = 0

    async def _fake_tool(name, tool_input, **_kwargs):
        nonlocal in_flight, max_in_flight_during_write
        in_flight += 1
        if name == "prepare_message_for_contact":
            max_in_flight_during_write = max(max_in_flight_during_write, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        if name == "prepare_message_for_contact":
            max_in_flight_during_write = max(max_in_flight_during_write, in_flight + 1)
        return {"status": "pending_confirmation", "proposal": {"action": name}} if name == "prepare_message_for_contact" else {"account_id": tool_input.get("account_id")}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)

    _reply, actions = await asyncio.wait_for(_run_turn(), timeout=2.0)

    assert max_in_flight_during_write == 1
    # L'ordre reste celui du modèle, écriture comprise.
    assert [a["tool"] for a in actions] == [
        "get_account_briefing",
        "prepare_message_for_contact",
        "get_account_briefing",
    ]
    assert actions[1]["status"] == "pending_confirmation"


@pytest.mark.asyncio
async def test_two_write_tools_run_strictly_in_order_never_concurrently(monkeypatch) -> None:
    """Deux écritures dans le même round : la seconde ne DÉMARRE qu'une fois la
    première COMPLÈTEMENT terminée — jamais l'inverse, jamais en parallèle."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use(
                        "prepare_message_for_contact", {"contact_id": "c1", "channel": "email"}, "t1"
                    ),
                    _tool_use(
                        "schedule_reminder_for_contact",
                        {"contact_id": "c1", "at": "2026-09-01T09:00:00Z"},
                        "t2",
                    ),
                ],
                usage=_usage(),
            ),
            _resp("end_turn", [_text("ok")], usage=_usage()),
        ],
    )
    order: list[str] = []

    async def _fake_tool(name, tool_input, **_kwargs):
        order.append(f"start:{name}")
        await asyncio.sleep(0.01)
        order.append(f"end:{name}")
        return {"status": "pending_confirmation", "proposal": {"action": name}}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)

    await asyncio.wait_for(_run_turn(), timeout=2.0)

    assert order == [
        "start:prepare_message_for_contact",
        "end:prepare_message_for_contact",
        "start:schedule_reminder_for_contact",
        "end:schedule_reminder_for_contact",
    ]


@pytest.mark.asyncio
async def test_start_account_analysis_is_treated_as_a_write_even_though_it_is_not_in_write_tool_names(
    monkeypatch,
) -> None:
    """`start_account_analysis` débite un crédit et lance un job réel — ce
    n'est pas une PROPOSITION comme le reste de `WRITE_TOOL_NAMES`, mais il
    doit rester hors de tout lot concurrent, au même titre qu'une écriture."""
    from app.services.chat_tools import WRITE_TOOL_NAMES

    assert "start_account_analysis" not in WRITE_TOOL_NAMES  # témoin : bien l'exception qu'on documente
    assert not chat_orchestrator._is_read_only_tool("start_account_analysis")
    for name in WRITE_TOOL_NAMES:
        assert not chat_orchestrator._is_read_only_tool(name), name
    # Témoin positif : un outil de lecture ordinaire n'est pas classé écriture.
    assert chat_orchestrator._is_read_only_tool("get_account_briefing")


# ── 3bis. `note_thread_context` ferme son lot comme une écriture (#3177/#3225) ──
#
# Recette prod du 30/09 (D02) : « le groupe La Poste et ses filiales » ne
# rapportait toujours aucun résultat après l'ancrage livré le matin même (lot
# Q02, `_anchor_market_memory_on_persistent_scope`). Root cause : le modèle
# pose `group_scope_root` (`note_thread_context`) ET interroge la mémoire
# marché (`search_market_memory`) dans le MÊME round — les deux sont des
# LECTURES pour `_is_read_only_tool`, donc `_batches_for_round` les mettait
# dans le MÊME lot concurrent ; `_prepared_call` (l'ancrage) prépare TOUT le
# lot AVANT d'exécuter quoi que ce soit, donc l'ancrage lisait encore
# `persistent_scope` d'AVANT ce round.


def test_note_thread_context_closes_its_batch_like_a_write() -> None:
    """`_batches_for_round` isole `note_thread_context` à sa propre place,
    exactement comme une écriture — sans pour autant en devenir une (voir le
    test suivant)."""
    calls = [
        chat_orchestrator._ToolCall(id="t1", name="get_account_briefing", input={"account_id": "a"}),
        chat_orchestrator._ToolCall(
            id="t2",
            name="note_thread_context",
            input={"group_scope_root": {"id": "acc-laposte", "label": "La Poste"}},
        ),
        chat_orchestrator._ToolCall(id="t3", name="search_market_memory", input={}),
    ]
    assert chat_orchestrator._batches_for_round(calls) == [[calls[0]], [calls[1]], [calls[2]]]


def test_note_thread_context_stays_read_only_for_retry_and_the_audit() -> None:
    """L'isolement de round ne touche PAS `_is_read_only_tool` : la
    classification lecture/écriture (retry, coupe-circuit, l'audit exhaustif
    ci-dessous) reste inchangée — seul l'ORDONNANCEMENT du round change."""
    assert chat_orchestrator._is_read_only_tool("note_thread_context")


@pytest.mark.asyncio
async def test_note_thread_context_anchors_a_market_memory_call_in_the_same_round(monkeypatch) -> None:
    """Le round complet, bout en bout : `note_thread_context` pose le
    périmètre de groupe, `search_market_memory` (sans `company_id`) suit dans
    le MÊME round — l'ancrage doit désormais voir l'état FRAIS, pas celui
    d'avant ce round."""
    from app.services.chat_thread_state import ThreadStateCollector

    seen: dict[str, dict] = {}

    async def _fake_tool(name, tool_input, **_kwargs):
        seen[name] = tool_input
        if name == "note_thread_context":
            return {
                "status": "thread_note",
                "group_scope_root": {"id": "acc-laposte", "label": "La Poste"},
            }
        return {"matches": []}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)

    thread = ThreadStateCollector()
    calls = [
        chat_orchestrator._ToolCall(
            id="t1",
            name="note_thread_context",
            input={"group_scope_root": {"id": "acc-laposte", "label": "La Poste"}},
        ),
        chat_orchestrator._ToolCall(id="t2", name="search_market_memory", input={}),
    ]
    await asyncio.wait_for(
        chat_orchestrator._run_tool_round(
            calls,
            user_id=USER,
            profile_data=None,
            crm_connected=False,
            crm_provider="none",
            emit=chat_orchestrator._noop_emit,
            thread=thread,
        ),
        timeout=2.0,
    )

    assert seen["search_market_memory"].get("company_id") == "acc-laposte"
    assert seen["search_market_memory"].get("include_subsidiaries") is True


# ── 4. Largeur du parallélisme bornée ───────────────────────────────────────


@pytest.mark.asyncio
async def test_the_fanout_width_is_bounded(monkeypatch) -> None:
    """« Tout d'un coup » sature l'API en aval. Le nombre d'appels EN VOL à un
    instant donné ne doit jamais dépasser la borne déclarée."""
    calls = [
        _tool_use("get_account_briefing", {"account_id": f"a{i}"}, f"t{i}")
        for i in range(chat_orchestrator._TOOL_FANOUT_LIMIT + 3)
    ]
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", calls, usage=_usage()),
            _resp("end_turn", [_text("ok")], usage=_usage()),
        ],
    )
    in_flight = 0
    peak = 0

    async def _fake_tool(name, tool_input, **_kwargs):
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.02)
        in_flight -= 1
        return {"account_id": tool_input["account_id"]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)

    await asyncio.wait_for(_run_turn(), timeout=3.0)

    assert peak <= chat_orchestrator._TOOL_FANOUT_LIMIT
    assert peak > 1  # témoin : la garde n'a pas tout sérialisé au passage


# ── 5. La classification LECTURE / ÉCRITURE couvre TOUT le catalogue ────────


def test_the_read_write_partition_covers_the_whole_catalogue_and_matches_the_audit() -> None:
    """EXHAUSTIVE et vérifiable, pas devinée : chaque nom de `CHAT_TOOLS` est
    d'un côté ou de l'autre, jamais des deux, jamais d'aucun.

    Le compte de droite est celui de l'audit manuel du 12/09/2026 (LOT 3) :
    les neuf propositions de `WRITE_TOOL_NAMES` + `start_account_analysis`,
    qui débite un crédit et lance un job réel sans jamais passer par
    `_proposal()`. Un outil d'écriture ajouté plus tard sans être inscrit
    dans l'une des deux listes fait tomber ce test — et resterait, sans lui,
    silencieusement parallélisable."""
    from app.services.chat_tools import CHAT_TOOLS

    names = [tool["name"] for tool in CHAT_TOOLS]
    assert len(names) >= 40, "le catalogue est vide ou tronqué — la garde ne lirait plus rien"
    writes = {n for n in names if not chat_orchestrator._is_read_only_tool(n)}
    reads = {n for n in names if chat_orchestrator._is_read_only_tool(n)}
    assert writes | reads == set(names)
    assert writes & reads == set()
    assert writes == {
        "prepare_message_for_contact",
        "schedule_reminder_for_contact",
        "enrich_contact",
        "export_contact_to_crm",
        "find_accounts",
        "prepare_mail_draft",
        "toggle_routine",
        "propose_settings_update",
        "pin_memory_fact",
        "start_account_analysis",
        # #4462.1 — une liste d'analyses lancées d'office : une écriture, comme `start_account_analysis`.
        "analyze_named_companies",
        # #1995 — PROPOSE une fiche à créer ; l'écriture est le clic, pas l'outil.
        "create_contact_from_crm_presence",
        # #1903.10 / #1935 — même famille que `find_accounts` : navigation
        # pré-remplie, aucune écriture ici, mais un tour à ne pas paralléliser
        # avec un autre qui toucherait la même audience.
        "prepare_campaign",
        # #2322 — le compilateur de besoin : PROPOSE, le clic de l'utilisateur
        # crée le besoin — même famille que `create_contact_from_crm_presence`.
        "compile_need",
        # #2392 — la clôture de journée : sa CARTE écrit au clic (report,
        # délégation, abandon), jamais l'outil — même famille que `compile_need`.
        "compile_day_closure",
        # #2423.9 — l'avenant se PROPOSE, le clic de l'utilisateur le valide —
        # même famille que `compile_need`/`compile_day_closure`.
        "propose_mission_amendment",
        "propose_opportunity_update",
        # #2376 — le brief d'appel se PROPOSE, aucune écriture — même famille
        # que `compile_need`/`compile_day_closure`.
        "prepare_cold_call",
        # #2391 — sa carte est une PROPOSITION (`_proposal()`, `pending_confirmation`) :
        # même famille que `compile_need`/`compile_day_closure`.
        "propose_focus_plan",
        # #2770 / #2852 (lot X14) — PROPOSITION de semaine, même famille que `propose_focus_plan`.
        "propose_weekly_plan",
        # Épopée #2853 (#2157.1) — PROPOSE une cible à créer ; l'écriture est
        # le clic, pas l'outil — même famille que `create_contact_from_crm_presence`.
        "create_target_list_from_account",
        # Épopée #2781 (#2150.30, LOT j1 26/09) — PROPOSE l'ajout au portefeuille ;
        # l'écriture est le clic, pas l'outil — même famille que
        # `create_target_list_from_account`.
        "add_account_to_portfolio",
        # #2320.26/.27 (épopée #2967) — la transition se PROPOSE
        # (`_proposal()`), le clic de l'utilisateur l'exécute — même famille
        # que `propose_mission_amendment`/`propose_opportunity_update`.
        "propose_need_transition",
        # #2987.56 — la décision de note de frais se PROPOSE (`_proposal()`),
        # jamais un effet réel (l'écriture reste le clic authentifié côté
        # écran) ; classée ÉCRITURE par construction dans `WRITE_TOOL_NAMES`
        # (chat_tools.py) — même famille que `propose_mission_amendment`.
        "propose_expense_report_decision",
        # Épopée #2955 (#2394.6/.19/.43) — la NOTE CRM se PROPOSE (`_proposal()`),
        # l'écriture est le clic après relecture ; classée ÉCRITURE par
        # construction dans `WRITE_TOOL_NAMES` — même famille que
        # `propose_expense_report_decision`.
        "propose_crm_note",
        # #1952.3 / #1952.7 — le travail long se PROPOSE (le commercial le valide
        # d'un clic) ; l'outil ne lance rien — même famille que `propose_crm_note`.
        "propose_long_job",
        # #3345.2 — l'écartement d'une piste se PROPOSE (le clic écrit) ; même famille.
        "propose_qualification_lead_decision",
        # #2434.56 (épopée #3579) — l'enrichissement en masse se PROPOSE (le clic débite) ; même famille.
        "propose_bulk_enrichment",
        # #3871.1 (lot V11, 07/10) — le passage en historique se PROPOSE (le clic écrit) ; même famille.
        "propose_contact_departure",
        # #3950.1 (décision Louis 09/10/2026, lot G01) — l'export du vivier se
        # PROPOSE (`_proposal()`), le clic de la personne le lance par le MÊME
        # bouton que l'écran ; même famille que `toggle_routine`/`pin_memory_fact`.
        "launch_vivier_export",
        # #3869.a (lot M05, 09/10) — la recherche de personnes se PROPOSE
        # (`_proposal()`), le clic la lance et la débite ; même famille que
        # `propose_bulk_enrichment`.
        "propose_people_search",
        # #2433.7 (lot M10, 09/10) — le signalement se PROPOSE (`_proposal()`), le
        # clic l'envoie par `POST /feedback` ; même famille que `launch_vivier_export`.
        "prepare_bug_report",
        # FIX-RECETTE-G (19/10, G.1) — l'événement d'agenda se PROPOSE (carte), créé seulement à la validation
        # de l'utilisateur : même famille que `prepare_bug_report`, partitionné du côté écriture.
        "prepare_calendar_event",
    }
