"""LE BANC DU GATE CHAT — #2443.7 (#2899), doctrine c77.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
c77 (doctrine, `packages/contracts/src/schemas/doctrine-registry.ts`) : « la
porte de qualité IA est un GATE CI BLOQUANT sur les rôles clés ». Les cinq
suites `test_copilote_*_eval.py` bloquent déjà le CI pytest, mais aucune
d'elles ne compare une COUVERTURE à une BASELINE VERSIONNÉE isolée par rôle —
c'est ce que ce module ajoute : combien de cas du corpus (`CORPUS`,
`test_copilote_scenario_corpus.py`) portent un hard failure NOMMÉ
(`ChatHardFailure`, #2443.6), par RÔLE CLÉ (`Famille`, #1920 — les quatre
personas relecteurs de la méthode humain métier, #2443.4 : `NOUVEL_ARRIVANT`
n'en est pas un, c'est une ANCIENNETÉ, #1920.6).

Isolé sous `tests/` (nom sans préfixe `test_`, non collecté par pytest — même
convention que `copilote_scenario_metadata.py`) parce qu'il lit `CORPUS`, qui
vit sous `tests/` par décision #1948 (« une VUE, pas un fichier de plus »).
GA-193 (`test_dependency_declaration_guard.py`) refuse tout import de
`tests/` depuis `app/**`, y compris local et tardif — `app/eval/chat_gate.py`
reste donc une bibliothèque PURE (détection de surface) qui ne connaît PAS ce
module ; c'est CE fichier qui l'importe, dans le sens autorisé, et lui
INJECTE le banc réel (`run_gate(bench=_run_bench, ...)`, plus bas). Le point
d'entrée réel est ``python -m tests.chat_gate_bench``.

─────────────────────────────────────────────────────────────────────────────
FAIL SUR RÉGRESSION, JAMAIS SUR CROISSANCE
─────────────────────────────────────────────────────────────────────────────
Le banc dossier (`app/eval/gate.py`) exige une baseline figée, mise à jour à
la main après un changement intentionnel — adapté à huit scores continus. Ce
banc compte des CAS : le corpus grossit organiquement à chaque lot (100+
scénarios aujourd'hui, plus demain). Exiger une mise à jour de baseline à
CHAQUE ajout de scénario ferait du gate un bruit permanent, contournable par
réflexe. Le gate échoue donc UNIQUEMENT si la couverture d'un rôle clé
DIMINUE vs la baseline committée — jamais si elle progresse. Une diminution
ne peut venir que d'une suppression ou d'un déclassement de scénario, jamais
d'un ajout — c'est exactement la régression P0 que #2443.7 nomme.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.access.rights_matrix import Famille
from app.eval.chat_hard_failures import ChatHardFailure
from tests.test_copilote_scenario_corpus import CORPUS

#: apps/ia/tests/<ce fichier> → parents[2] = apps/ia.
_IA_ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = _IA_ROOT / "tests" / "golden" / "chat_gate_baseline.json"

#: doctrine c77 — les RÔLES CLÉS : les quatre personas relecteurs réels de la
#: méthode humain métier (#2443.4). `NOUVEL_ARRIVANT` en est exclu : ce n'est
#: pas un rôle mais une ANCIENNETÉ (#1920.6) — DÉRIVÉ de `Famille`, jamais une
#: seconde liste.
KEY_ROLES: tuple[Famille, ...] = tuple(f for f in Famille if f is not Famille.NOUVEL_ARRIVANT)


def hard_failure_coverage() -> dict[str, int]:
    """Combien de cas du corpus portent chaque hard failure NOMMÉ — les seize
    valeurs de `ChatHardFailure`, jamais un sous-ensemble deviné."""
    coverage = {failure.value: 0 for failure in ChatHardFailure}
    for item in CORPUS:
        for failure in item.hard_failures:
            coverage[failure.value] += 1
    return coverage


def key_role_coverage() -> dict[str, dict[str, int]]:
    """Par rôle clé : combien de cas le visent (`meta.personas`), et combien
    d'entre eux portent au moins un hard failure nommé."""
    coverage: dict[str, dict[str, int]] = {}
    for role in KEY_ROLES:
        cases = [item for item in CORPUS if role in item.meta.personas]
        cases_with_hard_failure = [item for item in cases if item.hard_failures]
        coverage[role.value] = {
            "cases": len(cases),
            "cases_with_named_hard_failure": len(cases_with_hard_failure),
        }
    return coverage


def current_report() -> dict:
    return {
        "hard_failure_coverage": hard_failure_coverage(),
        "key_role_coverage": key_role_coverage(),
    }


def load_baseline(path: Path | None = None) -> dict:
    target = path or BASELINE_PATH
    return json.loads(target.read_text(encoding="utf-8"))


def write_baseline(report: dict, path: Path | None = None) -> None:
    target = path or BASELINE_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def regressions(current: dict, baseline: dict) -> tuple[str, ...]:
    """Les DIMINUTIONS vs baseline — jamais les progressions. Chaque message
    nomme le rôle ou le hard failure concerné, jamais un total agrégé qui
    masquerait quel P0 recule."""
    problems: list[str] = []

    base_hf = baseline.get("hard_failure_coverage", {})
    cur_hf = current.get("hard_failure_coverage", {})
    for failure, base_count in base_hf.items():
        cur_count = cur_hf.get(failure, 0)
        if cur_count < base_count:
            problems.append(
                f"hard failure « {failure} » : couverture {cur_count} < baseline {base_count}"
            )

    base_roles = baseline.get("key_role_coverage", {})
    cur_roles = current.get("key_role_coverage", {})
    for role, base_stats in base_roles.items():
        cur_stats = cur_roles.get(role, {"cases": 0, "cases_with_named_hard_failure": 0})
        for metric, base_value in base_stats.items():
            cur_value = cur_stats.get(metric, 0)
            if cur_value < base_value:
                problems.append(
                    f"rôle clé « {role} » / {metric} : {cur_value} < baseline {base_value}"
                )

    return tuple(problems)


def _run_bench() -> int:
    """Le banc réel, injecté dans `app.eval.chat_gate.run_gate` — jamais
    importé par `app/**` (voir le docstring du module)."""
    current = current_report()
    baseline = load_baseline()
    failures = regressions(current, baseline)
    if failures:
        print("chat gate: RÉGRESSION #2443.7 (doctrine c77) sur un rôle clé ou un hard failure :")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("chat gate: aucune régression vs la baseline committée.")
    return 0


def main(argv: list[str] | None = None) -> int:
    """``python -m tests.chat_gate_bench`` — le point d'entrée réel du gate
    (#2443.7) : app/eval/chat_gate.py fournit la détection de surface, ce
    module fournit le banc."""
    import argparse

    from app.eval.chat_gate import DEFAULT_BASE_REF, run_gate

    p = argparse.ArgumentParser(
        description="Gate CI dédié du chat (#2443.7, doctrine c77) — compare la couverture "
        "du corpus à sa baseline quand la surface chat a changé."
    )
    p.add_argument("--base", default=DEFAULT_BASE_REF, help=f"Ref git de base (défaut: {DEFAULT_BASE_REF}).")
    p.add_argument("--force", action="store_true", help="Rejoue le banc quel que soit le diff.")
    args = p.parse_args(argv)
    return run_gate(_run_bench, args.base, force=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
