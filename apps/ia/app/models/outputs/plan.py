"""Pydantic output model for BELLUM-PLAN (Phase 4).

Validated by Instructor — Claude must return data matching this schema.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class PlanAction(BaseModel):
    action_id: str = ""
    action: str = ""
    # p27 : chaque action précise owner, canal, contact, raison, échéance, résultat
    # attendu et feedback. `owner`/`reason` sont générés ; `feedback` est rempli
    # APRÈS exécution (résultat/apprentissage) — jamais inventé par le LLM.
    owner: str = ""
    contact: str = ""
    channel: str = ""  # linkedin | email | phone | event | meeting | content
    reason: str = ""
    deadline: str = ""
    expected_outcome: str = Field(alias="expectedOutcome", default="")
    kpi: str = ""
    feedback: str = ""

    model_config = {"populate_by_name": True}


class PlanPhase(BaseModel):
    name: str = ""  # IMMEDIAT | MOIS 1 | MOIS 2-3 | MOIS 3-6 | MOIS 6-12
    title: str = ""
    objective: str = ""
    actions: list[PlanAction] = []


class ActionPlanSection(BaseModel):
    strategy: str = ""
    justification: str = ""
    phases: list[PlanPhase] = []


class OfferToPropose(BaseModel):
    title: str = ""
    pitch: str = ""
    target_contact: str = Field(alias="targetContact", default="")
    pain_addressed: str = Field(alias="painAddressed", default="")
    estimated_tjm: str = Field(alias="estimatedTJM", default="")
    estimated_team_size: str = Field(alias="estimatedTeamSize", default="")
    estimated_duration: str = Field(alias="estimatedDuration", default="")
    differentiator: str = ""
    # Roadmap §14 (« EJM et durées sans provenance claire ») — le raisonnement
    # EXPLICITE derrière les estimations (TJM/équipe/durée sont des hypothèses
    # Bellum dérivées du contexte, jamais des faits) et les signaux RÉELS de
    # l'analyse qui justifient l'offre. Additifs : vides sur un ancien payload.
    estimation_hypothesis: str = Field(alias="estimationHypothesis", default="")
    justifying_signals: list[str] = Field(alias="justifyingSignals", default=[])

    model_config = {"populate_by_name": True}


class QuickWin(BaseModel):
    action: str = ""
    contact: str = ""
    channel: str = ""
    time_required: str = ""
    expected_impact: str = ""


class AlternativeContact(BaseModel):
    name: str = ""
    title: str = ""
    reason: str = ""


class IfNoResponse(BaseModel):
    trigger: str = ""
    alternative_contact: AlternativeContact = Field(
        alias="alternative_contact", default_factory=AlternativeContact,
    )
    different_angle: str = ""
    reengagement_pretext: str = ""
    escalation_option: str = ""


class Risk(BaseModel):
    risk: str = ""
    probability: str = "moyenne"  # haute | moyenne | basse
    impact: str = "modere"  # critique | important | modere
    mitigation: str = ""


class ScoreAxis(BaseModel):
    """One line of the /25 scoring grid (V1-vendable §3.1) — explainable per axis."""

    axis: str = ""
    label: str = ""
    points: int = 0
    max: int = 0
    note: str = ""

    model_config = {"populate_by_name": True}


class BellumRead(BaseModel):
    """Les quatre temps de la lecture d'un dossier (#1607.1).

    ⚠️ Les noms des champs sont ceux du CONTRAT partagé
    (`bellumReadSchema`, `packages/contracts/src/schemas/analysis/plan.ts`) et
    ils s'écrivent en snake_case des deux côtés — donc **aucun alias ici** :
    `model_dump(by_alias=True)` rendrait sinon du camelCase que l'écran n'irait
    pas chercher.

    ⚠️⚠️ Ce modèle existe parce que son absence a rendu la fonctionnalité
    INVISIBLE en production. Pydantic ignore les clés qu'il ne connaît pas :
    `Evaluation` n'avait pas ce champ, `ActionPlanOutput.model_validate(merged)`
    l'effaçait donc du dossier, en silence, quoi que le modèle ait répondu. Rien
    ne pouvait le voir — ni une erreur, ni un test du prompt, ni un test de
    l'écran. C'est la famille « un normaliseur avale les champs neufs », et la
    leçon tient en une ligne : **un champ ajouté au prompt s'ajoute AUSSI au
    modèle qui relit la réponse.**
    """

    verdict_line: str | None = None
    why: list[str] = []
    missing: str | None = None
    next_action: str | None = None

    model_config = {"populate_by_name": True}


class DossierScoreAxis(BaseModel):
    """#2118.30-.40 — un axe du score décomposé.

    Miroir de `dossierScoreAxisSchema`. `value` est ABSENTE quand `state` vaut
    `unknown` : une note sur un axe non évalué est le zéro qui ment."""

    key: str = ""
    state: str = "unknown"
    value: float | None = None
    impact: str | None = None
    lever: str | None = None

    model_config = {"populate_by_name": True}


class DossierReliabilityDimension(BaseModel):
    """#2118.44 — une dimension de fiabilité (0-100), ou « non mesurée »."""

    state: str = "unknown"
    value: float | None = None
    note: str | None = None

    model_config = {"populate_by_name": True}


