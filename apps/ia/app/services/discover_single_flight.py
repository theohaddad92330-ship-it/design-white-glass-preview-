"""#3901.14 — deux recherches /discover identiques et simultanées ne font qu'UN travail.

Le seau de chaque fournisseur est partagé par tout le processus : deux pages identiques lancées ensemble
(double clic, deux onglets du même espace) se disputaient les mêmes jetons. La seconde attend la première et
reçoit sa copie. Ce n'est PAS un cache : dès que la recherche finit, rien n'est gardé, et une recherche
différente (autres filtres, autre profil, autres SIREN de l'espace) ne s'attend jamais.
"""

from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Awaitable, Callable
from typing import TypeVar

from pydantic import BaseModel

_ModelT = TypeVar("_ModelT", bound=BaseModel)


class _Flight:
    __slots__ = ("task", "waiters")

    def __init__(self, task: asyncio.Task) -> None:
        self.task = task
        self.waiters = 0


_FLIGHTS: dict[str, _Flight] = {}


def flight_key(request: BaseModel) -> str:
    """Même demande octet pour octet (filtres, limite, profil, sources, SIREN de l'espace) ⇒ même clé."""
    return hashlib.sha256(request.model_dump_json().encode("utf-8")).hexdigest()


async def single_flight(request: BaseModel, run: Callable[[], Awaitable[_ModelT]]) -> _ModelT:
    key = flight_key(request)
    flight = _FLIGHTS.get(key)
    if flight is None:
        task = asyncio.ensure_future(run())
        flight = _Flight(task)
        _FLIGHTS[key] = flight
        task.add_done_callback(lambda _t, k=key, f=flight: _forget(k, f))
    flight.waiters += 1
    try:
        result = await asyncio.shield(flight.task)
    except asyncio.CancelledError:
        # Le dernier à partir arrête le travail ; tant qu'un autre attend, la recherche continue.
        flight.waiters -= 1
        if flight.waiters <= 0 and not flight.task.done():
            flight.task.cancel()
        raise
    flight.waiters -= 1
    # Chacun reçoit SA copie : un appelant qui modifie sa réponse ne change pas celle de l'autre.
    return result.model_copy(deep=True)


def _forget(key: str, flight: _Flight) -> None:
    if _FLIGHTS.get(key) is flight:
        del _FLIGHTS[key]
    if not flight.task.cancelled():
        flight.task.exception()  # consomme l'erreur : chaque attendant l'a déjà reçue
