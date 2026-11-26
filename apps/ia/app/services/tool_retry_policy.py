"""Politique de retry PAR OUTIL du chat — #2283.18/.19/.20/.21/.22/.23
(LAU-FINAL-024, épopée #2983).

Avant ce module, un seul retry existait dans tout le pipeline outillé du chat :
``brave_search.py`` (``max_retries=3``), pour UNE source, pas "chaque outil"
comme le demande #2283. Ce module donne un lookup nommé — ``get_retry_policy``
lu par ``tool_resilience.execute_chat_tool_resilient`` (le seul appelant :
``chat_orchestrator._execute_one_tool``) — plutôt qu'une constante globale que
rien ne peut faire varier par outil.

Faute d'avoir audité individuellement les 84 outils déclarés dans
``CHAT_TOOLS`` (des jours de travail à part), ``RETRY_POLICIES`` reste vide et
tout outil reçoit ``DEFAULT_RETRY_POLICY`` — mais le lookup EST par nom, prêt à
accueillir une politique différenciée dès qu'un outil précis le justifie
(fournisseur mesuré plus fragile, coût de retry non nul…), sans toucher
l'appelant.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.retry import DEFAULT_JITTER_RATIO
from app.services.tool_error_taxonomy import RETRYABLE_CODES, ToolErrorCode


@dataclass(frozen=True)
class ToolRetryPolicy:
    """Une politique de retry nommée, pour UN outil de chat.

    ``max_duration_s`` reste toujours strictement sous ``_PER_CALL_TIMEOUT_S``
    (60s, ``chat_orchestrator.py``) : un outil qui retente ne doit jamais, à
    lui seul, dépasser le budget du tour de modèle qui l'a appelé.
    """

    #: #2283.18 — nombre maximal de tentatives SUPPLÉMENTAIRES après le
    #: premier essai (donc `max_retries=2` → 3 essais au total).
    max_retries: int = 2
    #: #2283.19 — backoff exponentiel, mêmes paramètres que `retry.py`.
    backoff_base_s: float = 1.0
    backoff_max_s: float = 8.0
    jitter_ratio: float = DEFAULT_JITTER_RATIO
    #: #2283.22 — durée maximale CUMULÉE des tentatives (première incluse).
    max_duration_s: float = 20.0
    #: #2283.20/.21 — familles retryables pour cet outil ; hérite du défaut de
    #: la taxonomie (transitoire uniquement) sauf politique dédiée.
    retryable_codes: frozenset[ToolErrorCode] = field(default_factory=lambda: RETRYABLE_CODES)
    #: #2283.23 — coût du retry : un outil de LECTURE du chat ne débite jamais
    #: une deuxième fois pour une nouvelle tentative (le coût du tour est fixé
    #: avant l'appel outil, `_ReplyCostBudget`). `True` réservé à un outil dont
    #: le fournisseur facture CHAQUE appel, retry compris — aucun aujourd'hui.
    retry_costs_credits: bool = False


#: Politique appliquée à tout outil sans entrée dédiée dans `RETRY_POLICIES`.
DEFAULT_RETRY_POLICY = ToolRetryPolicy()

#: Politiques différenciées PAR NOM d'outil — vide aujourd'hui (voir
#: docstring du module), le lookup reste nommé pour que la prochaine entrée
#: n'ait pas à toucher l'appelant.
RETRY_POLICIES: dict[str, ToolRetryPolicy] = {}


def get_retry_policy(tool_name: str) -> ToolRetryPolicy:
    """La politique de retry de ``tool_name`` — le défaut si non différenciée."""
    return RETRY_POLICIES.get(tool_name, DEFAULT_RETRY_POLICY)


__all__ = [
    "DEFAULT_RETRY_POLICY",
    "RETRY_POLICIES",
    "ToolRetryPolicy",
    "get_retry_policy",
]
