"""Typed payload of the Contact Hunter agent (Phase 2).

Lean shape: a list of :class:`ApolloSearchHit` plus its count. Apollo's
typed model already nails the per-contact wire format; this wrapper just
lets the envelope contract carry it.

Mirrored by ``packages/contracts/src/schemas/contacts-data.ts``.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.contacts import ApolloSearchHit


class ContactsFallbackOutcome(BaseModel):
    """#2543.5b — le repli web, tel qu'il s'est déroulé pour CETTE recherche.

    ``foundCount`` reste ``None`` tant que le repli n'a pas ABOUTI (pas
    tenté, ou tenté et l'appel a levé) — jamais un ``0`` pour un geste qui
    n'a pas eu lieu ou n'a pas fini (GA-18/19)."""

    attempted: bool = False
    found_count: int | None = Field(default=None, alias="foundCount")
    failure: str | None = None

    model_config = {"populate_by_name": True}


class ContactsWidenOutcome(BaseModel):
    """#2543.5g — la passe d'élargissement automatique, telle qu'elle s'est
    déroulée pour CETTE recherche (décision Louis 18/09/2026).

    Posée SEULEMENT quand la passe a tourné (stock resté mince après le
    repli + les amorces du registre légal, ET l'interrupteur d'environnement
    activé) — absente sinon, jamais un « non tentée » qui laisserait croire
    qu'on a réfléchi à la question. ``added`` est toujours un nombre dès que
    la passe a tourné, même ``0`` — une passe qui ne trouve rien le DIT
    (GA-18/19)."""

    attempted: bool = False
    initial_stock: int = Field(default=0, alias="initialStock")
    added: int | None = None
    failure: str | None = None

    model_config = {"populate_by_name": True}


class ContactsData(BaseModel):
    contacts: list[ApolloSearchHit] = Field(default_factory=list)
    count: int = 0
    # #2543.5a/.5c — l'état de la source Apollo + la population qu'elle ANNONCE
    # pour cette recherche. Absent = non mesuré (aucune recherche live cette
    # requête-ci), jamais un statut "ok" deviné.
    source_status: str | None = Field(default=None, alias="sourceStatus")
    source_total_entries: int | None = Field(default=None, alias="sourceTotalEntries")
    # C.2 (Cédric 20/10) — d'où vient l'ancre d'organisation de la recherche
    # (enrichment | website | explicit | none). Absent = non mesuré.
    org_anchor_source: str | None = Field(default=None, alias="orgAnchorSource")
    # #2543.5b — le repli web : tenté ou non, combien trouvés, l'échec nommé.
    fallback: ContactsFallbackOutcome | None = None
    # #2543.5g — la passe d'élargissement automatique : voir
    # ``ContactsWidenOutcome``. Absente quand elle n'a pas tourné.
    widened: ContactsWidenOutcome | None = None

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }
