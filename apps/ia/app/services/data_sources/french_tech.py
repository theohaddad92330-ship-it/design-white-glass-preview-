"""#4734 — annuaires publics French Tech (national ET régionaux) : ce que l'annuaire DIT, rien de plus.

Arbitrage Louis du 28/10/2026 : le point est ROUVERT, national et régional. Un label n'est pas une levée (le BODACC
dit qu'un capital a augmenté ; il ne dit pas qu'une entreprise est labellisée, accompagnée ou membre d'un
écosystème) — c'est un fait à part entière, rendu sous son propre type (``ecosystem``).

Les annuaires sont des JEUX DE DONNÉES OUVERTS que l'opérateur déclare dans ``FRENCH_TECH_DIRECTORY_URLS`` (liste
séparée par des virgules, CSV ou JSON). Aucun annuaire n'est câblé par défaut : aucune des pages publiques de la
Mission French Tech ou des antennes régionales n'expose à ce jour un contrat lisible par machine que nous ayons pu
VÉRIFIER (« un contrat d'API non vérifiable ne se devine pas »). VIDE = no-op strict, zéro appel réseau.

Colonnes lues (noms sans accent ni casse) : ``siren`` (obligatoire), ``label``/``statut``, ``programme``,
``promotion``/``annee``, ``date``, ``url``/``lien``. Ce module ne devine rien :
  * **identification sûre** : une ligne sans SIREN valide (9 chiffres) est écartée — JAMAIS rapprochée par le nom ;
  * le fait est ce que la ligne dit (label, programme, année), daté (la date de la ligne, sinon la date de COLLECTE
    de l'annuaire), avec son lien ``http(s)`` ; jamais « levée », jamais « prometteuse » ;
  * une entreprise absente des annuaires ne porte AUCUNE ligne ;
  * un label dont la date dépasse 24 mois redevient ``unknown`` : il reste affiché, daté, à confirmer — on archive,
    on ne supprime pas.
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import re
import time
import unicodedata
from datetime import date, timedelta
from typing import Any

import httpx

from app.services import provider_cache

logger = logging.getLogger(__name__)

_TIMEOUT_S = 8.0
#: Un annuaire est un fait lent : 7 j de cache partagé (gratuit, mais une page relue ne rappelle rien).
_CACHE_TTL_S = 7 * 24 * 3600
#: Mémoire de process : l'annuaire n'est lu qu'UNE fois pour toute la page, jamais en parallèle.
_MEMORY_TTL_S = 900.0
#: Au-delà, le label redevient « inconnu » (à confirmer) — il ne disparaît pas.
_FRESH_DAYS = 730
_ROWS_KEYS = ("data", "results", "items", "rows", "records")

_ALIASES: dict[str, tuple[str, ...]] = {
    "siren": ("siren",),
    "label": ("label", "labels", "statut", "distinction"),
    "programme": ("programme", "program"),
    "year": ("promotion", "annee", "year"),
    "date": ("date", "date_maj", "updated_at", "mis_a_jour"),
    "url": ("url", "lien", "link"),
}

_memory: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_locks: dict[str, asyncio.Lock] = {}


_REGIONAL_ENTRY = re.compile(r"^([0-9A-Za-z]{1,3})@(https?://.+)$", re.IGNORECASE)


def configured_directories(region: str | None = None) -> list[str]:
    """Les annuaires à lire. Un annuaire NATIONAL s'écrit ``https://…``, un RÉGIONAL ``<code région>@https://…``.

    #4734.1 (décision Louis 27/10/2026) — l'automatique plafonne à la RÉGION : un annuaire régional n'est lu que si
    ``region`` (code INSEE) est celui du compte ; sans région connue, seuls les nationaux sont lus. La France
    entière reste un geste de l'utilisateur, jamais un parcours de ce module."""
    raw = os.getenv("FRENCH_TECH_DIRECTORY_URLS", "")
    wanted = (region or "").strip().lower()
    urls: list[str] = []
    for entry in (e.strip() for e in raw.split(",")):
        regional = _REGIONAL_ENTRY.match(entry)
        if regional:
            if wanted and regional.group(1).lower() == wanted:
                urls.append(regional.group(2))
        elif entry.lower().startswith(("http://", "https://")):
            urls.append(entry)
    return urls


