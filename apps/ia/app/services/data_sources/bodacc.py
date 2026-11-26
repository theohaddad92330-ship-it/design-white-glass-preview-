"""BODACC — Bulletin officiel des annonces civiles et commerciales (DILA).

Free, NO key (Opendatasoft mirror). Recent legal announcements for a SIREN:
account-creation/closure of branches, *modifications* (dirigeant changes), comptes
deposits, *procédures collectives* (sauvegarde/redressement/liquidation), cessions.
These are dated RECENT SIGNALS an ESN cares about (a new DG, a restructuring, a
filing) — fetched in parallel with the rest of Phase 1. Empty on any error.
"""

from __future__ import annotations

import re
import json
import logging

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

_BASE = "https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/"
_TIMEOUT_S = 8.0

# #2604 — un client HTTP RÉUTILISÉ, construit UNE seule fois plutôt qu'à
# chaque appel. Même défaut, même correctif que `public_tenders.py` : voir son
# commentaire pour la mesure (2-12 ms par construction, avant le premier
# `await`) et pourquoi aucun verrou n'est nécessaire ici.
_shared_client: httpx.AsyncClient | None = None


def _get_shared_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient(timeout=_TIMEOUT_S)
    return _shared_client


#: Lot 762 : le maximum que l'API rend par appel (20) — plus de plafond de 8 au stockage.
_MAX_ROWS = 20


