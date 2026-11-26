"""Sortie du modèle pour BELLUM-OUTREACH (``/message/generate``).

⚠️ Chaque clé que le prompt demande (``bellum_outreach._CHANNEL_OUTPUT``) a
son champ ICI. pydantic ignore les clés inconnues : une clé demandée, produite
et payée sans champ déclaré disparaîtrait en silence avant la réponse. C'est
``tests/test_message.py::test_every_new_output_field_reaches_the_api_response``
qui le tient, du retour du modèle jusqu'au JSON rendu.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

# Ce qu'un modèle écrit quand il n'a rien : jamais affiché comme un contenu.
_EMPTY_MARKERS = frozenset({"", "null", "none", "n/a", "aucun", "aucune"})


class OutreachClaim(BaseModel):
    """#2368.14 — une affirmation factuelle du message et sa preuve DÉCLARÉE
    par le modèle, une citation censée venir du packet de contexte. Le
    routeur vérifie chaque ``proof`` avant de renvoyer le brouillon
    (``app.services.evidence_gate.assert_claims_are_grounded``)."""

    text: str = ""
    proof: str = ""

    model_config = {"extra": "ignore"}

    @field_validator("text", "proof", mode="before")
    @classmethod
    def _text(cls, value: object) -> str:
        return value.strip() if isinstance(value, str) else ""


class OutreachDraftOutput(BaseModel):
    subject: str = ""
    body: str = ""
    # #1926.29 — la raison du choix de l'angle retenu.
    rationale: str | None = None
    # #1926.28 — l'autre angle crédible, non retenu.
    alternative_angle: str | None = Field(default=None, alias="alternativeAngle")
    # #2368.14 — les affirmations factuelles déclarées, chacune avec sa preuve.
    claims: list[OutreachClaim] = Field(default_factory=list)

    model_config = {"populate_by_name": True, "extra": "ignore"}

    @field_validator("subject", "body", mode="before")
    @classmethod
    def _text(cls, value: object) -> str:
        return value.strip() if isinstance(value, str) else ""

    @field_validator("rationale", "alternative_angle", mode="before")
    @classmethod
    def _optional_text(cls, value: object) -> str | None:
        # Un champ illisible vaut `null`, jamais une valeur de remplissage.
        if not isinstance(value, str):
            return None
        text = value.strip()
        return None if text.lower() in _EMPTY_MARKERS else text
