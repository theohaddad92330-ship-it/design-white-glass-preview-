"""Rôle, équipe, compétences et tension d'une offre d'emploi — #2322.70.

Règles DÉTERMINISTES seules (aucun modèle, aucun appel réseau : sans clé comme avec,
le résultat est le même). Chaque champ n'existe que si le texte de l'offre le PROUVE :
absent = aucune clé, jamais « 0 », jamais deviné (doctrine « on n'affiche pas ce qu'on
n'a pas »). Réutilise les extracteurs déjà codés (`job_family`, `job_context`,
`tech_stack`) — ils n'avaient pas d'appelant sur la collecte du dossier compte.

Tension — jamais une probabilité, toujours sa RAISON :
- ``source_flag``     : la source signale le manque de candidats (déjà posé par la source) ;
- ``urgent_text``     : le texte dit l'urgence (« urgent », « dès que possible »…) ;
- ``republished_text``: le texte dit la republication ;
- ``online_long``     : l'offre est en ligne depuis ≥ ``ONLINE_LONG_DAYS`` jours (durée MESURÉE,
  portée par ``tension_days``). Une offre déjà rangée en historique ne porte pas ce signal.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from app.services.job_context import derive_team
from app.services.job_family import derive_job_family
from app.services.tech_stack import derive_technologies
from app.services.text_norm import normalize_name

#: Durée de publication à partir de laquelle une offre encore en ligne est dite « en ligne depuis longtemps ».
ONLINE_LONG_DAYS = 60
#: Même plafond que la collecte des offres (`france_travail.py`, `skills[:12]`).
MAX_SKILLS = 12

_URGENT_RE = re.compile(
    r"\burgent(?:e|s)?\b|\burgence\b|des que possible|\basap\b|immediatement|poste a pourvoir (?:rapidement|immediatement)"
    r"|urgently|immediate start"
)
_REPUBLISHED_RE = re.compile(r"republi|re-?publish|reposted|a nouveau en ligne")


def _text(offer: dict) -> str:
    return " ".join(str(offer.get(k) or "") for k in ("title", "description") if offer.get(k))


def _days_online(raw: object, now: datetime) -> int | None:
    try:
        when = datetime.fromisoformat(str(raw or "").strip()[:10]).replace(tzinfo=UTC)
    except ValueError:
        return None
    days = (now - when).days
    return days if days >= 0 else None


def _tension(offer: dict, text: str, now: datetime) -> dict:
    if offer.get("tension") is True:
        return {"tension": True, "tension_reason": "source_flag"}
    folded = normalize_name(text)
    if folded and _URGENT_RE.search(folded):
        return {"tension": True, "tension_reason": "urgent_text"}
    if folded and _REPUBLISHED_RE.search(folded):
        return {"tension": True, "tension_reason": "republished_text"}
    if not offer.get("historical"):
        days = _days_online(offer.get("date"), now)
        if days is not None and days >= ONLINE_LONG_DAYS:
            return {"tension": True, "tension_reason": "online_long", "tension_days": days}
    return {}


def enrich_job_offer(offer: dict, *, now: datetime) -> dict:
    """Une offre enrichie (copie) ; les clés déjà posées par la source ne sont jamais écrasées."""
    text = _text(offer)
    out = dict(offer)
    out.pop("tension", None)
    role = derive_job_family(offer.get("title"))
    if role:
        out["role"] = role
    team = derive_team(offer.get("title"), offer.get("description"))
    if team:
        out["team"] = team
    listed = [s for s in (offer.get("skills") or []) if isinstance(s, str) and s.strip()]
    seen = {s.casefold() for s in listed}
    detected = [s for s in derive_technologies(text) if s.casefold() not in seen]
    out["skills"] = (listed + detected)[:MAX_SKILLS]
    out.update(_tension(offer, text, now))
    return out


def enrich_job_offers(offers: list, *, now: datetime | None = None) -> list:
    """Enrichit chaque offre (dict) ; une entrée illisible passe telle quelle."""
    moment = now or datetime.now(UTC)
    return [enrich_job_offer(o, now=moment) if isinstance(o, dict) else o for o in offers]


__all__ = ["ONLINE_LONG_DAYS", "enrich_job_offer", "enrich_job_offers"]