async def legal_signals(siren: str, *, limit: int = _MAX_ROWS, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Most-recent BODACC announcements for a SIREN, newest first. Empty when the
    SIREN is missing or the lookup fails.

    Cached globally by SIREN (BODACC is public + slow-moving). This also collapses
    the TWO BODACC lookups a single analysis does (pre- and post-siren-resolution)
    into one live call, and lets a repeat/teammate reuse it."""
    s = "".join(ch for ch in str(siren or "") if ch.isdigit())
    if len(s) != 9:
        return []
    return await provider_cache.cached_json(
        "bodacc:signals",
        f"{s}:{limit}",
        lambda: _legal_signals_uncached(s, limit=limit, client=client),
        ttl=provider_cache.TTL_SIGNALS,
    )


async def _legal_signals_uncached(s: str, *, limit: int, client: httpx.AsyncClient | None) -> list[dict]:
    http = client if client is not None else _get_shared_client()
    params = {
        "dataset": "annonces-commerciales",
        "q": s,
        "rows": str(max(1, min(limit, _MAX_ROWS))),
        # This Opendatasoft v1 mirror returns ``dateparution`` newest-first.
        "sort": "dateparution",
    }
    try:
        # ``bodacc: 60 rpm`` était déclaré dans ``_DEFAULTS`` — et appliqué nulle
        # part. Le miroir Opendatasoft est public et sans clé : le budget est par
        # IP, donc partagé par TOUS les runs de l'instance, pas par analyse.
        async with throttle("bodacc"):
            resp = await http.get(_BASE, params=params)
        if resp.status_code == 429:
            back_off_provider("bodacc", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — a free source must never break research
        logger.warning("BODACC lookup failed for %r: %s", s, exc)
        # Report the REAL cause: without it the run can only say "aucun
        # résultat", which reads identically to a company that genuinely has
        # nothing here — opposite facts, same message.
        record_degradation(get_correlation_id(), source="bodacc", reason=str(exc))
        return []

    records = payload.get("records") if isinstance(payload, dict) else None
    out: list[dict] = []
    for rec in records or []:
        f = rec.get("fields") if isinstance(rec, dict) else None
        if not isinstance(f, dict):
            continue
        # #3916 — rattachement par SIREN : la recherche `q` est plein-texte, donc
        # une annonce dont le registre nomme un AUTRE SIREN n'est pas la nôtre.
        reg = f.get("registre")
        if reg and s not in _registre_sirens(reg):
            continue
        family = f.get("familleavis_lib") or f.get("familleavis")
        is_executive = classify_announcement_kind(f.get("familleavis"), family, f.get("modificationsgenerales")) == "executive_change"
        out.append(
            {
                "url": _announcement_url(f),
                "date": f.get("dateparution"),
                "type": _EXECUTIVE_LABEL if is_executive else family,
                # #3916 — le TYPE PRÉCIS, quand l'annonce le porte (jamais deviné).
                "precision": _precision(f),
                "tribunal": f.get("tribunal"),
                "label": str(f.get("commercant") or "").strip(),
            }
        )
    return out


_ANNOUNCEMENT_URL = "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:"


def _announcement_url(fields: dict) -> str | None:
    """Le lien vers l'annonce BODACC (#3916, recette 15/10 : « chaque événement légal porte le lien vers
    son annonce source »). `url_complete` quand le jeu de données le donne ; sinon le MÊME gabarit, construit
    sur l'identifiant de l'annonce. Ni l'un ni l'autre ⇒ `None` : jamais un lien inventé."""
    given = str(fields.get("url_complete") or "").strip()
    if given:
        return given
    ident = str(fields.get("id") or "").strip()
    return _ANNOUNCEMENT_URL + ident if re.fullmatch(r"[A-Za-z0-9]+", ident) else None


def _registre_sirens(registre: object) -> set[str]:
    """Les SIREN (9 chiffres) que le champ ``registre`` d'une annonce NOMME.

    #3916 (recette prod 11/10) — la forme réelle du jeu de données est UNE chaîne
    « 395030844,395 030 844 » (SIREN compact, puis espacé, un par entité citée) ;
    concaténer tous ses chiffres donnait un nombre qui n'était jamais le SIREN,
    donc TOUTES les annonces étaient écartées. Une liste reste acceptée.
    """
    parts = registre if isinstance(registre, (list, tuple)) else str(registre or "").split(",")
    sirens = {"".join(ch for ch in str(p) if ch.isdigit()) for p in parts}
    return {d[:9] for d in sirens if len(d) in (9, 14)}


def _json_field(f: dict, key: str) -> dict:
    raw = f.get(key)
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip().startswith("{"):
        try:
            parsed = json.loads(raw)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _precision(f: dict) -> str | None:
    """Le type PRÉCIS d'une annonce : « Modifications diverses » ne dit rien.

    Champs relevés sur l'API publique : ``jugement.nature`` (procédure collective),
    ``modificationsgenerales.descriptif`` (modification), ``depot.typeDepot``
    (dépôt des comptes). Aucun des trois → ``None`` : jamais deviné.
    """
    for key, field in (("jugement", "nature"), ("modificationsgenerales", "descriptif"), ("depot", "typeDepot")):
        value = _json_field(f, key).get(field)
        if isinstance(value, str) and value.strip():
            return " ".join(value.split())[:160]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# #3916.a — COLLECTE CONTINUE : une PLAGE DE DATES, page après page.
# ─────────────────────────────────────────────────────────────────────────────
# `legal_signals` ci-dessus sert l'analyse : les 8 dernières annonces, en cache.
# La veille, elle, doit lire TOUT ce qui est paru depuis son dernier passage —
# sans cache (une annonce du jour doit arriver le jour même) et sans plafond
# implicite. Le miroir rend les annonces les plus récentes d'abord : on pagine
# par `start` et on s'arrête dès qu'une page sort de la plage. Aucune syntaxe
# de requête de dates n'est devinée (contrat non observable depuis ici) : la
# borne est appliquée sur `dateparution`, champ déjà lu en production.

#: Taille d'une page — le maximum que le miroir v1 accepte sans négociation.
_PAGE_SIZE = 100
#: Plafond d'offset du miroir Opendatasoft v1 (`start + rows` borné). Au-delà,
#: on ne « continue » pas en silence : la réponse le DIT (`truncated`).
_MAX_OFFSET = 10_000

#: `familleavis` (code) → genre d'annonce. Le libellé sert de repli.
_KIND_BY_CODE: dict[str, str] = {
    "collective": "collective_proceeding",
    "retablissement_professionnel": "collective_proceeding",
    "conciliation": "collective_proceeding",
    "creation": "creation",
    "immatriculation": "creation",
    "vente": "sale",
    "dpc": "accounts_filing",
    "modification": "modification",
    "radiation": "deregistration",
}
_KIND_BY_LABEL: tuple[tuple[str, str], ...] = (
    ("procedure", "collective_proceeding"),
    ("redressement", "collective_proceeding"),
    ("liquidation", "collective_proceeding"),
    ("sauvegarde", "collective_proceeding"),
    ("creation", "creation"),
    ("immatriculation", "creation"),
    ("vente", "sale"),
    ("cession", "sale"),
    ("depot", "accounts_filing"),
    ("compte", "accounts_filing"),
    ("modification", "modification"),
    ("radiation", "deregistration"),
)


def _fold(value: object) -> str:
    import unicodedata

    text = unicodedata.normalize("NFD", str(value or "")).encode("ascii", "ignore").decode()
    return text.lower().strip()


#: #3921.2 — ce que le descriptif d'une MODIFICATION dit d'un changement de direction.
#: Termes lus dans de vraies annonces : « Modification survenue sur l'administration »,
#: « Modification de l'administration. », « Changement de gérant »,
#: « Changement d'administrateur », « Changement dans le conseil d'administration ».
#: Ni « commissaire aux comptes », ni adresse, ni capital : jamais un dirigeant.
_EXECUTIVE_TERMS = ("administration", "administrateur", "gerant", "gerance", "dirigeant", "president")
_EXECUTIVE_LABEL = "Changement de dirigeant"


def _modification_descriptif(raw: object) -> str:
    """``modificationsgenerales`` est un JSON dans une chaîne : ``{"descriptif": "…"}``."""
    if not isinstance(raw, str) or not raw.strip():
        return ""
    try:
        data = json.loads(raw)
    except ValueError:
        return ""
    return str(data.get("descriptif") or "") if isinstance(data, dict) else ""


def classify_announcement_kind(code: object, label: object, modifications: object = None) -> str:
    """Le genre d'une annonce : le CODE de famille d'abord, le libellé ensuite.
    Une MODIFICATION dont le descriptif nomme la direction est un
    ``executive_change`` (#3921.2). Rien de reconnaissable → ``other``."""
    kind = _KIND_BY_CODE.get(_fold(code))
    if kind == "modification" and any(t in _fold(_modification_descriptif(modifications)) for t in _EXECUTIVE_TERMS):
        return "executive_change"
    if kind:
        return kind
    folded = _fold(label)
    for term, mapped in _KIND_BY_LABEL:
        if term in folded:
            return mapped
    return "other"


#: #4045.2 — ce qui, dans une MODIFICATION, reste un fait d'affaires : dirigeant,
#: capital, fusion/absorption/scission, cession, apport. Tout le reste (adresse,
#: objet, commissaire aux comptes…) est de l'administratif.
_BUSINESS_MODIFICATION_TERMS = (
    "capital",
    "fusion",
    "absorption",
    "scission",
    "cession",
    "apport",
    "dirigeant",
    "administrat",
    "gerant",
    "gerance",
    "president",
    "direction",
)


def is_low_value_announcement(label: object, precision: object = None) -> bool:
    """Une annonce du greffe sans valeur de « pourquoi maintenant » : un DÉPÔT DES
    COMPTES, ou une MODIFICATION qui ne nomme aucun fait d'affaires. Changement
    de dirigeant, procédure collective, vente/cession, fusion, capital : jamais."""
    kind = classify_announcement_kind(None, label)
    if kind == "accounts_filing":
        return True
    if kind == "modification":
        return not any(t in _fold(precision) for t in _BUSINESS_MODIFICATION_TERMS)
    return False


async def announcements_between(
    siren: str,
    *,
    since: str,
    until: str,
    page_size: int = _PAGE_SIZE,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """Toutes les annonces BODACC d'un SIREN publiées entre ``since`` et
    ``until`` (ISO, bornes incluses), les plus récentes d'abord.

    Rend ``{announcements, truncated, failed}``. ``failed`` n'est JAMAIS un
    relevé vide : l'appelant ne doit pas avancer son curseur sur une panne.
    """
    s = "".join(ch for ch in str(siren or "") if ch.isdigit())
    if len(s) != 9 or not since or not until:
        return {"announcements": [], "truncated": False, "failed": True}
    http = client if client is not None else _get_shared_client()
    rows = max(1, min(page_size, _PAGE_SIZE))
    out: list[dict] = []
    start = 0
    while True:
        if start >= _MAX_OFFSET:
            return {"announcements": out, "truncated": True, "failed": False}
        params = {"dataset": "annonces-commerciales", "q": s, "rows": str(rows), "start": str(start), "sort": "dateparution"}
        try:
            async with throttle("bodacc"):
                resp = await http.get(_BASE, params=params)
            if resp.status_code == 429:
                back_off_provider("bodacc", retry_after_header(resp))
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001 — une source gratuite ne casse jamais la veille
            logger.warning("BODACC window lookup failed for %r: %s", s, exc)
            record_degradation(get_correlation_id(), source="bodacc", reason=str(exc))
            return {"announcements": out, "truncated": False, "failed": True}
        records = payload.get("records") if isinstance(payload, dict) else None
        if not records:
            break
        left_window = False
        for rec in records:
            f = rec.get("fields") if isinstance(rec, dict) else None
            if not isinstance(f, dict):
                continue
            date = str(f.get("dateparution") or "")[:10]
            if date and date < since:
                left_window = True
                continue
            if not date or date > until:
                continue
            if s not in _registre_sirens(f.get("registre")):
                # #3916 — rattachement par SIREN : sans registre lisible qui le
                # nomme, l'annonce n'est pas prouvée être la nôtre.
                continue
            family = f.get("familleavis_lib") or f.get("familleavis")
            kind = classify_announcement_kind(f.get("familleavis"), family, f.get("modificationsgenerales"))
            out.append(
                {
                    # L'identité stable de l'annonce — c'est elle qui rend l'écriture
                    # idempotente côté API (une annonce relue n'est jamais neuve).
                    "ref": str(f.get("id") or rec.get("recordid") or f.get("url_complete") or f"{date}:{family}").strip(),
                    "url": _announcement_url(f),
                    "date": date,
                    "type": _EXECUTIVE_LABEL if kind == "executive_change" else family,
                    "kind": kind,
                    "tribunal": f.get("tribunal"),
                    "label": str(f.get("commercant") or "").strip(),
                }
            )
        if left_window or len(records) < rows:
            break
        start += rows
    return {"announcements": out, "truncated": False, "failed": False}
