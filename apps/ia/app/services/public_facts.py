"""Faits PUBLICS par entreprise, partagés entre espaces — et la frontière privée.

#4067 — lot DECOUVRIR-COLLECTE (Louis 13/10) : « toutes ces recherches on les
stocke en cache pour s'en resservir pour d'autres users, notre base interne, que
ce soit pas des crédits foutus en l'air ».

Le cache durable existait (``source_cache``, C5) : ce module ne crée PAS de second
cache, il range dans la même table une famille ``public_facts`` dont la clé est
l'ENTREPRISE — SIREN, sinon domaine — et la NATURE du fait (offres, actualités,
annonces légales, appels d'offres, registre). Découvrir et l'analyse complète
écrivaient jusqu'ici sous des clés différentes (le nom tapé, le nom + SIREN…) :
un fait collecté par l'un n'était pas relu par l'autre.

- **Lire avant d'appeler** : un fait frais en cache = AUCUN appel externe.
- **Fraîcheur par nature, réglée à UN endroit** (GA-26) : le TTL de la famille de
  cache correspondante (``provider_cache.TTL_*``) — offres 30 j (15/10), actualités 30 j,
  annonces légales et AO 7 j, registre 30 j.
- **Date de collecte** : chaque fait stocké porte ``collectedAt``.
- **On archive, on ne supprime pas** : périmé, un fait n'est plus servi
  (``expires_at``), il n'est pas purgé (``source_cache._PURGE_SQL``).

FRONTIÈRE NON NÉGOCIABLE — ce qui est PRIVÉ à un espace (CRM, notes, documents,
Drive, missions, corrections humaines, listes) ne va JAMAIS ici : une nature
privée est REFUSÉE (``PrivateFactRefused``), une ligne qui porte un marqueur
d'espace est rendue à son appelant mais jamais écrite. Aucune fonction de ce
module ne prend d'espace ni d'utilisateur : la clé ne peut pas en porter.
Doctrine GA-43 : on partage la DONNÉE publique ; le coût d'accès d'un espace ne
s'expose ni ne s'agrège vers un autre — rien ici ne compte par espace.

Sans Postgres ni Redis : passe-plat strict (la collecte vivante, à l'octet près).
"""

from __future__ import annotations

import logging
import re
from collections.abc import Awaitable, Callable, Mapping
from datetime import UTC, datetime
from typing import Any

from app.services import provider_cache, source_cache, source_health

logger = logging.getLogger(__name__)

#: La fraîcheur de chaque nature EST le TTL de sa famille de cache — un seul réglage.
FRESHNESS_S: dict[str, int] = {
    "jobs": provider_cache.TTL_JOBS,
    "news": provider_cache.TTL_NEWS,
    "legal": provider_cache.TTL_SIGNALS,
    "tenders": provider_cache.TTL_SIGNALS,
    "registry": provider_cache.TTL_FIRMO,
}

#: « Cherché, rien trouvé » : le même délai que le vide des offres (SIG-C).
EMPTY_FRESHNESS_S: int = provider_cache.TTL_EMPTY_JOBS

#: Ce qui appartient à UN espace — refusé par nom, jamais rangé ici.
PRIVATE_NATURES: frozenset[str] = frozenset(
    {"crm", "notes", "documents", "drive", "missions", "corrections", "lists", "contacts", "signal_history"}
)

#: Une ligne qui porte l'une de ces clés vient d'un espace, pas d'une source publique.
_PRIVATE_ROW_KEYS: frozenset[str] = frozenset(
    {
        "workspace_id",
        "workspaceId",
        "user_id",
        "userId",
        "account_id",
        "accountId",
        "owner_id",
        "ownerId",
        "note",
        "notes",
        "crm",
        "correction",
        "corrections",
    }
)

#: Une clé qui porte l'un de ces noms, à N'IMPORTE QUELLE profondeur, désigne un
#: espace — miroir de ``SHARED_PUBLIC_FACT_WORKSPACE_MARKERS`` (contrat TS) et du
#: CHECK ``source_cache_public_fact_no_workspace_marker`` (#3989).
WORKSPACE_MARKERS: frozenset[str] = frozenset({"workspace_id", "workspaceId", "user_id", "userId"})

