"""#2276.39-.43 — Laura choisit son budget, sa parallélisation, ses contrôles et
son self-check selon la COMPLEXITÉ de la demande, et ne tombe jamais sur un
modèle économique pour une demande complexe.

La classification à cinq classes (#2276.32-.36) est ÉCARTÉE : le plan se fonde
sur des signaux déjà présents — le palier de la demande (#2248,
``choose_chat_tier``), la nature des appels d'un round, le nombre de sources
lues, et les capacités critiques/financières.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.chat_model_routing import ChatRoute, ChatTierContext, ChatTierDecision
from app.services.chat_tools import CHAT_TOOLS as TOOLS
from app.services.chat_turn_plan import (
    CRITICAL_TOOL_NAMES,
    SIMPLE_TURN_PLAN,
    build_turn_observability,
    call_signature,
    duplicate_call_names,
    is_economic_model,
    numbers_missing_unit,
    plan_turn,
    record_turn_observability,
    requires_large_inspection,
    requires_multiple_searches,
    round_is_critical,
    turn_observability_as_dict,
    unjustified_absolute_claims,
    unverified_figures,
)
from app.services.search_universe import CoverageReport

# ── le plan, pur ─────────────────────────────────────────────────────────────


def test_a_simple_request_keeps_the_plan_of_before():
    plan = plan_turn("ouvre la fiche Airbus", None)
    assert plan == SIMPLE_TURN_PLAN
    assert plan.complex is False
    assert plan.tool_rounds == chat_orchestrator._MAX_TOOL_ROUNDS
    assert plan.fanout_limit == chat_orchestrator._TOOL_FANOUT_LIMIT


def test_no_request_is_the_plan_of_before():
    assert plan_turn(None, None) == SIMPLE_TURN_PLAN


def test_a_complex_request_gets_one_more_tool_round_and_a_wider_fanout():
    """#2276.39 / #2276.40 — une stratégie en plusieurs étapes a un round
    d'outils de plus, et ses lectures indépendantes partent plus larges."""
    plan = plan_turn(
        "fais-moi un plan d'action sur 90 jours pour le groupe Thales", None
    )
    assert plan.complex is True
    assert plan.reason == "multi_step_plan"
    assert plan.tool_rounds == SIMPLE_TURN_PLAN.tool_rounds + 1
    assert plan.fanout_limit > SIMPLE_TURN_PLAN.fanout_limit


def test_the_approfondi_mode_gets_a_wider_budget_than_an_ordinary_deep_turn():
    """#3196.2 / #3196.3 (LAU-FINAL-202) — le mode ``"approfondi"`` forçait
    déjà le palier ``deep`` (#2450.1) mais recevait le MÊME budget qu'une
    demande complexe ordinaire (``multi_step_plan``, etc.) : les quatre
    budgets nommés par l'issue (Rapide/Vérifié/Approfondi/Auto) doivent se
    distinguer les uns des autres, pas seulement du mode rapide."""
    ordinary_deep = plan_turn(
        "fais-moi un plan d'action sur 90 jours pour le groupe Thales", None
    )
    approfondi = plan_turn(
        "ouvre la fiche Airbus", ChatTierContext(requested_mode="approfondi")
    )
    assert approfondi.reason == "mode_approfondi"
    assert approfondi.tool_rounds > ordinary_deep.tool_rounds
    assert approfondi.fanout_limit > ordinary_deep.fanout_limit


def test_the_verifie_mode_keeps_the_ordinary_deep_budget():
    """#3196.2 — ``"verifie"`` (INTERACTIF VÉRIFIÉ) force le palier ``deep``
    mais reste sur le budget ordinaire : seul ``"approfondi"`` (JOB
    APPROFONDI) reçoit l'écart, il ne se généralise pas à tout mode profond."""
    ordinary_deep = plan_turn(
        "fais-moi un plan d'action sur 90 jours pour le groupe Thales", None
    )
    verifie = plan_turn(
        "ouvre la fiche Airbus", ChatTierContext(requested_mode="verifie")
    )
    assert verifie.reason == "mode_verifie"
    assert verifie.tool_rounds == ordinary_deep.tool_rounds
    assert verifie.fanout_limit == ordinary_deep.fanout_limit


# ── #2146.9 (via #2898) — le SEUL signal réel disponible avant le premier appel
# outil : le palier de la demande (#2248), jamais un classifieur inventé pour
# l'occasion (`agent_docs/doctrine.md:19`, JAMAIS de donnée fictive).


