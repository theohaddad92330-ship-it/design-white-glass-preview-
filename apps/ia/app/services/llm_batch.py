"""LOT (15/10) DATA-C — la file de lots Anthropic (Message Batches) du NOCTURNE.

Un appel envoyé en lot coûte moitié prix, mais rend en minutes au lieu de
secondes. Il ne sert donc QUE ce que personne n'attend devant un écran : le
refresh quotidien de la veille (``watchlist-refresh``), et tout autre appelant
de fond qui pose l'en-tête :data:`LANE_HEADER` sur sa requête.

Trois pièces, chacune avec sa raison :

* **la voie** — un ``ContextVar`` posé par ``app.middleware.llm_lane`` pour la
  durée d'UNE requête HTTP. Les ``asyncio.create_task`` de la requête (les trois
  prompts concurrents de la phase 1) en héritent ; rien d'autre ne la voit.
* **le regroupeur** — les appels concurrents d'une même boucle partent dans UN
  lot : la collecte de la phase 1 est finie quand ses prompts partent, ils se
  retrouvent dans la même fenêtre (:func:`coalesce_window_s`).
* **le lot** — :func:`run_batch` construit, soumet, attend sous un DÉLAI, relit ;
  au-delà, il ANNULE (un lot oublié facture quand même) et lève
  :class:`LlmBatchTimeout` : l'appelant repart en synchrone. Le nocturne est
  moins cher, jamais moins complet.

Interrupteur : ``LLM_BATCH_DISABLED=true`` ramène toute la voie au synchrone,
octet pour octet le chemin d'avant (aucun client de lot construit).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import time
import weakref
from collections.abc import Awaitable, Callable, Iterator
from contextvars import ContextVar
from typing import Any

logger = logging.getLogger(__name__)

#: L'en-tête par lequel un appelant de FOND demande la voie « lot ».
LANE_HEADER = "x-bellum-llm-lane"
#: La seule valeur reconnue — toute autre (absente, « sync », faute de frappe)
#: laisse la requête en synchrone : on n'ouvre jamais la voie lente par défaut.
LANE_BATCH = "batch"

_LANE: ContextVar[str | None] = ContextVar("llm_lane", default=None)


class LlmBatchTimeout(Exception):
    """Le lot n'a pas fini sous son délai — il a été annulé."""


def lane_from_header(raw: str | None) -> str | None:
    return LANE_BATCH if (raw or "").strip().lower() == LANE_BATCH else None


@contextlib.contextmanager
def llm_lane(lane: str | None) -> Iterator[None]:
    """Pose la voie pour le bloc (et les tâches qu'il crée), puis la retire."""
    token = _LANE.set(lane)
    try:
        yield
    finally:
        _LANE.reset(token)


def batch_lane_requested() -> bool:
    return _LANE.get() == LANE_BATCH


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def lane_enabled() -> bool:
    """Faux quand l'interrupteur ``LLM_BATCH_DISABLED`` est posé."""
    return not _env_flag("LLM_BATCH_DISABLED")


def batch_lane_active() -> bool:
    return batch_lane_requested() and lane_enabled()


def _env_seconds(name: str, default: float) -> float:
    """Un réglage illisible ou négatif retombe sur le défaut — jamais désarmé."""
    try:
        value = float(os.getenv(name, ""))
    except ValueError:
        return default
    return value if value >= 0 else default


def max_wait_s() -> float:
    """Délai d'un lot avant annulation et repli synchrone (``LLM_BATCH_MAX_WAIT_S``).

    240 s : la phase 1 a 480 s de budget côté API, collecte comprise ; un lot
    rend d'ordinaire en quelques minutes, et le repli synchrone (~60-120 s) doit
    encore tenir dans ce qui reste."""
    return _env_seconds("LLM_BATCH_MAX_WAIT_S", 240.0)


def poll_interval_s() -> float:
    return _env_seconds("LLM_BATCH_POLL_S", 5.0)


def coalesce_window_s() -> float:
    """Fenêtre pendant laquelle les appels concurrents se regroupent en UN lot."""
    return _env_seconds("LLM_BATCH_COALESCE_S", 1.0)


async def run_batch(client: Any, requests: list[dict[str, Any]]) -> dict[str, Any]:
    """Soumet ``requests`` (``custom_id`` + ``params``), attend, relit.

    Rend ``{custom_id: Message}`` pour les SEULES requêtes réussies — une requête
    en erreur, annulée ou expirée est absente (l'appelant la rejoue en
    synchrone). Lève :class:`LlmBatchTimeout` au-delà de :func:`max_wait_s`,
    après avoir demandé l'annulation du lot."""
    batch = await client.messages.batches.create(requests=requests)
    deadline = time.monotonic() + max_wait_s()
    poll = poll_interval_s()
    while getattr(batch, "processing_status", None) != "ended":
        if time.monotonic() >= deadline:
            with contextlib.suppress(Exception):  # annuler est un effort, pas une condition
                await client.messages.batches.cancel(batch.id)
            raise LlmBatchTimeout(f"lot {batch.id} non terminé après {max_wait_s():.0f}s")
        await asyncio.sleep(poll)
        batch = await client.messages.batches.retrieve(batch.id)
    messages: dict[str, Any] = {}
    async for row in await client.messages.batches.results(batch.id):
        result = getattr(row, "result", None)
        if getattr(result, "type", None) == "succeeded":
            messages[row.custom_id] = result.message
        else:
            logger.warning(
                "Lot %s : requête %s non aboutie (%s) — repli synchrone",
                batch.id,
                row.custom_id,
                getattr(result, "type", "?"),
            )
    return messages


# ── le regroupeur ────────────────────────────────────────────────────────────


class _Pending:
    def __init__(self) -> None:
        self.items: list[tuple[Any, asyncio.Future[Any]]] = []
        self.flusher: asyncio.Task[None] | None = None


_PENDING: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, _Pending] = weakref.WeakKeyDictionary()


async def coalesced(item: Any, runner: Callable[[list[Any]], Awaitable[list[Any]]]) -> Any:
    """Rend le résultat de ``item`` une fois passé dans un lot PARTAGÉ.

    Le premier appel ouvre une fenêtre ; tous ceux qui arrivent pendant la
    fenêtre partent avec lui dans ``runner(items)`` (un seul lot)."""
    loop = asyncio.get_running_loop()
    pending = _PENDING.setdefault(loop, _Pending())
    future: asyncio.Future[Any] = loop.create_future()
    pending.items.append((item, future))
    if pending.flusher is None:
        pending.flusher = loop.create_task(_flush_after_window(pending, runner))
    return await future


async def _flush_after_window(pending: _Pending, runner: Callable[[list[Any]], Awaitable[list[Any]]]) -> None:
    await asyncio.sleep(coalesce_window_s())
    batch, pending.items, pending.flusher = pending.items, [], None
    try:
        results = await runner([item for item, _ in batch])
    except BaseException as exc:  # noqa: BLE001 — l'échec revient à CHAQUE appelant
        for _, future in batch:
            if not future.done():
                future.set_exception(exc)
        if not isinstance(exc, Exception):
            raise
        return
    for (_, future), result in zip(batch, results, strict=True):
        if future.done():
            continue
        # Un échec PROPRE à un élément (son repli synchrone a levé) ne revient
        # qu'à son appelant ; les autres reçoivent leur résultat.
        if isinstance(result, BaseException):
            future.set_exception(result)
        else:
            future.set_result(result)
