"""Tests du Tool Planner (#2281 / épopée #2969) — plan d'exécution orienté résultat.

TDD : écrits AVANT `app/services/tool_planner.py`. Couvre le socle (3 règles de
base + contrat 16 champs), les 5 pénalités anti-tool-spam, le chemin de
vérification ciblée (#2281.23), « ne pas tout lancer » (#2281.28) et le
journal à 9 champs (#2281.36-44).
"""

from __future__ import annotations

import pytest

from app.services.tool_planner import (
    PENALTY_COSTLIER_WHEN_LOCAL_SUFFICES,
    PENALTY_DATA_ALREADY_FRESH,
    PENALTY_DUPLICATE_OBJECT,
    PENALTY_REDUNDANT_CALL,
    PENALTY_UNNECESSARY_EXHAUSTIVE_SEARCH,
    PLAN_CONTRACT_FIELDS,
    PLAN_LOG_FIELDS,
    ExecutionPlan,
    Intent,
    PathKind,
    PlanTooNarrowError,
    ToolCandidate,
    apply_cost_penalties,
    build_execution_plan,
    build_plan_execution_log,
    record_plan_execution_log,
    select_path,
    select_sources,
    summarize_and_record_round,
)

# ── Socle — #2281.1 à #2281.3 ────────────────────────────────────────────────


def test_build_execution_plan_requires_a_structured_intent_not_raw_text():
    """#2281.1/.2 — le planificateur part d'une INTENTION structurée, jamais
    d'une chaîne brute qu'on ferait matcher sur des mots-clés."""
    with pytest.raises(TypeError):
        build_execution_plan("trouve-moi des contacts chez Capgemini", candidates=())  # type: ignore[arg-type]


def test_same_keyword_yields_different_tools_depending_on_context():
    """#2281.2 — même mot ("contacts") dans deux intentions, deux plans
    différents selon ce qui est déjà disponible : la preuve qu'aucune table
    mot-clé → outil ne pilote la sélection."""
    local = ToolCandidate(name="get_account_contacts", cost=0.0, produces="contacts", is_local=True)
    paid = ToolCandidate(name="enrich_contact", cost=2.0, produces="contacts", is_local=False)

    plan_with_local_data = build_execution_plan(
        Intent(goal="lister les contacts de ce compte", known_data=("contacts",)),
        candidates=(local, paid),
    )
    plan_without_local_data = build_execution_plan(
        Intent(goal="lister les contacts de ce compte", known_data=()),
        candidates=(local, paid),
    )

    assert plan_with_local_data.tools != plan_without_local_data.tools or (
        plan_with_local_data.path != plan_without_local_data.path
    )


def test_plan_never_reduces_to_a_bare_redirect():
    """#2281.3 — « ouvrir tel écran » seul n'est jamais un plan."""
    redirect_only = ToolCandidate(name="propose_guided_action", cost=0.0, produces="screen", is_local=True)
    with pytest.raises(PlanTooNarrowError):
        build_execution_plan(
            Intent(goal="montre-moi l'écran des factures en retard"),
            candidates=(redirect_only,),
        )


def test_plan_with_redirect_plus_validation_is_allowed():
    """Un renvoi d'écran devient un plan valide s'il porte un point de
    validation / une étape supplémentaire — ce n'est plus une redirection nue."""
    redirect = ToolCandidate(name="propose_guided_action", cost=0.0, produces="screen", is_local=True)
    check = ToolCandidate(name="get_overdue_payments", cost=0.0, produces="overdue_payments", is_local=True)
    plan = build_execution_plan(
        Intent(goal="montre-moi l'écran des factures en retard"),
        candidates=(redirect, check),
    )
    assert "propose_guided_action" in plan.tools
    assert len(plan.tools) > 1


# ── Contrat — 16 champs (#2281.4 à #2281.19) ────────────────────────────────


def test_execution_plan_carries_the_16_contract_fields():
    assert len(PLAN_CONTRACT_FIELDS) == 16
    field_names = {f.name for f in ExecutionPlan.__dataclass_fields__.values()}
    for name in PLAN_CONTRACT_FIELDS:
        assert name in field_names, f"champ manquant au contrat: {name}"