class DossierReliability(BaseModel):
    """#2118.44 — qualité / couverture / fraîcheur. Rien du POTENTIEL du compte."""

    quality: DossierReliabilityDimension | None = None
    coverage: DossierReliabilityDimension | None = None
    freshness: DossierReliabilityDimension | None = None

    model_config = {"populate_by_name": True}


class DossierObstacle(BaseModel):
    """#2118.25 — un frein, et pourquoi il freine."""

    label: str | None = None
    why: str | None = None

    model_config = {"populate_by_name": True}


class DossierAntiAdvice(BaseModel):
    """#2118.26 / .28 — ce qu'il ne faut PAS faire ici, et pourquoi."""

    what: str | None = None
    why: str | None = None

    model_config = {"populate_by_name": True}


class DossierNextAction(BaseModel):
    """#2118.27 — un geste et son endroit, distinct de la phrase du résumé."""

    label: str | None = None
    route: str | None = None
    tab: str | None = None

    model_config = {"populate_by_name": True}


class DossierEntryPoint(BaseModel):
    """#2118.24 — la meilleure porte d'entrée : qui, quel profil, pourquoi lui."""

    label: str | None = None
    target_profile: str | None = None
    why: str | None = None

    model_config = {"populate_by_name": True}


class DossierNoGo(BaseModel):
    """#2118.45 / .47 — un no-go temporaire, contextualisé, avec son déclencheur.

    `temporary` est posé par le service (`normalize_dossier_read`), pas rendu
    par le modèle : on n'enterre pas un compte."""

    temporary: bool = True
    context: str | None = None
    trigger: str | None = None

    model_config = {"populate_by_name": True}


class DossierMissingItem(BaseModel):
    """#2118.4 — un élément non évalué, NOMMÉ."""

    label: str | None = None
    why: str | None = None

    model_config = {"populate_by_name": True}


class DossierRead(BaseModel):
    """#2118 — la lecture du dossier, en contrat fermé.

    ⚠️⚠️ Chaque champ de `dossierReadSchema` est déclaré ICI, un par un, et
    `tests/test_dossier_read_contract.py` le PROUVE. Pydantic avale en silence
    toute clé qu'il ne connaît pas : un bloc demandé au prompt, produit par le
    modèle et facturé disparaîtrait sans qu'aucune erreur ne le signale — c'est
    exactement ce qui était arrivé à `bellum_read` (#1607.1), et ce bloc-ci
    porte quinze champs."""

    axes: list[DossierScoreAxis] = []
    why_for_your_esn: str | None = None
    recommended_scope: str | None = None
    best_entry_point: DossierEntryPoint | None = None
    # #2304.7 (épopée #2932) — Q6, la voie d'achat/accès plausible.
    access_path: str | None = None
    obstacles: list[DossierObstacle] = []
    anti_advice: DossierAntiAdvice | None = None
    next_action: DossierNextAction | None = None
    reliability: DossierReliability | None = None
    no_go: DossierNoGo | None = None
    profile_incomplete: bool | None = None
    profile_incomplete_fields: list[str] = []
    missing: list[DossierMissingItem] = []
    # #2306.15 — la version du profil ESN qui a produit CE score.
    esn_profile_version: int | None = None
    # #2306.16 — les objectifs commerciaux NOMMÉS actifs au moment du scoring.
    scoring_objectives: list[str] = []
    # #2306.22 — le poids de chaque axe dans la somme, rendu explicite.
    axis_weights: dict[str, float] = {}
    # #2306.23 — la version de la règle de score qui a produit ce bloc.
    algorithm_version: str | None = None

    model_config = {"populate_by_name": True}


