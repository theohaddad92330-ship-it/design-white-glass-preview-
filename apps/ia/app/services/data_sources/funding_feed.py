"""Flux PUBLICS de levées de fonds — signal « levée » de Découvrir (#3941, #3091).

Décision Louis 11/10/2026 : brancher des flux de levées / pré-seed / French Tech.
Sources OUVERTES d'abord : les fils RSS que la presse spécialisée publie pour être
repris (titre, lien, date — rien de plus). Aucune clé ; aucun contenu d'article
n'est collecté (c79 : large, mais PROPRE).

Ce module ne devine rien :
  * un titre qui n'annonce pas clairement « X lève … » n'est pas une levée ;
  * une ligne sans date lisible n'est pas gardée (« un signal sans date n'en est
    pas un ») ; un lien qui n'est pas http(s) n'est pas gardé ;
  * le montant n'est écrit que s'il est dans le titre — sinon la levée est
    signalée SANS montant, jamais « 0 » ;
  * un candidat n'est rapproché que par son NOM ENTIER (comparé sans forme
    juridique ni accents) : « Alan » n'est pas « Alana Conseil ». Depuis #4285.2 le nom
    de la carte est comparé AVEC la raison sociale et l'enseigne du registre quand elle
    les porte (même règle, jamais de correspondance partielle ni sur un mot générique).

``FUNDING_FEED_URLS`` (liste séparée par des virgules) remplace les fils par
défaut ; VIDE = no-op strict (zéro appel réseau).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import unicodedata
from collections.abc import Iterable
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Any
from xml.etree import ElementTree

import httpx

from app.services import provider_cache

logger = logging.getLogger(__name__)

#: Fils publics par défaut (RSS de syndication). Remplaçables par ``FUNDING_FEED_URLS``.
_DEFAULT_FEEDS = ("https://www.maddyness.com/feed/", "https://www.frenchweb.fr/feed")
_TIMEOUT_S = 6.0
#: Une levée plus vieille que cela n'est plus un « pourquoi maintenant ».
_WINDOW_DAYS = 365
#: Cache d'un fil : la fraîcheur EST le produit (comme la presse).
# Un FIL (la liste du jour), pas un fait d'entreprise : 24 h, découplé de
# `TTL_NEWS` (#4067 — 14 j pour une actualité rattachée, pas pour un fil entier).
_FEED_TTL_S = 24 * 3600

_LEGAL_FORMS = {"sas", "sasu", "sa", "sarl", "eurl", "snc", "scop", "sca", "se", "inc", "ltd", "gmbh"}

# « Alan lève 183 M€ », « Pennylane boucle un tour de 40 M€ », « X annonce une levée de … »
_VERB = r"(?:lève|boucle|réalise une levée|annonce une levée|obtient|décroche|sécurise|réussit une levée)"
_TITLE_RE = re.compile(
    rf"^(?:levée de fonds|levée|funding)\s*[:\-–]\s*|(?P<co>[^,:;–—|]+?)\s+{_VERB}\b",
    re.IGNORECASE,
)
_AMOUNT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(milliards?|md|millions?|m)\s*(?:d['’]\s*euros|euros|€)", re.IGNORECASE)
_ROUND_RE = re.compile(r"(pré-?seed|seed|amorçage|série\s+[a-h]\b)", re.IGNORECASE)
_FUNDING_HINT_RE = re.compile(rf"{_VERB}|levée", re.IGNORECASE)


def configured_feeds() -> list[str]:
    """Les fils lus. Variable posée mais VIDE = aucun fil (no-op strict)."""
    raw = os.getenv("FUNDING_FEED_URLS")
    if raw is None:
        return list(_DEFAULT_FEEDS)
    return [u.strip() for u in raw.split(",") if u.strip().lower().startswith(("http://", "https://"))]


def _fold(value: str) -> str:
    text = unicodedata.normalize("NFD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


#: « S.A.S » → « SAS » : les points d'un sigle se retirent avant de comparer (symétrique des deux côtés).
_DOTTED_ACRONYM = re.compile(r"(?<=\b[A-Za-z])\.(?=[A-Za-z]\b)")


def comparable_name(value: str) -> str:
    words = [w for w in _fold(_DOTTED_ACRONYM.sub("", value)).split() if w not in _LEGAL_FORMS]
    return " ".join(words)


#: Mots d'enseigne juridique ou géographique que la presse omet (« Alan France » → « Alan »).
#: Liste FERMÉE : on ne retire que ces mots, en queue, jamais un mot du nom propre.
_BRAND_TAILS = {
    "france",
    "group",
    "groupe",
    "holding",
    "international",
    "technologies",
    "technology",
    "services",
    "labs",
}


def name_aliases(value: str) -> set[str]:
    """Le nom comparable ET sa forme « marque » (queue générique retirée, ≥ 1 mot restant).

    #3941.7 — « Alan France » (raison sociale) nomme la marque « Alan » ; « Alana Conseil »
    reste une autre entreprise : on ne compare jamais par préfixe, seulement par nom entier.
    """
    words = comparable_name(value).split()
    if not words:
        return set()
    aliases = {" ".join(words)}
    trimmed = list(words)
    while len(trimmed) > 1 and trimmed[-1] in _BRAND_TAILS:
        trimmed.pop()
    aliases.add(" ".join(trimmed))
    return aliases


def _company_from_title(title: str) -> str | None:
    cleaned = re.sub(r"^(?:levée de fonds|levée|funding)\s*[:\-–]\s*", "", title.strip(), flags=re.IGNORECASE)
    match = re.match(rf"^(?P<co>[^,:;–—|]+?)\s+{_VERB}\b", cleaned, flags=re.IGNORECASE)
    if not match:
        return None
    company = match.group("co").strip(" «»\"'")
    words = company.split()
    # Un nom propre : 1 à 4 mots, il commence par une majuscule ou un chiffre.
    if not (1 <= len(words) <= 4) or not (company[0].isupper() or company[0].isdigit()):
        return None
    return company


def _amount_label(title: str) -> str | None:
    match = _AMOUNT_RE.search(title)
    if not match:
        return None
    number = match.group(1).replace(",", ".")
    number = number[:-2] if number.endswith(".0") else number
    unit = match.group(2).lower()
    return f"{number} Md€" if unit.startswith(("milliard", "md")) else f"{number} M€"


def _round_label(raw: str) -> str:
    text = re.sub(r"\s+", " ", raw.strip().lower()).replace("pre-seed", "pré-seed").replace("preseed", "pré-seed")
    return f"{text[:-1]}{text[-1].upper()}" if text.startswith("série") else text


def _iso_date(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw.strip()).date().isoformat()
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(raw.strip().replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def parse_funding_items(xml_text: str) -> list[dict[str, Any]]:
    """Un fil RSS → les lignes qui annoncent CLAIREMENT une levée, datées."""
    if not xml_text or not xml_text.strip():
        return []
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        return []
    items: list[dict[str, Any]] = []
    for node in root.iter("item"):
        title = (node.findtext("title") or "").strip()
        if not title or not _FUNDING_HINT_RE.search(title):
            continue
        company = _company_from_title(title)
        published = _iso_date(node.findtext("pubDate"))
        if not company or not published:
            continue
        link = (node.findtext("link") or "").strip()
        round_match = _ROUND_RE.search(title)
        items.append(
            {
                "company": company,
                "amount_label": _amount_label(title),
                "round": _round_label(round_match.group(1)) if round_match else None,
                "date": published,
                "url": link if link.lower().startswith(("http://", "https://")) else None,
            }
        )
    return items


def _wanted_names(name: str, other_names: Iterable[str]) -> set[str]:
    """Les formes comparables du nom de la carte ET des autres noms que le registre lui donne.

    #4285.2 — raison sociale et enseigne comptent comme le nom, sous la MÊME règle (nom entier, formes
    juridiques et accents neutralisés). Un autre nom réduit à des mots génériques (« Groupe », « France »,
    « SAS ») ne nomme personne : il est ignoré, jamais comparé."""
    wanted = name_aliases(name or "")
    for other in other_names:
        words = comparable_name(other or "").split()
        if words and not all(w in _BRAND_TAILS for w in words):
            wanted |= name_aliases(other)
    return wanted


def funding_signals_for(
    name: str,
    items: list[dict[str, Any]],
    *,
    today: date | None = None,
    other_names: Iterable[str] = (),
) -> list[dict[str, Any]]:
    """Les levées de ``items`` qui nomment CETTE entreprise (nom entier, ou l'un de ses autres noms
    de registre), récentes, les plus récentes d'abord."""
    wanted = _wanted_names(name, other_names)
    if not wanted:
        return []
    limit = (today or date.today()) - timedelta(days=_WINDOW_DAYS)
    signals: list[dict[str, Any]] = []
    for item in items:
        if not (name_aliases(item["company"]) & wanted):
            continue
        # Lot 762 : plus de borne d'âge de stockage — la levée ancienne est estampillée ``historical``.
        old = date.fromisoformat(item["date"]) < limit
        parts = [p for p in (item.get("amount_label"), item.get("round")) if p]
        label = "Levée de fonds" + (f" : {' · '.join(parts)}" if parts else "")
        signal: dict[str, Any] = {
            "type": "funding",
            "label": label,
            "date": item["date"],
            "detail": "Presse spécialisée",
        }
        if old:
            signal["historical"] = True
        if item.get("url"):
            signal["url"] = item["url"]
        signals.append(signal)
    signals.sort(key=lambda s: s["date"], reverse=True)
    return signals


