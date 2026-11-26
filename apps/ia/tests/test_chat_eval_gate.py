"""LE GATE CI DÉDIÉ DU CHAT — #2443.7 (#2899), doctrine c77.

« La porte de qualité IA est un GATE CI BLOQUANT sur les rôles clés »
(c77, `packages/contracts/src/schemas/doctrine-registry.ts`). Ce fichier EST
ce gate, distinct des cinq suites `test_copilote_*_eval.py` : il compare la
couverture ACTUELLE du corpus (`tests/chat_gate_bench.py`) à une baseline
VERSIONNÉE (`tests/golden/chat_gate_baseline.json`) et échoue sur toute
RÉGRESSION d'un rôle clé — jamais sur sa progression (voir le docstring de
`chat_gate_bench.py` pour pourquoi).

Régénérer après un changement INTENTIONNEL (retrait ou déclassement d'un
scénario qui fait légitimement baisser une couverture) :

    UPDATE_CHAT_GATE_BASELINE=1 pytest tests/test_chat_eval_gate.py -q

puis committer `tests/golden/chat_gate_baseline.json` avec le changement.
"""

from __future__ import annotations

import os

from tests.chat_gate_bench import (
    BASELINE_PATH,
    KEY_ROLES,
    current_report,
    load_baseline,
    regressions,
    write_baseline,
)

_UPDATE = os.getenv("UPDATE_CHAT_GATE_BASELINE") == "1"


def test_chat_gate_baseline_file_is_committed():
    assert BASELINE_PATH.exists(), (
        f"baseline absente : {BASELINE_PATH}. "
        "Générer avec `UPDATE_CHAT_GATE_BASELINE=1 pytest tests/test_chat_eval_gate.py -q`."
    )


def test_chat_gate_has_no_regression_vs_baseline():
    """LE GATE — bloque si un rôle clé ou un hard failure nommé RECULE."""
    if _UPDATE:
        write_baseline(current_report())
        import pytest

        pytest.skip("baseline régénérée (UPDATE_CHAT_GATE_BASELINE=1)")

    current = current_report()
    baseline = load_baseline()
    failures = regressions(current, baseline)
    assert not failures, "régression #2443.7 (doctrine c77) sur un rôle clé ou un hard failure :\n" + "\n".join(
        f"  - {f}" for f in failures
    )


def test_every_key_role_is_covered_by_at_least_one_case_with_a_named_hard_failure():
    """Preuve n°2 (une garde dont le corpus est vide est verte pour rien) :
    chaque rôle clé doit avoir AUJOURD'HUI au moins un cas hard-failure, sinon
    la comparaison à la baseline ne protégerait rien de réel pour ce rôle."""
    report = current_report()
    manquants = [
        role
        for role in KEY_ROLES
        if report["key_role_coverage"][role.value]["cases_with_named_hard_failure"] == 0
    ]
    assert not manquants, f"rôles clés sans aucun cas à hard failure nommé : {manquants}"


def test_the_gate_knows_how_to_say_no():
    """Preuve n°1 — elle sait dire NON : une régression fabriquée doit remonter."""
    baseline = {"hard_failure_coverage": {"identity_error": 999}, "key_role_coverage": {}}
    current = {"hard_failure_coverage": {"identity_error": 1}, "key_role_coverage": {}}
    failures = regressions(current, baseline)
    assert failures and "identity_error" in failures[0]


def test_the_gate_never_fails_on_growth():
    """Preuve n°3 — elle n'attrape pas à côté : une PROGRESSION ne doit
    jamais faire tomber le gate (voir le docstring de `chat_gate_bench.py`)."""
    baseline = {"hard_failure_coverage": {"identity_error": 1}, "key_role_coverage": {}}
    current = {"hard_failure_coverage": {"identity_error": 5}, "key_role_coverage": {}}
    assert regressions(current, baseline) == ()
