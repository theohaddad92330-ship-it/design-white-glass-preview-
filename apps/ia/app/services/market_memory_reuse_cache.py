"""#220.5 / épopée #3232 — RÉUTILISER LA MÉMOIRE MARCHÉ DÉJÀ INTERROGÉE.

─────────────────────────────────────────────────────────────────────────────
LA DÉPENDANCE ASSUMÉE, ÉCRITE DANS L'ÉPOPÉE
─────────────────────────────────────────────────────────────────────────────
#3232 demande de brancher la réutilisation sur `compare_scenarios` (#3214).
Au 28/09, `compare_scenarios` / `scenario_comparison.py` n'existent QUE sur
`feat/lau-219-220-28-09` — `git grep -rn "compare_scenarios" apps/ia` sur
`origin/main` rend zéro. #3232 nomme lui-même le calcul de DELTA entre deux
jeux de faits comparés « un chantier séparé, pas une fonction isolée » : ce
module livre la BRIQUE qu'il désigne, pas le chantier entier — un cache qui
évite une collecte RÉSEAU redondante quand la MÊME question (mêmes critères,
ou la même identité + son scope de groupe) revient dans une fenêtre courte.
`search_market_memory` (l'outil qui existe DÉJÀ, sur les deux axes que
l'épopée #3225 vient d'étendre) en profite dès ce lot ; `compare_scenarios`,
une fois fusionné, n'aura rien à réinventer pour en profiter à son tour.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE NE FAIT PAS
─────────────────────────────────────────────────────────────────────────────
Il ne recalcule RIEN et ne devine RIEN : il rend TEL QUEL un résultat déjà lu
depuis `MarketMemoryService` (GA-258 — le service NestJS reste le seul point
d'entrée ; ce cache vit devant l'APPEL réseau, jamais devant une seconde
dérivation). Il ne met JAMAIS en cache une lecture `unavailable` : une panne
mise en cache resterait figée alors que le pont peut répondre à l'appel
suivant — seul un succès (`status: "ok"`) entre.

Scopé PAR UTILISATEUR : le corpus est partagé (GA-16), mais un résultat porte
`accountRoute` — la route de la fiche d'un compte du PORTEFEUILLE de
l'appelant (#1961.21). Une clé qui omettrait `user_id` ferait fuir la route
d'un compte d'un espace vers un autre à la première requête identique.

─────────────────────────────────────────────────────────────────────────────
DEUX TIERS (#220.5, reste audité 28/09 soir) — même patron que
`provider_cache.py`, best-effort, jamais bloquant
─────────────────────────────────────────────────────────────────────────────
Le dernier bilan de #3232 nommait la limite du tier mémoire seul : « à
reconsidérer (Redis) si la réutilisation doit survivre plus longtemps ou
traverser des instances ». L'IA tourne derrière plusieurs répliques
(Railway) — un cache PAR PROCESSUS rate donc la majorité des relectures
réelles, celles qui atterrissent sur une autre instance. Le tier Redis
(`_redis()`, réutilise le client poolé du rate-limiter distribué, comme
`provider_cache`) est ajouté DEVANT le tier mémoire : une écriture pose les
DEUX (le tier mémoire reste le filet de sécurité quand Redis est absent ou
en panne), une lecture regarde Redis d'abord puis le tier mémoire. Toute
erreur Redis est avalée (`except Exception`) — une panne de cache ne doit
JAMAIS devenir une panne de lecture pour l'utilisateur.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

from app.services.distributed_rate_limiter import RedisUnavailable, get_client, redis_url

logger = logging.getLogger(__name__)

# #220.5 — cinq minutes : assez pour qu'une conversation qui revient sur le
# même compte ou le même filtre au fil de plusieurs messages réutilise
# réellement la lecture, jamais assez pour servir une mesure périmée si le
# corpus est réimporté entre-temps (l'import du corpus n'est pas continu).
TTL_SECONDS = 300

# Borne dure : un service qui tourne des jours ne doit jamais faire grossir ce
# cache sans limite. La plus ancienne entrée cède la place — best-effort, pas
# une politique d'éviction sophistiquée pour un cache qui, de toute façon,
# dégrade sans bruit vers l'appel réseau sur un ratage.
MAX_ENTRIES = 512

_PREFIX = "market-memory-reuse:"

_store: dict[str, tuple[float, dict[str, Any]]] = {}


def _cache_key(user_id: str, axis: str, payload: dict[str, Any]) -> str:
    """`axis` distingue les deux formes de `search_market_memory` (#3225) :
    `filters` (critères) et `identity` (`company_id` + groupe) — deux payloads
    qui ne se ressemblent jamais mais pourraient, par accident, partager une
    clé si l'axe n'y entrait pas."""
    canonical = json.dumps(payload, sort_keys=True, default=str)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"{user_id}:{axis}:{digest}"


async def _redis():
    """Client Redis poolé, ou `None` quand le cache Redis est indisponible
    (best-effort — mockable dans les tests, même contrat que
    `provider_cache._redis`)."""
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except (RedisUnavailable, Exception) as exc:  # noqa: BLE001 — cache best-effort
        logger.debug("Market memory reuse cache: Redis indisponible (%s) — tier mémoire seul", exc)
        return None


async def get(user_id: str, axis: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    """`None` couvre RATAGE et EXPIRATION à l'identique — l'appelant dégrade
    vers l'appel réseau dans les deux cas, jamais une différence de comportement
    entre « jamais vu » et « vu, mais trop vieux »."""
    key = _cache_key(user_id, axis, payload)

    redis = await _redis()
    if redis is not None:
        try:
            raw = await redis.get(_PREFIX + key)
            if raw:
                return json.loads(raw)
        except Exception as exc:  # noqa: BLE001 — une panne Redis ne casse jamais la lecture
            logger.debug("Market memory reuse cache: lecture Redis en échec (%s) — tier mémoire", exc)

    entry = _store.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if expires_at < time.monotonic():
        _store.pop(key, None)
        return None
    return value


async def put(user_id: str, axis: str, payload: dict[str, Any], value: dict[str, Any]) -> None:
    if not isinstance(value, dict) or value.get("status") != "ok":
        return
    key = _cache_key(user_id, axis, payload)

    redis = await _redis()
    if redis is not None:
        try:
            await redis.set(_PREFIX + key, json.dumps(value, ensure_ascii=False, default=str), ex=TTL_SECONDS)
        except Exception as exc:  # noqa: BLE001 — une panne Redis ne casse jamais l'écriture
            logger.debug("Market memory reuse cache: écriture Redis en échec (%s) — tier mémoire seul", exc)

    if key not in _store and len(_store) >= MAX_ENTRIES:
        oldest_key = min(_store, key=lambda existing: _store[existing][0])
        _store.pop(oldest_key, None)
    _store[key] = (time.monotonic() + TTL_SECONDS, value)


def clear() -> None:
    """Pour les tests — jamais appelé sur le chemin produit : un cache qui se
    vide de lui-même en production redeviendrait un appel réseau à chaque
    fois, exactement ce que ce module existe pour éviter."""
    _store.clear()