def test_requires_multiple_searches_on_an_account_analysis():
    plan = plan_turn("analyse le compte Thales", None)
    assert plan.reason == "account_analysis"
    assert requires_multiple_searches(plan) is True


def test_requires_multiple_searches_on_a_multi_step_plan():
    plan = plan_turn(
        "fais-moi un plan d'action sur 90 jours pour le groupe Thales", None
    )
    assert plan.reason == "multi_step_plan"
    assert requires_multiple_searches(plan) is True


def test_requires_multiple_searches_on_two_heavy_tool_families():
    plan = plan_turn("compare le pipeline et la campagne de ces deux comptes", None)
    assert plan.reason == "heavy_tools"
    assert requires_multiple_searches(plan) is True


def test_requires_multiple_searches_is_false_on_the_default_plan():
    # Une demande ordinaire, ou même une demande « approfondis » (qui ne dit
    # rien de PLUSIEURS recherches, seulement de creuser CELLE-CI) : aucune
    # des deux n'est un signal de recherches CROISÉES.
    assert requires_multiple_searches(plan_turn("ouvre la fiche Airbus", None)) is False
    assert (
        requires_multiple_searches(plan_turn("approfondis ta réponse", None)) is False
    )
    assert requires_multiple_searches(SIMPLE_TURN_PLAN) is False


# #2146.10 (via #2898) — le même signal (le palier, #2248), pour une demande
# VOLUMINEUSE plutôt que CROISÉE. Disjoint de `_MULTI_SEARCH_TIER_REASONS` :
# une même raison de palier ne doit jamais faire les deux vrais à la fois.


def test_requires_large_inspection_on_a_long_or_complex_request():
    plan = plan_turn("question ?" * 4, None)
    assert plan.reason == "long_or_complex"
    assert requires_large_inspection(plan) is True


def test_requires_large_inspection_is_false_on_multi_search_reasons():
    # #2146.9 et #2146.10 sont DISJOINTS : un plan à plusieurs étapes lance
    # LAUNCH_JOB, jamais OPEN_SURFACE — les deux ensembles de raisons ne se
    # recoupent jamais.
    assert (
        requires_large_inspection(plan_turn("analyse le compte Thales", None)) is False
    )
    assert (
        requires_large_inspection(
            plan_turn(
                "fais-moi un plan d'action sur 90 jours pour le groupe Thales", None
            )
        )
        is False
    )
    assert (
        requires_large_inspection(
            plan_turn("compare le pipeline et la campagne de ces deux comptes", None)
        )
        is False
    )


def test_requires_large_inspection_is_false_on_the_default_plan():
    assert requires_large_inspection(plan_turn("ouvre la fiche Airbus", None)) is False
    assert requires_large_inspection(plan_turn("approfondis ta réponse", None)) is False
    assert requires_large_inspection(SIMPLE_TURN_PLAN) is False


def test_the_two_reason_sets_are_disjoint():
    """Une demande ne doit jamais pouvoir déclencher LAUNCH_JOB et OPEN_SURFACE
    à la fois — sinon le routeur (`laura_router.decide_action`) trancherait sur
    un ordre arbitraire entre deux signaux également vrais."""
    from app.services.chat_turn_plan import (
        _LARGE_INSPECTION_TIER_REASONS,
        _MULTI_SEARCH_TIER_REASONS,
    )

    assert _MULTI_SEARCH_TIER_REASONS.isdisjoint(_LARGE_INSPECTION_TIER_REASONS)


def test_critical_tools_exist_in_the_catalogue():
    """Une garde qui LIT : chaque nom critique est un vrai outil du catalogue."""
    names = {tool["name"] for tool in TOOLS}
    assert (names | {"start_account_analysis"}) >= CRITICAL_TOOL_NAMES
    assert "get_revenue" in CRITICAL_TOOL_NAMES
    assert "get_confirmed_revenue" in CRITICAL_TOOL_NAMES


def test_round_is_critical_says_no_on_ordinary_reads():
    assert round_is_critical(["get_revenue", "list_accounts"]) is True
    assert round_is_critical(["list_accounts", "get_account"]) is False
    assert round_is_critical([]) is False


# ── #3196.5 — dédoublication : signature d'appel, détection des doublons ───


