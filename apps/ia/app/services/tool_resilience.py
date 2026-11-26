"""Assemble taxonomie + retry + idempotency + circuit breaker autour d'UN
appel d'outil de chat — #2283 (LAU-FINAL-024, épopée #2983).

Seul appelant réel : ``chat_orchestrator._execute_one_tool``. Avant ce
module, un appel d'outil de chat était un essai UNIQUE — une exception ou une
panne momentanée du fournisseur (Brave, Apollo, Pappers…) faisait échouer le
tour entier sans la moindre nouvelle tentative, quelle que soit la cause
(``chat_orchestrator.py:1450-1467`` avant ce lot : ``try/except Exception``
qui convertit tout en ``{"error": str(exc)}``, une fois, jamais retenté).

L'exécuteur réel (``chat_tools.execute_chat_tool``) est injecté plutôt
qu'importé en dur : ``chat_orchestrator`` continue de passer SA propre
référence (celle que ``test_chat_tool_round_concurrency.py`` monkeypatch déjà
via ``monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", ...)``),
donc cette suite existante reste byte-identique — ce module ne la court-circuite
pas en important son propre alias figé de ``execute_chat_tool``.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

from app.middleware.correlation_id import get_correlation_id
from app.services.retry import DEFAULT_JITTER_RATIO, jittered_delay
from app.services.source_health import record_degradation
from app.services.tool_circuit_breaker import ToolCircuitBreaker, get_tool_circuit_breaker
from app.services.tool_error_taxonomy import (
    ToolErrorCode,
    ToolTaxonomyError,
    classify_exception,
    generic_message_for,
    tool_error_payload,
)
from app.services.tool_idempotency import idempotency_key_for, recent_result, remember_result
from app.services.tool_retry_policy import ToolRetryPolicy, get_retry_policy

logger = logging.getLogger(__name__)

_now = time.monotonic

ToolExecutor = Callable[..., Awaitable[dict[str, Any]]]


#: Décision produit du 28/09/2026 (lot V36, épopées #2879/#2983) — un outil qui
#: ÉCRIT ou qui DÉPENSE ne retente JAMAIS, même sur une famille d'erreur
#: normalement retryable : une deuxième tentative après un premier envoi
#: risquerait de dupliquer l'effet (double écriture, double débit). Un TIMEOUT
#: sur un tel outil n'est PAS un échec — on ne sait pas si l'écriture a eu
#: lieu avant que la réponse ne se perde — donc `unknown`, jamais `failed`.
_WRITE_TOOL_TIMEOUT_MESSAGE = (
    "Le temps a manqué pour confirmer si cette action a bien été appliquée — à vérifier avant de la retenter."
)


async def execute_chat_tool_resilient(
    name: str,
    tool_input: dict[str, Any],
    *,
    user_id: str,
    executor: ToolExecutor,
    circuit_breaker: ToolCircuitBreaker | None = None,
    retry_policy: ToolRetryPolicy | None = None,
    is_write_tool: bool = False,
    **executor_kwargs: Any,
) -> dict[str, Any]:
    """Exécute ``executor(name, tool_input, user_id=user_id, **executor_kwargs)``
    avec, dans l'ordre :

    1. le disjoncteur (#2283.25/.27/.28) — un outil OUVERT ne touche plus le
       réseau, la santé du système en est informée (``source_health``) ;
    2. la déduplication de quasi-doublons (#2283.24) ;
    3. le retry typé (#2283.18-.23) — seules les familles ``retryable`` de la
       taxonomie (temporairement indisponible, timeout) redéclenchent un essai,
       borné en nombre ET en durée cumulée — SAUF si ``is_write_tool`` est vrai
       (voir ci-dessous).

    ``is_write_tool`` (#2879/#2983, 28/09/2026) : passé par l'appelant
    (``chat_orchestrator._is_read_only_tool`` inversé) pour les outils
    d'``WRITE_TOOL_NAMES``/``_EXTRA_WRITE_TOOLS``/``is_spending_tool``. Un tel
    outil ne retente jamais, quelle que soit la famille d'erreur — et un
    TIMEOUT y rend ``outcome: "unknown"`` plutôt qu'un échec ordinaire.

    Ne lève jamais : une exception de l'exécuteur est classée
    (``classify_exception``) et rendue comme un ``tool_error_payload`` normal
    — même contrat de sortie que l'exécuteur d'origine (un ``dict``), jamais
    une exception qui remonterait casser le tour de chat.
    """
    breaker = circuit_breaker or get_tool_circuit_breaker()
    policy = retry_policy or get_retry_policy(name)

    if not breaker.allow(name):
        record_degradation(
            get_correlation_id(),
            source=name,
            reason="circuit ouvert après échecs répétés",
            code="circuit_open",
        )
        return tool_error_payload(
            ToolErrorCode.TEMPORARILY_UNAVAILABLE,
            "Cet outil est temporairement indisponible après plusieurs échecs — Laura réessaiera au prochain message.",
        )

    key = idempotency_key_for(name, user_id, tool_input)
    cached = recent_result(key)
    if cached is not None:
        return cached

    start = _now()
    attempt = 0
    output: dict[str, Any] = {}
    while True:
        attempt += 1
        try:
            output = await executor(name, tool_input, user_id=user_id, **executor_kwargs)
        except ToolTaxonomyError as exc:
            # Message écrit par l'outil pour un lecteur humain — jamais une
            # exception brute, donc sûr à rendre tel quel.
            output = tool_error_payload(exc.code, str(exc))
        except Exception as exc:  # noqa: BLE001 — un outil de chat ne doit jamais planter le tour
            code = classify_exception(exc)
            # #2283.41 — le détail TECHNIQUE (`exc`, potentiellement une trace,
            # un chemin, un détail de fournisseur) reste dans ce log ; la
            # réponse rendue à l'utilisateur ne porte que le message générique
            # sûr de la famille classée, jamais `str(exc)`.
            logger.warning("Outil de chat %s en échec (essai %d, %s): %s", name, attempt, code.value, exc)
            output = tool_error_payload(code, generic_message_for(code))

        is_error = isinstance(output, dict) and bool(output.get("error"))
        if not is_error:
            breaker.record_success(name)
            remember_result(key, output)
            return output

        if is_write_tool:
            # Jamais de retry sur un outil qui écrit ou qui dépense — voir la
            # docstring. `retryable` est forcé à `False` dans le payload rendu
            # : un appelant qui le relirait ailleurs ne doit jamais y voir un
            # feu vert à une nouvelle tentative que cette fonction refuse déjà.
            breaker.record_failure(name)
            if output.get("error_code") == ToolErrorCode.TIMEOUT.value:
                output = {**output, "error": _WRITE_TOOL_TIMEOUT_MESSAGE, "retryable": False, "outcome": "unknown"}
            else:
                output = {**output, "retryable": False}
            remember_result(key, output)
            return output

        retryable = isinstance(output, dict) and output.get("retryable") is True
        elapsed = _now() - start
        if not retryable or attempt > policy.max_retries or elapsed >= policy.max_duration_s:
            breaker.record_failure(name)
            remember_result(key, output)
            return output

        nominal = min(policy.backoff_base_s * (2 ** (attempt - 1)), policy.backoff_max_s)
        delay = jittered_delay(nominal, policy.jitter_ratio, policy.backoff_max_s)
        delay = min(delay, max(0.0, policy.max_duration_s - elapsed))
        logger.info(
            "Nouvelle tentative %d/%d pour l'outil %s dans %.2fs: %s",
            attempt,
            policy.max_retries,
            name,
            delay,
            output.get("error"),
        )
        await asyncio.sleep(delay)


__all__ = ["ToolExecutor", "execute_chat_tool_resilient"]
