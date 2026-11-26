"""#2146.2 — LE SOCLE DU MOTEUR D'ARBITRAGE DE LAURA.

« ARCHITECTURE PRODUIT — LAURA UNIQUE ET ORCHESTRATION DES DEMANDES »
(LAU-FINAL, #2146) demande une règle NOMMÉE qui choisit, pour chaque requête,
UN comportement principal parmi cinq : répondre directement, lancer un job,
ouvrir une surface préremplie, demander une clarification, expliquer une
limite. ``git grep -i "decide_action\\|laura_router"`` rendait 0 résultat sur
``origin/main`` — ``chat_tools.py``/``claude_service.py`` existaient, aucune
règle à cinq branches n'était ÉCRITE : chaque appel du modèle choisissait seul,
sans qu'aucun test ne puisse dire ce qui aurait dû se passer.

``decide_action`` est une fonction PURE : aucun appel modèle, aucune E/S. Elle
ne REMPLACE PAS la boucle d'outils du modèle (``chat_orchestrator.py``) —
Bellum reste un produit dont Claude choisit ses outils lui-même, tour par tour.
Elle est le SOCLE que la source réclame explicitement : un point où la règle
est ÉCRITE et TESTÉE, que l'appelant peut consulter pour orienter le tour
(prompt, filtrage d'outils) au lieu de laisser cinq comportements possibles
sans aucune trace de la règle qui devrait les départager.

PRÉCÉDENCE, décidée ici (la source énumère les cinq sans en fixer l'ordre) :

    1. ``capability_available is False`` → EXPLAIN_LIMIT. Rien d'autre n'est
       possible sans la capacité — même une clarification serait un travail
       demandé pour une porte fermée.
    2. ``ambiguous_and_material`` → CLARIFY. Doctrine « DEMANDER AVANT DE
       CHERCHER » (``bellum_advisor.py``, ``_BLOCK_ASK_FIRST``) : une question
       coûte moins qu'une recherche à côté de la plaque, donc elle passe AVANT
       tout travail lourd.
    3. ``requires_multiple_searches`` → LAUNCH_JOB.
    4. ``requires_large_inspection`` → OPEN_SURFACE.
    5. Sinon → RESPOND.

Un ordre STABLE est la moitié utile d'une règle : sans lui, deux appels sur les
mêmes signaux pourraient rendre deux actions différentes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class LauraAction(StrEnum):
    """Les cinq comportements de #2146 — un VERBE À L'INFINITIF chacun : une
    décision est une INTENTION, jamais un état accompli (#2146.20, doctrine
    « Laura ne prétend jamais avoir exécuté une action non confirmée »)."""

    RESPOND = "respond"
    LAUNCH_JOB = "launch_job"
    OPEN_SURFACE = "open_surface"
    CLARIFY = "clarify"
    EXPLAIN_LIMIT = "explain_limit"


@dataclass(frozen=True)
class RoutingSignals:
    """Ce que l'appelant sait déjà AVANT de choisir — jamais deviné ici.

    Chaque champ correspond à une clause de la source (#2146) ; aucun n'a de
    valeur par défaut côté production : c'est à l'appelant de les mesurer.
    """

    capability_available: bool
    ambiguous_and_material: bool
    requires_multiple_searches: bool
    requires_large_inspection: bool
    data_already_known: bool


@dataclass(frozen=True)
class RoutingDecision:
    action: LauraAction
    """#2146.12 / #2146.18 — pourquoi la capacité manque, uniquement porté par
    EXPLAIN_LIMIT. `None` ailleurs : une décision RESPOND n'a rien à débloquer."""
    missing_reason: str | None = None
    """#2146.16 — les hypothèses raisonnables ANNONCÉES par l'appelant, jamais
    devinées ici. Liste vide par défaut, jamais `None` : un appelant qui lit
    `decision.assumptions` n'a pas à distinguer « aucune » de « pas fournie »."""
    assumptions: list[str] = field(default_factory=list)


def decide_action(
    signals: RoutingSignals,
    *,
    missing_reason: str | None = None,
    assumptions: list[str] | None = None,
) -> RoutingDecision:
    """Le socle #2146.2 : une seule branche, nommée, jamais un choix silencieux."""
    resolved_assumptions = list(assumptions) if assumptions else []

    if not signals.capability_available:
        return RoutingDecision(LauraAction.EXPLAIN_LIMIT, missing_reason=missing_reason)
    if signals.ambiguous_and_material:
        return RoutingDecision(LauraAction.CLARIFY)
    if signals.requires_multiple_searches:
        return RoutingDecision(LauraAction.LAUNCH_JOB)
    if signals.requires_large_inspection:
        return RoutingDecision(LauraAction.OPEN_SURFACE)
    return RoutingDecision(LauraAction.RESPOND, assumptions=resolved_assumptions)