def test_call_signature_ignores_key_order():
    a = call_signature(
        "get_account", {"account_id": "42", "fields": ["name", "revenue"]}
    )
    b = call_signature(
        "get_account", {"fields": ["name", "revenue"], "account_id": "42"}
    )
    assert a == b


def test_call_signature_distinguishes_different_arguments():
    a = call_signature("get_account", {"account_id": "42"})
    b = call_signature("get_account", {"account_id": "43"})
    assert a != b


def test_call_signature_distinguishes_different_tools_with_the_same_arguments():
    a = call_signature("get_account", {"account_id": "42"})
    b = call_signature("get_contacts", {"account_id": "42"})
    assert a != b


def test_duplicate_call_names_is_empty_on_a_first_round():
    calls = [
        ("get_account", {"account_id": "42"}),
        ("get_contacts", {"account_id": "42"}),
    ]
    assert duplicate_call_names(calls, already_called=frozenset()) == ()


def test_duplicate_call_names_catches_a_repeat_from_an_earlier_round():
    already_called = frozenset({call_signature("get_account", {"account_id": "42"})})
    calls = [
        ("get_account", {"account_id": "42"}),
        ("get_contacts", {"account_id": "42"}),
    ]
    assert duplicate_call_names(calls, already_called=already_called) == (
        "get_account",
    )


def test_duplicate_call_names_catches_a_repeat_within_the_same_round():
    calls = [
        ("get_account", {"account_id": "42"}),
        ("get_contacts", {"account_id": "42"}),
        ("get_account", {"account_id": "42"}),
    ]
    assert duplicate_call_names(calls, already_called=frozenset()) == ("get_account",)


def test_duplicate_call_names_lets_the_same_tool_through_with_different_arguments():
    calls = [
        ("get_account", {"account_id": "42"}),
        ("get_account", {"account_id": "43"}),
    ]
    assert duplicate_call_names(calls, already_called=frozenset()) == ()


# ── #3196.6 — observabilité d'un tour : les huit champs nommés par l'issue ──


def test_build_turn_observability_reuses_the_plan_reason_as_the_execution_plan():
    plan = plan_turn(
        "fais-moi un plan d'action sur 90 jours pour le groupe Thales", None
    )
    observability = build_turn_observability(
        plan=plan,
        completed_steps=2,
        parallel_calls=5,
        budget_exhausted=True,
        degraded_answer=True,
    )
    assert observability.execution_plan == plan.reason == "multi_step_plan"
    assert observability.planned_steps == plan.tool_rounds
    assert observability.completed_steps == 2
    assert observability.skipped_steps == plan.tool_rounds - 2
    assert observability.parallel_calls == 5
    assert observability.budget_exhausted is True
    assert observability.degraded_answer is True
    assert observability.job_created is False


def test_build_turn_observability_defaults_to_no_capability_fallback():
    """#3861.5 — l'appelant d'avant ce champ (qui ne le transmet pas) garde un
    chemin byte-identique : aucun repli n'est rapporté sans geste explicite."""
    plan = SIMPLE_TURN_PLAN
    observability = build_turn_observability(
        plan=plan,
        completed_steps=plan.tool_rounds,
        parallel_calls=0,
        budget_exhausted=False,
        degraded_answer=False,
    )
    assert observability.capability_fallback is False


def test_build_turn_observability_reports_a_capability_fallback_when_told_to():
    """#3861.5 — un repli vers une capacité moindre (#2276.43) n'est pas masqué
    comme une exécution équivalente : l'observabilité du tour le NOMME."""
    plan = plan_turn("fais-moi un plan d'action sur 90 jours pour le groupe Thales", None)
    observability = build_turn_observability(
        plan=plan,
        completed_steps=2,
        parallel_calls=0,
        budget_exhausted=False,
        degraded_answer=False,
        capability_fallback=True,
    )
    assert observability.capability_fallback is True


def test_turn_observability_as_dict_carries_the_capability_fallback_flag():
    plan = SIMPLE_TURN_PLAN
    observability = build_turn_observability(
        plan=plan,
        completed_steps=plan.tool_rounds,
        parallel_calls=0,
        budget_exhausted=False,
        degraded_answer=False,
        capability_fallback=True,
    )
    wire = turn_observability_as_dict(observability)
    assert wire["capability_fallback"] is True


def test_build_turn_observability_never_reports_a_negative_skipped_count():
    plan = SIMPLE_TURN_PLAN
    observability = build_turn_observability(
        plan=plan,
        completed_steps=plan.tool_rounds + 5,
        parallel_calls=0,
        budget_exhausted=False,
        degraded_answer=False,
    )
    assert observability.skipped_steps == 0


