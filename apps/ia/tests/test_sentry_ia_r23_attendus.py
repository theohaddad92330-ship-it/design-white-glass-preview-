"""R23-SENTRY-IA — un aléa attendu (limiteur plein, source tierce muette) n'est pas un défaut de code :
il ne part pas à Sentry, et une recherche de lieu qui échoue ne lève pas dans une tâche asyncio."""

from __future__ import annotations

import asyncio
from time import monotonic

import pytest

from app.routers import discover
from app.sentry_init import _before_send
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.distributed_rate_limiter import RateLimitTimeout


@pytest.mark.parametrize(
    "exc",
    [RateLimitTimeout("recherche_entreprises", 5.0), SignalSourceUnavailable("recherche_entreprises", "429")],
)
def test_attendu_n_est_pas_envoye_a_sentry(exc: Exception) -> None:
    assert _before_send({"message": "x"}, {"exc_info": (type(exc), exc, None)}) is None


def test_une_vraie_panne_de_code_part_toujours() -> None:
    exc = KeyError("bug")
    assert _before_send({"message": "x"}, {"exc_info": (type(exc), exc, None)}) is not None


@pytest.mark.asyncio
async def test_recherche_de_lieu_en_echec_ne_leve_pas_dans_une_tache(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4448.1 — critère de Sentry : la TÂCHE ne finit pas en exception (TimeoutError sans message)."""

    async def boom(city: str, fuzzy: bool = False) -> None:
        raise TimeoutError

    monkeypatch.setattr(discover, "_resolve_city_commune", boom)
    loop = asyncio.get_running_loop()
    tasks: list[asyncio.Future] = []
    previous = loop.get_task_factory()

    def factory(lp, coro, **kw):  # noqa: ANN001
        task = asyncio.Task(coro, loop=lp, **kw)
        tasks.append(task)
        return task

    loop.set_task_factory(factory)
    try:
        out = await discover._resolve_place_within_share(["Lille", "Lyon"], monotonic() + 5)
    finally:
        loop.set_task_factory(previous)

    assert out == (None, None, True)
    assert tasks and all(t.exception() is None for t in tasks if t.done())
