"""DISCOVER-OFFRES (15/10, point A) — le VOLUME d'offres par carte de Découvrir, à ZÉRO crédit.

``POST https://dashboard.mantiks.io/api/v2/searches/preview`` (en-tête ``X-API-KEY``, 0 crédit) : UN appel pour
toute la page, ``company.websites`` = les domaines des cartes ; la réponse rend des lignes
``{company{id,name,website}, job{…}, matching_jobs}`` — on additionne ``matching_jobs`` des lignes dont le
domaine RACINE est celui de la carte. Offres en France, 90 jours, hors stage (même bloc ``job`` que la fiche).

Doctrine : pas de réponse (clé absente, panne, domaine absent des lignes) → AUCUNE ligne de volume, jamais un
« 0 » (GA-18 / GA-19). Cache commun de 24 h par domaine (gratuit, mais une page relue ne rappelle rien).
Aucun fournisseur ne se nomme à l'écran : l'écran lit ``offersVolume``, jamais cette source.
"""

from __future__ import annotations

import logging
import os
import re
from collections.abc import Iterable, Mapping, Sequence

import httpx

from app.services import provider_cache
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle

logger = logging.getLogger(__name__)

_PREVIEW_URL = "https://dashboard.mantiks.io/api/v2/searches/preview"
_TIMEOUT_S = 8.0
#: Geonames « France » — le même lieu que la fiche (``job_aggregators._MANTIKS_FRANCE``).
_FRANCE = {"id": "3017382", "radius": None}
WINDOW_DAYS = 90
#: Cache commun, par domaine racine : 24 h (l'aperçu est gratuit, la page ne le rappelle pas à chaque lecture).
_CACHE_NAMESPACE = "offer_volume"
_CACHE_TTL_S = 24 * 3600
_ROWS_KEYS = ("data", "results", "items", "rows", "companies")
#: Suffixes à deux étiquettes (« co.uk ») : le domaine racine en garde trois.
_SECOND_LEVEL = frozenset({"co", "com", "org", "net", "gouv", "asso"})


def root_domain(value: object) -> str:
    """Le domaine RACINE d'un site ou d'une URL (``https://www.shop.decathlon.fr/x`` → ``decathlon.fr``)."""
    host = re.sub(r"^[a-z]+://", "", str(value or "").strip().lower()).split("/")[0].split(":")[0]
    labels = [p for p in host.split(".") if p]
    if len(labels) < 2:
        return ""
    keep = 3 if len(labels) >= 3 and labels[-2] in _SECOND_LEVEL and len(labels[-1]) == 2 else 2
    return ".".join(labels[-keep:])


def _body(websites: Sequence[str]) -> dict:
    """Corps exigé par le contrat : champs requis vides ou par défaut, la France, 90 jours, hors stage."""
    return {
        "company": {
            "websites": list(websites),
            "websites_excluded": [],
            "sizes": [],
            "sectors": [],
            "sectors_excluded": [],
            "exclude_consulting_recruiting": False,
            "reverse_sourcing_min_probability": 70,
        },
        "people": {"has_valid_email": False, "allow_missing_people": True, "phone": False, "persona_strategy": "all"},
        "job": {
            "locations": [dict(_FRANCE)],
            "published_date_window_days": WINDOW_DAYS,
            "contract_types_exclude": ["internship"],
            "is_reposting": False,
            "job_title_query": None,
            "job_title_include": [],
            "job_title_exclude": [],
            "description_include": [],
            "description_exclude": [],
            "description_query": None,
            "volume": {"gte": None, "lte": None},
        },
    }


def _rows(payload: object) -> list[Mapping]:
    candidates = payload if isinstance(payload, list) else None
    if candidates is None and isinstance(payload, Mapping):
        candidates = next((payload[k] for k in _ROWS_KEYS if isinstance(payload.get(k), list)), None)
    return [r for r in candidates or [] if isinstance(r, Mapping)]


def _sum_by_domain(payload: object, wanted: Iterable[str]) -> dict[str, int]:
    """Additionne ``matching_jobs`` des lignes par domaine racine, pour les seuls domaines demandés."""
    wanted_set = set(wanted)
    totals: dict[str, int] = {}
    for row in _rows(payload):
        company = row.get("company") if isinstance(row.get("company"), Mapping) else {}
        domain = root_domain(company.get("website"))
        count = row.get("matching_jobs")
        if domain in wanted_set and isinstance(count, int) and not isinstance(count, bool) and count > 0:
            totals[domain] = totals.get(domain, 0) + count
    return totals


async def offer_volumes(websites: Iterable[object], *, client: httpx.AsyncClient | None = None) -> dict[str, int]:
    """Le volume d'offres (France, 90 j) par domaine racine. Un domaine sans réponse est ABSENT du résultat.
    NO-OP STRICT sans ``MANTIKS_API_KEY`` (zéro appel réseau)."""
    key = os.environ.get("MANTIKS_API_KEY", "").strip()
    domains = list(dict.fromkeys(d for d in (root_domain(w) for w in websites) if d))
    if not key or not domains:
        return {}
    out: dict[str, int] = {}
    missing: list[str] = []
    for domain in domains:
        hit = await provider_cache.get_json(_CACHE_NAMESPACE, domain)
        if isinstance(hit, int) and not isinstance(hit, bool) and hit > 0:
            out[domain] = hit
        else:
            missing.append(domain)
    if not missing:
        return out
    owns = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    try:
        async with throttle("mantiks"):
            resp = await http.post(
                _PREVIEW_URL, json=_body(missing), headers={"X-API-KEY": key, "accept": "application/json"}
            )
        if not resp.is_success:
            if resp.status_code == 429:
                back_off_provider("mantiks", retry_after_header(resp))
            logger.warning("offer volume preview failed (status %s)", resp.status_code)
            return out
        logger.info("mantiks searches/preview cache=miss coût=0")
        found = _sum_by_domain(resp.json(), missing)
    except Exception as exc:  # noqa: BLE001 — un volume absent ne casse jamais la page
        logger.warning("offer volume preview failed: %s", type(exc).__name__)
        return out
    finally:
        if owns:
            await http.aclose()
    for domain, count in found.items():
        await provider_cache.set_json(_CACHE_NAMESPACE, domain, count, _CACHE_TTL_S)
    return {**out, **found}
