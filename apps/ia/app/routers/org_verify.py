"""« Vérifier une relation » — l'action p22 sur UN lien de l'organigramme.

Le commercial regarde un lien pointillé (inféré) et demande la preuve. On lance
une recherche web CIBLÉE sur ces deux personnes-là, et on rend un verdict
déterministe (`app.services.relation_verifier`) : preuve officielle → le lien
devient vérifié ; preuve secondaire → il reste pointillé mais mieux étayé ; rien
trouvé → on le dit, et l'appelant ne touche à rien.

Aucun LLM n'intervient : le spec interdit qu'un modèle prononce seul une
hiérarchie (p12), et une inférence LLM seule plafonne à 49 (p14). Sans clé de
recherche, la passerelle ne fait AUCUN appel réseau et renvoie « rien trouvé » —
jamais une preuve fabriquée.
"""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.data_gateway import DataGateway
from app.services.relation_verifier import build_verification_queries, verdict_from_hits

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/org", tags=["Org"])

#: Nombre de requêtes réellement lancées. Les requêtes sont ordonnées de la plus
#: probante (site officiel) à la plus large : on s'arrête dès qu'une preuve
#: officielle tombe, donc le coût réel est souvent d'un seul appel.
_MAX_QUERIES = 3
_HITS_PER_QUERY = 5


class VerifyRelationRequest(BaseModel):
    company: str
    from_name: str
    to_name: str
    website: str | None = None


@router.post("/verify-relation")
async def verify_relation(req: VerifyRelationRequest) -> dict:
    """Cherche la preuve d'un lien entre deux personnes nommées.

    Réponse : `{verified, confidence, sources[], checked}`. `confidence: null`
    = aucune preuve trouvée — l'appelant DOIT alors laisser le lien inchangé
    (l'absence de preuve n'est pas une preuve du contraire).
    """
    queries = build_verification_queries(
        company=req.company,
        from_name=req.from_name,
        to_name=req.to_name,
        website=req.website,
    )
    if not queries:
        # Sans deux personnes nommées, il n'y a pas de lien à vérifier. On répond
        # « rien trouvé » plutôt qu'une erreur : l'écran n'a rien de spécial à
        # faire, et un 4xx ferait passer un cas normal pour une panne.
        return {"verified": False, "confidence": None, "sources": [], "checked": False}

    today = date.today().isoformat()
    gateway = DataGateway()
    hits: list[dict] = []
    # Ordre inversé : la requête `site:` (la seule capable de grounding A) est la
    # dernière construite ; on la joue en PREMIER pour pouvoir sortir tôt.
    for query in list(reversed(queries))[:_MAX_QUERIES]:
        try:
            found = await gateway.search(query, limit=_HITS_PER_QUERY)
        except Exception as exc:  # noqa: BLE001 — une recherche en échec ne casse pas l'écran
            logger.warning("verify-relation: search failed for %r: %s", query, exc)
            continue
        hits.extend(found or [])
        verdict = verdict_from_hits(
            hits,
            from_name=req.from_name,
            to_name=req.to_name,
            website=req.website,
            today=today,
        )
        if verdict["verified"]:
            return dict(verdict)

    return dict(
        verdict_from_hits(
            hits,
            from_name=req.from_name,
            to_name=req.to_name,
            website=req.website,
            today=today,
        )
    )
