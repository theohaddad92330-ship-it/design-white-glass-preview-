"""BODACC B — « Augmentation de capital » : un CRITÈRE de recherche de Découvrir (#3941.5).

Décision Louis 17/10/2026 : la levée devient un critère de recherche, sourcée par le BODACC (gratuit, sans
clé — le miroir Opendatasoft déjà interrogé par ``bodacc.py``). Ce module liste, sur un territoire et une
fenêtre, les sociétés dont une annonce de MODIFICATION (publication B) dit « augmentation » du capital.

Ce que la source ne dit pas, on ne l'écrit pas :
  * le signal se nomme « Augmentation de capital », daté de la parution — jamais « levée » : une
    augmentation de capital n'est pas forcément une levée de fonds ;
  * « Modification survenue sur le capital » SANS le mot augmentation n'est PAS gardée (hausse ou
    baisse, la source ne le dit pas) ; le plein texte ramasse aussi l'objet social d'une autre annonce
    (« …par voie d'acquisition, d'augmentation de capital… ») : seul le DESCRIPTIF compte ;
  * aucun montant : la fiche porte un capital sans dire s'il est d'avant ou d'après l'opération ;
  * le SIREN est celui de la société NOMMÉE par l'annonce (``listepersonnes``), jamais celui d'un tiers
    cité au registre.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, timedelta

import httpx

from app.services import provider_cache
from app.services.company_filters import reason_for_exception
from app.services.data_sources.bodacc import _announcement_url, _get_shared_client, _json_field
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.data_sources.territory_query import normalize_department, since_date
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle

logger = logging.getLogger(__name__)

SOURCE_NAME = "BODACC"
SIGNAL_LABEL = "Augmentation de capital"

_BASE = "https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/"
#: Les deux formes réelles du descriptif : « Augmentation de capital » (ancien format) et
#: « modification survenue sur le capital (augmentation) … » (format courant).
_AUGMENTATION_RE = re.compile(r"augmentation", re.IGNORECASE)
_PAGE_ROWS = 100


def _says_augmentation(fields: dict) -> bool:
    descriptif = _json_field(fields, "modificationsgenerales").get("descriptif")
    return isinstance(descriptif, str) and bool(_AUGMENTATION_RE.search(descriptif))


def _named_company(fields: dict) -> tuple[str, str] | None:
    """(SIREN, nom) de la société que l'annonce NOMME ; ``None`` si l'un des deux manque."""
    person = _json_field(fields, "listepersonnes").get("personne")
    if not isinstance(person, dict):
        return None
    registration = person.get("numeroImmatriculation")
    raw = registration.get("numeroIdentification") if isinstance(registration, dict) else None
    siren = "".join(ch for ch in str(raw or "") if ch.isdigit())
    name = str(person.get("denomination") or "").strip()
    return (siren, name) if len(siren) == 9 and name else None


async def list_capital_increase_companies(
    department: str | None = None,
    since_days: int = 90,
    limit: int = 25,
    *,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Sociétés dont une annonce BODACC B (modification) dit « augmentation » du capital, les plus récentes
    d'abord. Même forme de ligne que les autres sources de Découvrir : ``name``, ``siren``, ``department``,
    ``city`` + un ``signal`` daté (``type='business'``).

    Lève :class:`SignalSourceUnavailable` si la source est injoignable — jamais de liste vide silencieuse.
    """
    limit = max(1, min(int(limit or 1), 100))
    dept = normalize_department(department)
    params = {
        "dataset": "annonces-commerciales",
        # Le plein texte ramasse l'objet social : le descriptif est re-contrôlé ligne à ligne ci-dessous.
        "q": f"modificationsgenerales:augmentation AND dateparution>={since_date(since_days)}",
        "refine.familleavis": "modification",
        # Ce miroir rend ``dateparution`` du plus récent au plus ancien (cf. ``bodacc.legal_signals``).
        "sort": "dateparution",
        "rows": str(_PAGE_ROWS),
    }
    if dept:
        params["refine.numerodepartement"] = dept

    http = client if client is not None else _get_shared_client()
    try:
        async with throttle("bodacc"):
            resp = await http.get(_BASE, params=params)
        if resp.status_code == 429:
            back_off_provider("bodacc", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("BODACC capital listing failed (dept=%s): %s", dept, exc)
        raise SignalSourceUnavailable(SOURCE_NAME, reason_for_exception(exc)) from exc

    records = payload.get("records") if isinstance(payload, dict) else None
    by_siren: dict[str, dict] = {}
    for rec in records or []:
        fields = rec.get("fields") if isinstance(rec, dict) else None
        if not isinstance(fields, dict) or not _says_augmentation(fields):
            continue
        if str(fields.get("typeavis") or "annonce").lower() == "annulation":
            continue
        day = str(fields.get("dateparution") or "")[:10]
        named = _named_company(fields)
        if not named or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            continue  # date obligatoire (« un signal sans date n'en est pas un ») ; société nommée
        siren, name = named
        known = by_siren.get(siren)
        if known and known["signal"]["date"] >= day:
            continue
        by_siren[siren] = {
            "name": name,
            "siren": siren,
            "department": str(fields.get("numerodepartement") or "").strip() or None,
            "city": str(fields.get("ville") or "").strip() or None,
            "signal": {
                "type": "business",
                "label": SIGNAL_LABEL,
                "date": day,
                "url": _announcement_url(fields),
                "detail": None,
            },
        }
    rows = sorted(by_siren.values(), key=lambda r: r["signal"]["date"], reverse=True)
    return rows[:limit]


#: Un fait de carte plus vieux que cela n'est plus un « pourquoi maintenant ».
CARD_FACT_WINDOW_DAYS = 365


async def capital_increase_signals(
    siren: str,
    *,
    today: date | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """#4285.1 — l'augmentation de capital de CETTE société (12 derniers mois), prête à être un fait de carte.

    Rapprochée par SIREN, jamais par nom : l'annonce doit NOMMER la société (``listepersonnes``), pas la
    citer au registre. Rend au plus un signal ``business`` « Augmentation de capital », daté de la parution,
    avec le lien de l'annonce. Sans SIREN valide : ``[]``, zéro appel. Une panne LÈVE
    :class:`SignalSourceUnavailable` (jamais mise en cache comme « rien »).
    """
    s = "".join(ch for ch in str(siren or "") if ch.isdigit())
    if len(s) != 9:
        return []
    now = today or date.today()
    return await provider_cache.cached_json(
        "bodacc:capital_card",
        f"{s}:{now.isoformat()}",
        lambda: _capital_increase_uncached(s, now, client),
        ttl=provider_cache.TTL_SIGNALS,
    )


async def _capital_increase_uncached(siren: str, now: date, client: httpx.AsyncClient | None) -> list[dict]:
    limit_day = (now - timedelta(days=CARD_FACT_WINDOW_DAYS)).isoformat()
    params = {
        "dataset": "annonces-commerciales",
        "q": f"{siren} AND modificationsgenerales:augmentation AND dateparution>={limit_day}",
        "refine.familleavis": "modification",
        "sort": "dateparution",
        "rows": str(_PAGE_ROWS),
    }
    http = client if client is not None else _get_shared_client()
    try:
        async with throttle("bodacc"):
            resp = await http.get(_BASE, params=params)
        if resp.status_code == 429:
            back_off_provider("bodacc", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("BODACC capital card fact failed for %s: %s", siren, exc)
        raise SignalSourceUnavailable(SOURCE_NAME, reason_for_exception(exc)) from exc

    records = payload.get("records") if isinstance(payload, dict) else None
    best: dict | None = None
    for rec in records or []:
        fields = rec.get("fields") if isinstance(rec, dict) else None
        if not isinstance(fields, dict) or not _says_augmentation(fields):
            continue
        if str(fields.get("typeavis") or "annonce").lower() == "annulation":
            continue
        day = str(fields.get("dateparution") or "")[:10]
        named = _named_company(fields)
        if not named or named[0] != siren or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            continue
        if day < limit_day or day > now.isoformat():
            continue
        if best is None or day > best["date"]:
            best = {
                "type": "business",
                "label": SIGNAL_LABEL,
                "date": day,
                "url": _announcement_url(fields),
                "detail": None,
            }
    if best is None:
        return []
    if not best["url"]:
        del best["url"]
    return [best]