class Evaluation(BaseModel):
    # V1-vendable verdict: GO / PRUDENT / STOP, over a /25 score. The verdict is a
    # DETERMINISTIC band on the score (set API-side), not the model's free choice.
    verdict: str = "PRUDENT"
    score: int = Field(default=0, ge=0, le=25)
    score_breakdown: list[ScoreAxis] = Field(alias="scoreBreakdown", default=[])
    justification: str = ""
    risks: list[Risk] = []
    # Legacy back-compat (derived): old consumers read goNoGo + globalScore /10.
    go_no_go: str = Field(alias="goNoGo", default="CONDITIONNEL")
    global_score: int = Field(alias="globalScore", default=5, ge=0, le=10)
    # Quality-gate cap (Théo restitution §6/§7 : "score recalculé après gates
    # qualité"). Set when the Quality Judge degraded the verdict below what the raw
    # /25 breakdown gave, so the front can badge "score plafonné (qualité)" and the
    # reason (hallucination / trop_faible) rather than showing a silent low score.
    quality_capped: bool = Field(alias="qualityCapped", default=False)
    quality_cap_reason: str | None = Field(alias="qualityCapReason", default=None)
    # #1607.1 — les quatre temps de la lecture. `None` quand le modèle ne les a
    # pas rendus : l'écran retombe alors sur la justification d'un seul tenant,
    # exactement comme pour un dossier analysé avant ce changement.
    bellum_read: BellumRead | None = None
    # #2118 — la lecture en contrat FERMÉ (sept axes + blocs rédigés). `None`
    # quand le modèle ne l'a pas rendue : l'écran retombe sur `bellum_read`
    # puis sur `justification`, exactement comme un dossier analysé avant ce
    # lot. Les noms sont ceux du contrat partagé, en snake_case des deux côtés
    # — donc AUCUN alias, sinon `model_dump(by_alias=True)` rendrait du
    # camelCase que l'écran n'irait pas chercher.
    dossier_read: DossierRead | None = None

    model_config = {"populate_by_name": True}


class CompetitorStrategy(BaseModel):
    competitor: str = ""
    differentiator: str = ""
    talking_point: str = Field(alias="talkingPoint", default="")

    model_config = {"populate_by_name": True}


class CompetitiveStrategy(BaseModel):
    positioning_statement: str = Field(alias="positioningStatement", default="")
    vs_competitors: list[CompetitorStrategy] = Field(alias="vsCompetitors", default=[])

    model_config = {"populate_by_name": True}


class PrioritySubAccount(BaseModel):
    """A priority zone's 30-day roadmap entry (deck's «feuille de route 30j par
    zone») — the next concrete action + the approach angle to take."""

    name: str = ""
    why: str = ""
    entry_contact: str = Field(alias="entryContact", default="")
    suggested_offer: str = Field(alias="suggestedOffer", default="")
    next_action: str = Field(alias="nextAction", default="")
    approach_angle: str = Field(alias="approachAngle", default="")  # top_down | bottom_up | middle_out
    deadline: str = ""

    model_config = {"populate_by_name": True}


