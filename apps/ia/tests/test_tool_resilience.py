"""#2283 (LAU-FINAL-024, épopée #2983) — assemble taxonomie + politique de
retry + idempotency + circuit breaker autour d'UN appel d'outil de chat.

Seul appelant réel : `chat_orchestrator._execute_one_tool` (voir
`test_chat_orchestrator_tool_resilience.py`). Ces tests couvrent le module en
isolation, avec un exécuteur factice injecté — jamais le vrai
`execute_chat_tool` (9248 lignes, réseau réel)."""

from __future__ import annotations

import asyncio

from app.services.tool_circuit_breaker import ToolCircuitBreaker
from app.services.tool_error_taxonomy import ToolErrorCode, ToolTaxonomyError, tool_error_payload
from app.services.tool_resilience import execute_chat_tool_resilient
from app.services.tool_retry_policy import ToolRetryPolicy

# L'isolation du cache de déduplication (`tool_idempotency`) entre les cas de
# ce fichier vient de l'autouse `_hermetic_tool_resilience_state` (conftest.py)
# — plusieurs cas ici réutilisent volontairement le même (outil, utilisateur,
# entrée) pour des raisons différentes.


def _fast_policy(**overrides) -> ToolRetryPolicy:
    base = dict(max_retries=2, backoff_base_s=0.001, backoff_max_s=0.002, max_duration_s=1.0)
    base.update(overrides)
    return ToolRetryPolicy(**base)


def test_success_on_first_try_returns_output_untouched() -> None:
    async def executor(name, tool_input, *, user_id, **kw):
        return {"ok": True, "account_id": tool_input["account_id"]}

    out = asyncio.run(
        execute_chat_tool_resilient(
            "get_account_briefing",
            {"account_id": "abc"},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
        )
    )
    assert out == {"ok": True, "account_id": "abc"}


def test_non_retryable_error_is_returned_after_a_single_attempt() -> None:
    calls = {"n": 0}

    async def executor(name, tool_input, *, user_id, **kw):
        calls["n"] += 1
        return tool_error_payload(ToolErrorCode.PERMISSION, "Vous n'avez pas accès à ce compte.")

    out = asyncio.run(
        execute_chat_tool_resilient(
            "get_account_briefing",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
        )
    )
    assert calls["n"] == 1
    assert out["error_code"] == "permission"


def test_retryable_error_retries_up_to_max_retries_then_gives_up() -> None:
    calls = {"n": 0}

    async def executor(name, tool_input, *, user_id, **kw):
        calls["n"] += 1
        return tool_error_payload(ToolErrorCode.TEMPORARILY_UNAVAILABLE, "Panne momentanée.")

    out = asyncio.run(
        execute_chat_tool_resilient(
            "get_account_briefing",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(max_retries=2),
        )
    )
    assert calls["n"] == 3  # premier essai + 2 retries
    assert out["error_code"] == "temporarily_unavailable"


def test_retryable_error_that_recovers_on_retry_returns_success() -> None:
    calls = {"n": 0}

    async def executor(name, tool_input, *, user_id, **kw):
        calls["n"] += 1
        if calls["n"] < 2:
            return tool_error_payload(ToolErrorCode.TIMEOUT, "Trop long.")
        return {"ok": True}

    out = asyncio.run(
        execute_chat_tool_resilient(
            "get_account_briefing",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
        )
    )
    assert calls["n"] == 2
    assert out == {"ok": True}


def test_tool_taxonomy_error_raised_by_the_executor_is_classified() -> None:
    async def executor(name, tool_input, *, user_id, **kw):
        raise ToolTaxonomyError(ToolErrorCode.AMBIGUOUS_OBJECT, "Deux comptes possibles.")

    out = asyncio.run(
        execute_chat_tool_resilient(
            "get_account_briefing",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
        )
    )
    assert out["error_code"] == "ambiguous_object"
    assert out["error"] == "Deux comptes possibles."


def test_a_plain_exception_is_classified_and_never_propagates() -> None:
    async def executor(name, tool_input, *, user_id, **kw):
        raise TimeoutError("boom")

    out = asyncio.run(
        execute_chat_tool_resilient(
            "get_account_briefing",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(max_retries=0),
        )
    )
    assert out["error_code"] == "timeout"


