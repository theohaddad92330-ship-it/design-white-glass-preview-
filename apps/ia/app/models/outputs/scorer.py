"""Pydantic output model for BELLUM-SCORER.

Validated by Instructor — Claude must return data matching this schema.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError


class ScoreCriterion(BaseModel):
    score: float = Field(default=5.0, ge=0, le=10)
    reason: str = ""


#: Le plancher de la doctrine : « un score n'est jamais nu — ses axes, et ce qui
#: n'a pas pu être évalué est NOMMÉ. **Sous 3 axes, il n'y a pas de score.** »
#: Le prompt en demande cinq (``bellum_scorer.py``, bloc ``SORTIE JSON``) ; ce
#: plancher est donc généreux, pas contraignant.
MINIMUM_AXES = 3

#: Le code d'erreur, en constante : `instructor` le remonte tel quel, et un
#: appelant qui veut le distinguer d'une autre faute de schéma doit pouvoir le
#: comparer sans recopier une chaîne.
_REFUSAL_CODE = "score_sans_axes"


class ScoringOutput(BaseModel):
    """Full output of BELLUM-SCORER prompt."""

    global_score: float = Field(default=5.0, ge=0, le=10)
    criteria: dict[str, ScoreCriterion] = Field(default_factory=dict)
    recommendation: str = "PRUDENT"  # GO | PRUDENT | STOP (normalized deterministically in scorer.py, S3)
    one_line: str = ""
    next_review_date: str = ""
    score_delta: str = ""
    score_delta_reason: str = ""

    @model_validator(mode="after")
    def _refuse_un_score_NU(self) -> ScoringOutput:
        """Un score sans ses axes n'est pas un score — refus BRUYANT.

        Mesuré le 29/08/2026 : trois tirages sur trois ont rendu
        ``{"global_score": 5.0, "criteria": {}, "recommendation": "PRUDENT"}``,
        tous les textes vides. Rien ne l'arrêtait : **chaque champ de ce modèle
        porte un défaut**, ``criteria`` compris, donc ``model_validate({})``
        passait. La sortie n'était pas rejetée, elle était PERSISTÉE — un 5/10
        « PRUDENT » sans un seul axe, exactement le score nu que la doctrine
        interdit (« sous 3 axes, il n'y a pas de score »).

        Le message NOMME le compte rendu et le plancher. C'est ce qui rend la
        relance CIBLÉE : ``instructor`` renvoie le message de validation au
        modèle (*reask*) au lieu de lui resservir le même prompt à l'identique.
        Même forme que ``ResearchStrategy._refuse_a_strategy_that_says_nothing``.

        ⚠️ Un axe dont la RAISON est vide ne compte pas : un nombre sans sa
        raison est un chiffre, pas un axe. Les compter reviendrait à accepter
        cinq « 7 » nus, qui n'expliquent pas plus le score qu'un dictionnaire
        vide.
        """
        axes = [nom for nom, c in self.criteria.items() if (c.reason or "").strip()]
        if len(axes) >= MINIMUM_AXES:
            return self
        muets = sorted(set(self.criteria) - set(axes))
        raise PydanticCustomError(
            _REFUSAL_CODE,  # type: ignore[arg-type]  — littéral côté pydantic, constante ici
            (
                "Score NU : {rendus} axe(s) argumenté(s) rendu(s), il en faut au moins "
                "{plancher}. Un axe est un couple score + raison ; un score sans sa "
                "raison ne compte pas{muets}. Nomme les axes que l'analyse fournie "
                "soutient réellement — n'en invente aucun."
            ),
            {
                "rendus": len(axes),
                "plancher": MINIMUM_AXES,
                "muets": f" (sans raison : {', '.join(muets)})" if muets else "",
                "axes": axes,
            },
        )