class PlayEvidence(BaseModel):
    """The PROOF backing a play's signal — the SalesConnect ``preuve`` (roadmap §14).

    Drawn from the research's real sourced entries (``recentSignals`` /
    ``budgetSignals`` carry a ``source`` and often a ``date``) — NEVER fabricated
    (§8). A play whose signal can't be tied to a sourced entry gets ``preuve=None``
    and is marked non-actionnable rather than shipping an invented citation. A
    weak / AI-reconstructed source is kept but flagged ``weak=True`` so the
    completeness gate degrades the play (Théo #2)."""

    source: str = ""  # the citation, e.g. "France Travail", "BODACC", "Les Echos"
    url: str | None = None
    date: str | None = None
    signal: str = ""  # the sourced signal text this proof backs
    weak: bool = False  # sourced from a weak/reconstructed source

    model_config = {"populate_by_name": True, "extra": "ignore"}


class Play(BaseModel):
    """Typed contract for a §5 play (prep chatbot / mémoire continue V2, Théo #7).
    Mirrors the deterministic ``_plays()`` output — a coherent play chains
    perimeter → signal → preuve → offer → contact → angle → action → message →
    risque (méthode SalesConnect, roadmap §14). Enforced at build time (``_plays``
    validates through this), so the object a future chatbot reads is stable and
    typed. ``extra=allow`` tolerates later additions."""

    perimeter: str = ""
    tier: str | None = None
    pain_signal: str = Field(alias="painSignal", default="")
    # SalesConnect `preuve` : the cited source that grounds ``pain_signal``. None
    # (not fabricated) when no real source backs the signal → play marked faible.
    preuve: PlayEvidence | None = None
    esn_offer: str = Field(alias="esnOffer", default="")
    target_contact: str = Field(alias="targetContact", default="")
    target_contact_role: str | None = Field(alias="targetContactRole", default=None)
    angle: str = ""
    first_action: str = Field(alias="firstAction", default="")
    evidence_level: str = Field(alias="evidenceLevel", default="")
    risk: str = ""
    ready_message: str | None = Field(alias="readyMessage", default=None)
    ready_message_channel: str | None = Field(alias="readyMessageChannel", default=None)
    # Coherence-judge verdict (retour Thales) : {status: coherent|repaired|
    # incoherent, issues: [...]} — the chain tells one story, or says why not.
    coherence: dict[str, Any] | None = None
    # SalesConnect completeness verdict (roadmap §14) : {status: complete|faible,
    # missing: [...], hasFoundedEvidence: bool, requiredFields: [...]} — a play
    # carrying the 6 fields + a founded preuve is `complete` (actionnable), else
    # `faible` (flagged, never dropped).
    completeness: dict[str, Any] | None = None

    model_config = {"populate_by_name": True, "extra": "allow"}

    @field_validator(
        "perimeter", "pain_signal", "esn_offer", "target_contact", "angle", "first_action", "evidence_level", "risk",
        mode="before",
    )
    @classmethod
    def _none_to_empty(cls, v: object) -> object:
        # A required-str play field must never abort validation on a None (e.g. an
        # empty-named contact → targetContact=None) — coerce to "" defensively.
        return "" if v is None else v


