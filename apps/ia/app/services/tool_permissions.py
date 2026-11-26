"""LA CLASSIFICATION LECTURE / DÉPENSE DES OUTILS DE LAURA (#1948.21, #2445.4).

─────────────────────────────────────────────────────────────────────────────
POURQUOI CE MODULE EXISTE, ET D'OÙ IL VIENT
─────────────────────────────────────────────────────────────────────────────
Cette classification vivait dans `tests/test_copilote_security_eval.py`,
DÉFINIE là-bas et lue par elle seule (via `tests.copilote_scenario_metadata.
permission_de`, avec un import local pour éviter un cycle). C'était juste pour
un jeu d'évaluation qui vérifie que le prompt et le code ne cèdent pas — mais
faux pour toute autre consommatrice : un service applicatif ne doit jamais
importer `tests.*`, et la console d'opérations IA (#2445.4, épopée #2766, « la
matrice des droits ») en a besoin pour de vrai.

GA-26 — UNE SEULE définition existe désormais, sous `app/access/rights_matrix.
py` (constatée à l'intégration du 28/09 : deux lots avaient fait ce même
déplacement en parallèle, chacun ignorant l'autre). Ce module RÉUTILISE
celle-là plutôt que la recopier — `ToolPermission`/`permission_of` restent ici
pour ses propres appelants (`config_admin.py`), mais l'ensemble source
n'existe qu'à un endroit.
"""

from __future__ import annotations

from enum import StrEnum

from app.access.rights_matrix import READ_ONLY_TOOLS, SPENDING_TOOLS

__all__ = ["READ_ONLY_TOOLS", "SPENDING_TOOLS", "ToolPermission", "permission_of"]


# ⚠️ Nommée `ToolPermission`, pas `Permission` : ce dernier nom est déjà le
# vocabulaire canonique de `tests/copilote_scenario_metadata.py`
# (`test_the_scenario_vocabulary_is_defined_in_a_single_file`, GA-26) — le
# redéfinir ici, même pour un usage différent, ferait échouer cette garde.
# `copilote_scenario_metadata.Permission` reste LA source de vérité du corpus
# d'éval ; celle-ci sert la console d'opérations, un lecteur différent.
class ToolPermission(StrEnum):
    """#1948.21 / #2445.4 — la permission requise, DÉRIVÉE de
    {@link READ_ONLY_TOOLS} / {@link SPENDING_TOOLS} ci-dessus. Trois valeurs
    seulement : Laura n'a pas de quatrième geste — aucun outil n'écrit dans
    l'espace du client sans passer par un clic humain (les outils dits
    « proposition » préparent, le clic exécute), et un seul dépense
    (`start_account_analysis`)."""

    LECTURE = "lecture de l'espace, scopée à la personne"
    PROPOSITION = "proposition — seul le clic de la personne exécute"
    DEPENSE = "dépense de crédits, après confirmation"


def permission_of(tool_name: str) -> ToolPermission:
    """La permission d'UN outil nommé, dérivée du même classement que
    `test_every_declared_tool_is_read_only_or_a_proposal` vérifie. Un outil
    absent des deux ensembles est une PROPOSITION par défaut — c'est la
    posture prudente que le registre applique déjà : tout ce qui n'est pas
    explicitement nommé lecture ou dépense doit annoncer sa confirmation."""
    if tool_name in SPENDING_TOOLS:
        return ToolPermission.DEPENSE
    if tool_name in READ_ONLY_TOOLS:
        return ToolPermission.LECTURE
    return ToolPermission.PROPOSITION
