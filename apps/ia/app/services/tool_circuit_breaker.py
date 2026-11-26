"""Circuit breaker PAR OUTIL de chat — #2283.25/.27/.28 (LAU-FINAL-024, #2983).

``source_health.py`` note déjà qu'une source a dégradé, mais explicitement
"in-process and best-effort... a worker restart loses it" et SANS SEUIL qui
arrête les appels suivants. Ce module ajoute le seuil manquant : après
``failure_threshold`` échecs CONSÉCUTIFS d'un outil, le disjoncteur OUVRE et
le prochain appel n'atteint plus le réseau jusqu'au refroidissement — où UN
appel d'essai (semi-ouvert) décide de refermer ou de rouvrir.

Scope PAR OUTIL, jamais par utilisateur (#2283.28 — « ne pas faire porter
l'échec à chacun ») : un outil mort pour tout le monde après N échecs ne fait
plus essuyer le N+1e appelant, quel qu'il soit.

Même patron que ``source_health.py`` (registre en mémoire, best-effort, perdu
au redémarrage d'un worker — acceptable ici pour la même raison : un
disjoncteur qui repart fermé après un redéploiement retente juste une fois de
plus, il ne ment jamais)."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

_now = time.monotonic


@dataclass
class _BreakerState:
    consecutive_failures: int = 0
    opened_at: float | None = None
    #: Un essai semi-ouvert est en vol : le prochain `allow()` ne doit pas en
    #: autoriser un second avant que celui-ci ait rendu son verdict.
    trial_in_flight: bool = False


class ToolCircuitBreaker:
    """Disjoncteur en mémoire, un état par nom d'outil."""

    def __init__(self, *, failure_threshold: int = 5, cooldown_s: float = 30.0) -> None:
        self._failure_threshold = max(1, failure_threshold)
        self._cooldown_s = max(0.0, cooldown_s)
        self._states: dict[str, _BreakerState] = {}
        self._lock = threading.Lock()

    def _state_for(self, tool_name: str) -> _BreakerState:
        state = self._states.get(tool_name)
        if state is None:
            state = _BreakerState()
            self._states[tool_name] = state
        return state

    def allow(self, tool_name: str) -> bool:
        """``False`` si l'appel à ``tool_name`` doit être court-circuité SANS
        réseau. Un disjoncteur OUVERT depuis plus de ``cooldown_s`` passe en
        semi-ouvert et autorise EXACTEMENT un essai."""
        with self._lock:
            state = self._state_for(tool_name)
            if state.opened_at is None:
                return True
            if state.trial_in_flight:
                return False
            if _now() - state.opened_at < self._cooldown_s:
                return False
            # Semi-ouvert : un essai, un seul, jusqu'au prochain verdict.
            state.trial_in_flight = True
            return True

    def record_success(self, tool_name: str) -> None:
        with self._lock:
            state = self._state_for(tool_name)
            state.consecutive_failures = 0
            state.opened_at = None
            state.trial_in_flight = False

    def record_failure(self, tool_name: str) -> None:
        with self._lock:
            state = self._state_for(tool_name)
            state.consecutive_failures += 1
            state.trial_in_flight = False
            if state.opened_at is not None or state.consecutive_failures >= self._failure_threshold:
                state.opened_at = _now()

    def release(self, tool_name: str) -> None:
        """#4617 — un essai semi-ouvert qui s'est terminé SANS verdict (l'appelant a cessé d'attendre avant
        la réponse) rend sa place : sans ça, ``trial_in_flight`` resterait vrai et le circuit ne se refermerait
        jamais. Le compteur et l'ouverture ne bougent pas."""
        with self._lock:
            self._state_for(tool_name).trial_in_flight = False

    def reset(self) -> None:
        """Vide tout état — usage tests uniquement (isolation entre cas qui
        réutilisent le même nom d'outil)."""
        with self._lock:
            self._states.clear()


#: Instance partagée — un disjoncteur par PROCESSUS, comme `source_health`
#: (un worker restart le remet à zéro, ce qui est le comportement voulu).
_SHARED = ToolCircuitBreaker()


def get_tool_circuit_breaker() -> ToolCircuitBreaker:
    return _SHARED


__all__ = ["ToolCircuitBreaker", "get_tool_circuit_breaker"]
