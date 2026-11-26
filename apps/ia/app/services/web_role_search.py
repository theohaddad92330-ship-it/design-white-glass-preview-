"""#4923.10 / #4923.11 (Louis 30/10/2026) — recherche web CIBLÉE PAR RÔLE.

Retour Julien Laszlo : « AXA head of data » trouve la personne en premier résultat
sur Google, et l'analyse ne la remonte pas. Pour chaque rôle de TÊTE d'une famille
cible qui reste SANS tête après Apollo, une requête
``"<compte>" "<titre>" site:linkedin.com/in`` part sur le moteur déjà branché (Serper).

Règles (doctrine du dépôt) :

* JAMAIS de donnée inventée : nom, titre, employeur et URL sont lus UNIQUEMENT dans le
  résultat rendu (format LinkedIn « Prénom Nom - Titre - Employeur | LinkedIn »). Rien
  n'est complété, déduit ni deviné ; un résultat qui ne se lit pas est écarté.
* Le contact est REJETÉ si l'employeur lu ≠ le compte ou son groupe (``contact_employer``).
* Bornes : ``CONTACTS_WEB_ROLE_MAX_QUERIES`` requêtes par analyse (24), cache fournisseur
  30 j, coût au ``cost_ledger``. Sans ``SERPER_API_KEY`` : no-op STRICT, zéro appel réseau.
* Source interne ``web_role_search`` — JAMAIS nommée à l'écran (on nomme ce que l'espace a
  branché, jamais ce qui nous sert).
* Dédup avec Apollo (#4923.11) : LinkedIn d'abord, puis nom + employeur. Si la personne est
  déjà chez Apollo, Apollo gagne pour les coordonnées et le web n'ajoute que la PROVENANCE.
"""

from __future__ import annotations

import logging
import os
import re
from collections.abc import Awaitable, Callable
from typing import Any

from app.services import cost_ledger, provider_cache
from app.services.contact_themes import THEME_DICTIONARY_VERSION, THEME_PRESETS
from app.services.data_sources import serper
from app.services.search_hit_employer import name_matches_account
from app.services.text_norm import normalize_name

logger = logging.getLogger(__name__)

SOURCE = "web_role_search"
MAX_QUERIES = int(os.getenv("CONTACTS_WEB_ROLE_MAX_QUERIES", "24"))
#: Titres de tête interrogés par famille et par passe (FR et EN alternés : les listes de tête
#: mêlent les deux langues, on prend les premiers de chaque).
_TITLES_PER_FAMILY = 3

SearchFn = Callable[[str], Awaitable[list[dict]]]

_LINKEDIN_IN = re.compile(r"linkedin\.com/in/", re.IGNORECASE)


#: Noms de groupe interrogés en plus du compte (borne : le plafond global reste ``max_queries``).
_MAX_GROUP_NAMES = 2


def role_queries(
    account: str,
    families: list[str],
    *,
    group_names: list[str] | None = None,
    max_queries: int = MAX_QUERIES,
) -> list[tuple[str, str, str]]:
    """``(famille, titre, requête)`` — tournée équitable sur les familles (une famille ne
    consomme pas tout le plafond), bornée à ``max_queries``.

    Lot 755 : les noms de GROUPE (``group_names``) sont interrogés APRÈS le compte, pour que le
    DSI/CDO du groupe — qui ne porte pas le nom de la filiale — soit cherché à son niveau. Le
    compte garde la priorité sur le plafond ; sans ``group_names`` la sortie est inchangée."""
    name = (account or "").strip()
    if not name:
        return []
    names = [name]
    for g in group_names or []:
        g = (g or "").strip()
        if g and g.lower() not in {n.lower() for n in names} and len(names) <= _MAX_GROUP_NAMES:
            names.append(g)
    per_family = [
        (fam, list(THEME_PRESETS[fam]["head_titles"][:_TITLES_PER_FAMILY])) for fam in families if fam in THEME_PRESETS
    ]
    out: list[tuple[str, str, str]] = []
    for target in names:
        for rank in range(_TITLES_PER_FAMILY):
            for fam, titles in per_family:
                if rank < len(titles) and len(out) < max_queries:
                    out.append((fam, titles[rank], f'"{target}" "{titles[rank]}" site:linkedin.com/in'))
    return out


def parse_linkedin_result(hit: dict) -> dict[str, str] | None:
    """Un résultat de recherche LinkedIn → ``{fullName, title, employer, linkedinUrl}``, lu
    tel que RENDU (« Prénom Nom - Titre - Employeur | LinkedIn »). ``None`` si le résultat ne
    se lit pas : on n'invente jamais le champ manquant."""
    url = str(hit.get("url") or "")
    if not _LINKEDIN_IN.search(url):
        return None
    title_line = re.sub(r"\s*\|\s*LinkedIn\s*$", "", str(hit.get("title") or "")).strip()
    parts = [p.strip() for p in re.split(r"\s+[-–—]\s+", title_line) if p.strip()]
    if len(parts) < 3:
        return None
    name, role, employer = parts[0], parts[1], parts[2]
    if len(name.split()) < 2:
        return None
    return {"fullName": name, "title": role, "employer": employer, "linkedinUrl": url}


