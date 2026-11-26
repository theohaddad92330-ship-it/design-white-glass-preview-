"""Tool Planner — plan d'exécution orienté résultat (épopée #2969, issue #2281).

Avant ce module : Laura choisissait un outil au tour par tour, décidé par le
modèle round après round (`chat_orchestrator._run_tool_round`), jamais un plan
métier construit une fois pour tout le tour. #2281 le nomme : « rien de tout
cela n'existe » — c'est un planificateur NEUF, pas une extension d'un module
existant.

Trois règles de base (#2281.1-.3), tenues STRUCTURELLEMENT, pas seulement par
consigne de prompt :

1. `build_execution_plan` part d'une :class:`Intent` — jamais d'une chaîne
   brute — pour qu'aucun code ne puisse re-router sur un mot-clé.
2. Aucune table mot-clé → outil n'existe ici : la sélection lit le CONTEXTE
   (données déjà là, fraîcheur, coût, localité) — `test_same_keyword_yields_
   different_tools_depending_on_context` le prouve.
3. `_assert_not_bare_redirect` refuse tout plan qui se réduirait à UN seul
   outil de redirection d'écran (`propose_guided_action`, #2281.3 — « ouvrir
   tel écran n'est pas un plan ») sans rien d'autre.

Style aligné sur `app/agents/registry.py` (dataclasses frozen, docstrings qui
portent la RAISON) et sur `app/services/tool_call_audit.py` (journal fail-soft
: un incident d'écriture de log ne fait jamais planter le tour de chat).

Doctrine tenue ici :
- un timeout est `unknown`, jamais `failed` (`PlanExecutionLog.result`) ;
- aucune probabilité n'est calculée ni affichée ;
- « on n'affiche pas ce qu'on n'a pas » : un champ du contrat est toujours
  rempli, avec un tuple/dict VIDE plutôt qu'un `None` — jamais un axe qui
  disparaît silencieusement.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum

logger = logging.getLogger(__name__)


# ── Intention structurée (#2281.1 / #2281.2) ────────────────────────────────


@dataclass(frozen=True)
class Intent:
    """Ce que le planificateur reçoit — JAMAIS une chaîne brute.

    `goal` est la formulation métier du résultat voulu (peut contenir les
    mêmes mots qu'une autre intention : voir #2281.2, rien ici ne mappe un mot
    à un outil). `known_data` nomme ce que l'appelant sait déjà disponible
    localement (objets, pas texte libre) — c'est ce qui fait diverger deux
    plans qui partagent le même `goal`.
    """

    goal: str
    entities: tuple[str, ...] = ()
    known_data: tuple[str, ...] = ()
    constraints: tuple[str, ...] = ()


# ── Chemins possibles (#2281.23) ────────────────────────────────────────────


class PathKind(StrEnum):
    DIRECT_ANSWER = "direct_answer"
    LOCAL_FREE_SEARCH = "local_free_search"
    PUBLIC_SEARCH = "public_search"
    TARGETED_VERIFICATION = "targeted_verification"
    PAID_ENRICHMENT = "paid_enrichment"
    ASYNC_JOB = "async_job"
    PREFILLED_PAGE = "prefilled_page"
    HONEST_IMPOSSIBILITY = "honest_impossibility"


# ── Candidats outils / sources ──────────────────────────────────────────────


@dataclass(frozen=True)
class ToolCandidate:
    """Un outil candidat pour le plan, avec ce qu'il faut pour le PÉNALISER
    sans deviner : coût réel, objet qu'il produit (pour détecter les
    doublons, #2281.35), localité (#2281.34), et s'il vérifie une donnée déjà
    partiellement connue (#2281.23) ou fait une recherche exhaustive
    (#2281.33)."""

    name: str
    cost: float
    produces: str
    is_local: bool = False
    verifies: bool = False
    exhaustive: bool = False


REDIRECT_ONLY_TOOLS = frozenset({"propose_guided_action"})


class PlanTooNarrowError(ValueError):
    """#2281.3 — un plan qui se réduit à une redirection d'écran unique."""


# ── Pénalités de coût — anti-tool-spam (#2281.31 à #2281.35) ───────────────

PENALTY_REDUNDANT_CALL = "redundant_call"  # #2281.31
PENALTY_DATA_ALREADY_FRESH = "data_already_fresh"  # #2281.32
PENALTY_UNNECESSARY_EXHAUSTIVE_SEARCH = "unnecessary_exhaustive_search"  # #2281.33
PENALTY_COSTLIER_WHEN_LOCAL_SUFFICES = "costlier_when_local_suffices"  # #2281.34
PENALTY_DUPLICATE_OBJECT = "duplicate_object_producer"  # #2281.35


@dataclass(frozen=True)
class CostPenalty:
    tool: str
    reason: str
    detail: str


def apply_cost_penalties(
    candidates: tuple[ToolCandidate, ...],
    *,
    already_called: tuple[str, ...] = (),
    known_object_ages_s: dict[str, float] | None = None,
    freshness_ceiling_s: float = 3600.0,
    exhaustive_needed: bool = False,
) -> tuple[tuple[ToolCandidate, ...], tuple[CostPenalty, ...]]:
    """Écarte les candidats qui déclencheraient une des 5 pénalités
    anti-tool-spam et RETOURNE le pourquoi de chaque écart — jamais un simple
    filtrage muet (#2281.39/.40 en ont besoin en aval)."""
    known_object_ages_s = known_object_ages_s or {}
    kept: list[ToolCandidate] = []
    penalties: list[CostPenalty] = []

    # #2281.31 — appel redondant : déjà appelé dans ce même tour/plan.
    survivors: list[ToolCandidate] = []
    for c in candidates:
        if c.name in already_called:
            penalties.append(CostPenalty(c.name, PENALTY_REDUNDANT_CALL, f"{c.name} déjà appelé"))
            continue
        survivors.append(c)

    # #2281.32 — la donnée produite est déjà fraîche localement.
    next_survivors: list[ToolCandidate] = []
    for c in survivors:
        age = known_object_ages_s.get(c.produces)
        if age is not None and age <= freshness_ceiling_s:
            penalties.append(
                CostPenalty(c.name, PENALTY_DATA_ALREADY_FRESH, f"{c.produces} déjà frais ({age}s <= {freshness_ceiling_s}s)")
            )
            continue
        next_survivors.append(c)
    survivors = next_survivors

    # #2281.33 — recherche exhaustive non nécessaire.
    next_survivors = []
    for c in survivors:
        if c.exhaustive and not exhaustive_needed:
            penalties.append(
                CostPenalty(c.name, PENALTY_UNNECESSARY_EXHAUSTIVE_SEARCH, "recherche exhaustive non demandée par l'intention")
            )
            continue
        next_survivors.append(c)
    survivors = next_survivors

    # #2281.34 — un outil plus coûteux alors qu'une source locale suffit pour
    # le MÊME objet.
    local_objects = {c.produces for c in survivors if c.is_local and c.cost == 0}
    next_survivors = []
    for c in survivors:
        if c.produces in local_objects and not (c.is_local and c.cost == 0):
            penalties.append(
                CostPenalty(c.name, PENALTY_COSTLIER_WHEN_LOCAL_SUFFICES, f"source locale gratuite disponible pour {c.produces}")
            )
            continue
        next_survivors.append(c)
    survivors = next_survivors

    # #2281.35 — plusieurs outils produisant le même objet : on garde le moins
    # cher, à égalité le premier déclaré (ordre stable, déterministe).
    best_by_object: dict[str, ToolCandidate] = {}
    for c in survivors:
        current = best_by_object.get(c.produces)
        if current is None or c.cost < current.cost:
            best_by_object[c.produces] = c
    for c in survivors:
        if best_by_object[c.produces] is c:
            kept.append(c)
        else:
            penalties.append(
                CostPenalty(c.name, PENALTY_DUPLICATE_OBJECT, f"{best_by_object[c.produces].name} produit déjà {c.produces}")
            )

    return tuple(kept), tuple(penalties)


# ── Ne pas tout lancer par défaut (#2281.28) ────────────────────────────────


def select_sources(
    candidates: tuple[ToolCandidate, ...],
    *,
    required_objects: tuple[str, ...],
    already_called: tuple[str, ...] = (),
    known_object_ages_s: dict[str, float] | None = None,
    freshness_ceiling_s: float = 3600.0,
    exhaustive_needed: bool = False,
) -> tuple[tuple[ToolCandidate, ...], tuple[tuple[str, str], ...]]:
    """Choisit le SOUS-ENSEMBLE minimal de candidats qui couvre
    `required_objects` — jamais tous les candidats connectés par défaut
    (#2281.28, le motif « du code juste que personne n'appelle » commence
    souvent par un planificateur qui appelle tout)."""
    survivors, penalties = apply_cost_penalties(
        candidates,
        already_called=already_called,
        known_object_ages_s=known_object_ages_s,
        freshness_ceiling_s=freshness_ceiling_s,
        exhaustive_needed=exhaustive_needed,
    )
    ignored: list[tuple[str, str]] = [(p.tool, p.reason) for p in penalties]

    if not required_objects:
        selected = survivors
    else:
        wanted = set(required_objects)
        selected = tuple(c for c in survivors if c.produces in wanted)
        for c in survivors:
            if c.produces not in wanted:
                ignored.append((c.name, "objet non requis par l'intention"))

    all_names = {c.name for c in candidates}
    selected_names = {c.name for c in selected}
    ignored_names = {name for name, _ in ignored}
    for name in all_names - selected_names - ignored_names:
        ignored.append((name, "non nécessaire au résultat attendu"))

    return selected, tuple(ignored)


# ── Chemin retenu (#2281.23) ────────────────────────────────────────────────


def select_path(
    selected: tuple[ToolCandidate, ...],
    *,
    is_async: bool = False,
    prefilled_page: str | None = None,
    already_satisfied: bool = False,
) -> PathKind:
    """8 chemins possibles ; construit au moins la vérification ciblée
    (#2281.23) quand un candidat SÉLECTIONNÉ porte `verifies=True`.

    `already_satisfied` (#2281.2) distingue « rien à faire car déjà connu »
    (réponse directe) de « rien à faire car rien n'est disponible »
    (impossibilité honnête) — le MÊME plan vide n'a pas la même raison."""
    if prefilled_page is not None:
        return PathKind.PREFILLED_PAGE
    if is_async:
        return PathKind.ASYNC_JOB
    if not selected:
        return PathKind.DIRECT_ANSWER if already_satisfied else PathKind.HONEST_IMPOSSIBILITY
    if any(c.name in REDIRECT_ONLY_TOOLS for c in selected) and len(selected) == 1:
        return PathKind.DIRECT_ANSWER
    if any(c.verifies for c in selected) and len(selected) <= 2:
        return PathKind.TARGETED_VERIFICATION
    if all(c.is_local and c.cost == 0 for c in selected):
        return PathKind.LOCAL_FREE_SEARCH
    if any(c.cost > 0 for c in selected):
        return PathKind.PAID_ENRICHMENT
    return PathKind.PUBLIC_SEARCH


# ── Contrat du plan — 16 champs (#2281.4 à #2281.19) ────────────────────────

PLAN_CONTRACT_FIELDS: tuple[str, ...] = (
    "expected_result",  # #2281.4
    "intermediate_objects",  # #2281.5
    "available_data",  # #2281.6
    "required_sources",  # #2281.7
    "tools",  # #2281.8
    "order",  # #2281.9
    "dependencies",  # #2281.10
    "parallelizable_steps",  # #2281.11
    "optional_steps",  # #2281.12
    "estimated_cost",  # #2281.13
    "estimated_time_s",  # #2281.14
    "required_permissions",  # #2281.15
    "validation_points",  # #2281.16
    "stop_criteria",  # #2281.17
    "fallback",  # #2281.18
    "output_format",  # #2281.19
)


@dataclass(frozen=True)
class ExecutionPlan:
    intent_goal: str
    path: PathKind
    expected_result: str
    intermediate_objects: tuple[str, ...]
    available_data: tuple[str, ...]
    required_sources: tuple[str, ...]
    tools: tuple[str, ...]
    order: tuple[str, ...]
    dependencies: dict[str, tuple[str, ...]]
    parallelizable_steps: tuple[tuple[str, ...], ...]
    optional_steps: tuple[str, ...]
    estimated_cost: float
    estimated_time_s: float
    required_permissions: tuple[str, ...]
    validation_points: tuple[str, ...]
    stop_criteria: tuple[str, ...]
    fallback: str | None
    output_format: str
    ignored_tools: tuple[tuple[str, str], ...] = ()
    penalties: tuple[CostPenalty, ...] = ()


def _assert_not_bare_redirect(selected: tuple[ToolCandidate, ...], validation_points: tuple[str, ...]) -> None:
    if (
        len(selected) == 1
        and selected[0].name in REDIRECT_ONLY_TOOLS
        and not validation_points
    ):
        raise PlanTooNarrowError(
            f"« {selected[0].name} » seul n'est pas un plan (#2281.3) — "
            "ouvrir un écran n'est jamais la réponse à une demande complexe."
        )


def build_execution_plan(
    intent: Intent,
    *,
    candidates: tuple[ToolCandidate, ...],
    already_called: tuple[str, ...] = (),
    known_object_ages_s: dict[str, float] | None = None,
    freshness_ceiling_s: float = 3600.0,
    exhaustive_needed: bool = False,
    required_permissions: tuple[str, ...] = (),
    output_format: str = "text",
    is_async: bool = False,
    prefilled_page: str | None = None,
    fallback: str | None = None,
) -> ExecutionPlan:
    """Construit le plan métier — jamais une sélection d'outil au mot-clé
    (#2281.1/.2), jamais réduit à une redirection unique (#2281.3)."""
    if not isinstance(intent, Intent):
        raise TypeError(
            "build_execution_plan attend une Intent structurée, jamais une chaîne brute (#2281.1/.2)"
        )

    required_objects = tuple(intent.entities) or tuple(sorted({c.produces for c in candidates}))
    # #2281.2 — une donnée déjà déclarée disponible (`known_data`) compte comme
    # fraîche d'office : c'est ce qui fait diverger deux plans qui partagent le
    # même mot dans `goal`, sans jamais lire ce mot lui-même.
    ages_from_known_data = {name: 0.0 for name in intent.known_data}
    effective_ages = {**ages_from_known_data, **(known_object_ages_s or {})}

    selected, ignored = select_sources(
        candidates,
        required_objects=required_objects,
        already_called=already_called,
        known_object_ages_s=effective_ages,
        freshness_ceiling_s=freshness_ceiling_s,
        exhaustive_needed=exhaustive_needed,
    )
    _, penalties = apply_cost_penalties(
        candidates,
        already_called=already_called,
        known_object_ages_s=effective_ages,
        freshness_ceiling_s=freshness_ceiling_s,
        exhaustive_needed=exhaustive_needed,
    )

    validation_points = tuple(f"vérifier {c.produces}" for c in selected if not c.is_local)
    _assert_not_bare_redirect(selected, validation_points)

    already_satisfied = bool(required_objects) and set(required_objects) <= set(intent.known_data)
    path = select_path(
        selected, is_async=is_async, prefilled_page=prefilled_page, already_satisfied=already_satisfied
    )

    order = tuple(c.name for c in selected)
    tools = order
    intermediate_objects = tuple(dict.fromkeys(c.produces for c in selected))
    estimated_cost = sum(c.cost for c in selected)
    # Estimation grossière et déterministe : local = quasi instantané, distant
    # = 2s par appel — cohérente avec le vocabulaire "coût/vague" de
    # org-enrichment-planner (approche reprise, pas le code).
    estimated_time_s = sum(0.05 if c.is_local else 2.0 for c in selected)
    stop_criteria = (
        ("résultat attendu obtenu" if selected else "aucune source disponible — impossibilité honnête"),
    )

    return ExecutionPlan(
        intent_goal=intent.goal,
        path=path,
        expected_result=intent.goal,
        intermediate_objects=intermediate_objects,
        available_data=tuple(intent.known_data),
        required_sources=order,
        tools=tools,
        order=order,
        dependencies={},
        parallelizable_steps=(order,) if len(order) > 1 else (),
        optional_steps=(),
        estimated_cost=estimated_cost,
        estimated_time_s=estimated_time_s,
        required_permissions=required_permissions,
        validation_points=validation_points,
        stop_criteria=stop_criteria,
        fallback=fallback,
        output_format=output_format,
        ignored_tools=ignored,
        penalties=penalties,
    )


# ── Journal — 9 champs (#2281.36 à #2281.44) ────────────────────────────────

PLAN_LOG_FIELDS: tuple[str, ...] = (
    "planned_plan",  # #2281.36 — plan prévu
    "executed_order",  # #2281.37 — plan exécuté
    "chosen_tools",  # #2281.38 — outils choisis
    "ignored_tools",  # #2281.39 — outils ignorés
    "reasons",  # #2281.40 — raisons (choisi / ignoré)
    "cost",  # #2281.41 — coût prévu / réel
    "latency_s",  # #2281.42 — latence
    "result",  # #2281.43 — résultat
    "fallback_triggered",  # #2281.44 — fallback déclenché ou non
)


@dataclass(frozen=True)
class PlanExecutionLog:
    planned_plan: ExecutionPlan
    executed_order: tuple[str, ...]
    chosen_tools: tuple[str, ...]
    ignored_tools: tuple[tuple[str, str], ...]
    reasons: dict[str, str]
    cost: dict[str, float]
    latency_s: float
    result: str
    fallback_triggered: bool


def build_plan_execution_log(
    plan: ExecutionPlan,
    *,
    executed_order: tuple[str, ...],
    chosen_tools: tuple[str, ...],
    ignored_tools: tuple[tuple[str, str], ...],
    reasons: dict[str, str],
    cost_planned: float,
    cost_actual: float,
    latency_s: float,
    result: str,
    fallback_triggered: bool,
) -> PlanExecutionLog:
    """Assemble le journal à 9 champs. `result` suit la doctrine timeout :
    ``"unknown"`` jamais ``"failed"`` pour un dépassement de délai — c'est
    l'APPELANT qui choisit le mot, ce module ne le devine pas."""
    return PlanExecutionLog(
        planned_plan=plan,
        executed_order=tuple(executed_order),
        chosen_tools=tuple(chosen_tools),
        ignored_tools=tuple(ignored_tools),
        reasons=dict(reasons),
        cost={"planned": cost_planned, "actual": cost_actual},
        latency_s=latency_s,
        result=result,
        fallback_triggered=fallback_triggered,
    )


def summarize_and_record_round(
    *,
    goal: str,
    available_tool_names: tuple[str, ...],
    chosen_tool_names: tuple[str, ...],
    latency_s: float,
    result: str,
    fallback_triggered: bool = False,
) -> PlanExecutionLog | None:
    """Point d'intégration LÉGER pour `chat_orchestrator._run_tool_round` :
    journalise ce que le modèle a choisi CONTRE ce qui lui était présenté,
    sans changer son comportement (observation seule — le planificateur
    normatif reste `build_execution_plan`, avec ses 5 pénalités de coût, pour
    un appelant qui connaît le coût/l'objet réel de chaque candidat).

    Fail-soft de bout en bout, même geste que `tool_call_audit.record_tool_call`
    : un incident ici ne doit jamais faire planter un tour de chat par
    ailleurs correct. Rend `None` quand rien n'a pu être journalisé."""
    try:
        candidates = tuple(
            ToolCandidate(name=name, cost=0.0, produces=name, is_local=True) for name in available_tool_names
        )
        plan = build_execution_plan(Intent(goal=goal), candidates=candidates)
        ignored = tuple(
            (name, "non appelé par le modèle ce round")
            for name in available_tool_names
            if name not in chosen_tool_names
        )
        log = build_plan_execution_log(
            plan,
            executed_order=chosen_tool_names,
            chosen_tools=chosen_tool_names,
            ignored_tools=ignored,
            reasons={name: "sélectionné par le modèle" for name in chosen_tool_names},
            cost_planned=0.0,
            cost_actual=0.0,
            latency_s=latency_s,
            result=result,
            fallback_triggered=fallback_triggered,
        )
        record_plan_execution_log(log)
        return log
    except Exception:  # noqa: BLE001 — jamais faire planter le chat pour un journal
        logger.exception("tool_planner: échec du résumé de round")
        return None


def record_plan_execution_log(log: PlanExecutionLog) -> None:
    """Fail-soft, même geste que `tool_call_audit.record_tool_call` : un
    incident d'écriture de journal ne doit JAMAIS faire planter un tour de
    chat par ailleurs correct. Le corps des messages ne sort jamais vers un
    journal (doctrine) — seuls des noms d'outils et des nombres sont loggés."""
    try:
        logger.info(
            "tool_planner: plan exécuté chosen=%s ignored=%d cost=%s latency_s=%.3f result=%s fallback=%s",
            log.chosen_tools,
            len(log.ignored_tools),
            log.cost,
            log.latency_s,
            log.result,
            log.fallback_triggered,
        )
    except Exception:  # noqa: BLE001 — le journal ne doit jamais faire planter le chat
        logger.exception("tool_planner: échec d'écriture du journal de plan")
