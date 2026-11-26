"""#4735 — Crunchbase comme source de TOURS DE TABLE (levées de fonds datées).

Contrat lu sur la documentation officielle (``data.crunchbase.com``, pages « API essentials » et
« Find recently funded companies », 28/10/2026) : ``POST /v4/data/searches/funding_rounds``, clé dans l'en-tête
``X-cb-user-key``, corps ``{field_ids, query[], order[], limit}``, réponse ``{count, entities[{uuid, properties}]}``
où ``properties`` porte ``announced_on``, ``money_raised{currency, value, value_usd}``, ``investment_stage`` et
``funded_organization_identifier{permalink, value}``. Les champs et opérateurs réellement ouverts dépendent du
PALIER d'abonnement (non tranché — question ouverte de #4735) : un champ absent se lit « inconnu », jamais « 0 ».

Doctrine :
  * **sans clé (``CRUNCHBASE_API_KEY``) = no-op STRICT** : zéro appel réseau, aucun cache lu ni écrit, ``[]`` ;
  * **rien n'est déduit** : la date, le montant (dans la devise PUBLIÉE) et le stade sont ceux de la source ;
    un tour sans date n'est pas gardé ; un montant absent reste ``None``, jamais « 0 » ;
  * **l'entreprise se désigne par son ``permalink`` Crunchbase**, fourni par l'appelant. Le module ne le devine
    jamais à partir d'un nom : un rapprochement par nom ferait porter à un compte la levée d'un homonyme ;
  * **un appel payant n'est payé qu'une fois** : ``provider_cache.cached_json`` écrit le résultat SOUS le verrou
    single-flight (#4722) — N appelants simultanés sur la même requête font UN appel, UNE ligne au registre ;
  * **chaque appel réellement émis s'inscrit au ``cost_ledger``** (unités ; le prix en dollars seulement si
    l'opérateur a posé ``PROVIDER_UNIT_COST_CRUNCHBASE``) ;
  * le signal ne nomme jamais la source à l'écran (``detail`` est générique).

F2 (29/10/2026) — LA VOIE DE RÉSOLUTION, lue sur ``data.crunchbase.com`` (« Available Field Types & Operators »,
``reference/searchorganizations``) : ``POST /v4/data/searches/organizations`` accepte le prédicat ``website_url`` avec
``domain_eq`` (le domaine seul est extrait de la valeur). Le dépôt possède le SITE d'un compte (``company_domains``),
jamais un permalink : ``resolve_permalink`` passe donc du DOMAINE au permalink, et SEULEMENT par le domaine.
  * **un nom ne résout jamais rien** : une entrée qui n'est pas un domaine n'est pas envoyée ;
  * **un rapprochement ambigu ne résout rien** : exactement UNE organisation, dont le site porte bien ce domaine
    (on ne fait pas confiance au seul prédicat) — sinon ``None`` et AUCUNE recherche de tours ;
  * la résolution passe par le même ``provider_cache.cached_json`` (écriture SOUS le verrou single-flight) et le même
    ``cost_ledger`` que les tours : un domaine résolu n'est pas repayé, une panne n'est pas mise en cache.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import httpx

from app.services import cost_ledger, provider_cache, source_health
from app.services.data_sources._http_pool import get_shared_client

logger = logging.getLogger(__name__)

_SEARCH_URL = "https://api.crunchbase.com/v4/data/searches/funding_rounds"
_ORG_SEARCH_URL = "https://api.crunchbase.com/v4/data/searches/organizations"
_ORG_URL = "https://www.crunchbase.com/organization/"
_TIMEOUT_S = 10.0
#: Une page suffit : un compte compte rarement plus de quelques tours, on les trie côté client.
_PAGE_LIMIT = 50
_CACHE_NAMESPACE = "crunchbase:rounds"
_ORG_CACHE_NAMESPACE = "crunchbase:org"
#: « Un même appel n'est JAMAIS payé deux fois en 30 jours » (Louis 15/10) — la constante est celle du dépôt (GA-26).
_CACHE_TTL_S = provider_cache.TTL_SIGNALS
#: Un VIDE est une réponse (« aucun tour connu »), gardée 7 j — jamais quand l'appel a échoué.
_EMPTY_TTL_S = 7 * 24 * 3600

_PERMALINK_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,99}$")
_DOMAIN_RE = re.compile(r"^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$")
_ORG_FIELD_IDS = ["identifier", "website_url"]
_FIELD_IDS = ["funded_organization_identifier", "announced_on", "investment_stage", "money_raised"]


def _key() -> str:
    return os.getenv("CRUNCHBASE_API_KEY", "").strip()


def is_configured() -> bool:
    return bool(_key())


def _amount_label(money: Any) -> str | None:
    """Le montant TEL QUE PUBLIÉ, dans sa devise (« 330 M USD ») — jamais converti, jamais « 0 »."""
    if not isinstance(money, dict):
        return None
    value, currency = money.get("value"), str(money.get("currency") or "").strip().upper()
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0 or not currency:
        return None
    if value >= 1e9:
        number, unit = value / 1e9, "Md"
    elif value >= 1e6:
        number, unit = value / 1e6, "M"
    else:
        number, unit = value, ""
    text = f"{number:.2f}".rstrip("0").rstrip(".") if unit else f"{int(number)}"
    return f"{text} {unit} {currency}".replace("  ", " ").strip()


def _iso(raw: Any) -> str | None:
    text = str(raw or "").strip()
    return text if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) else None


def parse_rounds(payload: Any, permalink: str) -> list[dict[str, Any]] | None:
    """La réponse → les tours datés, les plus récents d'abord. ``None`` = réponse mal formée (une ERREUR, pas un vide)."""
    entities = payload.get("entities") if isinstance(payload, dict) else None
    if not isinstance(entities, list):
        return None
    rounds: list[dict[str, Any]] = []
    for entity in entities:
        props = entity.get("properties") if isinstance(entity, dict) else None
        if not isinstance(props, dict):
            continue
        announced = _iso(props.get("announced_on"))
        if not announced:
            continue  # « un signal sans date n'en est pas un »
        stage = props.get("investment_stage")
        row: dict[str, Any] = {
            "type": "funding",
            "label": "Levée de fonds",
            "date": announced,
            "detail": "Base de levées",
            "amount_label": _amount_label(props.get("money_raised")),
            "stage": stage if isinstance(stage, str) and stage.strip() else None,
            "url": f"{_ORG_URL}{permalink}",
        }
        if row["amount_label"]:
            row["label"] = f"Levée de fonds : {row['amount_label']}"
        rounds.append(row)
    rounds.sort(key=lambda r: r["date"], reverse=True)
    return rounds