#: La question posée à la source est un JETON fermé, jamais un texte libre d'espace
#: (miroir de ``SHARED_PUBLIC_FACT_KEY_PATTERN``, #3989).
VARIANT = re.compile(r"^[a-z0-9_:.-]{0,64}$")

_SIREN = re.compile(r"^\d{9}$")
_DOMAIN = re.compile(r"^[a-z0-9-]+(?:\.[a-z0-9-]+)+$")


class PrivateFactRefused(ValueError):
    """Une donnée privée à un espace a été présentée au cache PARTAGÉ."""


def company_fact_key(*, siren: str | None = None, domain: str | None = None) -> str | None:
    """La clé d'ENTREPRISE d'un fait : ``siren:<9 chiffres>``, sinon ``domain:<hôte>``.
    Tout le reste (un identifiant d'espace, de compte, un nom) → ``None`` : pas de
    clé, pas de partage."""
    raw_siren = (siren or "").replace(" ", "")
    if _SIREN.match(raw_siren):
        return f"siren:{raw_siren}"
    host = (domain or "").strip().lower()
    host = re.sub(r"^[a-z]+://", "", host).split("/", 1)[0].removeprefix("www.")
    if host and _DOMAIN.match(host):
        return f"domain:{host}"
    return None


def _carries_workspace_marker(value: Any) -> bool:
    if isinstance(value, Mapping):
        return bool(WORKSPACE_MARKERS & set(value)) or any(_carries_workspace_marker(v) for v in value.values())
    if isinstance(value, list):
        return any(_carries_workspace_marker(v) for v in value)
    return False


#: #4045 (14/10) — les sources d'offres, UNE variante canonique chacune. « ft » reste le
#: préfixe de France Travail : les entrées déjà rangées par Découvrir restent lues.
_JOBS_VARIANT_PREFIX: dict[str, str] = {
    "france_travail": "ft",
    "apec": "apec",
    "adzuna": "adzuna",
    "theirstack": "theirstack",
    "jooble": "jooble",
    "fantastic": "fantastic",
    "mantiks": "mantiks",
    # DISCOVER-OFFRES (15/10, D) — les offres FUSIONNÉES d'une analyse déjà faite (semis du cache,
    # ``scripts/seed_jobs_cache_from_analyses.py``) : lues par l'analyse et par Découvrir, jamais écrites par eux.
    "merged": "merged",
    "ats": "ats",
    "careers": "careers",
}
JOBS_SOURCES: tuple[str, ...] = tuple(_JOBS_VARIANT_PREFIX)

#: CACHE-SOURCES (15/10) — les sources dont le fait rangé est BRUT (les offres récentes de
#: l'entreprise, déjà sans stage et rattachées au groupe) : le tri métier de l'espace
#: s'applique à la LECTURE, donc une SEULE variante par source. Les autres (France Travail,
#: APEC, boards ATS, pages carrières) trient DANS leur requête gratuite : leur question
#: change avec le pack, leur variante le garde.
RAW_JOBS_SOURCES: frozenset[str] = frozenset({"adzuna", "jooble", "theirstack", "fantastic", "mantiks", "merged"})


#: Sources d'offres qui ne se LISENT que dans le cache partagé, jamais appelées : par Découvrir
#: (toujours) et par la veille quotidienne (VC.1). Payées à l'appel ou au résultat (TheirStack,
#: Mantiks, Fantastic.jobs), à quota À VIE (Jooble), ou dépendantes d'un site que Découvrir ne
#: connaît pas. UN seul réglage (GA-26) — ``discover.py`` le relit, il ne le recopie pas.
CACHE_ONLY_JOB_SOURCES: tuple[str, ...] = ("theirstack", "jooble", "fantastic", "mantiks", "merged", "careers")


