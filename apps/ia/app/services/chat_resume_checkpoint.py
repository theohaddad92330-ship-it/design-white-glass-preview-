"""#3236.2 (b, tranche) — mettre de côté les LECTURES d'un tour Approfondi coupé.

Quand le budget de rounds d'un tour Approfondi s'épuise, ce que Laura a déjà LU
(le `replay_cache` du tour, #3196.5) serait perdu : le tour suivant — « continue »
— referait les mêmes lectures avant d'avancer d'un pas. Ce module les garde, et
ELLES SEULES (jamais une écriture, jamais une réponse du modèle) :

- Redis, clé par PERSONNE ET CONVERSATION (jamais lisible par un autre), durée
  courte : une lecture ancienne devient un fait périmé, donc rien ne survit à la
  fenêtre d'une reprise ;
- consommé UNE fois à la lecture (`GETDEL`) : une reprise ne se rejoue pas ;
- borné en taille : au-delà, on garde les premières lectures et on laisse le
  reste se relire (jamais un résultat tronqué présenté comme entier) ;
- sans Redis, sans identifiant de conversation, ou sans rien à garder : AUCUN
  appel, chemin identique à avant — jamais de donnée inventée ni de repli deviné.

Ce n'est PAS le job de fond du point (b) : le travail ne continue pas pendant la
coupure ; seule la reprise ne repart plus de zéro.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.services.distributed_rate_limiter import get_client, redis_url

logger = logging.getLogger(__name__)

# 5 minutes : la fenêtre d'un « continue » immédiat. Plus long, ce serait resservir
# une lecture périmée comme si elle était actuelle (voir `tool_idempotency` : la
# fraîcheur d'une lecture prime) — au-delà, elle se refait.
TTL_SECONDS = 5 * 60
# Borne du paquet sérialisé (octets) : une conversation ne peut pas gonfler Redis.
MAX_BYTES = 256 * 1024
_VERSION = 1
_PREFIX = "chat_resume:"

ReadCache = dict[tuple[str, str], tuple[dict[str, Any], Any, bool]]


async def _redis() -> Any | None:
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except Exception as exc:  # noqa: BLE001 — la reprise est un confort, jamais un échec de tour
        logger.debug("Reprise Approfondi : Redis indisponible (%s) — rien gardé", exc)
        return None


def _key(user_id: str, conversation_id: str) -> str:
    digest = hashlib.sha256(f"{user_id}\x1f{conversation_id}".encode()).hexdigest()
    return f"{_PREFIX}{digest}"


def _encode(cache: ReadCache) -> str | None:
    reads: list[dict[str, Any]] = []
    for (name, arguments), (entry, output, is_error) in cache.items():
        item = {"name": name, "arguments": arguments, "entry": entry, "output": output, "error": is_error}
        try:
            json.dumps(item, ensure_ascii=False)
        except (TypeError, ValueError):
            continue  # une sortie non sérialisable se relira
        reads.append(item)
    kept: list[dict[str, Any]] = []
    for item in reads:
        candidate = json.dumps({"version": _VERSION, "reads": [*kept, item]}, ensure_ascii=False)
        if len(candidate.encode()) > MAX_BYTES:
            break
        kept.append(item)
    if not kept:
        return None
    return json.dumps({"version": _VERSION, "reads": kept}, ensure_ascii=False)


async def save(user_id: str, conversation_id: str | None, cache: ReadCache) -> bool:
    """Garde les lectures du tour ; `True` seulement si quelque chose est parti."""
    if not conversation_id or not cache:
        return False
    payload = _encode(cache)
    if payload is None:
        return False
    redis = await _redis()
    if redis is None:
        return False
    try:
        await redis.set(_key(user_id, conversation_id), payload, ex=TTL_SECONDS)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Reprise Approfondi : écriture refusée (%s)", exc)
        return False
    return True


async def load(user_id: str, conversation_id: str | None) -> ReadCache:
    """Les lectures gardées pour CETTE personne et CETTE conversation — une seule fois."""
    if not conversation_id:
        return {}
    redis = await _redis()
    if redis is None:
        return {}
    try:
        raw = await redis.getdel(_key(user_id, conversation_id))
    except Exception as exc:  # noqa: BLE001
        logger.debug("Reprise Approfondi : lecture refusée (%s)", exc)
        return {}
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict) or payload.get("version") != _VERSION:
            return {}
        return {
            (item["name"], item["arguments"]): (item["entry"], item["output"], bool(item["error"]))
            for item in payload["reads"]
        }
    except (ValueError, KeyError, TypeError):
        return {}
