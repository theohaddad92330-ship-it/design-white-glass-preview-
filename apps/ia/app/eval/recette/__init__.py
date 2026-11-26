"""Recette golden (#2130) — quinze comptes, treize vérifications, neuf labels.

Voir :mod:`app.eval.recette.grid`. Commande : ``python -m app.eval.recette``.
"""

from .grid import (
    ACCOUNTS_DIR,
    ARCHETYPES,
    BLOCKING_LABELS,
    CAS_DIR,
    LABELS,
    MACHINE_LABELS,
    MIN_MEASURED,
    VERIFICATIONS,
    AccountReport,
    CheckResult,
    GoldenAccount,
    RecoVerdict,
    corpus_violations,
    list_accounts,
    load_account,
    load_dossier,
    machine_label,
    run_account,
)

__all__ = [
    "ACCOUNTS_DIR",
    "ARCHETYPES",
    "BLOCKING_LABELS",
    "CAS_DIR",
    "LABELS",
    "MACHINE_LABELS",
    "MIN_MEASURED",
    "VERIFICATIONS",
    "AccountReport",
    "CheckResult",
    "GoldenAccount",
    "RecoVerdict",
    "corpus_violations",
    "list_accounts",
    "load_account",
    "load_dossier",
    "machine_label",
    "run_account",
]