def jobs_fact_variant(source: str, pack: str | None, all_roles: bool) -> str:
    """La variante de cache d'UNE source d'offres : ``<source>`` pour les sources à fait BRUT
    (``RAW_JOBS_SOURCES`` — le tri métier se fait à la lecture), sinon
    ``<source>:<pack>:<it|all>``.

    Fabrique UNIQUE (GA-26) : l'analyse l'écrit, Découvrir la relit — la même chaîne
    des deux côtés, sinon un fait collecté par l'un reste invisible de l'autre.
    Pour les sources triées DANS leur requête, ``pack`` et ``all_roles`` changent la
    QUESTION (tri métier du vendeur), jamais qui la pose."""
    prefix = _JOBS_VARIANT_PREFIX.get(source)
    if prefix is None:
        raise ValueError(f"« {source} » n'est pas une source d'offres connue")
    if source in RAW_JOBS_SOURCES:
        return prefix
    return f"{prefix}:{pack or 'esn_it'}:{'all' if all_roles else 'it'}"


async def peek_fact(nature: str, company_key: str | None, variant: str) -> list[dict] | None:
    """Lit un fait FRAIS du cache partagé SANS jamais appeler la source : ``None`` =
    pas d'entrée (jamais cherché, ou périmé), ``[]`` = cherché, rien trouvé."""
    if nature in PRIVATE_NATURES or nature not in FRESHNESS_S or not company_key:
        return None
    hit = await provider_cache.peek_json(f"facts:{nature}", f"{company_key}|{variant}")
    if isinstance(hit, Mapping) and isinstance(hit.get("rows"), list):
        return list(hit["rows"])
    return None


async def share_fact(
    nature: str,
    company_key: str | None,
    variant: str,
    rows: list[dict],
    *,
    collected_at: datetime | None = None,
    ttl_s: int | None = None,
) -> None:
    """Range des faits DÉJÀ collectés (sans passer par ``cached_fact``) dans le cache
    partagé. Seulement des lignes NON vides : un vide ne dit pas s'il vient d'une panne
    (``cached_fact`` seul sait le lire), donc il ne s'écrit jamais ici. Même frontière
    privée que ``cached_fact`` ; sans clé d'entreprise ni stockage : rien."""
    if nature in PRIVATE_NATURES or nature not in FRESHNESS_S or not company_key:
        return
    if not rows or _carries_private_data(rows):
        return
    # DISCOVER-OFFRES (15/10, D) — le semis du cache date le fait de sa COLLECTE réelle (``collected_at``)
    # et l'expire à collecte + fraîcheur (``ttl_s``) ; sans eux : maintenant, fraîcheur pleine (inchangé).
    payload = {"collectedAt": (collected_at or datetime.now(UTC)).isoformat(), "rows": rows}
    await provider_cache.set_json(f"facts:{nature}", f"{company_key}|{variant}", payload, ttl_s or FRESHNESS_S[nature])


async def shared_jobs(
    source: str,
    company_key: str | None,
    fetch: Callable[[], Awaitable[list[dict]]],
    *,
    pack: str | None,
    all_roles: bool,
    read: str = "full",
    watch: bool = False,
) -> list[dict]:
    """Les offres d'UNE source par le cache d'offres PARTAGÉ (#4045) — la porte unique de l'analyse.

    ``read`` : ``"full"`` lit (le vide aussi) puis écrit ; ``"nonempty"`` ne relit qu'une ligne
    rangée (question qui dépend du site du compte) ; ``"none"`` collecte puis range (question plus
    large que celle du cache).

    VC.1 (18/10) — ``watch`` (veille quotidienne) : une source de ``CACHE_ONLY_JOB_SOURCES`` n'est
    lue qu'en cache. Froid → la source est SAUTÉE : aucun appel (ni payé, ni la recherche gratuite
    qui le précède), aucune ligne inventée, et rien n'est rangé — un saut n'est pas « rien trouvé ».
    Un achat ne part que d'une analyse humaine ou du bouton « Actualiser ».

    VC.3 (18/10) — quand la veille n'a pas de collecte communautaire récente (``source_cache``,
    ``WATCH_COMMUNITY_REUSE_S``), les sources GRATUITES sont recollectées : le cache n'est pas relu
    (``reads_bypassed_for``), la collecte fraîche est rangée pour tous."""
    variant = jobs_fact_variant(source, pack, all_roles)
    if watch and source in CACHE_ONLY_JOB_SOURCES:
        hit = await peek_fact("jobs", company_key, variant)
        logger.info(
            "jobs_source_cache source=%s outcome=%s", source, "cache_only_skip" if hit is None else "cache_only_hit"
        )
        return hit or []
    if source_cache.reads_bypassed_for(f"jobs:{source}"):
        read = "none"
    if read == "full":
        return await cached_fact("jobs", company_key, variant, fetch)
    if read == "nonempty":
        hit = await peek_fact("jobs", company_key, variant)
        if hit:
            return hit
    rows = await fetch()
    if isinstance(rows, list):
        await share_fact("jobs", company_key, variant, rows)
    return rows


