"""#2445.6 (#2442.16, #2766) — l'identifiant du TOUR courant, visible en
profondeur sans changer la signature d'aucune fonction entre `chat.py` et
`execute_chat_tool`.

Un `ContextVar` copie sa valeur dans chaque tâche asyncio créée APRÈS l'avoir
posée (`asyncio.create_task`, exactement le geste de `chat.py` pour `_pump`) —
posé une fois à l'entrée HTTP, il retrouve son chemin jusqu'à
`execute_chat_tool` (via `chat_orchestrator._execute_one_tool`) sans qu'aucune
fonction intermédiaire n'ait à le porter. Même patron déjà éprouvé dans ce
dépôt pour un signal de portée « un tour » : `langfuse_client._trace`,
`cost_ledger._current`, `rate_limiter._WAIT_DEADLINE`.

Une tâche qui ne descend PAS de `chat.py` (tests, autres routeurs, jobs async)
ne voit jamais cette valeur posée : elle reste à son défaut, `None` — jamais
un identifiant deviné.
"""

from __future__ import annotations

from contextvars import ContextVar

_current_turn_id: ContextVar[str | None] = ContextVar("current_turn_id", default=None)


def current_turn_id() -> str | None:
    """L'identifiant du tour en cours, ou `None` hors d'un tour de chat."""
    return _current_turn_id.get()


def set_current_turn_id(turn_id: str | None) -> None:
    """Pose l'identifiant du tour pour la tâche courante (et celles qu'elle
    crée ensuite). Appelé UNE fois, par le SEUL appelant réel : `chat.py`,
    juste après avoir lu `x-bellum-turn`."""
    _current_turn_id.set(turn_id)


__all__ = ["current_turn_id", "set_current_turn_id"]
