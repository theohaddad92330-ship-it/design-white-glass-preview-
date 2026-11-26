"""#2440.82 — un changement de fournisseur ou de modèle déclenche les évaluations.

Les prompts, les goldens et le banc (`app.eval`) sont calibrés sur la référence
Anthropic. Dès qu'une tâche part ailleurs (`LLM_ROUTE_<TASK>` /
`LLM_GATEWAY_ROUTING`), la qualité de sa sortie n'est plus prouvée : la tâche
est « à évaluer » tant que l'opérateur n'a pas rejoué les évaluations ET déclaré
la destination dans `LLM_ROUTING_EVALS_PASSED` (liste `provider` ou
`provider:model`, séparée par des virgules).

Tranché sans Louis : on SIGNALE, on ne bloque pas — refuser d'appeler un
fournisseur routé couperait la production sur une oubli de déclaration. Une
destination jamais évaluée n'est jamais « ok » : c'est `to_evaluate`, nommée,
avec la commande de rejeu. Sans réglage posé, tout est `reference` (chemin
inchangé, aucun appel réseau).

Le routage reste décrit à UN seul endroit (`llm_gateway.describe_routing_policy`,
GA-26) ; ce module n'en refait pas la dérivation, il la lit.

Une destination est « évaluée » si elle est déclarée par L'UN OU L'AUTRE des
deux chemins, fusionnés : la variable d'env `LLM_ROUTING_EVALS_PASSED` (geste
de déploiement, posée avant ce lot) OU la table `llm_routing_eval_declarations`
(`provider_eval_declarations.py`, #2975 — geste de console, sans redéploiement).
Les deux répondent à la MÊME question (cette destination est-elle déclarée
évaluée ?) par deux gestes distincts, jamais deux vérités qui pourraient
diverger : une destination déclarée par L'UN est évaluée, point.
"""

from __future__ import annotations

import os
from typing import Any, Literal, NamedTuple

from app.services import provider_eval_declarations
from app.services.llm_gateway import PROVIDER_ANTHROPIC, describe_routing_policy

EVALS_PASSED_ENV = "LLM_ROUTING_EVALS_PASSED"

#: Rejeu LIVE du banc contre la destination routée (le banc hors-ligne ne parle à
#: aucun fournisseur : le rejouer ne prouverait rien sur un autre modèle).
REPLAY_COMMAND = "python -m app.eval.run --live <entreprise> --check-baseline"

EvalState = Literal["reference", "evaluated", "to_evaluate"]


class EvalStatus(NamedTuple):
    task: str
    provider: str
    model: str | None
    status: EvalState
    replay_command: str | None


def _declared_env() -> frozenset[str]:
    raw = os.environ.get(EVALS_PASSED_ENV, "")
    return frozenset(part.strip().lower() for part in raw.split(",") if part.strip())


async def eval_status_by_task(*, sb: Any | None = None) -> tuple[EvalStatus, ...]:
    declared = _declared_env() | await provider_eval_declarations.declared_keys(sb=sb)
    rows = []
    for entry in describe_routing_policy():
        provider = entry.provider.lower()
        if provider == PROVIDER_ANTHROPIC:
            state: EvalState = "reference"
        elif provider in declared or (entry.model and f"{provider}:{entry.model.lower()}" in declared):
            state = "evaluated"
        else:
            state = "to_evaluate"
        rows.append(
            EvalStatus(entry.task, entry.provider, entry.model, state, REPLAY_COMMAND if state == "to_evaluate" else None)
        )
    return tuple(rows)


async def pending(*, sb: Any | None = None) -> tuple[EvalStatus, ...]:
    return tuple(r for r in await eval_status_by_task(sb=sb) if r.status == "to_evaluate")
