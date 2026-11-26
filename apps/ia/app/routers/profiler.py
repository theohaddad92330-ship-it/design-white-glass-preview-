from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.agents.profiler import ProfilerAgent
from app.models.agent_envelope import AgentStatus
from app.models.progress import ProfilerProgressCallback

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profiler", tags=["profiler"])


class ProfilerBusinessUnit(BaseModel):
    """#2007.3 — un périmètre PORTÉ par le membre (BU / agence), tel que
    NestJS le lit (`EsnProfileWorkspaceResolver.resolveCarriedBusinessUnits`,
    borné espace actif + utilisateur). Nom, échelle, territoire, spécialités :
    rien d'autre ne voyage (ni membres, ni comptes, ni responsable)."""

    name: str
    kind: str
    territory: str | None = None
    specialties: list[str] = []


class OnboardingAnswers(BaseModel):
    user_id: str
    first_name: str | None = None
    esn_name: str = ""
    consultant_size: str = ""
    sales_team_size: str = ""
    expertise_areas: list[str] = []
    positioning: str = ""
    staffing_model: str = ""
    target_sectors: list[str] = []
    target_company_types: list[str] = []
    geo_zones: list[str] = []
    main_sales_pain: str = ""

    # #2007 — au-delà des dix champs Temps-1 : `EsnAnswers`
    # (packages/contracts/src/schemas/onboarding.ts) porte déjà tout le
    # complément Temps-2 et les 24 questions du profil progressif (§21-30),
    # mais `OnboardingAnswers` ne les déclarait pas — pydantic ignore
    # silencieusement toute clé inconnue (`extra="ignore"` par défaut), donc
    # rien de tout ça n'atteignait jamais le profiler, quoi qu'envoie l'API.
    # Chaque champ ci-dessous est ADDITIF et OPTIONNEL : un payload qui
    # n'envoie que les dix champs historiques reste valide, à l'octet près.
    offer_domain: str | None = None
    offer_domains: list[str] = []
    recruits_for_clients: str | None = None
    # #4270.1 (18/10) — le profil d'espace : ``staffing`` | ``forfait_conseil`` | absent.
    workspace_profile: str | None = None
    # Théo O onboarding-couverture (22/10/2026) — les « Précisions de cadrage » de l'onboarding V23 (25 champs ; `first_name`
    # existe déjà plus haut et porte désormais le prénom choisi pour Laura). ADDITIFS et OPTIONNELS : absent = `None` / `[]`.
    target_nature: list[str] = []
    target_size: list[str] = []
    language_capabilities: list[str] = []
    priority_expertise: list[str] = []
    skill_technos: list[str] = []
    activity_nature: list[str] = []
    data_sources: list[str] = []
    tools: list[str] = []
    delivery_frictions: list[str] = []
    recruiting_priorities: list[str] = []
    country_scope: list[str] = []
    account_access: str | None = None
    horizon: str | None = None
    success_target: str | None = None
    offer_pitch: str | None = None
    workflow_pain: str | None = None
    autonomy: str | None = None
    context_policy: str | None = None
    commercial_limits: str | None = None
    currency: str | None = None
    scope_level: str | None = None
    scope_unit: str | None = None
    bench_status: str | None = None
    geography_detail: str | None = None
    no_go: str | None = None
    # Temps 2 — le complément posé après la première analyse.
    decision_maker_personas: list[str] = []
    avg_sales_cycle: str | None = None
    avg_tjm: str | None = None
    client_references: list[str] = []
    no_go_sectors: list[str] = []
    # Profil progressif (§21-30) — voir `_coaching_message` pour la preuve
    # qu'au moins `user_role` est LU, pas seulement transporté.
    user_role: str | None = None
    role_tenure: str | None = None
    industry_tenure: str | None = None
    individual_goal: str | None = None
    monthly_target: str | None = None
    company_age: str | None = None
    company_size: str | None = None
    consultants_on_mission: str | None = None
    consultants_in_pipe: str | None = None
    team_overlap: str | None = None
    ramp_up_capacity: str | None = None
    avg_deal_size: str | None = None
    target_margin: str | None = None
    portfolio_size: str | None = None
    accounts_relationship_status: str | None = None
    weekly_calls: str | None = None
    weekly_emails: str | None = None
    weekly_linkedin: str | None = None
    proactivity_level: str | None = None
    public_sector_practice: str | None = None
    regulated_sector_readiness: str | None = None
    partner_relationship: str | None = None
    # #2067.2 — la cible partenaires suit l'archétype. `EsnAnswers`
    # (`onboarding/answers-profil.ts`) et la table `esn_profiles` (migration
    # `1795716657316-EsnProfilePartnerCounts`) portaient déjà ces deux bandes,
    # mais `OnboardingAnswers` ne les déclarait pas : pydantic ignore en
    # silence toute clé inconnue (`extra="ignore"`), donc l'API les envoyait et
    # le profiler ne les voyait jamais. C'est l'ANCRAGE de
    # `kpi_targets.partners_per_month` — sans lui, la cible s'omet.
    partners_regular_count: str | None = None
    partners_occasional_count: str | None = None
    go_to_market_channels: list[str] = []
    sales_routine: list[str] = []
    sales_blockers: list[str] = []
    tooling: list[str] = []
    shared_data_scope: list[str] = []
    # #2058.2 / #2058.10 — les moments acceptés pour solliciter la personne
    # (plages horaires, jours, moments à éviter), et le niveau de détail
    # attendu de ses réponses. ADDITIF, miroir `proactivity_level` /
    # `shared_data_scope` juste au-dessus.
    contact_windows: list[str] = []
    detail_level: str | None = None
    # #2032.10 / #2036.9 (16/09) — fonctions réellement exercées, suivi de
    # `user_role` ; ambition territoriale déclarée, distincte de `geo_zones`
    # (jamais fusionnées — #2036.10, garde GA-338).
    role_functions_practiced: list[str] = []
    growth_target_zones: list[str] = []
    # #2036.2 (#2847) — remote accepté et déplacements, distinct de
    # `geo_zones` et de `growth_target_zones` ci-dessus (jamais fusionnés).
    remote_and_travel_scope: list[str] = []
    # #2036.8 (#2847) — la posture territoriale déclarée (capacité avérée /
    # relations / intention), v1 tranché sans Louis (lot `feat/reste-r4-26-09`).
    zone_capability_status: list[str] = []
    # #2034 / #2035 (lot L15) — maturité commerciale déclarée + effectif réel
    # décomposé (migration `1794010000000-MaturiteEffectifReel`). Même règle
    # additive que le bloc au-dessus : absent reste absent, jamais deviné.
    esn_maturity_situation: str | None = None
    company_growth_goal: str | None = None
    active_clients_band: str | None = None
    revenue_recurrence: str | None = None
    client_concentration_risk: str | None = None
    consultants_managed_by_user_band: str | None = None
    available_consultants_band: str | None = None
    # #2035.1 / #2035.2 — la population dont parle le chiffre : cette activité,
    # son groupe, sa BU. Additif, jamais devinée.
    consultant_size_group_band: str | None = None
    consultant_size_business_unit_band: str | None = None

    # Lot 26 (#2038, #2039, #2040, #2041) — offre en types de prestation,
    # secteurs référencés, crédibilité et modes de réponse au besoin. Même
    # règle ADDITIVE : un payload qui les omet reste valide (`extra="ignore"`
    # et une valeur par défaut vide couvrent une API plus ancienne).
    service_types: list[str] = []
    service_types_proven: list[str] = []
    service_types_desired: list[str] = []
    reference_sectors: list[str] = []
    # #2041.1 — les secteurs déclarés PRIORITAIRES. Défaut vide : absent
    # veut dire « non répondu », jamais « aucune priorité ».
    priority_sectors: list[str] = []
    case_study_results: list[str] = []
    client_testimonials: list[str] = []
    # #2961 (#2302.28) — les mêmes références, NOMMÉES seules. Même défaut
    # additif que ses deux voisines ci-dessus.
    reference_accounts: list[str] = []
    # #2039.6 / #2039.2 (épopée #2880) — RÉPARÉ le 26/09/2026 (feat/soir-s10-26-09) :
    # `credibilite-preuves.ts`, `ia.client.ts` et `_COMPLEMENT_SECTIONS`
    # (`bellum_profiler.py`) portaient déjà ces deux champs, mais
    # `OnboardingAnswers` ne les déclarait pas — même défaut que celui documenté
    # juste au-dessus (`extra="ignore"` par défaut) : la valeur était postée par
    # l'API et silencieusement jetée avant d'atteindre le Profileur, sur les DEUX
    # champs depuis leur livraison. `test_profiler_router.py` le prouve
    # maintenant de bout en bout, pas seulement `_COMPLEMENT_SECTIONS`.
    expertise_no_concrete_proof: list[str] = []
    expertise_client_reference: list[str] = []
    # #2039.3/.4/.5 (épopée #2880, vague G lot g10) — même règle ADDITIVE que
    # leurs voisines ci-dessus, déclarées dès leur livraison (pas de défaut à
    # réparer plus tard).
    expertise_personal_experience: list[str] = []
    expertise_partner: list[str] = []
    expertise_talent_pool: list[str] = []
    staffing_modes: list[str] = []
    profile_validation_methods: list[str] = []
    contractual_constraints: list[str] = []

    # Lot L17 (#2042, #2043, #2044) — client idéal, interlocuteurs et chemins
    # d'accès. Miroir exact de `ia.client.ts` : même règle ADDITIVE, un payload
    # qui les omet reste valide.
    ideal_client_size: list[str] = []
    ideal_client_structure: list[str] = []
    ideal_client_maturity: list[str] = []
    ideal_client_territory: list[str] = []
    ideal_client_accessibility: str | None = None
    ideal_client_max_sales_cycle: str | None = None
    ideal_client_min_deal_size: str | None = None
    ideal_client_referencement_constraints: list[str] = []
    ideal_client_current_state: list[str] = []
    real_response_level: str | None = None
    budget_validator: str | None = None
    access_orienteur: str | None = None
    entry_channels_dependency: list[str] = []
    entry_channels_prerequisites: list[str] = []
    entry_channels_saturation: list[str] = []

    # Lot L19 (#2048 → #2055) — miroir exact de `ia.client.ts` : canaux,
    # unités comptées, temps réel, continuité, outillage et freins.
    entry_channels_used: list[str] = []
    # #2048.13 — la période par canal, migration 1794110000000.
    entry_channels_period: list[str] = []
    entry_channels_measured: list[str] = []
    entry_channels_last_starts: list[str] = []
    entry_channels_time_split: list[str] = []
    activity_measures_tracked: list[str] = []
    activity_reference_period: str | None = None
    weekly_sales_time_declared: str | None = None
    weekly_sales_time_protected: str | None = None
    weekly_sales_time_residual: str | None = None
    weekly_sales_time_slots: list[str] = []
    competing_workloads: list[str] = []
    workload_variability: str | None = None
    protected_slot_capacity: str | None = None
    dossier_continuity_practices: list[str] = []
    dossier_continuity_breaks: list[str] = []
    tooling_crm: str | None = None
    tooling_ats: str | None = None
    tooling_erp: str | None = None
    tooling_mailbox: str | None = None
    tooling_calendar: str | None = None
    tooling_drive: str | None = None
    tooling_spreadsheet: str | None = None
    tooling_enrichment: str | None = None
    tooling_sourcing_platform: str | None = None
    tooling_bi: str | None = None
    tooling_personal_notes: str | None = None
    tooling_reference: str | None = None
    tooling_reference_data: list[str] = []
    tooling_reference_freshness: str | None = None
    tooling_reference_confidence: str | None = None
    tooling_reference_export: str | None = None
    tooling_duplicates: str | None = None
    tooling_pain: str | None = None
    # #4971.1 — les noms des outils MAISON, déclarés (jamais une connexion, #4971.2).
    tooling_internal_names: list[str] = []
    sales_freins: list[str] = []
    frein_attempted: str | None = None
    frein_stopped: str | None = None
    frein_stopped_reason: str | None = None

    # #2007.9 — la COMPLÉTUDE : combien des questions du questionnaire ont une
    # réponse, sur combien au total (`computeAnswerCompleteness`,
    # `@bellum/contracts` — dérivée UNE FOIS, jamais recalculée ici). Les deux
    # nombres voyagent ensemble, jamais un pourcentage nu : un ratio seul
    # perdrait le dénominateur. ADDITIF — `None` pour un appelant plus ancien
    # qui ne les envoie pas encore.
    answered_count: int | None = None
    total_question_count: int | None = None

    # #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée (siège
    # et bureaux), distinct de `geo_zones` qui dit où elle PROSPECTE. Même
    # règle ADDITIVE : absent reste `[]`.
    company_locations: list[str] = []

    # #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais
    # NOMBRES du questionnaire. Même règle ADDITIVE : `None` pour un appelant
    # plus ancien qui ne les envoie pas encore, jamais un `0` inventé.
    consultant_count: int | None = None
    annual_revenue_amount: int | None = None
    annual_revenue_period: str | None = None

    # #2007.8 — l'état RÉEL des connecteurs (CRM, ATS, agenda…), distinct des
    # réponses `tooling_*` ci-dessus qui ne sont que du DÉCLARATIF. Résolu côté
    # NestJS par `ToolRegistryService.list(userId)` — le nom de chaque outil
    # dont le `status` vaut `connected`. ADDITIF : absent reste `[]`, jamais
    # deviné.
    connected_tools: list[str] = []

    # #2007.3 — les périmètres PORTÉS (BU / agence). ADDITIF : absent reste
    # `[]`, jamais un périmètre deviné. Rendu par `bellum_profiler.py`
    # (bloc « Périmètre porté »).
    business_units: list[ProfilerBusinessUnit] = []

    # #2007.6/#2007.12 — une ligne « source, statut » par réponse CONNUE de
    # `answer_meta` (côté NestJS, #2006.22), dérivée par
    # `deriveAnswerProvenanceForModel` (@bellum/contracts). ADDITIF : absent
    # reste `[]`, jamais une provenance devinée.
    answer_provenance_lines: list[str] = []
    # #2007.7 — les clés dont la valeur vient d'une source EXTERNE (registre,
    # Pappers, site, déduction, connecteur) plutôt que d'une saisie.
    imported_context_keys: list[str] = []
    # #2007.10 — les clés que l'utilisateur a CORRIGÉES après une première
    # valeur.
    corrected_answers_lines: list[str] = []
    # #2007.11 — les clés que l'utilisateur a volontairement PASSÉES
    # (`ProfileQuestionnaireDialog.tsx`, bouton « passer »), résolues côté
    # NestJS par `EsnProfileService.getSkippedQuestionKeys`. ADDITIF : absent
    # reste `[]`, jamais deviné. Distinct d'`answer_meta` : une question passée
    # n'a PRÉCISÉMENT aucune valeur, `answer_meta` suppose toujours qu'il y en
    # a une.
    skipped_question_keys: list[str] = []

    progress_callback: ProfilerProgressCallback | None = None


