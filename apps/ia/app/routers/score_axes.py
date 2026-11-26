"""Recalcul du score en cinq axes — déterministe, sans appel modèle (P1-10).

Le §58 demande qu'un retour utilisateur corrige « graphe, score et
recommandations sans full rerun ». Les corrections d'organigramme persistaient
déjà sans rejouer le dossier ; le SCORE, lui, restait figé sur la donnée
d'origine — un contact signalé faux continuait de compter dans l'accessibilité,
et la note gardait une justification que l'utilisateur venait de contredire.

Cette route existe pour que le recalcul vive à UN SEUL endroit. La logique est
en Python parce que c'est là que le pipeline la produit ; la réécrire côté API
donnerait deux implémentations de la même règle, qui divergeraient au premier
ajustement — et un score qui vaut 12 à l'analyse puis 14 après correction, sans
que rien n'ait changé d'autre, est pire qu'un score figé.

Aucun modèle n'est appelé, donc aucun crédit n'est débité : corriger une erreur
du produit ne doit rien coûter à celui qui la signale.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.account_score_axes import compute_axes

router = APIRouter(prefix="/score", tags=["score"])


class ScoreAxesRequest(BaseModel):
    analysis: dict = Field(default_factory=dict)
    profile: dict = Field(default_factory=dict)


@router.post("/axes")
async def score_axes(req: ScoreAxesRequest) -> dict:
    """Les cinq axes calculés sur l'analyse fournie. Pur : mêmes entrées, même
    sortie, aucun effet de bord, aucun coût."""
    return {"success": True, "data": compute_axes(req.analysis, req.profile)}
