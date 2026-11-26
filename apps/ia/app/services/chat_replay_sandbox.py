"""#2445.6 (#2442.16, #2766) — LE BAC À SABLE DE REJEU, sans écriture ni débit.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
#2445.6 / #2442.16 demandent un rejeu de tour de copilote qui n'écrit ni ne
débite — pour comparer une nouvelle version de prompt contre un tour déjà
JOUÉ, sans reproduire ses effets de bord. Deux tris précédents (lot e8, lot
`nuit-01-25-09`) avaient noté que la trace d'un tour porte déjà versions/
outils/statuts, mais que « le snapshot masqué des résultats d'outils et le
sandbox sans écriture ni débit restent à construire ».

Ce module construit l'EXÉCUTEUR du bac à sable — la pièce qui rend la
garantie structurelle « sans écriture ni débit » VÉRIFIABLE, pas seulement
promise dans un docstring :

* `ReplaySandboxExecutor.execute` ne lit QUE le snapshot fourni à la
  construction — il n'importe, n'appelle ni ne référence AUCUN pont
  (`copilot-bridge`), AUCUN client HTTP, AUCUNE fonction du dispatcher réel
  (`app/services/tool_resilience.py`, `chat_tools.CHAT_TOOLS` exécuteurs). Un
  test dédié (`tests/test_chat_replay_sandbox.py::
  test_the_module_never_imports_a_real_execution_path`) lit le SOURCE de ce
  fichier et refuse ces imports — la garantie casse au diff, pas en silence.
* Un outil absent du snapshot rend un marqueur EXPLICITE
  (`REPLAY_UNAVAILABLE`), jamais un résultat inventé ni un vrai appel : le
  bac à sable ne DEVINE jamais ce qu'un outil non enregistré aurait rendu.

─────────────────────────────────────────────────────────────────────────────
CE QUI RESTE HORS DE CETTE TRANCHE
─────────────────────────────────────────────────────────────────────────────
`mask_tool_result` masque les SECRETS MACHINE (réutilise `redact_secrets`,
déjà écrit et testé) — pas une anonymisation générale des données métier
(noms, e-mails, montants d'un contact réel). Construire cette seconde couche
suppose de savoir, PAR OUTIL, quels champs de son résultat sont personnels —
un travail propre à chacun des 100+ outils du registre, hors de cette tranche.
Le bac à sable reste donc, à ce stade, à réserver à des ENREGISTREMENTS déjà
anonymisés ou synthétiques (même règle que le corpus, #2443.2) — jamais un
rejeu direct d'une trace de production brute.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.services.secret_redaction import redact_secrets

#: Rendu pour tout appel d'outil absent du snapshot — jamais un résultat
#: inventé, jamais un vrai appel.
REPLAY_UNAVAILABLE: dict[str, Any] = {
    "status": "replay_unavailable",
    "reason": "outil absent de l'enregistrement source — le bac à sable ne devine jamais un résultat",
}


def mask_tool_result(result: Any) -> Any:
    """Applique `redact_secrets` (secrets MACHINE — clés, jetons, hôtes
    internes) récursivement à chaque valeur texte d'un résultat d'outil.
    Ne masque PAS les données métier (voir le docstring du module)."""
    if isinstance(result, str):
        return redact_secrets(result)
    if isinstance(result, Mapping):
        return {key: mask_tool_result(value) for key, value in result.items()}
    if isinstance(result, list):
        return [mask_tool_result(item) for item in result]
    if isinstance(result, tuple):
        return tuple(mask_tool_result(item) for item in result)
    return result


@dataclass(frozen=True)
class RecordedToolCall:
    """Un appel d'outil déjà JOUÉ, tel que la trace du tour l'a capturé."""

    tool_name: str
    result: Any


def build_sandbox_snapshot(recorded_calls: tuple[RecordedToolCall, ...]) -> dict[str, Any]:
    """Le snapshot MASQUÉ que l'exécuteur du bac à sable consultera — un
    résultat par nom d'outil (le dernier enregistré gagne si un outil a été
    appelé plusieurs fois dans le tour source)."""
    return {call.tool_name: mask_tool_result(call.result) for call in recorded_calls}


@dataclass(frozen=True)
class ReplaySandboxExecutor:
    """L'exécuteur du bac à sable — AUCUN import de pont, de client HTTP ni de
    dispatcher réel dans ce fichier : c'est ce qui rend « sans écriture ni
    débit » une propriété STRUCTURELLE, pas une promesse."""

    snapshot: Mapping[str, Any]

    def execute(self, tool_name: str, _tool_input: Mapping[str, Any] | None = None) -> Any:
        if tool_name not in self.snapshot:
            return dict(REPLAY_UNAVAILABLE)
        return self.snapshot[tool_name]

    def to_json(self) -> str:
        """Pour journaliser ou committer un snapshot de rejeu (jamais le
        corps d'un message, doctrine — seuls les résultats d'outils masqués)."""
        return json.dumps(self.snapshot, ensure_ascii=False, sort_keys=True, default=str)
