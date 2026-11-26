"""Taxonomie d'erreurs typée pour les outils du chat — #2283.6/.8/.9/.10/.13/.14/.16
(LAU-FINAL-024, épopée #2983).

Avant ce module, ``execute_chat_tool`` (``chat_tools.py``) rendait ~190 formes
différentes de ``{"error": "<texte libre en français>"}`` — aucun code, aucun
signal « est-ce qu'une nouvelle tentative a un sens ». Le pipeline d'ANALYSE a
déjà ``ErrorService``/``ErrorSeverity`` (``agent_envelope.py``) mais classé par
FOURNISSEUR (claude/firecrawl/brave/…), pas par TYPE d'échec — et les outils du
chat n'ont rien d'équivalent.

Ce module ne réécrit AUCUN des ~190 sites existants (ce serait des jours de
travail à part entière sur 9248 lignes) : il donne aux outils qui le veulent un
moyen de LEVER un échec typé (``ToolTaxonomyError``), et à l'appelant
(``chat_orchestrator._execute_one_tool`` / ``tool_resilience.py``) un moyen de
CLASSER une exception Python levée par le dispatch. Les sites qui rendent déjà
``{"error": str}`` sans lever d'exception gardent leur comportement byte-identique
— ce module est additif, jamais un remplacement forcé.

Le repli est toujours "internal", JAMAIS deviné depuis le texte d'un message :
relire une chaîne libre pour lui assigner un sens serait inventer une donnée
qu'on ne possède pas (doctrine CLAUDE.md — « JAMAIS de données fictives »).
Seuls le TYPE Python de l'exception ou un code HTTP explicite classent.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

import httpx


class ToolErrorCode(str, Enum):
    """Les onze familles d'échec de LAU-FINAL-024 (#2283, "TYPOLOGIE D'ÉCHEC").

    "job annulé" n'a pas de code ici : ``AgentStatus.CANCELLED``
    (``agent_envelope.py``) le couvre déjà — un réglage vit à un seul endroit
    (GA-26), pas deux vocabulaires pour la même idée.
    """

    INPUT_INVALID = "input_invalid"
    AMBIGUOUS_OBJECT = "ambiguous_object"
    PERMISSION = "permission"
    QUOTA = "quota"
    SOURCE_NOT_COVERED = "source_not_covered"
    TEMPORARILY_UNAVAILABLE = "temporarily_unavailable"
    TIMEOUT = "timeout"
    MALFORMED_RESPONSE = "malformed_response"
    NO_RESULT = "no_result"
    INTERNAL = "internal"
    CONFLICT = "conflict"


#: Seules les familles qui peuvent guérir SEULES dans les secondes qui suivent
#: valent une nouvelle tentative automatique (#2283.20/.21 — retryable /
#: non-retryable par outil). Un input invalide, une permission ou un quota
#: resteront faux au prochain essai immédiat ; retenter ne ferait que doubler
#: le coût pour le même résultat.
RETRYABLE_CODES: frozenset[ToolErrorCode] = frozenset(
    {ToolErrorCode.TEMPORARILY_UNAVAILABLE, ToolErrorCode.TIMEOUT}
)

#: Code HTTP → famille, pour classer une ``httpx.HTTPStatusError`` explicite.
_HTTP_STATUS_TO_CODE: dict[int, ToolErrorCode] = {
    401: ToolErrorCode.PERMISSION,
    403: ToolErrorCode.PERMISSION,
    404: ToolErrorCode.SOURCE_NOT_COVERED,
    409: ToolErrorCode.CONFLICT,
    429: ToolErrorCode.QUOTA,
}


class ToolTaxonomyError(Exception):
    """Un outil chat lève ceci pour dire explicitement QUEL type d'échec —
    plutôt que de rendre un ``{"error": str}`` que l'appelant ne peut pas
    classer. Attrapée par ``tool_resilience.execute_chat_tool_resilient``."""

    def __init__(self, code: ToolErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


def classify_exception(exc: BaseException) -> ToolErrorCode:
    """Classe une exception Python levée par le dispatch d'un outil.

    Ordre : ``ToolTaxonomyError`` explicite d'abord (appelant), puis un code
    HTTP explicite (``httpx.HTTPStatusError``), puis le TYPE de l'exception
    pour les familles génériques (timeout, input). Le repli est ``INTERNAL`` —
    jamais une supposition lue dans ``str(exc)``.
    """
    if isinstance(exc, ToolTaxonomyError):
        return exc.code
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in _HTTP_STATUS_TO_CODE:
            return _HTTP_STATUS_TO_CODE[status]
        if 500 <= status < 600:
            return ToolErrorCode.TEMPORARILY_UNAVAILABLE
        return ToolErrorCode.INTERNAL
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        # `TimeoutError` couvre aussi `asyncio.TimeoutError` (alias depuis
        # Python 3.11).
        return ToolErrorCode.TIMEOUT
    if isinstance(exc, (ValueError, KeyError, TypeError)):
        return ToolErrorCode.INPUT_INVALID
    return ToolErrorCode.INTERNAL


#: #2283.41 — le message qu'une classification AUTOMATIQUE (``classify_exception``,
#: jamais une raison écrite à la main par l'outil qui lève ``ToolTaxonomyError``)
#: peut montrer à l'utilisateur. Une exception Python brute (``str(exc)``) peut
#: porter une trace, un chemin de fichier, un détail de fournisseur — ce
#: niveau de détail reste dans les LOGS (``tool_resilience.py`` les journalise
#: déjà), jamais dans la réponse que le modèle ou l'utilisateur reçoit.
_GENERIC_MESSAGE: dict[ToolErrorCode, str] = {
    ToolErrorCode.INPUT_INVALID: "La demande n'est pas exploitable telle quelle.",
    ToolErrorCode.AMBIGUOUS_OBJECT: "Plusieurs objets correspondent, impossible de trancher seul.",
    ToolErrorCode.PERMISSION: "Vous n'avez pas accès à cette ressource.",
    ToolErrorCode.QUOTA: "Le quota de ce fournisseur est atteint pour le moment.",
    ToolErrorCode.SOURCE_NOT_COVERED: "Cette source n'est pas branchée ici.",
    ToolErrorCode.TEMPORARILY_UNAVAILABLE: "Ce service est temporairement indisponible.",
    ToolErrorCode.TIMEOUT: "La réponse a mis trop de temps à arriver.",
    ToolErrorCode.MALFORMED_RESPONSE: "Le fournisseur a rendu une réponse inexploitable.",
    ToolErrorCode.NO_RESULT: "Le fournisseur n'a rien trouvé pour cette demande.",
    ToolErrorCode.INTERNAL: "Une erreur interne a interrompu cet outil.",
    ToolErrorCode.CONFLICT: "Cette action entre en conflit avec un état déjà en place.",
}


def generic_message_for(code: ToolErrorCode) -> str:
    """Le message SÛR pour ``code`` — utilisé quand la seule source est une
    exception Python brute, jamais écrite pour un lecteur humain."""
    return _GENERIC_MESSAGE[code]


def tool_error_payload(code: ToolErrorCode, message: str) -> dict[str, Any]:
    """Le retour d'un outil chat en échec, typé — additif au ``{"error": str}``
    que tous les appelants existants lisent déjà (aucun ne casse : ``error``
    garde sa forme et sa place)."""
    return {
        "error": message,
        "error_code": code.value,
        "retryable": code in RETRYABLE_CODES,
    }


__all__ = [
    "RETRYABLE_CODES",
    "ToolErrorCode",
    "ToolTaxonomyError",
    "classify_exception",
    "tool_error_payload",
]
