"""#3916.a / #3921.a — registres publics lus EN CONTINU pour les comptes suivis.

L'analyse lit BODACC et Sirene une fois, au moment où elle tourne. La veille
quotidienne de l'API (``watchlist-refresh``, job ``registry``) appelle ces
routes pour chaque SIREN suivi : rien n'est décidé ici (ni qui suivre, ni quoi
alerter) — ce routeur ne fait que LIRE la source, sur la plage demandée, et
dire honnêtement quand il n'a pas pu (``failed``) ou pas tout lu (``truncated``).
"""

from __future__ import annotations

import hashlib
import re

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.middleware.correlation_id import get_correlation_id
from app.services import source_health
from app.services.data_sources.bodacc import announcements_between
from app.services.data_sources.decp import awarded_it_contracts, awards_for_siren, awards_won_by_siren
from app.services.data_sources.inpi_rne import rne_configured
from app.services.data_sources.inpi_rne import rne_events as rne_company_events
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.distributed_rate_limiter import RateLimitTimeout
from app.services.insee_sirene import InseeEtablissement, etablissements_reading, insee_api_key, unite_legale_by_siren
from app.services.signals.establishment_openings import new_establishments
from app.services.source_health import record_degradation

router = APIRouter(prefix="/public-registry", tags=["Public registries"])


class BodaccWindowRequest(BaseModel):
    siren: str = Field(min_length=9, max_length=14)
    #: Bornes ISO incluses — ``since`` est le dernier jour déjà lu par l'API.
    since: str = Field(min_length=10, max_length=10)
    until: str = Field(min_length=10, max_length=10)


@router.post("/bodacc")
async def bodacc_window(req: BodaccWindowRequest) -> dict:
    """Toutes les annonces BODACC du SIREN parues dans la plage, paginées."""
    return await announcements_between(req.siren, since=req.since, until=req.until)


# ─── #3921.a / #3921.b — le relevé Sirene du jour ─────────────────────────────


class PreviousEstablishment(BaseModel):
    siret: str
    isActive: bool = True
    periodStartDate: str | None = None
    city: str = ""


class SireneSnapshotRequest(BaseModel):
    siren: str = Field(min_length=9, max_length=14)
    #: Le relevé d'HIER, tel que l'API l'a stocké. ``None`` = aucun relevé
    #: antérieur : rien n'est comparable, aucune ouverture n'est déduite.
    previous: list[PreviousEstablishment] | None = None


def _opening_url(siret: str) -> str:
    # Même page officielle que les événements du registre (`company_events.py`).
    return f"https://annuaire-entreprises.data.gouv.fr/etablissement/{siret}"


@router.post("/sirene")
async def sirene_snapshot(req: SireneSnapshotRequest) -> dict:
    """Le relevé Sirene du jour (établissements + tranche d'effectif) et les
    ouvertures par rapport au relevé d'hier (`new_establishments`).

    Sans clé INSEE : no-op strict (``configured: False``, aucun appel). Une
    panne n'est JAMAIS un relevé vide (``failed: True``) — l'API ne l'écrit pas.
    """
    if not insee_api_key():
        return {"configured": False, "failed": False, "establishments": [], "headcountRange": None, "openings": []}
    current = await etablissements_reading(req.siren, limit=1000)
    if current is None:
        return {"configured": True, "failed": True, "establishments": [], "headcountRange": None, "openings": []}
    unit = await unite_legale_by_siren(req.siren)
    previous = (
        [
            InseeEtablissement(
                siret=p.siret,
                city=p.city,
                postal_code="",
                is_headquarters=False,
                headcount_range="",
                is_active=p.isActive,
                closure_date=None,
                period_start_date=p.periodStartDate,
            )
            for p in req.previous
        ]
        if req.previous
        else []
    )
    openings = [
        {"siret": o["siret"], "date": o["date"], "label": o["label"], "url": _opening_url(o["siret"])}
        for o in new_establishments(previous, current)
    ]
    return {
        "configured": True,
        "failed": False,
        "establishments": [
            {"siret": e.siret, "isActive": e.is_active, "periodStartDate": e.period_start_date, "city": e.city}
            for e in current
        ],
        # #3921.b — la tranche telle que le registre la publie, ou ``None`` :
        # « non mesuré », jamais un zéro.
        "headcountRange": (unit.headcount_range or None) if unit else None,
        "openings": openings,
    }


# ─── #3920.8 — les marchés attribués, lus EN CONTINU ──────────────────────────