def employer_matches(employer: str, account_names: list[str]) -> bool:
    """``contact_employer`` : l'employeur lu désigne-t-il le compte ou son groupe ? Containment
    de nom normalisé dans un sens ou l'autre (« AXA » ⊂ « AXA Group Operations »)."""
    emp = normalize_name(employer)
    if not emp:
        return False
    for raw in account_names:
        acc = normalize_name(raw)
        if acc and (f" {acc} " in f" {emp} " or f" {emp} " in f" {acc} "):
            return True
    return False


def _title_is_head_of(title: str, family: str) -> bool:
    title_norm = normalize_name(title)
    return any(
        f" {normalize_name(head)} " in f" {title_norm} " for head in THEME_PRESETS[family]["head_titles"]
    )


async def _serper_cached(query: str) -> list[dict]:
    @provider_cache.cached_by("search:web_role", lambda q: q.strip().lower(), ttl=provider_cache.TTL_SEARCH)
    async def _run(q: str) -> list[dict]:
        cost_ledger.record("serper", "web_role_search", units=1)
        return await serper.serper_search(q, limit=10)

    return await _run(query)


async def web_role_search(
    account: str,
    families_without_head: list[str],
    *,
    group_names: list[str] | None = None,
    search: SearchFn | None = None,
    max_queries: int = MAX_QUERIES,
) -> list[dict[str, Any]]:
    """Les contacts-têtes trouvés par le web, déjà filtrés (employeur, rôle de tête).

    No-op strict sans ``SERPER_API_KEY`` (sauf ``search`` injecté, pour les tests). Une panne
    d'une requête n'annule jamais les autres ni le dossier."""
    run = search or (_serper_cached if serper.has_key() else None)
    if run is None or not families_without_head:
        return []
    accepted = [account, *(group_names or [])]
    found: dict[str, dict[str, Any]] = {}
    for family, _title, query in role_queries(
        account, families_without_head, group_names=group_names, max_queries=max_queries
    ):
        try:
            hits = await run(query)
        except Exception as exc:  # noqa: BLE001 — la recherche web ne casse jamais la phase
            logger.warning("web_role_search failed for %r: %s", query, exc)
            continue
        for hit in hits or []:
            person = parse_linkedin_result(hit)
            # #4928.3 — la MÊME règle (c) que la recherche Apollo (`name_matches_account`) : nom égal, ou nom + suffixe
            # juridique/géographique connu. Plus de simple inclusion de mots (« Orange » ≠ « Orange Bleue »).
            if not person or not name_matches_account(person["employer"], accepted):
                continue
            if not _title_is_head_of(person["title"], family):
                continue
            found.setdefault(
                person["linkedinUrl"],
                {
                    "fullName": person["fullName"],
                    "title": person["title"],
                    "linkedinUrl": person["linkedinUrl"],
                    "contactEmployer": person["employer"],
                    "country": None,
                    "city": None,
                    "source": SOURCE,
                    "matchProvenance": {
                        "family": family,
                        "matchedTerm": None,
                        "matchedVia": "web_role",
                        "sectorAssociation": None,
                        "excludedAsFauxAmi": None,
                        "dictionaryVersion": THEME_DICTIONARY_VERSION,
                        "widened": True,
                    },
                },
            )
    return list(found.values())


def merge_web_role_seeds(seeds: list[dict[str, Any]], web_seeds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fusion avec Apollo (#4923.11) : LinkedIn d'abord, puis nom + employeur. Un doublon
    GARDE la fiche existante (Apollo gagne pour les coordonnées) et reçoit seulement la
    provenance ``web_role_search`` dans ``alsoFoundBy`` ; un nouveau est ajouté."""
    by_linkedin = {
        provider_cache.linkedin_identity(str(s["linkedinUrl"])): s for s in seeds if s.get("linkedinUrl")
    }
    by_name = {normalize_name(s.get("fullName")): s for s in seeds if s.get("fullName")}
    merged = list(seeds)
    for web in web_seeds:
        existing = by_linkedin.get(provider_cache.linkedin_identity(str(web["linkedinUrl"])))
        if existing is None:
            candidate = by_name.get(normalize_name(web["fullName"]))
            # nom + entité : le même nom chez un autre employeur n'est pas la même personne.
            if candidate is not None and employer_matches(
                str(candidate.get("organizationName") or web["contactEmployer"]), [web["contactEmployer"]]
            ):
                existing = candidate
        if existing is not None:
            sources = existing.setdefault("alsoFoundBy", [])
            if SOURCE not in sources:
                sources.append(SOURCE)
            continue
        merged.append(web)
    return merged