def test_a_plain_exception_never_leaks_its_raw_text_to_the_user() -> None:
    # #2283.41 — le détail technique reste dans les logs. Une exception Python
    # peut porter une trace, un chemin de fichier, un détail de fournisseur ;
    # ce texte ne doit JAMAIS atteindre la réponse que le modèle/l'utilisateur
    # reçoit — seul le message générique de la famille classée peut.
    async def executor(name, tool_input, *, user_id, **kw):
        raise RuntimeError("/var/secrets/apollo_key.pem introuvable — connexion refusée sur 10.0.4.12:5432")

    out = asyncio.run(
        execute_chat_tool_resilient(
            "get_account_briefing",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(max_retries=0),
        )
    )
    assert "apollo_key" not in out["error"]
    assert "10.0.4.12" not in out["error"]
    assert out["error_code"] == "internal"


def test_open_circuit_short_circuits_without_calling_the_executor() -> None:
    calls = {"n": 0}

    async def executor(name, tool_input, *, user_id, **kw):
        calls["n"] += 1
        return tool_error_payload(ToolErrorCode.TEMPORARILY_UNAVAILABLE, "Panne.")

    breaker = ToolCircuitBreaker(failure_threshold=1, cooldown_s=30.0)

    async def run_once():
        return await execute_chat_tool_resilient(
            "flaky_tool",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=breaker,
            retry_policy=_fast_policy(max_retries=0),
        )

    first = asyncio.run(run_once())
    assert first["error_code"] == "temporarily_unavailable"
    calls_after_first = calls["n"]

    second = asyncio.run(run_once())
    assert second["error_code"] == "temporarily_unavailable"
    # Le disjoncteur est ouvert après le premier échec (seuil=1) : le second
    # appel ne doit JAMAIS atteindre l'exécuteur.
    assert calls["n"] == calls_after_first


def test_write_tool_never_retries_even_on_a_retryable_error() -> None:
    # #2879/#2983 (28/09/2026) — un outil qui ÉCRIT ne retente jamais, même sur
    # une famille normalement retryable (ici temporairement indisponible) :
    # une deuxième tentative après un premier envoi risquerait de dupliquer
    # l'effet.
    calls = {"n": 0}

    async def executor(name, tool_input, *, user_id, **kw):
        calls["n"] += 1
        return tool_error_payload(ToolErrorCode.TEMPORARILY_UNAVAILABLE, "Panne momentanée.")

    out = asyncio.run(
        execute_chat_tool_resilient(
            "propose_settings_update",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(max_retries=2),
            is_write_tool=True,
        )
    )
    assert calls["n"] == 1
    assert out["error_code"] == "temporarily_unavailable"
    assert out["retryable"] is False


def test_write_tool_timeout_is_unknown_not_a_failure() -> None:
    # Doctrine : « un timeout n'est pas un échec » — sur un outil d'écriture,
    # on ne sait pas si l'action a eu lieu avant que la réponse ne se perde.
    async def executor(name, tool_input, *, user_id, **kw):
        return tool_error_payload(ToolErrorCode.TIMEOUT, "Trop long.")

    out = asyncio.run(
        execute_chat_tool_resilient(
            "propose_settings_update",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
            is_write_tool=True,
        )
    )
    assert out["outcome"] == "unknown"
    assert out["retryable"] is False
    assert out["error_code"] == "timeout"


def test_read_tool_timeout_has_no_outcome_field_and_retries_normally() -> None:
    # Le comportement des outils de LECTURE ne change pas : pas de clé
    # `outcome` inventée, et le retry normal s'applique toujours.
    calls = {"n": 0}

    async def executor(name, tool_input, *, user_id, **kw):
        calls["n"] += 1
        if calls["n"] < 2:
            return tool_error_payload(ToolErrorCode.TIMEOUT, "Trop long.")
        return {"ok": True}

    out = asyncio.run(
        execute_chat_tool_resilient(
            "get_account_briefing",
            {},
            user_id="user-1",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
            is_write_tool=False,
        )
    )
    assert calls["n"] == 2
    assert out == {"ok": True}
    assert "outcome" not in out


def test_duplicate_call_within_the_dedup_window_returns_the_remembered_result() -> None:
    calls = {"n": 0}

    async def executor(name, tool_input, *, user_id, **kw):
        calls["n"] += 1
        return {"ok": True, "call": calls["n"]}

    async def run_twice():
        first = await execute_chat_tool_resilient(
            "get_account_briefing",
            {"account_id": "same"},
            user_id="user-9",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
        )
        second = await execute_chat_tool_resilient(
            "get_account_briefing",
            {"account_id": "same"},
            user_id="user-9",
            executor=executor,
            circuit_breaker=ToolCircuitBreaker(),
            retry_policy=_fast_policy(),
        )
        return first, second

    first, second = asyncio.run(run_twice())
    assert calls["n"] == 1
    assert first == second == {"ok": True, "call": 1}