def test_record_turn_observability_never_raises(caplog):
    plan = SIMPLE_TURN_PLAN
    observability = build_turn_observability(
        plan=plan,
        completed_steps=plan.tool_rounds,
        parallel_calls=3,
        budget_exhausted=True,
        degraded_answer=True,
        job_created=False,
    )
    with caplog.at_level("INFO", logger="app.services.chat_turn_plan"):
        record_turn_observability(observability, correlation_id="test-cid")
    assert "test-cid" in caplog.text
    assert "budget_exhausted=True" in caplog.text


@pytest.mark.parametrize(
    ("model", "economic"),
    [
        ("claude-haiku-4-5", True),
        ("gpt-5-mini", True),
        ("gpt-5-nano", True),
        ("claude-sonnet-5", False),
        ("gemini-2.5-pro", False),
        ("gpt-5.6-luna", False),
    ],
)
def test_is_economic_model(model, economic):
    assert is_economic_model(model) is economic


def test_unverified_figures_names_what_no_tool_returned():
    outputs = ['{"revenue": 1250000, "invoices": 12}', '{"margin_pct": 18.5}']
    text = "CA de 1 250 000 €, 12 factures, marge 18,5 %, et une croissance de 37 % sur 2026."
    assert unverified_figures(text, outputs) == ["37"]


def test_unverified_figures_is_empty_when_everything_is_grounded():
    assert unverified_figures("Il reste 3 relances.", ['{"count": 3}']) == []


# ── #213.1/.3/.7 — un nombre sans unité ni période à proximité ───────────────


def test_numbers_missing_unit_is_empty_when_every_number_names_its_unite():
    text = (
        "Bellum observe 41 parcours professionnels historiques, correspondant "
        "à 28 personnes résolues, entre 2019 et 2025."
    )
    assert numbers_missing_unit(text) == []


def test_numbers_missing_unit_names_the_bare_lau_final_213_example():
    # #3207 — LAU-FINAL-213 : « consultants » n'est PAS une des UNITÉS #213.3
    # (elle recouvre personne/parcours/mission/CV/observation à la fois), donc
    # un nombre qu'elle seule accompagne reste nu.
    assert numbers_missing_unit("41 consultants observés") == ["41"]


def test_numbers_missing_unit_ignores_single_digit_and_year_noise():
    # Même seuil de bruit que `unverified_figures` (#2276.42) : un chiffre
    # seul ne se vérifie pas utilement, une année nommée n'est pas une mesure.
    assert numbers_missing_unit("Il reste 3 relances, ouvert en 2024.") == []


def test_numbers_missing_unit_accepts_a_nearby_period_marker_without_a_unit_word():
    assert numbers_missing_unit("18 signalés depuis janvier.") == []


# ── #214.4/.7 — une affirmation d'exhaustivité sans justification ───────────


def test_unjustified_absolute_claims_is_empty_on_the_allowed_wordings():
    text = (
        "Voici les éléments retrouvés : couverture partielle, liste non exhaustive, toutes les deux sources concordent."
    )
    assert unjustified_absolute_claims(text) == []


@pytest.mark.parametrize(
    "text,claim",
    [
        ("Laura a trouvé tous les décideurs.", "tous les décideurs"),
        ("Voici toutes les filiales du groupe.", "toutes les filiales"),
        ("Voici une analyse exhaustive du compte.", "exhaustive"),
        ("La liste complète des besoins ouverts.", "complète"),
    ],
)
def test_unjustified_absolute_claims_names_the_lau_final_214_no_go_examples(text, claim):
    found = unjustified_absolute_claims(text)
    assert found, f"« {claim} » aurait dû être signalé dans : {text!r}"


# ── #214.4/.7 (épopée #3229) — le ban de l'exhaustivité NON NUANCÉE ──────────


def test_unjustified_absolute_claims_bans_without_a_coverage_report():
    assert unjustified_absolute_claims("Voici tous les décideurs de ce compte.") == ["tous"]


def test_unjustified_absolute_claims_is_empty_without_any_marker():
    assert unjustified_absolute_claims("Voici les principaux décideurs, couverture partielle.") == []


def test_unjustified_absolute_claims_english_markers():
    assert unjustified_absolute_claims("Here are all the decision makers.") == ["all"]


