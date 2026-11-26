"""#2283.25/.27/.28 — circuit breaker PAR OUTIL de chat.

`source_health.py` note déjà qu'une source a dégradé, mais volontairement
"in-process and best-effort... a worker restart loses it" (source_health.py:18-21)
et SANS SEUIL qui arrête les appels suivants (#2283.25/.27 du registre). Ce
module ajoute le seuil : après N échecs consécutifs, le disjoncteur s'OUVRE et
le prochain appel n'atteint même plus le réseau — jusqu'au refroidissement, où
UN appel d'essai (semi-ouvert) décide de refermer ou de rouvrir.

#2283.28 (« ne pas faire porter l'échec à chacun ») : le disjoncteur est
partagé par NOM D'OUTIL, pas par utilisateur — un outil mort pour tout le
monde après 5 échecs ne fait plus essuyer le 6e utilisateur, le 7e, etc."""

from __future__ import annotations

from app.services.tool_circuit_breaker import ToolCircuitBreaker


def test_closed_by_default_allows_calls() -> None:
    breaker = ToolCircuitBreaker(failure_threshold=3, cooldown_s=30.0)
    assert breaker.allow("some_tool") is True


def test_opens_after_consecutive_failure_threshold() -> None:
    breaker = ToolCircuitBreaker(failure_threshold=3, cooldown_s=30.0)
    for _ in range(3):
        breaker.record_failure("flaky_tool")
    assert breaker.allow("flaky_tool") is False


def test_a_single_success_before_the_threshold_resets_the_streak() -> None:
    breaker = ToolCircuitBreaker(failure_threshold=3, cooldown_s=30.0)
    breaker.record_failure("flaky_tool")
    breaker.record_failure("flaky_tool")
    breaker.record_success("flaky_tool")
    breaker.record_failure("flaky_tool")
    breaker.record_failure("flaky_tool")
    # Deux échecs seulement depuis le succès qui a remis le compteur à zéro.
    assert breaker.allow("flaky_tool") is True


def test_breaker_is_scoped_per_tool_not_global() -> None:
    # #2283.28 — un outil mort ne fait pas tomber les autres.
    breaker = ToolCircuitBreaker(failure_threshold=2, cooldown_s=30.0)
    breaker.record_failure("dead_tool")
    breaker.record_failure("dead_tool")
    assert breaker.allow("dead_tool") is False
    assert breaker.allow("healthy_tool") is True


def test_half_open_after_cooldown_allows_one_trial_call(monkeypatch) -> None:
    import app.services.tool_circuit_breaker as mod

    clock = {"t": 0.0}
    monkeypatch.setattr(mod, "_now", lambda: clock["t"])
    breaker = ToolCircuitBreaker(failure_threshold=2, cooldown_s=10.0)
    breaker.record_failure("flaky_tool")
    breaker.record_failure("flaky_tool")
    assert breaker.allow("flaky_tool") is False
    clock["t"] += 5.0
    assert breaker.allow("flaky_tool") is False  # toujours dans le refroidissement
    clock["t"] += 6.0
    assert breaker.allow("flaky_tool") is True  # semi-ouvert : un essai autorisé


def test_a_failed_trial_call_reopens_the_breaker(monkeypatch) -> None:
    import app.services.tool_circuit_breaker as mod

    clock = {"t": 0.0}
    monkeypatch.setattr(mod, "_now", lambda: clock["t"])
    breaker = ToolCircuitBreaker(failure_threshold=2, cooldown_s=10.0)
    breaker.record_failure("flaky_tool")
    breaker.record_failure("flaky_tool")
    clock["t"] += 11.0
    assert breaker.allow("flaky_tool") is True
    breaker.record_failure("flaky_tool")  # l'essai semi-ouvert échoue aussi
    assert breaker.allow("flaky_tool") is False


def test_a_successful_trial_call_closes_the_breaker(monkeypatch) -> None:
    import app.services.tool_circuit_breaker as mod

    clock = {"t": 0.0}
    monkeypatch.setattr(mod, "_now", lambda: clock["t"])
    breaker = ToolCircuitBreaker(failure_threshold=2, cooldown_s=10.0)
    breaker.record_failure("flaky_tool")
    breaker.record_failure("flaky_tool")
    clock["t"] += 11.0
    assert breaker.allow("flaky_tool") is True
    breaker.record_success("flaky_tool")
    assert breaker.allow("flaky_tool") is True
    # Le compteur d'échecs est reparti à zéro — il faut à nouveau le seuil
    # complet pour rouvrir.
    breaker.record_failure("flaky_tool")
    assert breaker.allow("flaky_tool") is True
