"""BODACC — « Rachat ou fusion » : un CRITÈRE de recherche de Découvrir (#4732.1).

Recette prod 01/11/2026 (FAIL) : « Cadrer la recherche > Signaux » n'offrait ni rachat ni fusion. Louis a tranché
le 30/10 (#4854) qu'un rachat/fusion est un fait FORT sur la carte ; il devient ici un critère qui se COCHE,
jumeau de l'augmentation de capital (``bodacc_capital.py``) : gratuit, sans clé, SIREN porté par l'annonce.

Ce que la source ne dit pas, on ne l'écrit pas :
  * une annonce de VENTE (cession de fonds de commerce) et une MODIFICATION dont le descriptif NOMME une
    fusion / absorption / scission / un rachat / un apport partiel (le prédicat unique ``names_merger``,
    le même que la fiche compte et la carte) ; adresse, capital, administration : écartés ;
  * la société rendue est celle que l'annonce NOMME (``listepersonnes``) — on ne dit pas si elle achète ou
    est achetée : le signal se nomme « Rachat ou fusion », daté de la parution ;
  * une annulation n'est pas un signal ; une panne LÈVE ``SignalSourceUnavailable``, jamais une liste vide.
"""

from __future__ import annotations

import asyncio
import logging
import re

import httpx

from app.services.company_filters import reason_for_exception
from app.services.data_sources.bodacc import _announcement_url, _get_shared_client, _json_field
from app.services.data_sources.bodacc_capital import _BASE, _PAGE_ROWS, SOURCE_NAME, _named_company
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.data_sources.territory_query import normalize_department, since_date
from app.services.dated_signals import names_merger
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle

logger = logging.getLogger(__name__)

SIGNAL_LABEL = "Rachat ou fusion"


async def _fetch(family: str, params: dict, http: httpx.AsyncClient) -> list[dict]:
    try:
        async with throttle("bodacc"):
            resp = await http.get(_BASE, params={**params, "refine.familleavis": family})
        if resp.status_code == 429:
            back_off_provider("bodacc", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("BODACC takeover listing failed (family=%s): %s", family, exc)
        raise SignalSourceUnavailable(SOURCE_NAME, reason_for_exception(exc)) from exc
    records = payload.get("records") if isinstance(payload, dict) else None
    return [r for r in records or [] if isinstance(r, dict)]


def _is_takeover(family: str, fields: dict) -> bool:
    if family == "vente":
        return True  # la famille EST la cession : rien à deviner
    descriptif = _json_field(fields, "modificationsgenerales").get("descriptif")
    return isinstance(descriptif, str) and names_merger(descriptif)


async def list_takeover_companies(
    department: str | None = None,
    since_days: int = 90,
    limit: int = 25,
    *,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Sociétés nommées par une annonce BODACC de vente ou de fusion/rachat, les plus récentes d'abord. Même
    forme de ligne que ``list_capital_increase_companies`` : ``name``, ``siren``, ``department``, ``city`` +
    un ``signal`` daté (``type='business'``). Lève :class:`SignalSourceUnavailable` si la source est injoignable."""
    limit = max(1, min(int(limit or 1), 100))
    dept = normalize_department(department)
    since = since_date(since_days)
    base = {"dataset": "annonces-commerciales", "sort": "dateparution", "rows": str(_PAGE_ROWS)}
    if dept:
        base["refine.numerodepartement"] = dept
    http = client if client is not None else _get_shared_client()
    sale, modification = await asyncio.gather(
        _fetch("vente", {**base, "q": f"dateparution>={since}"}, http),
        _fetch(
            "modification",
            {**base, "q": f"(fusion OR absorption OR scission OR rachat OR apport) AND dateparution>={since}"},
            http,
        ),
    )
    by_siren: dict[str, dict] = {}
    for family, records in (("vente", sale), ("modification", modification)):
        for rec in records:
            fields = rec.get("fields")
            if not isinstance(fields, dict) or not _is_takeover(family, fields):
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