def test_unjustified_absolute_claims_deduplicates_and_sorts_markers():
    assert unjustified_absolute_claims("Une liste complète et exhaustive de tous les contacts.") == [
        "complète",
        "exhaustive",
        "tous",
    ]


def test_unjustified_absolute_claims_lifted_by_a_full_and_gapless_coverage():
    report = CoverageReport(detected=6, resolved=6, verified=6, relevant=6, enriched=6, estimated_coverage=1.0)
    assert unjustified_absolute_claims("Voici tous les décideurs.", coverage=report) == []


def test_unjustified_absolute_claims_stays_banned_with_a_partial_coverage():
    report = CoverageReport(detected=214, resolved=81, verified=9, relevant=18, enriched=6, unresolved=133)
    assert unjustified_absolute_claims("Voici tous les décideurs.", coverage=report) == ["tous"]


def test_unjustified_absolute_claims_stays_banned_when_coverage_is_unmeasured():
    report = CoverageReport(detected=6, resolved=6, verified=6, relevant=6, enriched=6)
    assert unjustified_absolute_claims("Voici tous les décideurs.", coverage=report) == ["tous"]


# ── le plan, dans la boucle ──────────────────────────────────────────────────


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
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeStream(self._responses.pop(0))


def _usage():
    return SimpleNamespace(
        input_tokens=10,
        output_tokens=5,
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
    )


def _tool(name: str, block_id: str):
    return SimpleNamespace(
        stop_reason="tool_use",
        content=[SimpleNamespace(type="tool_use", name=name, input={}, id=block_id)],
        usage=_usage(),
    )


def _answer(text: str):
    return SimpleNamespace(
        stop_reason="end_turn",
        content=[SimpleNamespace(type="text", text=text)],
        usage=_usage(),
    )


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())
    messages = _FakeMessages([])

    def _factory(**_kwargs):
        return SimpleNamespace(messages=messages)

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", _factory)
    return messages


@pytest.mark.asyncio
async def test_a_complex_turn_gets_a_third_tool_round(client, monkeypatch):
    """#2276.39 — le budget d'outils suit la complexité : trois rounds pour une
    stratégie, deux pour le reste (le chemin d'avant)."""
    client._responses = [_tool("list_accounts", f"t{i}") for i in range(3)] + [
        _answer("Voilà.")
    ]
    monkeypatch.setattr(
        chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"ok": 1})
    )

    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "u",
        user_id="u1",
        profile_data=None,
        tier_request="donne-moi une stratégie de compte pour Thales",
    )

    # 3 rounds d'outils + le tour final.
    assert len(client.calls) == 4


@pytest.mark.asyncio
async def test_a_simple_turn_keeps_two_tool_rounds(client, monkeypatch):
    client._responses = [_tool("list_accounts", f"t{i}") for i in range(2)] + [
        _answer("Voilà.")
    ]
    monkeypatch.setattr(
        chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"ok": 1})
    )

    await chat_orchestrator.run_chat_with_tools(
        "sys", "u", user_id="u1", profile_data=None, tier_request="ouvre Thales"
    )

    assert len(client.calls) == 3


@pytest.mark.asyncio
async def test_a_critical_round_adds_the_figures_control_before_the_next_call(
    client, monkeypatch
):
    """#2276.41 — un round qui a lu du financier impose la règle des chiffres au
    tour suivant ; un round ordinaire, non."""
    client._responses = [_tool("get_revenue", "t1"), _answer("CA : 1 000 €.")]
    monkeypatch.setattr(
        chat_orchestrator,
        "execute_chat_tool",
        AsyncMock(return_value={"revenue": 1000}),
    )

    await chat_orchestrator.run_chat_with_tools(
        "sys", "u", user_id="u1", profile_data=None, tier_request="mon CA ?"
    )

    second = client.calls[1]["messages"]
    assert chat_orchestrator._CRITICAL_CONTROL_NOTE in str(second)


@pytest.mark.asyncio
async def test_an_ordinary_round_adds_no_control(client, monkeypatch):
    client._responses = [_tool("list_accounts", "t1"), _answer("Trois comptes.")]
    monkeypatch.setattr(
        chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"count": 3})
    )

    await chat_orchestrator.run_chat_with_tools(
        "sys", "u", user_id="u1", profile_data=None, tier_request="mes comptes"
    )

    assert chat_orchestrator._CRITICAL_CONTROL_NOTE not in str(
        client.calls[1]["messages"]
    )