@router.post("/generate")
async def generate_profile(answers: OnboardingAnswers) -> JSONResponse:
    agent = ProfilerAgent()
    # #2069 — `user_id` voyage en ARGUMENT NOMMÉ, et non dans la charge utile :
    # il CLOISONNE la lecture des comptes réels proposés sur `/welcome`, il n'a
    # rien à faire dans le prompt (l'identité d'un utilisateur n'est pas une
    # réponse d'onboarding). Sans cette ligne, `real_accounts_for` résolvait
    # `caller = None` — `status="no_caller"`, écran d'accueil VIDE en
    # production, et pas une erreur pour le dire : le service et l'agent
    # savaient lire l'argument, leur unique appelant ne l'envoyait pas.
    envelope = await agent.run(
        answers.model_dump(exclude={"user_id", "progress_callback"}),
        progress_callback=answers.progress_callback,
        user_id=answers.user_id,
    )
    if envelope.status == AgentStatus.SUCCESS:
        http_status = 200
    elif envelope.status == AgentStatus.TERMINAL_FAILURE:
        if envelope.error and envelope.error.code == "AGENT_PRECONDITION_FAILED":
            http_status = 412
        elif envelope.error and envelope.error.service.value == "claude":
            http_status = 422
        else:
            http_status = 500
    else:
        http_status = 500
    return JSONResponse(
        status_code=http_status,
        content=envelope.model_dump(mode="json", exclude_none=True, by_alias=True),
    )
