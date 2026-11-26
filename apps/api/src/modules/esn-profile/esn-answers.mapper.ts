import { esnAnswersSchema, offerDomainSchema, type EsnAnswers } from '@bellum/contracts'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'

/** Row column is free TEXT — project it onto the contracts enum, degrading any
 *  unknown/legacy value to null (= default `esn_it` behaviour, never a throw). */
const offerDomain = offerDomainSchema.nullable().catch(null)

/**
 * Projects the current `esn_profiles` row onto the {@link EsnAnswers} contract
 * shape. A missing row (never onboarded) yields the all-empty answer set — the
 * caller then treats that as a profile-neutral run rather than an error.
 *
 * Shared by {@link EsnProfileService} (read/write) and the read-only
 * `EsnProfileReader` so the row→answers projection has a single definition.
 */
export function mapRowToAnswers(row: EsnProfileEntity | null): EsnAnswers {
  return {
    esn_name: row?.esn_name ?? null,
    consultant_size: row?.consultant_size ?? null,
    sales_team_size: row?.sales_team_size ?? null,
    expertise_areas: row?.expertise_areas ?? [],
    positioning: row?.positioning ?? null,
    target_sectors: row?.target_sectors ?? [],
    target_company_types: row?.target_company_types ?? [],
    staffing_model: row?.staffing_model ?? null,
    geo_zones: row?.geo_zones ?? [],
    // #2036.9 — l'ambition territoriale déclarée (colonne écrite depuis
    // `ProfileQuestionnaireDialog` via `ia.client.ts`, jamais relue avant
    // cette projection — même motif que #2060 plus bas dans ce fichier).
    growth_target_zones: row?.growth_target_zones ?? [],
    // #2036.2 (#2847) — le remote accepté et les déplacements, distincts de
    // `geo_zones`. Migration 1796321380100.
    remote_and_travel_scope: row?.remote_and_travel_scope ?? [],
    // #2036.8 (#2847) — la posture territoriale déclarée, v1 tranché sans
    // Louis. Migration 1796321504100.
    zone_capability_status: row?.zone_capability_status ?? [],
    // #3923.a — les métiers placés, colonne existante enfin projetée : elle
    // voyage par `GET /onboarding/state` jusqu'à Découvrir (`signalRelevance`).
    placed_roles: row?.placed_roles ?? [],
    // #4270.1 (18/10) — le profil d'espace ; une valeur inconnue dégrade en `null`.
    workspace_profile: esnAnswersSchema.shape.workspace_profile.parse(row?.workspace_profile ?? null),
    // Théo O onboarding-couverture (22/10) — les 26 clés neuves de la V23 ; absent = `null` / `[]`, jamais « 0 ».
    target_nature: row?.target_nature ?? [],
    target_size: row?.target_size ?? [],
    language_capabilities: row?.language_capabilities ?? [],
    priority_expertise: row?.priority_expertise ?? [],
    skill_technos: row?.skill_technos ?? [],
    activity_nature: row?.activity_nature ?? [],
    data_sources: row?.data_sources ?? [],
    tools: row?.tools ?? [],
    delivery_frictions: row?.delivery_frictions ?? [],
    recruiting_priorities: row?.recruiting_priorities ?? [],
    country_scope: row?.country_scope ?? [],
    account_access: row?.account_access ?? null,
    horizon: row?.horizon ?? null,
    success_target: row?.success_target ?? null,
    offer_pitch: row?.offer_pitch ?? null,
    workflow_pain: row?.workflow_pain ?? null,
    autonomy: row?.autonomy ?? null,
    context_policy: row?.context_policy ?? null,
    commercial_limits: row?.commercial_limits ?? null,
    currency: row?.currency ?? null,
    first_name: row?.first_name ?? null,
    scope_level: row?.scope_level ?? null,
    scope_unit: row?.scope_unit ?? null,
    bench_status: row?.bench_status ?? null,
    geography_detail: row?.geography_detail ?? null,
    no_go: row?.no_go ?? null,
    main_sales_pain: row?.main_sales_pain ?? null,
    offer_domain: offerDomain.parse(row?.offer_domain ?? null),
    // Portefeuille (DATAFORGE V10) : le zod du contrat écarte élément par
    // élément tout code que CE build ne connaît pas — jamais le tableau entier.
    offer_domains: esnAnswersSchema.shape.offer_domains.parse(row?.offer_domains ?? []),
    // #1124 — colonne TEXT libre : le zod du contrat borne à `yes`/`no` et
    // dégrade toute valeur inconnue en `null`, plutôt que de faire échouer la
    // lecture d'un profil entier pour un mot mal écrit.
    recruits_for_clients: esnAnswersSchema.shape.recruits_for_clients.parse(row?.recruits_for_clients ?? null),
    // Temps 2 (complément) — même projection, colonnes jamais remplies avant.
    decision_maker_personas: row?.decision_maker_personas ?? [],
    avg_sales_cycle: row?.avg_sales_cycle ?? null,
    avg_tjm: row?.avg_tjm ?? null,
    client_references: row?.client_references ?? [],
    no_go_sectors: row?.no_go_sectors ?? [],
    // #2118.10 / #2118.15 — le profil progressif (migration 1784819567318).
    // Le questionnaire ÉCRIT ces colonnes (`esnProfiles.merge(base, answers)`),
    // `esnAnswersToProfileData` sait les traduire (`sellerRole`,
    // `rampUpCapacity`, `consultantsOnMission`…), mais cette projection s'arrêtait
    // au Temps 2 : le rôle et la capacité n'atteignaient jamais le moteur, et la
    // lecture du compte les écrivait « non renseigné » pour tout le monde.
    user_role: row?.user_role ?? null,
    role_tenure: row?.role_tenure ?? null,
    industry_tenure: row?.industry_tenure ?? null,
    individual_goal: row?.individual_goal ?? null,
    monthly_target: row?.monthly_target ?? null,
    // #2052 (lot L19) — les objectifs commerciaux NOMMÉS. `[]` = aucun
    // objectif déclaré, jamais un objectif à zéro (jsonb, migration
    // 1794291845307).
    esn_objectives: row?.esn_objectives ?? [],
    company_age: row?.company_age ?? null,
    company_size: row?.company_size ?? null,
    // #2015.7 — la filiation déclarée. Migration 1795300384517.
    company_group_structure: row?.company_group_structure ?? null,
    consultants_on_mission: row?.consultants_on_mission ?? null,
    consultants_in_pipe: row?.consultants_in_pipe ?? null,
    team_overlap: row?.team_overlap ?? null,
    ramp_up_capacity: row?.ramp_up_capacity ?? null,
    avg_deal_size: row?.avg_deal_size ?? null,
    // #2053.3 — le coût d'intercontrat, DISTINCT de `available_consultants_band`
    // (un effectif, plus bas). Migration 1795698408511.
    intercontrat_cost: row?.intercontrat_cost ?? null,
    target_margin: row?.target_margin ?? null,
    // #2053.4 — la visibilité déclarée sur le délai d'encaissement, puis le
    // délai lui-même. Migration 1795698408511.
    payment_delay_visibility: row?.payment_delay_visibility ?? null,
    payment_delay_band: row?.payment_delay_band ?? null,
    portfolio_size: row?.portfolio_size ?? null,
    accounts_relationship_status: row?.accounts_relationship_status ?? null,
    weekly_calls: row?.weekly_calls ?? null,
    weekly_emails: row?.weekly_emails ?? null,
    weekly_linkedin: row?.weekly_linkedin ?? null,
    proactivity_level: row?.proactivity_level ?? null,
    public_sector_practice: row?.public_sector_practice ?? null,
    regulated_sector_readiness: row?.regulated_sector_readiness ?? null,
    partner_relationship: row?.partner_relationship ?? null,
    // #2067.2 — avec combien de partenaires, réguliers puis ponctuels.
    // Migration 1789764251903.
    partners_regular_count: row?.partners_regular_count ?? null,
    partners_occasional_count: row?.partners_occasional_count ?? null,
    go_to_market_channels: row?.go_to_market_channels ?? [],
    sales_routine: row?.sales_routine ?? [],
    sales_blockers: row?.sales_blockers ?? [],
    tooling: row?.tooling ?? [],
    shared_data_scope: row?.shared_data_scope ?? [],
    // #2058.2 / #2058.10 — les moments acceptés et le niveau de détail
    // attendu. Migration 1789893296516.
    contact_windows: row?.contact_windows ?? [],
    detail_level: row?.detail_level ?? null,
    // Maturité + effectif réel — lot L15 (#2034, #2035). `available_consultants_band`
    // a une colonne ET un lecteur IA depuis la migration 1780000000000 ; cette
    // ligne est ce qui manquait pour qu'un profil rempli le rende (#2035.5).
    esn_maturity_situation: row?.esn_maturity_situation ?? null,
    active_clients_band: row?.active_clients_band ?? null,
    revenue_recurrence: row?.revenue_recurrence ?? null,
    client_concentration_risk: row?.client_concentration_risk ?? null,
    company_growth_goal: row?.company_growth_goal ?? null,
    consultants_managed_by_user_band: row?.consultants_managed_by_user_band ?? null,
    available_consultants_band: row?.available_consultants_band ?? null,
    // #2035.1 / #2035.2 — de quelle population ce chiffre parle.
    consultant_size_group_band: row?.consultant_size_group_band ?? null,
    consultant_size_business_unit_band: row?.consultant_size_business_unit_band ?? null,
    // Canaux d'entrée (#2048) et unités comparables (#2049) — lot L19.
    // ⚠️ Le repli est `[]`/`null`, jamais une valeur de remplissage : un profil
    // qui n'a pas répondu doit se lire « on ne sait pas », et c'est
    // `channelAuditBuckets` qui traduit ce vide en seau « inconnu » plutôt
    // qu'en « aucun canal utilisé ».
    // Client idéal, interlocuteurs, chemins d'accès — lot L17 (#2042, #2043,
    // #2044). Les quatre `entry_channels_*` sans numéro L17 portent le bloc
    // canaux de #2048 (lot L19), apporté en dépendance — voir le rapport du lot.
    ideal_client_size: row?.ideal_client_size ?? [],
    ideal_client_structure: row?.ideal_client_structure ?? [],
    ideal_client_maturity: row?.ideal_client_maturity ?? [],
    ideal_client_territory: row?.ideal_client_territory ?? [],
    ideal_client_accessibility: row?.ideal_client_accessibility ?? null,
    ideal_client_max_sales_cycle: row?.ideal_client_max_sales_cycle ?? null,
    ideal_client_min_deal_size: row?.ideal_client_min_deal_size ?? null,
    ideal_client_referencement_constraints: row?.ideal_client_referencement_constraints ?? [],
    ideal_client_current_state: row?.ideal_client_current_state ?? [],
    real_response_level: row?.real_response_level ?? null,
    budget_validator: row?.budget_validator ?? null,
    access_orienteur: row?.access_orienteur ?? null,
    entry_channels_used: row?.entry_channels_used ?? [],
    // #2048.13 — la période par canal, migration 1794110000000.
    entry_channels_period: row?.entry_channels_period ?? [],
    entry_channels_measured: row?.entry_channels_measured ?? [],
    entry_channels_last_starts: row?.entry_channels_last_starts ?? [],
    entry_channels_time_split: row?.entry_channels_time_split ?? [],
    activity_measures_tracked: row?.activity_measures_tracked ?? [],
    activity_reference_period: row?.activity_reference_period ?? null,
    // Capacité réelle + continuité des dossiers — lot L19 (#2050, #2051).
    // Sans ces neuf lignes, la colonne et la question existent mais la lecture
    // du profil rend `undefined` : l'écran revient vide au rechargement et la
    // réponse est perdue en silence — le motif n°1 de ce dépôt.
    //
    // ⚠️ Les trois états du temps sont recopiés TELS QUELS, chacun depuis SA
    // colonne : aucun n'est déduit d'un autre (#2050.11/.12/.13).
    weekly_sales_time_declared: row?.weekly_sales_time_declared ?? null,
    weekly_sales_time_protected: row?.weekly_sales_time_protected ?? null,
    weekly_sales_time_residual: row?.weekly_sales_time_residual ?? null,
    weekly_sales_time_slots: row?.weekly_sales_time_slots ?? [],
    competing_workloads: row?.competing_workloads ?? [],
    workload_variability: row?.workload_variability ?? null,
    protected_slot_capacity: row?.protected_slot_capacity ?? null,
    dossier_continuity_practices: row?.dossier_continuity_practices ?? [],
    dossier_continuity_breaks: row?.dossier_continuity_breaks ?? [],
    // Cartographie de l'outillage — #2054 (migration 1794024402918). Sans ces
    // lignes, le questionnaire ÉCRIRAIT les colonnes (`esnProfiles.merge`) sans
    // jamais les rendre : l'utilisateur reverrait ses questions vides à la
    // réouverture, et le récapitulatif les compterait comme non répondues.
    tooling_crm: row?.tooling_crm ?? null,
    tooling_ats: row?.tooling_ats ?? null,
    tooling_erp: row?.tooling_erp ?? null,
    tooling_mailbox: row?.tooling_mailbox ?? null,
    tooling_calendar: row?.tooling_calendar ?? null,
    tooling_drive: row?.tooling_drive ?? null,
    tooling_spreadsheet: row?.tooling_spreadsheet ?? null,
    tooling_enrichment: row?.tooling_enrichment ?? null,
    tooling_sourcing_platform: row?.tooling_sourcing_platform ?? null,
    tooling_bi: row?.tooling_bi ?? null,
    tooling_personal_notes: row?.tooling_personal_notes ?? null,
    tooling_reference: row?.tooling_reference ?? null,
    tooling_reference_data: row?.tooling_reference_data ?? [],
    tooling_reference_freshness: row?.tooling_reference_freshness ?? null,
    tooling_reference_confidence: row?.tooling_reference_confidence ?? null,
    tooling_reference_export: row?.tooling_reference_export ?? null,
    tooling_duplicates: row?.tooling_duplicates ?? null,
    tooling_pain: row?.tooling_pain ?? null,
    // #4971.1 — les outils maison, nommés librement. `null` = question passée.
    tooling_internal_names: row?.tooling_internal_names ?? null,
    // Freins commerciaux — #2055 (migration 1794024403057). `[]` / `null` ici
    // veut dire « pas répondu » : c'est `readSalesFreins` (contracts) qui refuse
    // de le lire comme « aucun frein ».
    sales_freins: row?.sales_freins ?? [],
    frein_attempted: row?.frein_attempted ?? null,
    frein_stopped: row?.frein_stopped ?? null,
    frein_stopped_reason: row?.frein_stopped_reason ?? null,
    entry_channels_dependency: row?.entry_channels_dependency ?? [],
    entry_channels_prerequisites: row?.entry_channels_prerequisites ?? [],
    entry_channels_saturation: row?.entry_channels_saturation ?? [],
    // Lot 26 (#2038, #2039, #2040, #2041) — offre en types de prestation,
    // secteurs référencés, crédibilité et modes de réponse au besoin.
    service_types: row?.service_types ?? [],
    service_types_proven: row?.service_types_proven ?? [],
    service_types_desired: row?.service_types_desired ?? [],
    reference_sectors: row?.reference_sectors ?? [],
    // #2041.1 — le niveau le plus fort. `?? []` comme ses voisines : une
    // ligne écrite avant la migration n'a pas la colonne, et une absence n'est
    // pas « aucun secteur prioritaire ».
    priority_sectors: row?.priority_sectors ?? [],
    case_study_results: row?.case_study_results ?? [],
    client_testimonials: row?.client_testimonials ?? [],
    // #2961 (#2302.28) — migration `1796340600000`, même garde `?? []` que
    // ses voisines : une ligne écrite avant la migration n'a pas la colonne.
    reference_accounts: row?.reference_accounts ?? [],
    // #2039.6 (épopée #2880) — migration `1796321384417`, même garde `?? []`
    // que ses voisines : une ligne écrite avant la migration n'a pas la
    // colonne.
    expertise_no_concrete_proof: row?.expertise_no_concrete_proof ?? [],
    // #2039.2 (épopée #2880) — migration `1796322010437`, même garde `?? []`.
    expertise_client_reference: row?.expertise_client_reference ?? [],
    // #2039.3/.4/.5 (épopée #2880, vague G lot g10) — migrations
    // `1796322780320`/`1796322780330`/`1796322781937`, même garde `?? []`.
    expertise_personal_experience: row?.expertise_personal_experience ?? [],
    expertise_partner: row?.expertise_partner ?? [],
    expertise_talent_pool: row?.expertise_talent_pool ?? [],
    staffing_modes: row?.staffing_modes ?? [],
    profile_validation_methods: row?.profile_validation_methods ?? [],
    contractual_constraints: row?.contractual_constraints ?? [],
    // #2056 (appels d'offres) / #2057 (contenu) — migration 1794300000001.
    // Sans ces lignes, le questionnaire ÉCRIRAIT les colonnes (`esnProfiles.merge`)
    // sans jamais les rendre : même motif que le reste de ce fichier (les
    // commentaires ci-dessus le répètent à chaque lot — un profil qui répond
    // reverrait ses réponses vides à la réouverture).
    rfp_platforms_used: row?.rfp_platforms_used ?? [],
    rfp_referencing_status: row?.rfp_referencing_status ?? null,
    rfp_lot_allocation: row?.rfp_lot_allocation ?? null,
    rfp_response_templates: row?.rfp_response_templates ?? null,
    rfp_volume: row?.rfp_volume ?? null,
    rfp_volume_period: row?.rfp_volume_period ?? null,
    rfp_outcomes: row?.rfp_outcomes ?? [],
    rfp_go_no_go_process: row?.rfp_go_no_go_process ?? null,
    rfp_document_readiness: row?.rfp_document_readiness ?? null,
    // #2056.11 (économie du dossier) / #2057.10 (owner) — migration 1795300384517.
    rfp_deal_value: row?.rfp_deal_value ?? null,
    rfp_owner_assignment: row?.rfp_owner_assignment ?? null,
    content_active_profile: row?.content_active_profile ?? [],
    content_audience_size: row?.content_audience_size ?? null,
    content_visible_expertise: row?.content_visible_expertise ?? [],
    content_reactions: row?.content_reactions ?? null,
    content_conversations_generated: row?.content_conversations_generated ?? null,
    content_funnel_stages_reached: row?.content_funnel_stages_reached ?? [],
    // Vivier déclaré à l'onboarding — #2046. `null` partout : un profil qui
    // n'a pas répondu n'a « aucun » vivier, il n'a pas répondu.
    talent_pool_identified_band: row?.talent_pool_identified_band ?? null,
    talent_pool_qualified_band: row?.talent_pool_qualified_band ?? null,
    talent_pool_available_band: row?.talent_pool_available_band ?? null,
    talent_pool_availability_recency_band: row?.talent_pool_availability_recency_band ?? null,
    talent_pool_avg_tjm_band: row?.talent_pool_avg_tjm_band ?? null,
    talent_pool_mobility_band: row?.talent_pool_mobility_band ?? null,
    talent_pool_consent_status: esnAnswersSchema.shape.talent_pool_consent_status.parse(
      row?.talent_pool_consent_status ?? null,
    ),
    talent_pool_other_processes_band: row?.talent_pool_other_processes_band ?? null,
    talent_pool_engagement_reality_band: row?.talent_pool_engagement_reality_band ?? null,
    talent_pool_revalidation_frequency: esnAnswersSchema.shape.talent_pool_revalidation_frequency.parse(
      row?.talent_pool_revalidation_frequency ?? null,
    ),
    talent_pool_state_interested_band: row?.talent_pool_state_interested_band ?? null,
    talent_pool_state_available_band: row?.talent_pool_state_available_band ?? null,
    talent_pool_state_secured_band: row?.talent_pool_state_secured_band ?? null,
    // #2046.14 — un CV n'est pas une candidature prête.
    talent_pool_state_presentable_band: row?.talent_pool_state_presentable_band ?? null,
    // Base de clients déclarée à l'onboarding — #2047. #2047.1 n'a pas de
    // colonne (voir `answers-base-clients.ts`).
    client_base_missions_ongoing_band: row?.client_base_missions_ongoing_band ?? null,
    client_base_missions_completed_band: row?.client_base_missions_completed_band ?? null,
    client_base_renewals_band: esnAnswersSchema.shape.client_base_renewals_band.parse(
      row?.client_base_renewals_band ?? null,
    ),
    client_base_satisfaction_band: esnAnswersSchema.shape.client_base_satisfaction_band.parse(
      row?.client_base_satisfaction_band ?? null,
    ),
    client_base_referrals_band: esnAnswersSchema.shape.client_base_referrals_band.parse(
      row?.client_base_referrals_band ?? null,
    ),
    client_base_rex_band: esnAnswersSchema.shape.client_base_rex_band.parse(row?.client_base_rex_band ?? null),
    client_base_case_studies_band: row?.client_base_case_studies_band ?? null,
    client_base_cross_sell_band: esnAnswersSchema.shape.client_base_cross_sell_band.parse(
      row?.client_base_cross_sell_band ?? null,
    ),
    client_base_deadlines_band: esnAnswersSchema.shape.client_base_deadlines_band.parse(
      row?.client_base_deadlines_band ?? null,
    ),
    client_base_followup_regularity: esnAnswersSchema.shape.client_base_followup_regularity.parse(
      row?.client_base_followup_regularity ?? null,
    ),
    client_base_followup_owner: row?.client_base_followup_owner ?? null,
    // #2059 — attribution marketing, migration 1794200200000. `null` veut
    // dire « facultative, jamais répondue » (#2059.7) : jamais une valeur
    // devinée à la place de l'utilisateur.
    heard_about_bellum: row?.heard_about_bellum ?? null,
    // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée,
    // migration 1795610000000.
    company_locations: row?.company_locations ?? [],
    // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais
    // nombres. `null` partout : un profil qui n'a pas répondu n'a « aucun »
    // consultant ni « 0 » de chiffre d'affaires, il n'a pas répondu (GA-18/19).
    // Migration 1795716559575.
    consultant_count: row?.consultant_count ?? null,
    annual_revenue_amount: row?.annual_revenue_amount ?? null,
    annual_revenue_period: esnAnswersSchema.shape.annual_revenue_period.parse(row?.annual_revenue_period ?? null),
    // #2060 — la question ouverte qui FERME le parcours, migration
    // 1795712398814. `null` veut dire « jamais répondue » (GA-18/GA-19),
    // jamais une valeur devinée à la place de l'utilisateur.
    uncovered_activity_note: row?.uncovered_activity_note ?? null,
    // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
    // DÉCLARÉ, migration 1795712440422. N'entre nulle part dans les droits
    // (`workspace-permission.guard.ts` reste seul, GA-26).
    decisions_alone: row?.decisions_alone ?? [],
    decisions_to_validate: row?.decisions_to_validate ?? [],
    people_managed: row?.people_managed ?? [],
    recruitment_accounts_authority: row?.recruitment_accounts_authority ?? null,
    staffing_authority: row?.staffing_authority ?? null,
    margin_billing_authority: row?.margin_billing_authority ?? null,
    tools_access: row?.tools_access ?? [],
    invite_authority: row?.invite_authority ?? null,
    // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
    // du commercial, migration 1789741699223. `null` partout : un profil qui
    // n'a pas répondu n'a « aucun » recruteur, il n'a pas répondu (GA-18/19).
    associates_count: row?.associates_count ?? null,
    recruiters_team_size: row?.recruiters_team_size ?? null,
    delivery_team_size: row?.delivery_team_size ?? null,
    marketing_team_size: row?.marketing_team_size ?? null,
    ops_team_size: row?.ops_team_size ?? null,
    team_coordination_mode: row?.team_coordination_mode ?? null,
    // #2640.2 — le site de l'entreprise.
    esn_website: row?.esn_website ?? null,
    // #2045.1/.2/.4/.7 — le réseau personnel déclaré pour quatre portes de
    // `canaux.ts`.
    former_clients_count_band: row?.former_clients_count_band ?? null,
    former_colleagues_count_band: row?.former_colleagues_count_band ?? null,
    partners_count_band: row?.partners_count_band ?? null,
    referrers_count_band: row?.referrers_count_band ?? null,
  }
}
