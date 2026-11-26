from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.analysis_context import AnalysisContext
from app.models.progress import ProgressCallback


class StrategyScope(BaseModel):
    """On-demand "changer de stratégie" (Théo Palier-2 §3): re-plan around a
    different angle / entry mode / entity WITHOUT redoing research + contacts.
    All optional — an empty scope is the default (LLM-recommended) strategy."""

    # Build the plan around THIS angle (matched on its title) instead of the
    # first-recommended one — the user explores a different approach. Bounded
    # (interpolated into the plan prompt → cap blocks injection / huge payloads).
    angle: str | None = Field(default=None, max_length=300)
    # Force the entry vector: top_down (sponsor C-level) / bottom_up (operational
    # prescripteur) / middle_out (décideur N-1).
    entry_mode: str | None = Field(default=None, max_length=20)
    # Anchor the plan on one perimeter / BU (e.g. "Boursorama", "cyber").
    focus_entity: str | None = Field(default=None, max_length=120)
    # #2947 (#2204.15) — form constraints the user types in the SAME "changer de
    # stratégie" dialog (length, words to avoid). It never writes a body itself —
    # it only CADRES the drafted messages; sending still stays with the commercial.
    constraints: str | None = Field(default=None, max_length=300)
    # #2947 (#2204.11) — the message OBJECTIVE chosen in the same dialog (one of
    # the composer's `MESSAGE_OBJECTIVES` codes). Replays the batch M1-M2-M3
    # around it; an unknown code is refused (422), never silently dropped.
    objective: str | None = Field(default=None, max_length=40)

    @field_validator("objective")
    @classmethod
    def _known_objective(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        from app.services.message_brief import MESSAGE_OBJECTIVES

        if value not in MESSAGE_OBJECTIVES:
            raise ValueError(f"unknown message objective: {value}")
        return value


class PlanRequest(BaseModel):
    account_id: str
    user_id: str = ""
    # Team scope (RAG grounding) — see ResearchRequest.workspace_id.
    workspace_id: str = ""
    account_data: dict = {}
    contacts: list[dict] = []
    profile_data: dict = {}
    # The ESN's relationship with this account (cold / engaged / existing client /
    # incumbent…). The plan MUST adapt the approach to it — a "déjà client" upsell
    # is a different play than a cold first touch. Same structured context the
    # research phase already consumes; a plain string also works.
    user_context: AnalysisContext | str | None = None
    # "Changer de stratégie" override (Théo P3) — re-plan on a chosen angle /
    # entry mode / entity, reusing the existing research + contacts.
    strategy_scope: StrategyScope | None = None
    # Mémoire de corrections du compte (feedback loop A2) : directives factuelles
    # condensées côté API depuis les retours utilisateur (« play X hors sujet »,
    # « contact Y parti »…). Vide (défaut) = prompt byte-identique — voir
    # app.services.account_feedback.feedback_directives_block.
    account_feedback: str = ""
    # Couche zéro (annexe méthodo p7-p9) : « chercher ce qui EXISTE avant de
    # proposer du froid ». ``crm_presence`` = le relevé RÉEL du CRM connecté de
    # l'ESN sur ce compte (rendu côté API, non vide seulement en cas de match) ;
    # ``reverse_prospects`` = les ex-collaborateurs de la cible détectés en phase 2.
    # Les deux vides (défaut) = prompt byte-identique — voir
    # app.services.zero_layer.zero_layer_block.
    crm_presence: str = ""
    # Traces des AUTRES outils internes (Drive, notes, e-mails, ATS) — p8.
    internal_history: str = ""
    # #4070.2/.4 — les faits du compte (affaires gagnées/perdues/sommeil, missions, besoins,
    # tous datés), les motifs de perte déclarés et l'analyse précédente. Vides = byte-identique.
    account_facts: list[dict] = []
    lost_deal_rex: str = ""
    previous_analysis: str = ""
    # Boucle d'apprentissage (restitution V2 §6) : ce que l'ÉQUIPE a fait des
    # besoins passés (convertis / transformés / obsolètes, par secteur et par
    # offre), agrégé côté API depuis l'Opportunity Graph. Prior sur l'ESN, jamais
    # un fait sur la cible. Vide (défaut) = prompt byte-identique — voir
    # app.services.workspace_learning.workspace_learning_block.
    workspace_learning: str = ""
    # #3278.3 — canaux MESURÉS de l'espace (réponse sous 14 j) : le preset de canal de
    # la route cède devant eux (`opening_movement.measured_channel_choice`). [] = inchangé.
    channel_performance: list[dict[str, Any]] = []
    # #2451.1 / #2453.7 — le mode de contexte du dossier (« one_off_mission »,
    # « neutral »), posé par l'API SEULEMENT hors « Mon activité ». L'API a déjà
    # retiré les couches exclues ; le prompt dit pourquoi elles manquent.
    # ``None`` (défaut) = prompt byte-identique — voir
    # app.services.context_mode.analysis_context_mode_block.
    context_mode: str | None = None
    reverse_prospects: list[dict] = []
    # Le FOCUS du plan, regle par ESPACE (« jamais un prisme IT par defaut »).
    # Chaque axe plafonne combien d elements de cette famille entrent dans la
    # charge utile du plan — et ce qui n entre pas dans le plafond n entre pas
    # dans le plan. Vide (defaut) = les valeurs EN VIGUEUR, donc plan
    # byte-identique. Contrat : packages/contracts/src/schemas/org-focus-weights.ts,
    # copie embarquee : app/services/focus_weights.py.
    focus_weights: dict = {}
    # #3278 — les signaux de route relus par l'API à CHAQUE appel du plan (le
    # SalesContext persisté ne porte que ceux d'avant la recherche). Vides = inchangé.
    declared_partners: list[str] = []
    consultant_history: Literal["present", "former"] | None = None
    declared_signal_present: bool = False
    declared_route_signals: dict[str, bool] | None = None
    # #3278.a — preuves / historique des canaux lus côté API ({} = lu, rien trouvé ; None = non lu).
    accumulated_route_criteria: dict[str, str] | None = None
    progress_callback: ProgressCallback | None = None


class PlanResponse(BaseModel):
    success: bool = True
    data: dict = {}
