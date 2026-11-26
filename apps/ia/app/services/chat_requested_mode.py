"""#3218 — le mode de recherche demandé (« approfondi »…) pour le tour en cours.

Les outils de chat ne reçoivent pas le mode ; un ContextVar le leur donne sans
passer par six signatures. Posé au début du tour (`_run_chat_turn`), hérité par
les tâches d'outils créées dedans. Absent = `None` : comportement d'avant.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

_REQUESTED_MODE: ContextVar[str | None] = ContextVar("chat_requested_mode", default=None)


def current_requested_mode() -> str | None:
    return _REQUESTED_MODE.get()


# #3218 (recette NB 10/10) — le tour courant (message + fil), lu par
# `plan_account_analysis` : « lance-la » après une question de périmètre ne doit
# pas la reposer. Même patron que le mode : un ContextVar posé au début du tour.
_TURN_THREAD: ContextVar[tuple[str, tuple[dict, ...]] | None] = ContextVar("chat_turn_thread", default=None)


def set_turn_thread(message: str, history: list[dict] | None) -> None:
    _TURN_THREAD.set((message or "", tuple(history or ())))
    # #3218 (lot RBJ) — le périmètre PROPOSÉ par la préparation de CE tour. Un dict posé ici et
    # MUTÉ ensuite : les outils tournent dans des tâches filles, et une valeur posée dans l'une
    # n'est pas visible des autres ; l'objet partagé, si.
    _TURN_PLANNED_SCOPE.set({})


_TURN_PLANNED_SCOPE: ContextVar[dict[str, str] | None] = ContextVar("chat_turn_planned_scope", default=None)


def note_planned_scope_mode(mode: str) -> None:
    """#3218 (lot RBJ) — retient le périmètre que la préparation a proposé (`scopeGuardrail`)."""
    holder = _TURN_PLANNED_SCOPE.get()
    if holder is not None:
        holder["scope_mode"] = mode


def planned_scope_mode() -> str | None:
    holder = _TURN_PLANNED_SCOPE.get()
    return holder.get("scope_mode") if holder else None


def current_turn_thread() -> tuple[str, tuple[dict, ...]] | None:
    return _TURN_THREAD.get()


def set_requested_mode(mode: str | None) -> None:
    """Pose le mode du tour ; chaque requête a sa propre tâche, donc son contexte."""
    _REQUESTED_MODE.set(mode)


@contextmanager
def requested_mode_scope(mode: str | None) -> Iterator[None]:
    token = _REQUESTED_MODE.set(mode)
    try:
        yield
    finally:
        _REQUESTED_MODE.reset(token)


# #3973 — « Outils et sources » : les OUTILS décochés pour ce fil
# (`req.excluded_providers`, déjà recoupés par l'API avec le registre réel).
# Même patron que le mode : posé au début du tour, lu par `bellum_api` sur
# chaque lecture du pont qui CHOISIT un backend (messagerie, agenda) — avec deux
# messageries branchées, c'est le pont qui sait laquelle ne pas lire.
# `None`/vide = corps d'avant, byte-identique.
_TURN_EXCLUDED_PROVIDERS: ContextVar[tuple[str, ...]] = ContextVar("chat_turn_excluded_providers", default=())


def set_turn_excluded_providers(providers: list[str] | None) -> None:
    _TURN_EXCLUDED_PROVIDERS.set(tuple(providers or ()))


def current_excluded_tool_providers() -> tuple[str, ...]:
    return _TURN_EXCLUDED_PROVIDERS.get()


@contextmanager
def excluded_tool_providers_scope(providers: list[str] | None) -> Iterator[None]:
    token = _TURN_EXCLUDED_PROVIDERS.set(tuple(providers or ()))
    try:
        yield
    finally:
        _TURN_EXCLUDED_PROVIDERS.reset(token)


# #2770.35 (décision Louis 11/10) — les familles d'outils RÉELLEMENT opérationnelles
# pour CE tour (`req.connected_families`, déjà privées des familles décochées pour le
# fil). Même patron que les outils exclus juste au-dessus : posé au début du tour, lu
# par le plan de journée/semaine (`propose_focus_plan`/`propose_weekly_plan`) pour ne
# jamais placer un bloc qui s'appuie sur un outil non branché, et pour NOMMER ce qu'il
# a lu. `None` = « on ne sait pas » (ancien appelant) : le plan garde son comportement
# d'avant et dit qu'il n'a pas lu les outils branchés.
_TURN_CONNECTED_FAMILIES: ContextVar[tuple[str, ...] | None] = ContextVar("chat_turn_connected_families", default=None)


def set_turn_connected_families(families: list[str] | None) -> None:
    _TURN_CONNECTED_FAMILIES.set(tuple(families) if families is not None else None)


def current_connected_families() -> tuple[str, ...] | None:
    return _TURN_CONNECTED_FAMILIES.get()


@contextmanager
def connected_families_scope(families: list[str] | None) -> Iterator[None]:
    token = _TURN_CONNECTED_FAMILIES.set(tuple(families) if families is not None else None)
    try:
        yield
    finally:
        _TURN_CONNECTED_FAMILIES.reset(token)
