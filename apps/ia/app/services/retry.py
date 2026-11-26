from __future__ import annotations

import asyncio
import logging
import random
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

#: Étalement par défaut autour du délai nominal (±25 %). Sans lui, N appelants
#: qui échouent au même instant (jusqu'à 29 requêtes Brave en phase 1,
#: brave_search.py:200-204) retentent TOUS aux mêmes instants — un pic qui
#: retombe exactement quand le fournisseur demande de respirer. Mesuré : les
#: délais nominaux (1 s / 2 s / 4 s) restaient déterministes à l'octet près.
DEFAULT_JITTER_RATIO = 0.25


def jittered_delay(nominal: float, jitter_ratio: float, max_delay: float) -> float:
    """Bruit aléatoire autour de ``nominal``, dans une fenêtre BORNÉE.

    Jamais moins de ``nominal * (1 - jitter_ratio)``, jamais plus de
    ``nominal * (1 + jitter_ratio)`` — et le résultat est en plus toujours
    ramené dans ``[0, max_delay]`` : un nominal déjà au plafond ne doit pas
    dépasser ``max_delay`` à cause de l'étalement, et un nominal minuscule ne
    doit jamais devenir négatif. ``jitter_ratio=0`` rend le nominal exact
    (déterministe) — un appelant qui ne veut pas de bruit le peut.
    """
    if jitter_ratio <= 0:
        return max(0.0, min(nominal, max_delay))
    spread = nominal * jitter_ratio
    low = max(0.0, nominal - spread)
    high = min(max_delay, nominal + spread)
    if high <= low:
        return low
    return random.uniform(low, high)


async def retry_with_backoff(
    fn: Callable,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    exceptions: tuple = (Exception,),
    jitter_ratio: float = DEFAULT_JITTER_RATIO,
) -> T:
    """Retry an async function with exponential backoff + bounded jitter.

    Args:
        fn: Async callable to retry
        max_retries: Maximum number of attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
        exceptions: Tuple of exception types to catch
        jitter_ratio: Random spread applied around each nominal delay (±ratio).
            0 disables jitter (exact nominal delay, the old deterministic
            behaviour) — see :func:`jittered_delay`.
    """
    last_exc = None
    for attempt in range(max_retries):
        try:
            return await fn()
        except exceptions as exc:
            last_exc = exc
            if attempt < max_retries - 1:
                nominal = min(base_delay * (2 ** attempt), max_delay)
                delay = jittered_delay(nominal, jitter_ratio, max_delay)
                logger.warning(
                    "Retry %d/%d after %.2fs (nominal %.2fs): %s",
                    attempt + 1, max_retries, delay, nominal, exc,
                )
                await asyncio.sleep(delay)
            else:
                logger.error("All %d retries failed: %s", max_retries, exc)
    raise last_exc  # type: ignore
