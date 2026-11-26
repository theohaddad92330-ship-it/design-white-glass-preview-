"""DISCOVER-OFFRES (15/10, point C) — la réserve quotidienne d'Adzuna.

Adzuna plafonne à 500 appels par jour pour TOUT le monde. Les analyses (une fiche qu'un commercial attend)
passent avant Découvrir (une liste de cartes) : un compteur journalier COMMUN des appels RÉSEAU (le cache = 0)
est tenu dans Redis, remis à zéro à minuit Europe/Paris. Découvrir n'appelle que tant que
``appels_du_jour < ADZUNA_DAILY_LIMIT - ADZUNA_ANALYSIS_RESERVE`` ; les analyses vont jusqu'à la limite.
Au-delà : la source se tait (aucune erreur, aucun bandeau) — un quota n'est pas une panne.

Sans Redis, le compteur vit dans le processus (au mieux) : jamais de blocage faute de stockage.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.services import provider_cache

logger = logging.getLogger(__name__)

_PARIS = ZoneInfo("Europe/Paris")
_DEFAULT_DAILY_LIMIT = 500
_DEFAULT_ANALYSIS_RESERVE = 150
#: Une coupure de Découvrir se dit dans le journal au plus toutes les N secondes (une ligne par page, pas par carte).
_LOG_EVERY_S = 300.0

_local: dict[str, int] = {}
_last_cut_log = 0.0


def _env_int(name: str, default: int, *, minimum: int) -> int:
    try:
        value = int(os.environ.get(name, "").strip())
    except ValueError:
        return default
    return value if value >= minimum else default


def daily_limit() -> int:
    return _env_int("ADZUNA_DAILY_LIMIT", _DEFAULT_DAILY_LIMIT, minimum=1)


def analysis_reserve() -> int:
    return _env_int("ADZUNA_ANALYSIS_RESERVE", _DEFAULT_ANALYSIS_RESERVE, minimum=0)


def discover_ceiling() -> int:
    """Le nombre d'appels du jour à partir duquel Découvrir se tait (jamais négatif)."""
    return max(daily_limit() - analysis_reserve(), 0)


def day_key(now: datetime | None = None) -> str:
    """La clé du compteur : le JOUR de Paris (minuit Europe/Paris, pas minuit UTC)."""
    moment = (now or datetime.now(UTC)).astimezone(_PARIS)
    return f"adzuna:calls:{moment.date().isoformat()}"


def _seconds_to_paris_midnight(now: datetime | None = None) -> int:
    moment = (now or datetime.now(UTC)).astimezone(_PARIS)
    midnight = (moment + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((midnight - moment).total_seconds())


async def record_network_call() -> None:
    """Un appel RÉSEAU Adzuna vient de partir : le compteur du jour monte de 1."""
    key = day_key()
    redis = await provider_cache._redis()
    if redis is not None:
        try:
            await redis.incr(key)
            await redis.expire(key, _seconds_to_paris_midnight() + 3600)
            return
        except Exception as exc:  # noqa: BLE001 — le compteur est au mieux
            logger.debug("adzuna_budget: Redis indisponible (%s) — compteur local", exc)
    _local[key] = _local.get(key, 0) + 1


async def calls_today() -> int:
    key = day_key()
    redis = await provider_cache._redis()
    if redis is not None:
        try:
            raw = await redis.get(key)
            return int(raw) if raw is not None else 0
        except Exception as exc:  # noqa: BLE001
            logger.debug("adzuna_budget: lecture Redis impossible (%s) — compteur local", exc)
    return _local.get(key, 0)


async def discover_allowed() -> bool:
    """Découvrir peut-il appeler Adzuna ? Oui tant que la réserve des analyses est intacte."""
    allowed = await calls_today() < discover_ceiling()
    if not allowed:
        _log_cut()
    return allowed


async def analysis_allowed() -> bool:
    """Une analyse peut appeler Adzuna jusqu'à la limite du jour."""
    return await calls_today() < daily_limit()


def _log_cut() -> None:
    global _last_cut_log
    now = time.monotonic()
    if now - _last_cut_log >= _LOG_EVERY_S:
        _last_cut_log = now
        logger.info(
            "Adzuna — Découvrir coupé : réserve des analyses (limite %d, réserve %d, plafond Découvrir %d)",
            daily_limit(),
            analysis_reserve(),
            discover_ceiling(),
        )
