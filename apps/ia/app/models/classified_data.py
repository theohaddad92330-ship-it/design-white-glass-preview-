"""Typed payload of the Classifier agent (Phase 3).

Merge of ``ContactsOutput`` (per-contact classification) and
``OrgChartOutput`` (org structure + decision graph). The shape is what
``classify_contacts_and_organigramme`` already produces today via
``{**contacts.model_dump(by_alias=True), **org.model_dump(by_alias=True)}``;
this typed wrapper just lets the envelope contract carry it.

Mirrored by ``packages/contracts/src/schemas/classified-data.ts``.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.outputs.contacts import (
    ApproachStep,
    DecisionChain,
    EnrichedContact,
    OrgEntity,
    OrgInfluenceClaim,
    OrgRelationalEdgeClaim,
    OrgRelationClaim,
    RejectedClaim,
    StakeholderEntry,
    UncoveredZone,
)


class ClassifiedData(BaseModel):
    contacts: list[EnrichedContact] = []
    org_chart: list[OrgEntity] = Field(alias="organigramme", default=[])
    decision_chain: DecisionChain = Field(
        alias="decisionChain", default_factory=DecisionChain
    )
    uncovered_zones: list[UncoveredZone] = Field(alias="uncoveredZones", default=[])
    stakeholder_map: list[StakeholderEntry] = Field(alias="stakeholderMap", default=[])
    approach_order: list[ApproachStep] = Field(alias="approach_order", default=[])
    # Matière du graphe typé (annexe p23-p28) : relations typées + carte
    # d'influence + rejets. Déclarées ici pour survivre au passage par l'enveloppe
    # de l'agent (``model_dump(by_alias=True)``) jusqu'à l'assembleur de graphe.
    hierarchy_relations: list[OrgRelationClaim] = Field(alias="hierarchyRelations", default=[])
    influence_map: list[OrgInfluenceClaim] = Field(alias="influenceMap", default=[])
    # #2310.13/.15/.19/.20/.21 (épopée #2919) — même producteur que sur
    # ``OrgChartOutput``, mirroré ici pour survivre au passage par l'enveloppe.
    relational_edges: list[OrgRelationalEdgeClaim] = Field(alias="relationalEdges", default=[])
    rejected: list[RejectedClaim] = Field(default=[])

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }
