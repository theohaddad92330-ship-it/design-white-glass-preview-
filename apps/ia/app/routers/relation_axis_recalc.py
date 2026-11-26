"""#2298.4 (19/09/2026, lot I3) — le rejeu GRATUIT de l'axe RELATION seul.

Même discipline que `score_axes.py` (P1-10) : déterministe, aucun modèle
appelé, aucun crédit débité. Réutilise `relation_axis_recalc`
(`discover_scoring.py`) — jamais une seconde implémentation du barème
(GA-26).

Pas de `crm_presence` dans le schéma de requête : le lire exigerait un appel
LIVE au fournisseur CRM connecté côté API (`CrmReadService`), donc un appel
sortant — exactement ce que ce chemin gratuit refuse. Un champ inconnu posté
ici (`crm_presence`, ou autre) est simplement ignoré par Pydantic, jamais lu.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.discover_scoring import relation_axis_recalc

router = APIRouter(prefix="/score", tags=["score"])


class AddressabilityRelationRequest(BaseModel):
    missions_count: int | None = None
    last_meeting_at: str | None = None
    last_email_at: str | None = None
    # #4680 — contacts CONNUS (import / CRM) rattachés au compte : un NOMBRE lu en base par l'API, jamais un nom.
    known_contacts_count: int | None = None
    human_correction: str | None = None


@router.post("/addressability-relation")
async def addressability_relation(req: AddressabilityRelationRequest) -> dict:
    """L'axe relation recalculé sur les seules sources fournies. Pur : mêmes
    entrées, même sortie, aucun effet de bord, aucun coût."""
    return {
        "success": True,
        "data": relation_axis_recalc(
            missions_count=req.missions_count,
            last_meeting_at=req.last_meeting_at,
            last_email_at=req.last_email_at,
            known_contacts_count=req.known_contacts_count,
            human_correction=req.human_correction,
        ),
    }