async def _search(permalink: str, client: httpx.AsyncClient | None) -> list[dict[str, Any]]:
    http = client or get_shared_client("crunchbase", timeout=_TIMEOUT_S)
    body = {
        "field_ids": _FIELD_IDS,
        "query": [
            {
                "type": "predicate",
                "field_id": "funded_organization_identifier",
                "operator_id": "includes",
                "values": [permalink],
            }
        ],
        "order": [{"field_id": "uuid", "sort": "asc"}],
        "limit": _PAGE_LIMIT,
    }
    headers = {"X-cb-user-key": _key(), "Accept": "application/json", "Content-Type": "application/json"}
    try:
        resp = await http.post(_SEARCH_URL, json=body, headers=headers, timeout=_TIMEOUT_S)
    except httpx.HTTPError as exc:
        logger.warning("Crunchbase injoignable: %s", type(exc).__name__)
        source_health.note_fetch_error("crunchbase injoignable")
        return []
    # L'appel est parti : il est compté, qu'il réussisse ou non (une requête refusée peut consommer le quota).
    cost_ledger.record("crunchbase", "funding_rounds_search", units=1)
    if resp.status_code != 200:
        logger.warning("Crunchbase HTTP %s", resp.status_code)
        source_health.note_fetch_error(f"crunchbase HTTP {resp.status_code}", str(resp.status_code))
        return []
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    rounds = parse_rounds(payload, permalink)
    if rounds is None:
        source_health.note_fetch_error("crunchbase réponse illisible")
        return []
    return rounds


async def funding_rounds(permalink: str, *, client: httpx.AsyncClient | None = None) -> list[dict[str, Any]]:
    """Les tours de table datés d'UNE entreprise, désignée par son ``permalink``. Sans clé : ``[]``, zéro réseau."""
    if not is_configured():
        return []
    slug = (permalink or "").strip().lower()
    if not _PERMALINK_RE.match(slug):
        return []
    try:
        rows = await provider_cache.cached_json(
            _CACHE_NAMESPACE,
            slug,
            lambda: _search(slug, client),
            ttl=_CACHE_TTL_S,
            empty_ttl=_EMPTY_TTL_S,
        )
    except Exception as exc:  # noqa: BLE001 — une source payante d'appoint ne casse jamais une recherche
        logger.warning("Crunchbase failed: %s", type(exc).__name__)
        return []
    return rows or []


