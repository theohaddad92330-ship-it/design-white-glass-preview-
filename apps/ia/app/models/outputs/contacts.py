"""Pydantic output models for Phase 3.

Phase 3 runs two prompts in parallel:
- BELLUM-CONTACTS  → ContactsOutput (per-contact classification, lean)
- BELLUM-ORGANIGRAMME → OrganigrammeOutput (org chart, decision chain, etc.)

Both are merged in `phase3_classify.py` before being returned to the API.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, computed_field

from app.services.decision_role import is_out_of_scope
from app.services.hierarchy_level import classify_hierarchy_level

# Deterministic roll-up of a contact into the six buyer-signal buckets the sales
# rep triages by. Computed from the LLM's own fields (role / influenceLevel /
# title), never asked to the LLM, so it is ALWAYS present and stable — a
# guaranteed field the front can key on. Keeps Apollo's wide net usable: real
# deciders float up, thin rows land in "à vérifier", irrelevant rows in "bruit".
CONTACT_BUCKETS = ("decideur", "sponsor", "operationnel", "influenceur", "a_verifier", "bruit")


def compute_contact_bucket(*, title: str, role: str, influence_level: str) -> str:
    # ``role`` uses the MEDDIC-ish decision-role vocabulary the classifier emits:
    # economic | technical | sponsor | champion | operational | user | purchasing
    # | influencer | blocker (+ empty when unclassified).
    t = (title or "").strip()
    r = (role or "").strip().lower()
    inf = (influence_level or "").strip().lower()
    # No exploitable title → can't act on it → noise.
    if not t:
        return "bruit"
    # Interns / apprentices / trainees → flagged as noise (kept, not dropped),
    # even if the title also carries a decider keyword ("Stagiaire DSI").
    if is_out_of_scope(t):
        return "bruit"
    # Real decision-maker: economic buyer, technical decision-maker (DSI/CTO), or
    # a named final sponsor.
    if inf == "decision-maker" or r in ("sponsor", "economic", "technical"):
        return "decideur"
    # Internal promoter — a probable sponsor.
    if r == "champion":
        return "sponsor"
    # Prescriber / influencer.
    if r == "influencer" or inf == "influencer":
        return "influenceur"
    # User / buyer / executor / procurement (achats gate — a process role, handled
    # tactically, not a decision-maker).
    if r in ("operational", "user", "purchasing", "procurement") or inf == "executor":
        return "operationnel"
    # Blocker, or a title with no usable classification → surface for a check.
    return "a_verifier"


class EnrichedContact(BaseModel):
    full_name: str = Field(alias="fullName", default="")
    title: str = ""
    entity: str = ""
    # Business family (IT / Cyber / Data / IA / Infra / Dev / PMO / Finance /
    # C-Level / Achat / RH / Autre) — the decision-maker taxonomy. Empty = not
    # classified (NULL in DB).
    family: str = ""
    # Empty string when Claude didn't classify — the API layer interprets that
    # as "leave decision_role NULL in the DB" so the UI shows "—" instead of
    # baking a fake "unknown" classification into the row.
    # Deck MEDDIC taxonomy — same vocabulary the title override (decision_role.py)
    # emits, so LLM-assigned and title-derived roles speak one language:
    #   economic | technical | user | champion | influencer | blocker (=gatekeeper).
    # Legacy rows may still hold sponsor/operational/purchasing (the bucket maps
    # both). Empty = unclassified (NULL in DB).
    role: str = ""
    # 0 = "not classified" (sentinel; the schema enforces 1-5 when Claude does
    # produce a real priority). Same intent as `role` — null-in-DB friendly.
    priority: int = Field(default=0, ge=0, le=5)
    summary: str = ""
    why_contact: str = Field(alias="whyContact", default="")
    linkedin_url: str = Field(alias="linkedinUrl", default="")
    reporting_to: str = Field(alias="reportingTo", default="")
    influence_level: str = Field(alias="influenceLevel", default="")  # decision-maker | influencer | executor
    best_approach: str = Field(alias="bestApproach", default="")
    personalized_hook: str = Field(alias="personalizedHook", default="")
    # Decider psychology (deck / ORION meta-prompt) — career levers (what makes
    # them shine internally, to orient the pitch) and implicit organisational
    # fears (to defuse, never to exploit).
    career_levers: list[str] = Field(alias="careerLevers", default=[])
    implicit_fears: list[str] = Field(alias="implicitFears", default=[])
    connection_path: str = ""
    source: str = ""  # apollo | ia_reconstruction | pappers | manual
    # Apollo People Match enrichment — populated by the on-demand
    # `POST /contacts/:id/enrich` endpoint, never by Phase 3.
    email: str = ""
    phone: str = ""
    email_verified: bool = Field(alias="emailVerified", default=False)

    @computed_field(alias="bucket")  # type: ignore[prop-decorator]
    @property
    def bucket(self) -> str:
        """One of ``CONTACT_BUCKETS`` — decideur | sponsor | operationnel |
        influenceur | a_verifier | bruit. Always present (guaranteed for the
        front)."""
        return compute_contact_bucket(title=self.title, role=self.role, influence_level=self.influence_level)

    @computed_field(alias="hierarchyLevel")  # type: ignore[prop-decorator]
    @property
    def hierarchy_level(self) -> str:
        """Deck org tier (c_level | direction | management | expert |
        operationnel), derived from the title. A different axis from the decision
        role and from ``influenceLevel``. Always present."""
        return classify_hierarchy_level(self.title)

    model_config = {"populate_by_name": True}


class OrgEntity(BaseModel):
    entity: str
    level: str = ""  # groupe | filiale | BU | direction | departement
    contacts: list[str] = []
    missing_roles: list[str] = Field(alias="missingRoles", default=[])

    model_config = {"populate_by_name": True}


class DecisionStep(BaseModel):
    step: str
    actors: list[str] = []
    duration: str = ""


class DecisionChain(BaseModel):
    description: str = ""
    steps: list[DecisionStep] = []
    estimated_cycle_length: str = Field(alias="estimatedCycleLength", default="")
    budget_authority: str = Field(alias="budgetAuthority", default="")

    model_config = {"populate_by_name": True}


class UncoveredZone(BaseModel):
    zone: str
    # Annexe p19/p30 : une zone blanche se lit « par entité, famille et niveau ».
    # Sans ces trois axes, la case n'est pas relançable — c'est une phrase, pas
    # une lacune. Vides = le modèle n'a pas su situer la zone (rien n'est inventé).
    entity: str = ""
    family: str = ""
    level: str = ""  # L0 | L1 | L2 | L3 | L4 | L5
    importance: str = "secondaire"  # critique | importante | secondaire
    suggested_search: str = Field(alias="suggestedSearch", default="")
    suggested_title: str = Field(alias="suggestedTitle", default="")

    model_config = {"populate_by_name": True}


class OrgRelationClaim(BaseModel):
    """Une relation TYPÉE proposée par le modèle (annexe p9 / p25).

    ``evidence`` est l'élément FOURNI en entrée qui établit le lien. C'est le
    garde-fou n°2 du prompt : une relation sans preuve citable ne doit pas être
    émise, et l'assembleur la jette. Ce que le modèle affirme n'est JAMAIS un
    fait — le resolver déterministe re-score la relation, plafonne une inférence
    LLM à 49 et la range en influence, jamais en ligne hiérarchique vérifiée.
    """

    from_name: str = Field(alias="from", default="")
    to_name: str = Field(alias="to", default="")
    # reports_to | member_of | sponsors | owns_budget | procures_for
    type: str = ""
    evidence: str = ""
    reasoning: str = ""

    model_config = {"populate_by_name": True}


class OrgInfluenceClaim(BaseModel):
    """Un lien d'influence métier (annexe p13 / p27) — hypothétique par nature,
    donc obligatoirement porteur d'une confiance ET d'un raisonnement."""

    from_name: str = Field(alias="from", default="")
    to_name: str = Field(alias="to", default="")
    topic: str = ""
    stance: str = "unknown"  # supporter | neutral | detractor | unknown
    # Auto-évaluation du modèle. Elle ne peut qu'ABAISSER le score déterministe
    # (org_confidence), jamais le relever — une preuve absente ne se rattrape pas
    # par une confiance élevée.
    confidence: int = Field(default=0, ge=0, le=100)
    reasoning: str = ""

    model_config = {"populate_by_name": True}


class OrgRelationalEdgeClaim(BaseModel):
    """Un edge RELATIONNEL proposé par le modèle (épopée #2919, #2310.13/.15/.19/
    .20/.21) — distinct d'``OrgRelationClaim`` : jamais hiérarchique, jamais
    personne<->personne pour ``works_with`` (#2121.34 reste sur ``hierarchyRelations``).

    Même garde-fou que le reste du fichier : ``evidence`` (l'élément FOURNI qui
    établit le lien) ET ``author`` (#2310.28 — QUI l'affirme) sont tous deux
    requis par l'assembleur, sinon l'edge n'est pas émis — aucun auteur inventé.
    """

    from_name: str = Field(alias="from", default="")
    to_name: str = Field(alias="to", default="")
    # works_with | owns_project | blocks | introduced_by | related_workspace
    type: str = ""
    evidence: str = ""
    author: str = ""
    reasoning: str = ""

    model_config = {"populate_by_name": True}


class RejectedClaim(BaseModel):
    """Un élément écarté et mémorisé (annexe p10 « rejeté + mémorisé », p27)."""

    name: str = ""
    reason: str = ""

    model_config = {"populate_by_name": True}


class StakeholderEntry(BaseModel):
    full_name: str = Field(alias="fullName", default="")
    stance: str = "unknown"  # advocate | neutral | opponent | unknown
    reasoning: str = ""

    model_config = {"populate_by_name": True}


class ApproachStep(BaseModel):
    step: int
    contact: str = ""
    role: str = ""
    why_first: str = ""
    # Annexe p26 : « pour chaque étape : contact exact, objectif, CANAL, preuve,
    # risque, résultat attendu, contact suivant et FALLBACK ». Les deux champs du
    # contrat `orgRecommendedStepSchema` qui n'avaient aucun producteur.
    channel: str = ""
    expected_outcome: str = ""
    unlocks: str = ""
    fallback: str = ""


class ContactsOutput(BaseModel):
    """Per-contact enrichment — output of BELLUM-CONTACTS (lean)."""

    contacts: list[EnrichedContact] = []

    model_config = {"populate_by_name": True}


class OrgChartOutput(BaseModel):
    """Org structure + decision graph — output of BELLUM-ORGANIGRAMME.

    The wire format still uses the French ``organigramme`` key (Claude prompt
    output); the field name here is English. ``populate_by_name=True`` + the
    alias keep input/output compatibility until the prompt is renamed in a
    follow-up.
    """

    org_chart: list[OrgEntity] = Field(alias="organigramme", default=[])
    decision_chain: DecisionChain = Field(alias="decisionChain", default_factory=DecisionChain)
    uncovered_zones: list[UncoveredZone] = Field(alias="uncoveredZones", default=[])
    stakeholder_map: list[StakeholderEntry] = Field(alias="stakeholderMap", default=[])
    approach_order: list[ApproachStep] = Field(alias="approach_order", default=[])
    # Matière du graphe typé (annexe p23-p28). Vides par défaut : un modèle qui ne
    # produit rien ici laisse le graphe exactement dans son état déterministe
    # d'avant — la refonte est ADDITIVE, elle n'enlève aucune ligne existante.
    hierarchy_relations: list[OrgRelationClaim] = Field(alias="hierarchyRelations", default=[])
    influence_map: list[OrgInfluenceClaim] = Field(alias="influenceMap", default=[])
    # #2310.13/.15/.19/.20/.21 (épopée #2919) — le producteur manquant noté
    # « reste » sur #2919 le 26/09 : jusqu'ici rien ne demandait cette matière au
    # modèle, alors même que l'assembleur (`org_graph_assembler.py`) savait déjà
    # la lire via son paramètre `llm_relational_edges`. Même défaut vide.
    relational_edges: list[OrgRelationalEdgeClaim] = Field(alias="relationalEdges", default=[])
    rejected: list[RejectedClaim] = Field(default=[])

    model_config = {"populate_by_name": True}


# Legacy alias — keep the old import path working through the migration.
OrganigrammeOutput = OrgChartOutput
