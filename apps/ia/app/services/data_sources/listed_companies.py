"""Les sociétés dont la cotation est PROUVÉE — #4361.2.

Libre, SANS clé : l'index ouvert Wikidata (CC0), requête SPARQL. Il répond à la
seule question que le registre des entreprises ne sait pas poser : **ce SIREN
a-t-il une cotation en cours ?** (le registre gouv.fr n'a aucun champ de cotation,
et `access_scoring.py` le dit : « aucune source publique gratuite ne lie un SIREN
à une cotation »). Ici le lien existe, mais il est PARTIEL.

─────────────────────────────────────────────────────────────────────────────
CE QU'ELLE PROUVE, ET CE QU'ELLE NE PROUVE PAS
─────────────────────────────────────────────────────────────────────────────
Un SIREN PRÉSENT = une entité qui porte à la fois ce SIREN et une cotation sans
date de fin. C'est une preuve de « cotée ».

Un SIREN ABSENT n'est PAS « non coté » : l'index est incomplet (tout le monde n'y
a pas saisi son SIREN). L'absence se lit « cotation non établie » — jamais une
valeur basse (GA-18/GA-19), jamais « non cotée ». Aucun appelant ne doit déduire
l'un de l'autre, ni deviner sur la taille seule.

Sans réponse (réseau, quota, réponse vide) : ``None``, et la dégradation est
enregistrée. ``None`` n'est PAS « aucune société cotée » : l'appelant ne retire
alors rien et le dit.
"""

from __future__ import annotations

import logging
import time

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services.data_sources._http_pool import get_shared_client
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

SOURCE_NAME = "listed-companies"

_ENDPOINT = "https://query.wikidata.org/sparql"
_TIMEOUT_S = 20.0

#: Les entités qui portent un SIREN (P1616) ET une cotation (P414) sans date de
#: fin (P582) : une cotation close n'est plus une cotation.
_QUERY = (
    "SELECT DISTINCT ?siren WHERE { ?c wdt:P1616 ?siren ; p:P414 ?st . ?st ps:P414 ?market . "
    "FILTER NOT EXISTS { ?st pq:P582 ?end } }"
)

#: Une cotation bouge à l'échelle de l'année, pas de l'heure : le cache est
#: d'un jour, et l'index entier (~200 lignes) tient en mémoire de process.
_CACHE_TTL_S = 24 * 3600

#: (échéance monotone, index). ``None`` = rien de chaud.
_cache: tuple[float, frozenset[str]] | None = None


def _clean_siren(value: object) -> str:
    """Un SIREN à neuf chiffres, ou une chaîne vide — aucune tolérance."""
    text = str(value or "").strip()
    return text if len(text) == 9 and text.isdigit() else ""


async def listed_sirens(*, client: httpx.AsyncClient | None = None) -> frozenset[str] | None:
    """L'ensemble des SIREN prouvés cotés, ou ``None`` si la source n'a pas répondu."""
    global _cache
    now = time.monotonic()
    if _cache is not None and _cache[0] > now:
        return _cache[1]

    found = await _fetch(client)
    if found is None:
        return None
    _cache = (now + _CACHE_TTL_S, found)
    return found


async def _fetch(client: httpx.AsyncClient | None) -> frozenset[str] | None:
    http = client if client is not None else get_shared_client("listed_companies", timeout=_TIMEOUT_S)
    try:
        async with throttle(SOURCE_NAME):
            resp = await http.get(
                _ENDPOINT,
                params={"query": _QUERY},
                headers={
                    "Accept": "application/sparql-results+json",
                    # La politique de l'index exige un agent identifiable.
                    "User-Agent": "BellumAI/1.0 (listing check)",
                },
            )
        if resp.status_code == 429:
            back_off_provider(SOURCE_NAME, retry_after_header(resp))
        resp.raise_for_status()
        bindings = resp.json().get("results", {}).get("bindings", [])
    except Exception as exc:  # noqa: BLE001 — une source libre ne casse jamais une recherche
        logger.warning("listed companies index failed: %s", exc)
        record_degradation(get_correlation_id(), source=SOURCE_NAME, reason=str(exc)[:200])
        return None

    sirens = frozenset(
        siren
        for siren in (_clean_siren(b.get("siren", {}).get("value")) for b in bindings if isinstance(b, dict))
        if siren
    )
    if not sirens:
        # Un index sans AUCUNE société cotée n'existe pas : c'est une source muette.
        record_degradation(get_correlation_id(), source=SOURCE_NAME, reason="empty index")
        return None
    return sirens