def _carries_private_data(rows: list[Any]) -> bool:
    return any(isinstance(row, Mapping) and _PRIVATE_ROW_KEYS & set(row) for row in rows) or _carries_workspace_marker(
        rows
    )


async def cached_fact(
    nature: str,
    company_key: str | None,
    variant: str,
    fetch: Callable[[], Awaitable[list[dict]]],
    *,
    stale_fallback_s: int | None = None,
) -> list[dict]:
    """Les faits ``nature`` de l'entreprise ``company_key`` : depuis le cache partagé
    s'ils sont frais (aucun appel), sinon collectés par ``fetch`` puis rangés.

    ``variant`` : ce qui change la QUESTION posée à la source (le domaine d'offres du
    vendeur, le placement…), jamais qui la pose. Un résultat vide se range 24 h,
    sauf si la source s'est déclarée en erreur pendant la collecte ; une exception
    de ``fetch`` remonte telle quelle (« échec API → erreur claire »).

    #4045.4 (14/10) — ``stale_fallback_s`` : quand la source s'est déclarée en
    ERREUR (429, panne réseau…) et n'a donc RIEN pu confirmer, une ligne
    PÉRIMÉE du MÊME cache partagé (même clé — déjà filtrée par le pack du
    vendeur, déjà triée IT, déjà sans stage, par construction de chaque
    source) reste un fait plus utile qu'un vide : la donnée accumulée est un
    intrant du traitement PARTOUT (doctrine Louis 12/10), et ``source_cache``
    l'archive déjà au lieu de la supprimer. Servie seulement dans cette
    fenêtre de repli (plus large que la fraîcheur normale) ; sans ligne
    dans la fenêtre, ou sans fenêtre demandée, le vide d'avant est rendu tel
    quel — jamais rien d'inventé."""
    if nature in PRIVATE_NATURES or nature not in FRESHNESS_S:
        raise PrivateFactRefused(f"« {nature} » n'est pas une nature de fait public partageable")
    if not company_key or not VARIANT.match(variant):
        # #3989 — un texte libre dans la clé désignerait l'espace qui a posé la question.
        return await fetch()
    namespace = f"facts:{nature}"
    key = f"{company_key}|{variant}"
    hit = await provider_cache.get_json(namespace, key)
    if isinstance(hit, Mapping) and isinstance(hit.get("rows"), list):
        return list(hit["rows"])
    with source_health.watch_fetch_errors() as errors:
        rows, is_winner = await source_cache.single_flight(namespace, key, fetch)
    if not is_winner or not isinstance(rows, list):
        return rows
    if _carries_private_data(rows):
        logger.warning("public_facts: ligne portant une donnée d'espace — non partagée (%s)", nature)
        return rows
    if rows:
        ttl = FRESHNESS_S[nature]
    elif not errors:
        # « Cherché, rien trouvé » est un fait, plus court qu'une offre publiée.
        # Jamais quand la source s'est déclarée en ERREUR : elle n'a pas dit « rien ».
        ttl = EMPTY_FRESHNESS_S
    else:
        if stale_fallback_s:
            stale = await provider_cache.get_json_stale(namespace, key, stale_fallback_s)
            if isinstance(stale, Mapping) and isinstance(stale.get("rows"), list) and stale["rows"]:
                return list(stale["rows"])
        return rows
    payload = {"collectedAt": datetime.now(UTC).isoformat(), "rows": rows}
    await provider_cache.set_json(namespace, key, payload, ttl)
    return rows