#: Mémoire de processus, par fil : une recherche de Découvrir interroge jusqu'à
#: vingt-cinq candidats — le fil ne doit être lu qu'UNE fois pour toute la page
#: (et jamais en parallèle), quel que soit l'état du cache partagé.
_MEMORY_TTL_S = 900.0
_memory: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_locks: dict[str, asyncio.Lock] = {}


async def _fetch_feed(url: str) -> list[dict[str, Any]]:
    lock = _locks.setdefault(url, asyncio.Lock())
    async with lock:
        hit = _memory.get(url)
        if hit and time.monotonic() - hit[0] < _MEMORY_TTL_S:
            return hit[1]
        items = await _fetch_feed_uncached(url)
        # Une panne (liste vide) est mémorisée aussi, brièvement : pas de tempête de retries.
        _memory[url] = (time.monotonic(), items)
        return items


async def _fetch_feed_uncached(url: str) -> list[dict[str, Any]]:
    async def _load() -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S, follow_redirects=True) as http:
            resp = await http.get(url, headers={"User-Agent": "BellumAI/1.0 (veille levees)"})
            resp.raise_for_status()
            return parse_funding_items(resp.text)

    try:
        return await provider_cache.cached_json("funding_feed:items", url, _load, ttl=_FEED_TTL_S) or []
    except Exception as exc:  # noqa: BLE001 — une source libre ne casse jamais une recherche
        logger.warning("Funding feed failed for %s: %s", url, exc)
        return []


async def funding_signals(name: str, *, other_names: Iterable[str] = ()) -> list[dict[str, Any]]:
    """Levées de fonds datées et sourcées d'UNE entreprise. Aucun fil configuré = ``[]``, zéro réseau."""
    feeds = configured_feeds()
    if not feeds or not name:
        return []
    items: list[dict[str, Any]] = []
    for url in feeds:
        items.extend(await _fetch_feed(url))
    return funding_signals_for(name, items, other_names=other_names)
