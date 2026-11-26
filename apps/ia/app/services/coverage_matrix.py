"""#4420 — la matrice de couverture : POURQUOI une recherche par compétence est bridée.

Chaque source de la moisson d'offres peut ne rien rendre pour une raison différente, et « 0 offre » les confondait
toutes. Ce module NOMME la cause (compteurs seulement, jamais un contenu ni un critère) :

- côté sources : ``noKey`` (sans clé, no-op voulu), ``unauthorized``, ``quota`` (jour ou limiteur), ``http4xx`` (notre
  requête refusée), ``http5xx``, ``network``, ``timeout`` (on a cessé d'attendre), ``other``, ``cache`` (servi sans
  appel), ``cap`` (plafond d'achats atteint, non tenté) ;
- côté filtres : ce que le tri écarte, par motif (métier, zone, compétence absente, trop ancienne, stage, anonyme).

⚠️ Un filtre qui ne rejette JAMAIS alors que des offres arrivent ne tourne pas (mesuré le 25/10 : ``outsideTrade 0``
sur 59 offres). ``silent_filters`` rend ce cas visible, par source. Les clés nomment nos sources : donnée seulement,
jamais à l'écran (doctrine : nos fournisseurs ne se nomment jamais).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.services.company_filters import DegradeReason

#: Les causes d'une source qui n'a rien (ou peu) rendu — l'ordre est celui de la ligne de journal.
SOURCE_CAUSES = ("noKey", "unauthorized", "quota", "http4xx", "http5xx", "network", "timeout", "other", "cache", "cap")
#: Les motifs de rejet d'une offre (miroir de ``discover_skill_offers._OFFER_REJECTS``, relu par le test).
FILTER_CAUSES = ("anonymous", "tooOld", "internship", "skillAbsent", "outsideTrade", "outsideZone")
#: Sous ce nombre d'offres reçues, « aucun rejet » ne prouve rien (un petit lot propre existe).
SILENT_FILTER_MIN_RECEIVED = 20

_BY_REASON = {
    DegradeReason.MISSING_API_KEY: "noKey",
    DegradeReason.UNAUTHORIZED: "unauthorized",
    DegradeReason.QUOTA_EXCEEDED: "quota",
    DegradeReason.RATE_LIMITED: "quota",
    DegradeReason.REQUEST_REJECTED: "http4xx",
    DegradeReason.UPSTREAM_ERROR: "http5xx",
    DegradeReason.NETWORK_ERROR: "network",
    DegradeReason.TIME_BUDGET: "timeout",
}


def failure_cause(exc: BaseException) -> str:
    """La cause (clé de ``SOURCE_CAUSES``) d'une source qui a LEVÉ. Rien n'est deviné : une panne sans motif connu
    est ``other``."""
    if isinstance(exc, TimeoutError):
        return "timeout"
    reason = getattr(exc, "reason", None)
    if isinstance(reason, str) and reason in _BY_REASON:
        return _BY_REASON[reason]
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if isinstance(status, int):
        from app.services.company_filters import reason_for_status

        return _BY_REASON.get(reason_for_status(status), "other")
    return "other"


def source_causes(stats: Mapping[str, Any]) -> dict[str, int]:
    """Les causes NON NULLES d'une source : celles posées à l'appel (``causes``) et celles que ses autres compteurs
    portent déjà (cache servi, plafond d'achats, quota Découvrir d'Adzuna)."""
    found = {k: int(v) for k, v in dict(stats.get("causes") or {}).items() if v}
    for cause, key in (("cache", "cached"), ("cap", "notAttempted"), ("quota", "quotaSkipped")):
        if stats.get(key):
            found[cause] = found.get(cause, 0) + int(stats[key])
    return found


def silent_filters(by_source: Mapping[str, Mapping[str, Any]]) -> list[str]:
    """Les sources dont ``received`` ≥ ``SILENT_FILTER_MIN_RECEIVED`` et dont AUCUN rejet n'a été compté : un tri
    qui ne tourne pas (ou une source qui ne rend que du parfait, ce qui se vérifie à la main)."""
    return [
        name
        for name, stats in by_source.items()
        if int(stats.get("received") or 0) >= SILENT_FILTER_MIN_RECEIVED
        and not any(dict(stats.get("rejected") or {}).values())
    ]


def coverage(harvest: Any) -> dict[str, Any]:
    """La matrice d'une moisson : causes par source et en total, offres filtrées par motif, filtres silencieux."""
    by_source = {name: source_causes(stats) for name, stats in harvest.by_source.items()}
    causes = dict.fromkeys(SOURCE_CAUSES, 0)
    for found in by_source.values():
        for cause, count in found.items():
            causes[cause] = causes.get(cause, 0) + count
    if harvest.from_cache:
        causes["cache"] += 1  # toute la moisson est resservie du cache : aucune source n'a été relue
    return {
        "causes": causes,
        "bySource": {name: found for name, found in by_source.items() if found},
        "filtered": {key: int(harvest.rejected.get(key, 0)) for key in FILTER_CAUSES},
        "silentFilters": silent_filters(harvest.by_source),
    }


def log_line(matrix: Mapping[str, Any]) -> str:
    """Une ligne lisible pour le journal : causes non nulles, offres filtrées non nulles, filtres silencieux."""
    causes = {k: v for k, v in dict(matrix.get("causes") or {}).items() if v}
    filtered = {k: v for k, v in dict(matrix.get("filtered") or {}).items() if v}
    return (
        f"COMPETENCE-TROUVE couverture causes={causes} filtrees={filtered} "
        f"silencieux={list(matrix.get('silentFilters') or [])}"
    )