def _fold(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def normalize_siren(value: object) -> str | None:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits if len(digits) == 9 else None


def _pick(row: dict[str, object], field: str) -> str:
    for alias in _ALIASES[field]:
        value = row.get(alias)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _iso(raw: str) -> str | None:
    """#4734.2 — la date TELLE QUE PUBLIÉE : ``2026``, ``2026-03`` ou ``2026-03-12``. Jamais complétée (ni au
    1er janvier, ni en fin de période) : sa précision se garde jusqu'à l'écran."""
    m = re.match(r"\d{4}(?:-\d{2}(?:-\d{2})?)?(?![\d])", raw.strip())
    if not m:
        return None
    head = m.group(0)
    try:
        _period_end(head)
    except ValueError:
        return None
    return head


def _period_end(published: str) -> date:
    """Le DERNIER jour de la période publiée — pour juger la fraîcheur seulement, jamais pour afficher."""
    parts = [int(p) for p in published.split("-")]
    if len(parts) == 3:
        return date(parts[0], parts[1], parts[2])
    if len(parts) == 2:
        nxt = date(parts[0] + (parts[1] == 12), parts[1] % 12 + 1, 1)
        return nxt - timedelta(days=1)
    return date(parts[0], 12, 31)


def _records(text: str) -> list[dict[str, object]]:
    stripped = (text or "").strip()
    if not stripped:
        return []
    if stripped[0] in "[{":
        try:
            data = json.loads(stripped)
        except ValueError:
            return []
        if isinstance(data, dict):
            data = next((data[k] for k in _ROWS_KEYS if isinstance(data.get(k), list)), [])
        return [{_fold(k): v for k, v in r.items()} for r in data if isinstance(r, dict)]
    if stripped[0] == "<":
        return []
    first = stripped.splitlines()[0]
    delimiter = max(";,\t", key=first.count)
    reader = csv.DictReader(io.StringIO(stripped), delimiter=delimiter)
    return [{_fold(k or ""): v for k, v in r.items()} for r in reader]


def parse_directory(text: str, *, collected_on: date) -> list[dict[str, Any]]:
    """Un annuaire (CSV ou JSON) → les lignes rattachables par SIREN."""
    rows: list[dict[str, Any]] = []
    for record in _records(text):
        siren = normalize_siren(_pick(record, "siren"))
        if not siren:
            continue  # jamais rapproché par le seul nom
        url = _pick(record, "url")
        rows.append(
            {
                "siren": siren,
                "label": _pick(record, "label") or "Membre",
                "programme": _pick(record, "programme") or None,
                "year": _pick(record, "year") or None,
                "date": _iso(_pick(record, "date")) or collected_on.isoformat(),
                "url": url if url.lower().startswith(("http://", "https://")) else None,
            }
        )
    return rows


def signals_for(siren: str, rows: list[dict[str, Any]], *, today: date | None = None) -> list[dict[str, Any]]:
    """Les lignes d'annuaire qui portent CE SIREN. Absent des annuaires = aucune ligne."""
    wanted = normalize_siren(siren)
    if not wanted:
        return []
    limit = (today or date.today()) - timedelta(days=_FRESH_DAYS)
    signals: list[dict[str, Any]] = []
    for row in rows:
        if row["siren"] != wanted:
            continue
        parts = [p for p in (row["label"], row.get("programme"), row.get("year")) if p]
        known = _period_end(row["date"]) >= limit
        signal: dict[str, Any] = {
            "type": "ecosystem",
            "label": " · ".join(parts),
            "date": row["date"],
            "detail": "Annuaire de l'écosystème startup" + ("" if known else " — à confirmer"),
            "status": "known" if known else "unknown",
        }
        if row.get("url"):
            signal["url"] = row["url"]
        signals.append(signal)
    signals.sort(key=lambda s: s["date"], reverse=True)
    return signals


async def _load(url: str, client: httpx.AsyncClient | None) -> list[dict[str, Any]]:
    async def fetch() -> list[dict[str, Any]]:
        http = client or httpx.AsyncClient(timeout=_TIMEOUT_S, follow_redirects=True)
        try:
            resp = await http.get(url, headers={"User-Agent": "BellumAI/1.0 (annuaires)"})
            resp.raise_for_status()
            return parse_directory(resp.text, collected_on=date.today())
        finally:
            if client is None:
                await http.aclose()

    try:
        return await provider_cache.cached_json("french_tech:directory", url, fetch, ttl=_CACHE_TTL_S) or []
    except Exception as exc:  # noqa: BLE001 — une source libre ne casse jamais une recherche
        logger.warning("French Tech directory failed: %s", type(exc).__name__)
        return []


async def _directory(url: str, client: httpx.AsyncClient | None) -> list[dict[str, Any]]:
    lock = _locks.setdefault(url, asyncio.Lock())
    async with lock:
        hit = _memory.get(url)
        if hit and time.monotonic() - hit[0] < _MEMORY_TTL_S:
            return hit[1]
        rows = await _load(url, client)
        _memory[url] = (time.monotonic(), rows)
        return rows


async def french_tech_signals(
    siren: str, *, client: httpx.AsyncClient | None = None, region: str | None = None
) -> list[dict[str, Any]]:
    """Ce que les annuaires disent d'UN SIREN. Aucun annuaire configuré (ou régional hors région) = ``[]``, zéro réseau."""
    urls = configured_directories(region)
    if not urls or not normalize_siren(siren):
        return []
    rows: list[dict[str, Any]] = []
    for url in urls:
        rows.extend(await _directory(url, client))
    return signals_for(siren, rows)
