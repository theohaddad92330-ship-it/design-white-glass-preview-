"""Apollo Professional (02/11) — la fraîcheur du poste lue par People-Match (parcours DATÉ).

Mesure du 01/11 (n=44, protocole ``app/eval/employment_freshness``) : People-Match 20/20 justes, la relecture par
recherche de nom 0/17 sur les départs. Cette lecture contourne volontairement le cache de 30 jours de
``apollo.enrich_person`` : un parcours périmé servi depuis Redis serait exactement la faute qu'on corrige.

Un échec (clé absente, plan, panne) n'est JAMAIS un état : ``status`` le dit, ``state`` reste ``unknown``. Aucune
probabilité. Le crédit est tracé par le registre de coûts (D19), à l'appel même (``_enrich_person_uncached``).
"""

from __future__ import annotations

import logging
from typing import Any

from app.eval.employment_freshness.protocol import observe_from_history, observe_from_snapshot
from app.models.contacts import EmploymentFreshnessResponse
from app.services.apollo import ApolloError, _enrich_person_uncached
from app.services.current_position import same_employer

logger = logging.getLogger(__name__)


def _left_on(history: list[dict[str, Any]], employer_ref: str) -> str | None:
    ends = sorted(
        (str(e.get("end_date") or "").strip()[:10] for e in history if same_employer(str(e.get("organization_name") or ""), employer_ref)),
        reverse=True,
    )
    return next((end for end in ends if end), None)


async def read_employment_freshness(
    *, apollo_id: str | None, linkedin_url: str | None, employer_ref: str
) -> EmploymentFreshnessResponse:
    if not (apollo_id or linkedin_url) or not employer_ref.strip():
        return EmploymentFreshnessResponse(status="no_identifier")
    try:
        result = await _enrich_person_uncached(apollo_id=apollo_id or None, linkedin_url=linkedin_url or None)
    except ApolloError as exc:
        logger.warning("Employment freshness unavailable: %s", type(exc).__name__)
        return EmploymentFreshnessResponse(status="unavailable")
    if not result.matched:
        # Un miss ne débite rien (People-Match) : « inconnu », pas « parti ».
        return EmploymentFreshnessResponse(status="unmatched")
    history = [e.model_dump() for e in result.employment_history]
    state = observe_from_history(history, employer_ref)
    if state == "unknown":
        state = observe_from_snapshot(result.organization_name, employer_ref)
    return EmploymentFreshnessResponse(
        status="ok",
        state=state,
        organization=result.organization_name or None,
        left_on=_left_on(history, employer_ref) if state == "left" else None,
        credits=1,
    )
