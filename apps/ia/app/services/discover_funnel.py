"""#4419 — l'entonnoir de rejet d'une recherche Découvrir : entrés / retenus / écartés PAR CRITÈRE.

Un seul endroit (GA-26) fabrique ``query.funnel`` ; l'écran ne fait que le lire. Un critère qui n'a pas tourné
(ou n'a rien écarté) est ABSENT — jamais « 0 » ; un amont qui ne dit pas ce qu'il a vu ne fait pas inventer
« entrés ». Ce compteur dit ce que NOUS avons écarté, jamais ce que le marché fait ; aucun fournisseur n'y figure."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.services.account_qualification import ExclusionCode

#: Les critères nommables à l'écran. Tout autre nom est ignoré (un fournisseur ou un détail interne ne sort pas).
FUNNEL_CRITERIA = ("city", "zone", "trade", "headcount", "sector", "individual", "ceased", "duplicate", "portfolio")


def _count(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def build_funnel(*, entered: int | None, kept: int, rejected: Mapping[str, object]) -> dict[str, Any] | None:
    """``{entered?, kept, rejected{critère: n>0}}`` ; ``None`` quand il n'y a rien à dire."""
    out: dict[str, int] = {}
    for criterion in FUNNEL_CRITERIA:
        n = _count(rejected.get(criterion))
        if n:
            out[criterion] = n
    seen = _count(entered)
    if seen is None and not out:
        return None
    funnel: dict[str, Any] = {"kept": max(0, kept), "rejected": out}
    if seen is not None:
        funnel = {"entered": seen, **funnel}
    return funnel


#: Le code d'exclusion de la qualification → le critère nommé à l'écran (une table, un seul endroit).
_CRITERION_OF_EXCLUSION = {
    ExclusionCode.NATURAL_PERSON: "individual",
    ExclusionCode.UNINCORPORATED: "individual",
    ExclusionCode.CEASED: "ceased",
    ExclusionCode.DUPLICATE: "duplicate",
    ExclusionCode.OUT_OF_ZONE: "zone",
    ExclusionCode.OUT_OF_SECTOR: "sector",
}


def with_qualification(query: Mapping[str, Any], qualifications: list[Mapping[str, Any]]) -> dict[str, Any]:
    """``query`` + ce que la QUALIFICATION a écarté, par critère (#4419). Un entonnoir déjà posé en amont (recherche
    par compétence : villes, tailles) est complété, pas remplacé ; sinon il part de ce qui a été évalué. Un code
    d'exclusion que la table ne nomme pas n'est pas rangé sous un critère inventé."""
    if not qualifications:
        return dict(query)
    rejected: dict[str, int] = {}
    excluded = 0
    for qualification in qualifications:
        if qualification.get("verdict") != "excluded":
            continue
        excluded += 1
        criterion = _CRITERION_OF_EXCLUSION.get(str(qualification.get("code") or ""))
        if criterion:
            rejected[criterion] = rejected.get(criterion, 0) + 1
    upstream = query.get("funnel")
    if isinstance(upstream, Mapping):
        merged = dict(upstream.get("rejected") or {})
        for criterion, n in rejected.items():
            merged[criterion] = int(merged.get(criterion) or 0) + n
        funnel = build_funnel(
            entered=upstream.get("entered"),
            kept=max(0, int(upstream.get("kept") or 0) - excluded),
            rejected=merged,
        )
    else:
        funnel = build_funnel(entered=len(qualifications), kept=len(qualifications) - excluded, rejected=rejected)
    return {**query, "funnel": funnel} if funnel else dict(query)