@pytest.mark.asyncio
async def test_the_self_check_runs_on_a_critical_turn_and_logs_ungrounded_figures(
    client, monkeypatch, caplog
):
    """#2276.42 — le self-check se choisit : il tourne sur un tour critique, et
    nomme le NOMBRE de chiffres qu'aucun outil n'a rendus (jamais le texte)."""
    client._responses = [
        _tool("get_revenue", "t1"),
        _answer("CA : 1 000 €, en hausse de 37 %."),
    ]
    monkeypatch.setattr(
        chat_orchestrator,
        "execute_chat_tool",
        AsyncMock(return_value={"revenue": 1000}),
    )

    with caplog.at_level("WARNING"):
        await chat_orchestrator.run_chat_with_tools(
            "sys", "u", user_id="u1", profile_data=None, tier_request="mon CA ?"
        )

    lines = [r.getMessage() for r in caplog.records if "self-check" in r.getMessage()]
    assert lines and "unverified=1" in lines[0]
    assert "37" not in lines[0]


@pytest.mark.asyncio
async def test_the_self_check_logs_a_number_missing_its_unit_on_a_critical_turn(client, monkeypatch, caplog):
    """#3207 (#213.1, #213.3, #213.7) — le self-check nomme aussi le NOMBRE de
    chiffres sans unité ni période à proximité, jamais le texte."""
    client._responses = [_tool("get_revenue", "t1"), _answer("41 consultants observés.")]
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"revenue": 1000}))

    with caplog.at_level("WARNING"):
        await chat_orchestrator.run_chat_with_tools(
            "sys", "u", user_id="u1", profile_data=None, tier_request="mon CA ?"
        )

    lines = [r.getMessage() for r in caplog.records if "sans unité" in r.getMessage()]
    assert lines and "sans_unite=1" in lines[0]
    assert "41" not in lines[0]


@pytest.mark.asyncio
async def test_the_self_check_logs_an_unjustified_exhaustiveness_claim_on_a_critical_turn(
    client, monkeypatch, caplog
):
    """#3208 (#214.4, #214.7) — le self-check nomme aussi le NOMBRE de
    réclamations d'exhaustivité non nuancées, jamais le texte."""
    client._responses = [_tool("get_revenue", "t1"), _answer("CA : 1 000 €. Voici tous les décideurs du compte.")]
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"revenue": 1000}))

    with caplog.at_level("WARNING"):
        await chat_orchestrator.run_chat_with_tools(
            "sys", "u", user_id="u1", profile_data=None, tier_request="mon CA ?"
        )

    lines = [r.getMessage() for r in caplog.records if "exhaustivité" in r.getMessage()]
    assert lines and "claims=1" in lines[0]
    assert "décideurs" not in lines[0]


@pytest.mark.asyncio
async def test_no_self_check_on_an_ordinary_turn(client, monkeypatch, caplog):
    client._responses = [_tool("list_accounts", "t1"), _answer("Il y en a 42.")]
    monkeypatch.setattr(
        chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"count": 3})
    )

    with caplog.at_level("WARNING"):
        await chat_orchestrator.run_chat_with_tools(
            "sys", "u", user_id="u1", profile_data=None, tier_request="mes comptes"
        )

    assert not [r for r in caplog.records if "self-check" in r.getMessage()]


# ── #2276.43 — jamais un modèle économique pour une demande complexe ─────────


def _route(tier: str, reason: str):
    task = f"chat_{tier}"
    return lambda *_a, **_k: ChatRoute(task, f"bellum_chat_{tier}", ChatTierDecision(tier, reason))  # type: ignore[arg-type]


def test_a_deep_turn_routed_to_an_economic_model_falls_back_to_the_chat_route(
    client, monkeypatch
):
    monkeypatch.setattr(
        chat_orchestrator, "resolve_chat_route", _route("deep", "multi_step_plan")
    )
    anthropic_provider = SimpleNamespace(name="anthropic")

    def _dispatch(task, model, requirements=None):
        return (
            (anthropic_provider, "claude-haiku-4-5")
            if task == "chat_deep"
            else (anthropic_provider, "claude-sonnet-5")
        )

    monkeypatch.setattr(chat_orchestrator.llm_gateway, "resolve_dispatch", _dispatch)
    turns = chat_orchestrator._make_turns(
        system_prompt="s", max_tokens=10, tier_request="stratégie", tier_context=None
    )
    assert turns.model == "claude-sonnet-5"