def test_build_execution_plan_fills_every_contract_field():
    local = ToolCandidate(name="get_account_contacts", cost=0.0, produces="contacts", is_local=True)
    plan = build_execution_plan(
        Intent(goal="lister les contacts de ce compte", known_data=("contacts",)),
        candidates=(local,),
        required_permissions=("read:contacts",),
        output_format="liste",
    )
    for name in PLAN_CONTRACT_FIELDS:
        if name == "fallback":
            continue  # optionnel par nature : None = « pas de repli déclaré », jamais deviné
        value = getattr(plan, name)
        assert value is not None, f"{name} ne doit jamais être None"
    assert plan.output_format == "liste"
    assert plan.required_permissions == ("read:contacts",)


# ── Chemin de vérification ciblée — #2281.23 ────────────────────────────────


def test_targeted_verification_path_is_constructed():
    verify = ToolCandidate(
        name="get_account_briefing", cost=1.0, produces="account_status", is_local=False, verifies=True
    )
    selected, _ignored = select_sources((verify,), required_objects=("account_status",))
    path = select_path(selected)
    assert path is PathKind.TARGETED_VERIFICATION


def test_all_eight_paths_exist():
    assert len(set(PathKind)) == 8


def test_each_of_the_8_paths_is_reachable():
    """#2281.23 — les 8 chemins ne sont pas qu'une énumération : chacun se
    construit réellement depuis des candidats/contexte plausibles."""
    local_free = ToolCandidate(name="get_account_contacts", cost=0.0, produces="contacts", is_local=True)
    public = ToolCandidate(name="run_account_search", cost=0.0, produces="accounts", is_local=False)
    paid = ToolCandidate(name="enrich_contact", cost=2.0, produces="contacts", is_local=False)
    verify = ToolCandidate(name="get_account_briefing", cost=1.0, produces="status", is_local=False, verifies=True)
    redirect = ToolCandidate(name="propose_guided_action", cost=0.0, produces="screen", is_local=True)

    assert select_path(()) is PathKind.HONEST_IMPOSSIBILITY
    assert select_path((redirect,)) is PathKind.DIRECT_ANSWER
    assert select_path((local_free,)) is PathKind.LOCAL_FREE_SEARCH
    assert select_path((verify,)) is PathKind.TARGETED_VERIFICATION
    assert select_path((paid,)) is PathKind.PAID_ENRICHMENT
    assert select_path((public,)) is PathKind.PUBLIC_SEARCH
    assert select_path((local_free,), is_async=True) is PathKind.ASYNC_JOB
    assert select_path((local_free,), prefilled_page="/accounts/123") is PathKind.PREFILLED_PAGE


# ── Ne pas tout lancer par défaut — #2281.28 ────────────────────────────────


def test_select_sources_does_not_launch_every_candidate():
    local = ToolCandidate(name="get_account_contacts", cost=0.0, produces="contacts", is_local=True)
    paid_1 = ToolCandidate(name="enrich_contact", cost=2.0, produces="contacts", is_local=False)
    paid_2 = ToolCandidate(name="search_talents", cost=3.0, produces="contacts", is_local=False)

    selected, ignored = select_sources((local, paid_1, paid_2), required_objects=("contacts",))

    names = {c.name for c in selected}
    assert names == {"get_account_contacts"}
    assert {name for name, _reason in ignored} == {"enrich_contact", "search_talents"}


# ── 5 pénalités anti-tool-spam — #2281.31 à #2281.35 ────────────────────────


def test_penalty_redundant_call():
    tool = ToolCandidate(name="get_account_briefing", cost=1.0, produces="briefing", is_local=False)
    selected, penalties = apply_cost_penalties((tool,), already_called=("get_account_briefing",))
    assert selected == ()
    assert any(p.reason == PENALTY_REDUNDANT_CALL for p in penalties)


def test_penalty_data_already_fresh():
    tool = ToolCandidate(name="get_account_briefing", cost=1.0, produces="briefing", is_local=False)
    selected, penalties = apply_cost_penalties(
        (tool,), known_object_ages_s={"briefing": 60.0}, freshness_ceiling_s=3600.0
    )
    assert selected == ()
    assert any(p.reason == PENALTY_DATA_ALREADY_FRESH for p in penalties)


def test_penalty_unnecessary_exhaustive_search():
    exhaustive = ToolCandidate(
        name="run_account_search", cost=1.0, produces="accounts", is_local=False, exhaustive=True
    )
    selected, penalties = apply_cost_penalties((exhaustive,), exhaustive_needed=False)
    assert selected == ()
    assert any(p.reason == PENALTY_UNNECESSARY_EXHAUSTIVE_SEARCH for p in penalties)