def _domain(value: object) -> str:
    """Le domaine d'un site (``https://www.Acme.fr/x`` → ``acme.fr``), ou ``""`` si l'entrée n'en est pas un.

    Un nom d'entreprise (« Acme », « Acme SAS ») n'a ni point ni forme de domaine : il sort vide, donc rien n'est envoyé."""
    host = re.sub(r"^[a-z][a-z0-9+.-]*://", "", str(value or "").strip().lower()).split("/")[0].split("?")[0]
    host = host.split("@")[-1].split(":")[0].removeprefix("www.")
    return host if _DOMAIN_RE.match(host) else ""


async def _resolve(domain: str, client: httpx.AsyncClient | None) -> dict[str, str]:
    """Une recherche ``organizations`` sur le domaine. ``{"permalink": …}`` si UNE organisation, ``{}`` sinon."""
    http = client or get_shared_client("crunchbase", timeout=_TIMEOUT_S)
    body = {
        "field_ids": _ORG_FIELD_IDS,
        "query": [{"type": "predicate", "field_id": "website_url", "operator_id": "domain_eq", "values": [domain]}],
        # Deux suffisent : une deuxième organisation sur le même domaine rend le rapprochement ambigu.
        "limit": 2,
    }
    headers = {"X-cb-user-key": _key(), "Accept": "application/json", "Content-Type": "application/json"}
    try:
        resp = await http.post(_ORG_SEARCH_URL, json=body, headers=headers, timeout=_TIMEOUT_S)
    except httpx.HTTPError as exc:
        logger.warning("Crunchbase (résolution) injoignable: %s", type(exc).__name__)
        source_health.note_fetch_error("crunchbase injoignable")
        return {}
    cost_ledger.record("crunchbase", "organizations_search", units=1)
    if resp.status_code != 200:
        logger.warning("Crunchbase (résolution) HTTP %s", resp.status_code)
        source_health.note_fetch_error(f"crunchbase HTTP {resp.status_code}", str(resp.status_code))
        return {}
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    entities = payload.get("entities") if isinstance(payload, dict) else None
    if not isinstance(entities, list):
        source_health.note_fetch_error("crunchbase réponse illisible")
        return {}
    if len(entities) != 1:
        return {}  # aucune organisation, ou plusieurs : un VIDE est une réponse, jamais un choix au hasard
    props = entities[0].get("properties") if isinstance(entities[0], dict) else None
    props = props if isinstance(props, dict) else {}
    identifier = props.get("identifier")
    permalink = str(identifier.get("permalink") or "").strip().lower() if isinstance(identifier, dict) else ""
    if not _PERMALINK_RE.match(permalink) or _domain(props.get("website_url")) != domain:
        return {}
    return {"permalink": permalink}


async def resolve_permalink(domain: str, *, client: httpx.AsyncClient | None = None) -> str | None:
    """Le ``permalink`` de l'UNIQUE organisation dont le site porte ce DOMAINE. Un nom n'est jamais accepté.

    Sans clé : ``None``, zéro réseau. Ambigu, introuvable, en panne : ``None``."""
    if not is_configured():
        return None
    slug = _domain(domain)
    if not slug:
        return None
    try:
        hit = await provider_cache.cached_json(
            _ORG_CACHE_NAMESPACE,
            slug,
            lambda: _resolve(slug, client),
            ttl=_CACHE_TTL_S,
            empty_ttl=_EMPTY_TTL_S,
        )
    except Exception as exc:  # noqa: BLE001 — une source payante d'appoint ne casse jamais une recherche
        logger.warning("Crunchbase (résolution) failed: %s", type(exc).__name__)
        return None
    permalink = hit.get("permalink") if isinstance(hit, dict) else None
    return permalink if isinstance(permalink, str) and _PERMALINK_RE.match(permalink) else None


async def funding_rounds_for_domain(domain: str, *, client: httpx.AsyncClient | None = None) -> list[dict[str, Any]]:
    """Les tours de table datés de l'entreprise dont le SITE porte ce domaine : domaine → permalink → tours.

    Sans clé, sans domaine, ou sans rapprochement certain : ``[]`` (et les tours ne sont pas même cherchés)."""
    permalink = await resolve_permalink(domain, client=client)
    return await funding_rounds(permalink, client=client) if permalink else []