def test_a_deep_turn_never_lands_on_an_economic_model_even_if_the_chat_route_is_economic(
    client, monkeypatch
):
    monkeypatch.setattr(
        chat_orchestrator, "resolve_chat_route", _route("deep", "multi_step_plan")
    )
    provider = SimpleNamespace(name="anthropic")
    monkeypatch.setattr(
        chat_orchestrator.llm_gateway,
        "resolve_dispatch",
        lambda *_a: (provider, "claude-haiku-4-5"),
    )
    turns = chat_orchestrator._make_turns(
        system_prompt="s", max_tokens=10, tier_request="stratégie", tier_context=None
    )
    assert not is_economic_model(turns.model)


def test_a_fast_turn_may_use_an_economic_model(client, monkeypatch):
    """La garde sait dire NON : le quotidien reste libre d'être rapide."""
    monkeypatch.setattr(
        chat_orchestrator, "resolve_chat_route", _route("fast", "default")
    )
    provider = SimpleNamespace(name="anthropic")
    monkeypatch.setattr(
        chat_orchestrator.llm_gateway,
        "resolve_dispatch",
        lambda *_a: (provider, "claude-haiku-4-5"),
    )
    turns = chat_orchestrator._make_turns(
        system_prompt="s", max_tokens=10, tier_request="ouvre", tier_context=None
    )
    assert turns.model == "claude-haiku-4-5"


@pytest.mark.asyncio
async def test_capability_fallback_is_reported_in_turn_observability(client, monkeypatch):
    """#3861.5 — le repli de #2276.43 (un modèle économique écarté pour une
    demande complexe) doit se VÉRIFIER, pas seulement se journaliser : il
    atteint l'observabilité du tour, que `app/routers/chat.py` expose à
    l'API (`turn_observability_as_dict`), jamais seulement un `logger.warning`
    qu'il faudrait grepper en prod pour le découvrir."""
    monkeypatch.setattr(
        chat_orchestrator, "resolve_chat_route", _route("deep", "multi_step_plan")
    )
    anthropic_provider = SimpleNamespace(name="anthropic")

    def _dispatch(task, model, requirements=None):
        return (
            (anthropic_provider, "claude-haiku-4-5")
            if task == "chat_deep"
            else (anthropic_provider, "claude-sonnet-5")
        )

    monkeypatch.setattr(chat_orchestrator.llm_gateway, "resolve_dispatch", _dispatch)
    client._responses = [_answer("Voilà la stratégie.")]
    sink: list = []
    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "u",
        user_id="u1",
        profile_data=None,
        tier_request="stratégie",
        observability_sink=sink,
    )
    assert sink[-1].capability_fallback is True


@pytest.mark.asyncio
async def test_no_capability_fallback_reported_on_an_ordinary_turn(client, monkeypatch):
    client._responses = [_answer("Voilà.")]
    sink: list = []
    await chat_orchestrator.run_chat_with_tools(
        "sys", "u", user_id="u1", profile_data=None, observability_sink=sink
    )
    assert sink[-1].capability_fallback is False


@pytest.mark.asyncio
async def test_the_control_note_is_framed_as_an_internal_directive_not_a_user_message(
    client, monkeypatch
):
    """#3178 / #193.4 (recette 29/09) — « Analyse le groupe Société Générale »
    a reçu « Compris. Pour la suite, je citerai chaque chiffre exactement… » :
    la note de contrôle est rejointe au tour UTILISATEUR (`_append_user_note`),
    sans cadre, donc le modèle l'a lue comme une consigne de la personne et lui
    a répondu. Le cadre dit que la note est INTERNE et qu'on n'y répond pas."""
    client._responses = [_tool("get_revenue", "t1"), _answer("CA : 1 000 €.")]
    monkeypatch.setattr(
        chat_orchestrator,
        "execute_chat_tool",
        AsyncMock(return_value={"revenue": 1000}),
    )

    await chat_orchestrator.run_chat_with_tools(
        "sys", "u", user_id="u1", profile_data=None, tier_request="mon CA ?"
    )

    last_user = client.calls[1]["messages"][-1]
    texts = [b["text"] for b in last_user["content"] if b.get("type") == "text"]
    note = next(t for t in texts if chat_orchestrator._CRITICAL_CONTROL_NOTE in t)
    assert "interne" in note.lower()
    assert "n'y réponds pas" in note.lower()
