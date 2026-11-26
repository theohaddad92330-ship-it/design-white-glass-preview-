"""Idempotency key par outil de chat — #2283.24 (LAU-FINAL-024, épopée #2983).

Portée volontairement étroite : dédupliquer un appel d'outil STRICTEMENT
identique (même outil, même utilisateur, même entrée) relancé à quelques
secondes d'intervalle — le cas concret étant le retry interne de
``tool_resilience.execute_chat_tool_resilient`` qui ne doit jamais compter
deux fois le même essai transitoire. Ce n'est PAS le verrou anti-double-clic
d'une écriture réelle (Action OS, déjà tenu par
``action-router.service.spec.ts:898`` côté API) — un outil de chat ne mute
jamais rien directement (il prépare une proposition, ``_proposal()``), donc
rien ici n'a besoin d'un ledger durable : un cache en mémoire, borné et à
courte durée de vie, suffit.

Même forme que ``source_health.py`` (registre en mémoire, borné, best-effort)
— un réglage vit à un seul endroit (GA-26), le patron ne se réinvente pas.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any

#: Fenêtre de déduplication — délibérément COURTE. Le but n'est jamais de
#: mettre un outil de LECTURE en cache (un utilisateur qui relit un compte 10s
#: plus tard doit voir un résultat frais, jamais une réponse figée resservie
#: en silence — ce serait resservir une donnée périmée comme si elle était
#: actuelle). Le but est de coalescer deux appels QUASI SIMULTANÉS au même
#: outil avec la même entrée — double-clic, ou deux tentatives internes de
#: `tool_resilience` qui se chevauchent — pas d'agir comme un cache.
DEDUP_TTL_S = 5.0

MAX_TRACKED_KEYS = 512

_now = time.monotonic

_RESULTS: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()


def idempotency_key_for(tool_name: str, user_id: str, tool_input: dict[str, Any]) -> str:
    """Clé déterministe pour (outil, utilisateur, entrée) — l'ordre des clés
    du dict d'entrée n'influence jamais la clé (``sort_keys=True``)."""
    canonical = json.dumps(tool_input or {}, sort_keys=True, default=str, ensure_ascii=False)
    raw = f"{tool_name}\u0000{user_id}\u0000{canonical}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def remember_result(key: str, result: Any) -> None:
    """Note le résultat d'un appel — best-effort, jamais bloquant."""
    _RESULTS[key] = (_now(), result)
    _RESULTS.move_to_end(key)
    while len(_RESULTS) > MAX_TRACKED_KEYS:
        _RESULTS.popitem(last=False)


def forget_all() -> None:
    """Vide le cache de déduplication — usage tests uniquement (isolation
    entre cas qui réutilisent volontairement le même (outil, utilisateur,
    entrée))."""
    _RESULTS.clear()


def recent_result(key: str) -> Any | None:
    """Le résultat mémorisé pour ``key``, s'il a moins de ``DEDUP_TTL_S`` —
    ``None`` sinon (jamais mémorisé, ou expiré)."""
    entry = _RESULTS.get(key)
    if entry is None:
        return None
    recorded_at, result = entry
    if _now() - recorded_at > DEDUP_TTL_S:
        _RESULTS.pop(key, None)
        return None
    return result


__all__ = ["DEDUP_TTL_S", "forget_all", "idempotency_key_for", "recent_result", "remember_result"]