class CommercialOffer(BaseModel):
    """Offre commerciale STRUCTURÉE du dossier (roadmap §14 : « EJM et durées
    apparaissent sans provenance claire »). Calque le pattern preuve/completeness
    des plays (#466) :

    - ``estimate`` / ``editable`` sont des CONSTANTES ``True`` (contrat UI :
      toute valeur affichée est une estimation Bellum ET reste modifiable) —
      un payload qui tenterait de les éteindre est recadré, jamais honoré.
    - ``estimated_effort`` / ``duration_estimate`` : hypothèses dérivées du
      contexte (taille compte, périmètre du signal). ``None`` — jamais un
      chiffre inventé — quand rien ne permet d'estimer.
    - ``hypothesis`` : le raisonnement d'estimation en clair. Absent → l'offre
      est marquée ``faible`` par ``offer_provenance`` (jamais supprimée).
    - ``rate_basis`` : ``None`` par défaut, « à relier aux tarifs du client ».
      ``AnalysisProfileData`` ne porte AUCUNE grille tarifaire aujourd'hui →
      placeholder éditable ; JAMAIS un tarif fabriqué (le ``estimatedTJM`` du
      LLM n'est pas repris ici).
    - ``provenance`` : la source citée qui justifie l'offre — le MÊME registre
      que ``_play_evidence`` (recentSignals/budgetSignals sourcés). ``None``
      (pas fabriquée, §8) quand aucune entrée réelle ne la fonde.
    - ``completeness`` : verdict déterministe {status: complete|faible,
      missing, hasFoundedEvidence, requiredFields}, comme play_completeness."""

    title: str = ""
    description: str = ""
    target_contact: str | None = Field(alias="targetContact", default=None)
    pain_addressed: str | None = Field(alias="painAddressed", default=None)
    estimated_effort: str | None = Field(alias="estimatedEffort", default=None)
    duration_estimate: str | None = Field(alias="durationEstimate", default=None)
    estimate: bool = True
    hypothesis: str | None = None
    editable: bool = True
    rate_basis: str | None = Field(alias="rateBasis", default=None)
    provenance: PlayEvidence | None = None
    completeness: dict[str, Any] | None = None

    model_config = {"populate_by_name": True, "extra": "allow"}

    @field_validator("estimate", "editable", mode="before")
    @classmethod
    def _always_true(cls, _v: object) -> bool:
        # Contrat roadmap §14 : une estimation est TOUJOURS marquée comme telle
        # et TOUJOURS éditable — constantes, pas des choix du modèle.
        return True


class Cockpit(BaseModel):
    """The decision cockpit as one typed object — the foundation a future chatbot
    / mémoire continue sits on (Théo #7). A view over the plan output; ``extra=allow``
    so it tolerates surfaces added later without a breaking change."""

    executive_summary: list[str] = Field(alias="executiveSummary", default=[])
    next_best_action: dict[str, Any] | None = Field(alias="nextBestAction", default=None)
    plays: list[Play] = []
    group_relationship: dict[str, Any] | None = Field(alias="groupRelationship", default=None)

    model_config = {"populate_by_name": True, "extra": "allow"}


class ActionPlanOutput(BaseModel):
    """Full output of BELLUM-PLAN prompt."""

    action_plan: ActionPlanSection = Field(alias="actionPlan", default_factory=ActionPlanSection)
    offers_to_propose: list[OfferToPropose] = Field(alias="offersToPropose", default=[])
    quick_wins: list[QuickWin] = []
    if_no_response: IfNoResponse = Field(default_factory=IfNoResponse)
    evaluation: Evaluation = Field(default_factory=Evaluation)
    priority_sub_accounts: list[PrioritySubAccount] = Field(alias="prioritySubAccounts", default=[])
    competitive_strategy: CompetitiveStrategy = Field(alias="competitiveStrategy", default_factory=CompetitiveStrategy)
    # Annexe méthodo (P2/P3) — deterministic, additive, derived from the SalesContext
    # (never rewrites the LLM plan). `recommendedMovement` = the opening movement
    # (1 of 7, TABLE C p13) ; `nextActions` = the 3-5 hierarchised next moves
    # (MOTEUR rule p28 — « jamais 20 actions non hiérarchisées »).
    recommended_movement: dict[str, str] = Field(alias="recommendedMovement", default_factory=dict)
    # #2959 — la route commerciale calculée (même source que le bloc de prompt).
    recommended_route: dict[str, str] = Field(alias="recommendedRoute", default_factory=dict)
    next_actions: list[dict[str, Any]] = Field(alias="nextActions", default_factory=list)
    # `nextActionsByHorizon` = les MÊMES actions rangées par échéance p27
    # (7j / 30j / 60j / 90j, buckets vides omis). Chaque action porte aussi sa
    # clé `horizon` ; un dossier antérieur n'a ni l'un ni l'autre et s'affiche
    # comme avant (liste plate).
    next_actions_by_horizon: dict[str, list[dict[str, Any]]] = Field(
        alias="nextActionsByHorizon", default_factory=dict
    )

    model_config = {"populate_by_name": True}