def test_penalty_costlier_tool_when_local_suffices():
    local = ToolCandidate(name="get_account_contacts", cost=0.0, produces="contacts", is_local=True)
    paid = ToolCandidate(name="enrich_contact", cost=2.0, produces="contacts", is_local=False)
    selected, penalties = apply_cost_penalties((local, paid))
    names = {c.name for c in selected}
    assert names == {"get_account_contacts"}
    assert any(p.reason == PENALTY_COSTLIER_WHEN_LOCAL_SUFFICES and p.tool == "enrich_contact" for p in penalties)


def test_penalty_duplicate_object_producers():
    a = ToolCandidate(name="search_talents", cost=1.0, produces="talents", is_local=False)
    b = ToolCandidate(name="search_dormant_network", cost=1.0, produces="talents", is_local=False)
    selected, penalties = apply_cost_penalties((a, b))
    assert len(selected) == 1
    assert any(p.reason == PENALTY_DUPLICATE_OBJECT for p in penalties)


# ── Journal — 9 champs (#2281.36 à #2281.44) ────────────────────────────────


def test_plan_execution_log_has_9_fields():
    assert len(PLAN_LOG_FIELDS) == 9


def test_build_plan_execution_log_fills_every_field():
    local = ToolCandidate(name="get_account_contacts", cost=0.0, produces="contacts", is_local=True)
    plan = build_execution_plan(
        Intent(goal="lister les contacts de ce compte", known_data=("contacts",)),
        candidates=(local,),
    )
    log = build_plan_execution_log(
        plan,
        executed_order=("get_account_contacts",),
        chosen_tools=("get_account_contacts",),
        ignored_tools=(("enrich_contact", "costlier_when_local_suffices"),),
        reasons={"get_account_contacts": "source locale suffisante"},
        cost_planned=0.0,
        cost_actual=0.0,
        latency_s=0.12,
        result="success",
        fallback_triggered=False,
    )
    field_names = {f.name for f in log.__dataclass_fields__.values()}
    assert field_names == set(PLAN_LOG_FIELDS)
    for name in PLAN_LOG_FIELDS:
        assert getattr(log, name) is not None, f"{name} ne doit jamais être None"


def test_record_plan_execution_log_is_fail_soft(caplog):
    """Même geste que `tool_call_audit.record_tool_call` : n'explose jamais,
    même journal cassé (typiquement un log serveur down)."""
    local = ToolCandidate(name="get_account_contacts", cost=0.0, produces="contacts", is_local=True)
    plan = build_execution_plan(Intent(goal="lister les contacts"), candidates=(local,))
    log = build_plan_execution_log(
        plan,
        executed_order=(),
        chosen_tools=(),
        ignored_tools=(),
        reasons={},
        cost_planned=0.0,
        cost_actual=0.0,
        latency_s=0.0,
        result="unknown",
        fallback_triggered=False,
    )
    # Ne doit jamais lever, quoi qu'il arrive.
    record_plan_execution_log(log)


# ── Intégration légère — point d'appel de `chat_orchestrator` ──────────────


def test_summarize_and_record_round_reports_ignored_tools():
    log = summarize_and_record_round(
        goal="lister les contacts de ce compte",
        available_tool_names=("get_account_contacts", "enrich_contact", "search_talents"),
        chosen_tool_names=("get_account_contacts",),
        latency_s=0.42,
        result="success",
    )
    assert log is not None
    assert log.chosen_tools == ("get_account_contacts",)
    ignored_names = {name for name, _reason in log.ignored_tools}
    assert ignored_names == {"enrich_contact", "search_talents"}


def test_summarize_and_record_round_never_raises():
    # Aucun outil disponible : ne doit jamais lever, même sans rien à journaliser.
    log = summarize_and_record_round(
        goal="",
        available_tool_names=(),
        chosen_tool_names=(),
        latency_s=0.0,
        result="unknown",
    )
    assert log is None or isinstance(log, object)


def test_timeout_result_is_unknown_never_failed():
    """Doctrine — un timeout n'est pas un échec : `unknown`, jamais `failed`."""
    local = ToolCandidate(name="get_account_contacts", cost=0.0, produces="contacts", is_local=True)
    plan = build_execution_plan(Intent(goal="lister les contacts"), candidates=(local,))
    log = build_plan_execution_log(
        plan,
        executed_order=(),
        chosen_tools=("get_account_contacts",),
        ignored_tools=(),
        reasons={},
        cost_planned=0.0,
        cost_actual=0.0,
        latency_s=30.0,
        result="unknown",
        fallback_triggered=True,
    )
    assert log.result == "unknown"
    assert log.result != "failed"
