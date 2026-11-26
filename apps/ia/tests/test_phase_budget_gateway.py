"""Le budget d'une phase ne dépasse JAMAIS celui de sa passerelle.

## Ce que cette garde protège

Deux budgets bornent la même phase, dans deux langages qui ne s'importent pas :

* ``PHASE_TIMEOUTS_S`` (`apps/ia/app/graph/builder.py`) — le budget INTÉRIEUR,
  celui qui sait convertir un dépassement en message typé et en français ;
* ``PHASE_TIMEOUT_MS`` (`apps/api/.../analysis.constants.ts`) — la PASSERELLE,
  le budget réseau que l'API accorde à l'appel.

Si la passerelle coupe la première, le graphe n'a jamais l'occasion de rendre
son verdict : l'utilisateur reçoit « analyse interrompue » à la place de
« l'étape plan d'action a dépassé son temps de calcul (budget : 350 s) —
restreins le périmètre ». **La garde-fou qui existe pour rendre la panne lisible
devient la première chose que la panne emporte.**

## Pourquoi elle LIT le fichier TypeScript

Parce qu'aucun des deux dépôts ne peut voir l'autre. C'est le motif déjà employé
par `test_cache_freshness_guarantee.py`, qui lit les DEUX constantes plutôt que
de faire confiance à un commentaire.

Le 31/08/2026, remonter le budget du plan de 260 à 350 s côté graphe l'aurait
inversé côté API, où il valait 300 — le correctif aurait créé le défaut qu'il
venait corriger, et aucune suite ne l'aurait vu.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.graph.builder import PHASE_TIMEOUTS_S

_CONSTANTS = (
    Path(__file__).resolve().parents[2] / "api" / "src" / "modules" / "analysis" / "analysis.constants.ts"
)


def _gateway_budgets_seconds() -> dict[str, float]:
    """Les budgets de la passerelle, lus dans le TypeScript.

    On lit le bloc ``PHASE_TIMEOUT_MS`` et lui seul : parcourir tout le fichier
    ramasserait ``JOB_TIMEOUT_MS`` et rendrait la garde fausse dans le sens
    permissif — celui qui ne se remarque pas.
    """
    source = _CONSTANTS.read_text(encoding="utf-8")
    block = re.search(r"PHASE_TIMEOUT_MS[^=]*=\s*\{(.*?)\}", source, re.S)
    assert block, "bloc PHASE_TIMEOUT_MS introuvable — le fichier a été renommé ou restructuré"
    pairs = re.findall(r"(\w+)\s*:\s*([\d_]+)", block.group(1))
    return {name: int(value.replace("_", "")) / 1000 for name, value in pairs}


def test_the_gateway_file_is_readable_and_carries_every_phase():
    """Garde de corpus. Sans elle, un fichier déplacé rendrait un dict VIDE et
    le test ci-dessous passerait en ne comparant rien."""
    gateway = _gateway_budgets_seconds()
    assert set(gateway) == {"research", "contacts", "classify", "plan"}
    assert all(value > 0 for value in gateway.values())


@pytest.mark.parametrize("phase", ["research", "contacts", "classify", "plan"])
def test_the_gateway_budget_outlasts_the_graph_budget(phase: str):
    gateway = _gateway_budgets_seconds()[phase]
    inner = PHASE_TIMEOUTS_S[f"phase_{phase}"]

    assert gateway > inner, (
        f"phase « {phase} » : la passerelle API coupe à {gateway:g}s alors que le "
        f"graphe s'accorde {inner:g}s. L'API couperait la première et le "
        f"dépassement sortirait en « analyse interrompue » au lieu de nommer la "
        f"phase. Monter PHASE_TIMEOUT_MS.{phase} dans analysis.constants.ts."
    )