class AwardsRequest(BaseModel):
    siren: str = Field(min_length=9, max_length=14)
    #: #3915.decp — n'est PLUS lu : le rattachement se fait par SIREN seul. Gardé
    #: optionnel pour qu'une API déployée avant ce lot ne prenne pas un 422.
    name: str | None = Field(default=None, max_length=200)
    #: LUD.1 — le pack de l'espace (``industrial_engineering``…) : les marchés suivent le domaine
    #: vendu. Absent = tri IT d'avant, à l'octet près.
    pack: str | None = Field(default=None, max_length=64)


def _award_ref(item: dict, day: str) -> str:
    """Identité STABLE d'un marché : objet + date.

    #3915.decp — l'acheteur est tenu HORS de l'identité : son nom vient du
    registre libre, résolu un jour et pas le lendemain, et une identité qui en
    dépend écrirait deux fois le même marché. La forme ``objet|date|`` est celle
    que portaient déjà les marchés lus par SIREN avant ce lot (acheteur vide) :
    les lignes déjà écrites restent les mêmes.
    """
    raw = f"{(item.get('title') or '').lower()[:120]}|{day}|"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]  # noqa: S324 — identité, pas un secret


@router.post("/awards")
async def awards_snapshot(req: AwardsRequest) -> dict:
    """Les marchés IT attribués récents du SIREN (acheteur OU titulaire), datés.

    #3915.decp — par SIREN seul (jamais par le nom : un homonyme ne s'attribue
    pas), en France seulement. Un marché sans date lisible n'est pas rendu. Une
    panne de la source n'est JAMAIS un relevé vide (``failed`` + ``reason``) ;
    l'attente de NOTRE limiteur n'est pas une panne (``deferred``) : l'API ne
    bouge pas son curseur et relit au prochain passage, sans rien journaliser
    comme une erreur.
    """
    try:
        items = await awards_for_siren(req.siren, pack=req.pack)
    except RateLimitTimeout:
        return {"failed": False, "deferred": True, "reason": None, "awards": []}
    except SignalSourceUnavailable as exc:
        return {"failed": True, "deferred": False, "reason": exc.reason, "awards": []}
    awards: list[dict] = []
    for item in items or []:
        raw_date = str(item.get("notifiedDate") or "").strip()[:10]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date):
            continue
        url = str(item.get("url") or "").strip()
        awards.append(
            {
                "ref": _award_ref(item, raw_date),
                "date": raw_date,
                "label": item.get("title") or "Marché attribué",
                "role": "titulaire" if item.get("role") == "titulaire" else "buyer",
                "winner": item.get("winner"),
                "buyer": item.get("buyer"),
                "url": url if url.lower().startswith(("http://", "https://")) else None,
            }
        )
    awards.sort(key=lambda a: a["date"], reverse=True)
    return {"failed": False, "deferred": False, "reason": None, "awards": awards}


# ─── #3921.9 — les événements du registre national des entreprises (RNE) ──────


class RneEventsRequest(BaseModel):
    siren: str = Field(min_length=9, max_length=14)


@router.post("/rne-events")
async def rne_events(req: RneEventsRequest) -> dict:
    """Changement de dirigeant, ouverture et fermeture d'établissement, datés PAR le registre.

    Sans identifiants : no-op strict (``configured: False``, aucun appel). Une panne n'est
    JAMAIS un relevé vide (``failed: True``) : l'API ne fixe pas son curseur de premier passage."""
    if not rne_configured():
        return {"configured": False, "failed": False, "events": []}
    try:
        events = await rne_company_events(req.siren)
    except Exception as exc:  # noqa: BLE001 — une source ne casse jamais la veille
        record_degradation(get_correlation_id(), source="inpi", reason=f"rne-events: {exc}")
        return {"configured": True, "failed": True, "events": []}
    return {"configured": True, "failed": False, "events": events}


# ─── #3921.10 — les marchés GAGNÉS par une ESN (rôle titulaire) ────────────────


class AwardsWonRequest(BaseModel):
    siren: str = Field(min_length=9, max_length=14)


@router.post("/awards-won")
async def awards_won(req: AwardsWonRequest) -> dict:
    """Les marchés IT dont ce SIREN est TITULAIRE. Une panne n'est JAMAIS un relevé vide
    (``failed``) : l'API n'écrit alors ni la liste ni la date de lecture."""
    try:
        awards = await awards_won_by_siren(req.siren)
    except Exception as exc:  # noqa: BLE001 — une source libre ne casse jamais la relecture
        record_degradation(get_correlation_id(), source="decp", reason=f"awards-won: {exc}")
        return {"failed": True, "awards": []}
    return {"failed": False, "awards": awards}
