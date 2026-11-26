"""Charge les overrides de config depuis la table ``config_overrides`` (owner
NestJS) et les applique à la config knowledge in-process.

Un opérateur écrit la ligne (scope='global', patch JSONB) → POST /config/reload
sur l'IA → nouveau seuil actif SANS redeploy. Dégradable : toute erreur de lecture
(pas de creds, réseau, table absente) → no-op, on garde les defaults."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from app.config.knowledge_config import set_overrides
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def fetch_global_override_patch() -> dict[str, Any]:
    """Read the ``global`` override patch from ``config_overrides``, or ``{}``."""
    try:
        # `.limit(1)` et NON `.maybe_single()` : ce dernier envoie l'en-tête
        # `Accept: application/vnd.pgrst.object+json`, et PostgREST répond
        # **406 Not Acceptable** quand le résultat n'est pas exactement un
        # objet — donc à CHAQUE démarrage, puisque aucun opérateur n'a jamais
        # écrit de surcharge globale. L'absence de ligne est le cas NORMAL ici :
        # la faire ressembler à une erreur HTTP apprend à ignorer les logs de
        # démarrage, et c'est là qu'on regarde quand quelque chose ne va pas.
        res = get_supabase().table("config_overrides").select("patch").eq("scope", "global").limit(1).execute()
        rows = res.data if isinstance(res.data, list) else []
        if not rows or not isinstance(rows[0], dict):
            return {}
        patch = rows[0].get("patch")
        return patch if isinstance(patch, dict) else {}
    except Exception as exc:  # degradable — never break startup on a config read
        logger.warning("config_overrides load failed, keeping defaults: %s", exc)
        return {}


def load_config_overrides(fetch: Callable[[], dict[str, Any]] = fetch_global_override_patch) -> dict[str, Any]:
    """Apply the fetched override patch to the in-process config. Injectable
    ``fetch`` for tests. Returns the applied patch.

    Synchronous, blocking (``fetch`` does a plain ``.execute()`` HTTP call,
    not ``.aexecute()``) — call ``aload_config_overrides`` from an ``async
    def`` handler instead of this one (see #2915.2)."""
    patch = fetch() or {}
    set_overrides(patch)
    return patch


# #2915.2 — démarrage IA retardé : `main.py` (startup) et `POST /config/reload`
# appelaient `load_config_overrides()` directement depuis un handler `async
# def`, alors qu'elle fait un `.execute()` Supabase SYNCHRONE (bloquant, pas la
# variante `TableQuery.aexecute()` prévue pour ça — c'était le seul appel du
# dépôt à contourner `aexecute()`). L'IA tourne en un seul processus
# (`apps/ia/railway.json` ne pose pas `--workers`) : ce thread event-loop est
# AUSSI celui qui répond à `/health`, donc un fetch lent (réseau Supabase,
# cold start) gèle tout le service — y compris son propre healthcheck — le
# temps du fetch. `asyncio.to_thread` décharge le blocage sur un thread
# séparé, exactement comme `aexecute()` le fait déjà pour toute autre requête
# Supabase du dépôt.
async def aload_config_overrides(fetch: Callable[[], dict[str, Any]] = fetch_global_override_patch) -> dict[str, Any]:
    """Async-safe variant of ``load_config_overrides`` for use from an
    ``async def`` handler (startup event, ``/config/reload``)."""
    patch = await asyncio.to_thread(fetch) or {}
    set_overrides(patch)
    return patch
