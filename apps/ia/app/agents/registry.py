"""Registre des agents nommés (niveau-2, Théo).

Chaque brique de la méthode a un NOM, un TYPE (``algo`` déterministe vs ``prompt``
LLM) et pointe vers son implémentation RÉELLE. Rend le knowledge structuré — pas
« un dossier + quelques prompts flous » — et sert de carte à la décomposition
LangGraph v2 (un node = un agent). Voir agent_docs/knowledge-architecture.md.

Note : plusieurs agents que Théo listait en « prompt » sont en fait DÉTERMINISTES
ici (AccountScorer, QualityJudge, SourceJudge, ProfileInterpreter, EntitySelector)
— c'est justement le niveau-1 qu'il voulait (algo, pas prompt flou)."""

from __future__ import annotations

import importlib
from dataclasses import dataclass


@dataclass(frozen=True)
class Agent:
    name: str
    kind: str  # "algo" (déterministe, niveau-1) | "prompt" (LLM, niveau-2)
    module: str  # module d'implémentation (importable)
    entrypoint: str  # fonction/attribut clé (build_system_prompt, ou la fonction algo)
    role: str


AGENTS: tuple[Agent, ...] = (
    Agent("ProfileInterpreter", "algo", "app.services.esn_profiler", "derive_esn_rules", "Profil ESN → règles (archetype, entry mode, no-go)"),
    Agent("EntitySelector", "algo", "app.services.entities", "classify_entity_relevance", "Gate entité (operating / bruit / hors-secteur / no-go)"),
    Agent("SignalInterpreter", "prompt", "app.prompts.bellum_signals", "build_system_prompt", "Signaux publics → hypothèses actionnables"),
    Agent("ContactMapper", "prompt", "app.prompts.bellum_contacts", "build_system_prompt", "Contacts → rôles décisionnels + why"),
    Agent("AccountScorer", "algo", "app.services.account_score", "score_from_breakdown", "Score compte /25 + verdict GO/PRUDENT/STOP"),
    Agent("PlaySelector", "prompt", "app.prompts.bellum_strategy", "build_system_prompt", "Angles/plays pilotés par le profil + axes écartés"),
    Agent("ActionPlanGenerator", "prompt", "app.prompts.bellum_plan", "build_system_prompt", "Plan 30/60/90 + offres + quick wins"),
    Agent("MessageGenerator", "prompt", "app.prompts.bellum_messages", "build_system_prompt", "Messages M1 prêts (LinkedIn/email/tel)"),
    Agent("QualityJudge", "algo", "app.services.quality_judge", "judge_quality", "Juge qualité déterministe du dossier"),
    Agent("SourceJudge", "algo", "app.services.source_quality", "is_weak_source", "Qualité de source (écarte les sources faibles)"),
    Agent("AccountVocabularyBuilder", "prompt", "app.prompts.bellum_vocabulary_builder", "build_system_prompt", "Vocabulaire du groupe (grille de lecture par compte)"),
    # #2281 / épopée #2969 — plan d'exécution orienté résultat, PAS une
    # sélection d'outil au mot-clé : voir apps/ia/app/services/tool_planner.py.
    Agent("ToolPlanner", "algo", "app.services.tool_planner", "build_execution_plan", "Plan d'exécution métier + pénalités anti-tool-spam + journal"),
)

_BY_NAME = {a.name: a for a in AGENTS}


def get_agent(name: str) -> Agent | None:
    return _BY_NAME.get(name)


def resolve(agent: Agent) -> object:
    """Import the agent's module and return its entrypoint — proves the registry
    points at real code (raises if the reference is stale)."""
    mod = importlib.import_module(agent.module)
    return getattr(mod, agent.entrypoint)


def agent_map() -> dict[str, dict[str, str]]:
    """name → {kind, module, entrypoint, role} — for docs / a front architecture view."""
    return {a.name: {"kind": a.kind, "module": a.module, "entrypoint": a.entrypoint, "role": a.role} for a in AGENTS}
