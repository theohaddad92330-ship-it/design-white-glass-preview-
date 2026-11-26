"""DISCOVER-OFFRES (15/10, E) — alerte quand le solde de crédits Mantiks passe sous 10 %.

``GET https://dashboard.mantiks.io/api/v2/credits/balance`` (0 crédit, en-tête ``X-API-KEY``), lu AU PLUS UNE
FOIS PAR HEURE (le marqueur vit dans le cache commun : tous les processus le partagent). Sous
``LOW_BALANCE_RATIO`` du total, une ligne de journal ``WARNING`` le dit — c'est la seule alerte : l'appelant
(``mantiks_jobs``) ne dépend jamais de la réponse.

⚠️ Le schéma exact de la réponse n'est pas figé ici (contrat non vérifié) : on lit des clés usuelles pour le
solde RESTANT et le TOTAL ; si l'un des deux manque, aucune alerte n'est levée (jamais un ratio deviné).
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Mapping

import httpx

from app.services import provider_cache
from app.services.rate_limiter import throttle

logger = logging.getLogger(__name__)

_BALANCE_URL = "https://dashboard.mantiks.io/api/v2/credits/balance"
_TIMEOUT_S = 6.0
LOW_BALANCE_RATIO = 0.10
_CHECK_EVERY_S = 3600
_MARKER_NAMESPACE = "mantiks_balance_check"
_REMAINING_KEYS = ("remaining", "credits_remaining", "balance", "credits", "available")
_TOTAL_KEYS = ("total", "credits_total", "quota", "limit", "allowance", "initial")

_last_check = 0.0


def _number(payload: Mapping, keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            return float(value)
    return None


def low_balance(payload: object) -> tuple[float, float] | None:
    """``(restant, total)`` quand le solde est sous le seuil, sinon ``None`` (y compris réponse illisible)."""
    if not isinstance(payload, Mapping):
        return None
    remaining, total = _number(payload, _REMAINING_KEYS), _number(payload, _TOTAL_KEYS)
    if remaining is None or total is None or total <= 0:
        return None
    return (remaining, total) if remaining / total < LOW_BALANCE_RATIO else None


async def check_balance(*, client: httpx.AsyncClient | None = None) -> None:
    """Lit le solde (au plus 1×/h) et journalise une alerte s'il est bas. Ne lève jamais."""
    global _last_check
    key = os.environ.get("MANTIKS_API_KEY", "").strip()
    now = time.monotonic()
    if not key or (_last_check and now - _last_check < _CHECK_EVERY_S):
        return
    if await provider_cache.get_json(_MARKER_NAMESPACE, "last") is not None:
        _last_check = now
        return
    _last_check = now
    await provider_cache.set_json(_MARKER_NAMESPACE, "last", {"at": int(time.time())}, _CHECK_EVERY_S)
    owns = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    try:
        async with throttle("mantiks"):
            resp = await http.get(_BALANCE_URL, headers={"X-API-KEY": key, "accept": "application/json"})
        logger.info("mantiks credits/balance cache=miss coût=0")
        if not resp.is_success:
            logger.warning("mantiks credits/balance illisible (status %s)", resp.status_code)
            return
        low = low_balance(resp.json())
        if low is not None:
            logger.warning(
                "Mantiks — solde de crédits bas : %d restants sur %d (< %d %%)",
                low[0],
                low[1],
                round(LOW_BALANCE_RATIO * 100),
            )
    except Exception as exc:  # noqa: BLE001 — l'alerte est un confort, jamais une panne
        logger.warning("mantiks credits/balance indisponible: %s", type(exc).__name__)
    finally:
        if owns:
            await http.aclose()
