import type { Question } from './questions'

/**
 * #2024.10 / #2025.1 — ce que chaque réponse Temps-1 CHANGE pour la suite, à
 * afficher à côté de la question. Jamais une promesse de résultat, jamais un
 * pourcentage, jamais une probabilité (doctrine `c26_probabilite`) : ce que
 * {{brand}}/{{copilot}} fait RÉELLEMENT de cette réponse — vérifié contre
 * `esnAnswersToProfileData` (`packages/contracts/src/schemas/analysis.ts`) et
 * le constructeur de prompt IA (`apps/ia/app/models/profile_context.py`).
 *
 * Vit ICI plutôt que sur `Question` (`lib/questions/*.ts`) pour ne pas rouvrir
 * les fichiers de sous-étape que sept autres lots touchent déjà en parallèle
 * (brief du lot L6, 15/09/2026) — un lookup séparé, indexé par la même clé que
 * `question.key`, jamais un champ ajouté au contrat `EsnAnswers`.
 *
 * `impact` sur `ComplementQuestion` (Temps-2, `complement-questions.ts`) est le
 * précédent déjà posé pour le complément de profil ; ce lookup en est le
 * pendant pour les questions Temps-1. Garde de non-orphelinage et de complétude
 * FR+EN : `question-consequences.test.ts`.
 */
export const QUESTION_CONSEQUENCE_KEY: Partial<Record<Question['key'], string>> = {
  esn_name: 'consequence.esnName',
  consultant_size: 'consequence.consultantSize',
  sales_team_size: 'consequence.salesTeamSize',
  expertise_areas: 'consequence.expertiseAreas',
  target_sectors: 'consequence.targetSectors',
  geo_zones: 'consequence.geoZones',
  remote_and_travel_scope: 'consequence.remoteAndTravelScope',
  zone_capability_status: 'consequence.zoneCapabilityStatus',
  main_sales_pain: 'consequence.mainSalesPain',
  // Théo O onboarding-couverture (22/10) — les 26 clés neuves de la V23.
  activity_nature: 'consequence.activityNature',
  data_sources: 'consequence.dataSources',
  tools: 'consequence.tools',
  workflow_pain: 'consequence.workflowPain',
  delivery_frictions: 'consequence.deliveryFrictions',
  first_name: 'consequence.firstName',
  scope_level: 'consequence.scopeLevel',
  scope_unit: 'consequence.scopeUnit',
  autonomy: 'consequence.autonomy',
  context_policy: 'consequence.contextPolicy',
  offer_pitch: 'consequence.offerPitch',
  language_capabilities: 'consequence.languageCapabilities',
  priority_expertise: 'consequence.priorityExpertise',
  skill_technos: 'consequence.skillTechnos',
  bench_status: 'consequence.benchStatus',
  recruiting_priorities: 'consequence.recruitingPriorities',
  commercial_limits: 'consequence.commercialLimits',
  currency: 'consequence.currency',
  target_nature: 'consequence.targetNature',
  target_size: 'consequence.targetSize',
  country_scope: 'consequence.countryScope',
  geography_detail: 'consequence.geographyDetail',
  no_go: 'consequence.noGo',
  account_access: 'consequence.accountAccess',
  horizon: 'consequence.horizon',
  success_target: 'consequence.successTarget',
  positioning: 'consequence.positioning',
  target_company_types: 'consequence.targetCompanyTypes',
  staffing_model: 'consequence.staffingModel',
  offer_domains: 'consequence.offerDomains',
  recruits_for_clients: 'consequence.recruitsForClients',
  // #4270.1 (18/10) — le profil d'espace « forfait / conseil ».
  workspace_profile: 'consequence.workspaceProfile',
  // #2034 / #2035 — maturité, santé d'activité, effectif réel. La garde de
  // non-orphelinage exige une ligne par question Temps-1 : sept questions
  // ajoutées, sept conséquences, sinon la question serait posée sans dire ce
  // qu'elle change.
  //
  // ⚠️ Ce que ces sept lignes peuvent promettre N'EST PAS le même, et les
  // textes le reflètent — vérifié le 15/09/2026 :
  //  - `available_consultants_band` est le SEUL des sept qui atteigne le
  //    modèle : `esnAnswersToProfileData` le projette en
  //    `availableConsultantsBand` (`analysis.ts:704-705`), que
  //    `sales_context.py::_bench_band` (l. 178-192) normalise en
  //    `capacity.benchAvailable` (l. 233) du contexte de vente. Son texte peut
  //    donc nommer {{copilot}}.
  //  - les six autres ENTRENT désormais dans le profil ESN canonique — le
  //    mapping manquait, il est posé : `esnAnswersToProfileData`
  //    (`analysis.ts`) et son miroir Python `esn_row_to_profile_data`
  //    (`seller_context.py`) les traduisent. Le seul prompt qui les LIT
  //    aujourd'hui est celui de l'analyse d'appel d'offres, qui sérialise tout
  //    le profil (`bellum_rfp.py::build_analysis_user_prompt`, appelé par
  //    `apps/api/src/modules/rfp/rfp.service.ts:102`).
  //
  //    ⚠️ Les autres prompts énumèrent leurs clés UNE PAR UNE — profiler
  //    (`_COMPLEMENT_SECTIONS`), Découvrir (`_PROFILE_FIELDS`), Laura (le bloc
  //    « le commercial à qui tu parles ») — et ne les voient donc pas encore.
  //    Tant que ces trois listes ne les nomment pas, les textes ci-dessous
  //    restent MODESTES (« situe », « note », « enregistre ») : ils disent ce
  //    que le code tient, jamais qu'ils orientent l'analyse d'un compte. Un
  //    texte qui promet plus que le code est pire qu'un texte modeste.
  esn_maturity_situation: 'consequence.esnMaturitySituation',
  company_growth_goal: 'consequence.companyGrowthGoal',
  active_clients_band: 'consequence.activeClientsBand',
  revenue_recurrence: 'consequence.revenueRecurrence',
  client_concentration_risk: 'consequence.clientConcentrationRisk',
  consultants_managed_by_user_band: 'consequence.consultantsManagedByUserBand',
  available_consultants_band: 'consequence.availableConsultantsBand',
  // #2035.1 / #2035.2 — de quelle population le chiffre parle.
  consultant_size_group_band: 'consequence.consultantSizeGroupBand',
  consultant_size_business_unit_band: 'consequence.consultantSizeBusinessUnitBand',
  // #2048 / #2049 — canaux d'entrée et unités comparables (lot L19). Même
  // exigence que ci-dessus : une question Temps-1 sans conséquence serait posée
  // sans dire ce qu'elle change.
  //
  // ⚠️ Ce que ces six lignes promettent est BORNÉ, et les textes le disent.
  // Les six colonnes sont ENREGISTRÉES et relues (migration
  // `1794020000000-CanauxEntreeMesures.ts`, projetées par `mapRowToAnswers`),
  // mais aucune n'entre aujourd'hui dans un dossier : rien dans
  // `esnAnswersToProfileData`, rien dans les prompts. Les textes disent donc
  // « note », « enregistre », « situe » — jamais qu'ils orientent une analyse.
  // ⚠️ Et aucun ne promet un TAUX : sans dénominateur fiable il n'y en a pas
  // (#2049.14), et ce qui n'est pas mesuré s'écrit « non mesuré », jamais 0.
  entry_channels_used: 'consequence.entryChannelsUsed',
  // #2048.13 — la période par canal.
  entry_channels_period: 'consequence.entryChannelsPeriod',
  entry_channels_measured: 'consequence.entryChannelsMeasured',
  entry_channels_last_starts: 'consequence.entryChannelsLastStarts',
  entry_channels_time_split: 'consequence.entryChannelsTimeSplit',
  activity_measures_tracked: 'consequence.activityMeasuresTracked',
  activity_reference_period: 'consequence.activityReferencePeriod',
  // #2050 / #2051 — lot L19 : capacité réelle et continuité des dossiers. La
  // garde de non-orphelinage exige une ligne par question Temps-1 ; neuf
  // questions ajoutées, neuf conséquences.
  //
  // ⚠️ Les neuf sont ENREGISTRÉES et relues — colonnes `esn_profiles`
  // (migration `1794023117482-TempsReelEtRoutines.ts`), projetées par
  // `mapRowToAnswers` (`esn-answers.mapper.ts`) — et, depuis le 16/09/2026,
  // QUATRE d'entre elles entrent dans l'AUDIT : `weekly_sales_time_declared` /
  // `_protected` (#2050.14, le nombre de fronts tenables),
  // `protected_slot_capacity` et `workload_variability` (ce qui érode ce temps),
  // `dossier_continuity_breaks` / `_practices` (#2051.16, la routine qui
  // tiendrait la rupture) — via `buildAuditDeclaredSignals`
  // (`packages/contracts/.../commercial-audit-signals.ts`), rendu par
  // `AuditDeclaredSignals.tsx`. Rien dans `esnAnswersToProfileData` ni dans les
  // prompts pour autant : les textes ci-dessous continuent de dire « note » et
  // « enregistre », jamais qu'ils orientent une ANALYSE de compte.
  weekly_sales_time_declared: 'consequence.weeklySalesTimeDeclared',
  weekly_sales_time_protected: 'consequence.weeklySalesTimeProtected',
  weekly_sales_time_residual: 'consequence.weeklySalesTimeResidual',
  competing_workloads: 'consequence.competingWorkloads',
  workload_variability: 'consequence.workloadVariability',
  weekly_sales_time_slots: 'consequence.weeklySalesTimeSlots',
  protected_slot_capacity: 'consequence.protectedSlotCapacity',
  dossier_continuity_practices: 'consequence.dossierContinuityPractices',
  dossier_continuity_breaks: 'consequence.dossierContinuityBreaks',
  // #2054 / #2055 — cartographie de l'outillage et freins commerciaux (lot G4).
  // La garde de non-orphelinage exige une ligne par question Temps-1 : vingt-deux
  // questions ajoutées, vingt-deux conséquences.
  //
  // ⚠️ Ce que ces vingt-deux lignes peuvent promettre est BORNÉ, et les textes le
  // disent — vérifié le 15/09/2026 : aucune de ces colonnes n'entre aujourd'hui
  // dans un dossier. Rien dans `esnAnswersToProfileData` (`analysis.ts`), rien
  // dans `_COMPLEMENT_SECTIONS` (`apps/ia/app/prompts/bellum_profiler.py`). Elles
  // sont ENREGISTRÉES (colonnes `esn_profiles`, migrations 1794024402918 et
  // 1794024403057) et RELUES (`mapRowToAnswers`, `esn-answers.mapper.ts`) — c'est
  // exactement ce que les textes annoncent (« note », « enregistre », « désigne »),
  // jamais qu'elles orientent une analyse. Brancher l'audit dessus est un lot à
  // part (il touche `ia.client.ts`, `profiler.py` et les empreintes de prompt).
  tooling_crm: 'consequence.toolingCrm',
  tooling_ats: 'consequence.toolingAts',
  tooling_erp: 'consequence.toolingErp',
  tooling_mailbox: 'consequence.toolingMailbox',
  tooling_calendar: 'consequence.toolingCalendar',
  tooling_drive: 'consequence.toolingDrive',
  tooling_internal_names: 'consequence.toolingInternalNames',
  tooling_spreadsheet: 'consequence.toolingSpreadsheet',
  tooling_enrichment: 'consequence.toolingEnrichment',
  tooling_sourcing_platform: 'consequence.toolingSourcingPlatform',
  tooling_bi: 'consequence.toolingBi',
  tooling_personal_notes: 'consequence.toolingPersonalNotes',
  tooling_reference: 'consequence.toolingReference',
  tooling_reference_data: 'consequence.toolingReferenceData',
  tooling_reference_freshness: 'consequence.toolingReferenceFreshness',
  tooling_reference_confidence: 'consequence.toolingReferenceConfidence',
  tooling_reference_export: 'consequence.toolingReferenceExport',
  tooling_duplicates: 'consequence.toolingDuplicates',
  tooling_pain: 'consequence.toolingPain',
  sales_freins: 'consequence.salesFreins',
  frein_attempted: 'consequence.freinAttempted',
  frein_stopped: 'consequence.freinStopped',
  frein_stopped_reason: 'consequence.freinStoppedReason',
  // #2042 / #2043 / #2044 — client idéal, interlocuteurs, chemins d'accès (lot
  // L17). Même honnêteté que les sept lignes ci-dessus : ENREGISTRÉES et
  // relues au round-trip (colonnes `esn_profiles`, `mapRowToAnswers`), mais
  // AUCUN appelant ne les fait encore entrer dans un prompt — le brancher est
  // un lot à part, hors périmètre fichiers de celui-ci. Les textes disent donc
  // ce qui est vrai (« situe », « note », « distingue »), jamais qu'elles
  // orientent une analyse.
  ideal_client_size: 'consequence.idealClientSize',
  ideal_client_structure: 'consequence.idealClientStructure',
  ideal_client_maturity: 'consequence.idealClientMaturity',
  ideal_client_territory: 'consequence.idealClientTerritory',
  ideal_client_accessibility: 'consequence.idealClientAccessibility',
  ideal_client_max_sales_cycle: 'consequence.idealClientMaxSalesCycle',
  ideal_client_min_deal_size: 'consequence.idealClientMinDealSize',
  ideal_client_referencement_constraints: 'consequence.idealClientReferencementConstraints',
  ideal_client_current_state: 'consequence.idealClientCurrentState',
  real_response_level: 'consequence.realResponseLevel',
  budget_validator: 'consequence.budgetValidator',
  access_orienteur: 'consequence.accessOrienteur',
  entry_channels_dependency: 'consequence.entryChannelsDependency',
  entry_channels_prerequisites: 'consequence.entryChannelsPrerequisites',
  entry_channels_saturation: 'consequence.entryChannelsSaturation',
  // Lot 26 (#2038, #2039, #2040, #2041) — neuf champs neufs, wiring vérifié
  // le 15/09/2026 : les neuf atteignent `AnalysisProfileData`
  // (`esnAnswersToProfileData`, `analysis.ts`) et donc le dossier — leurs
  // textes peuvent nommer {{copilot}}. La lecture FINE du texte de prompt IA
  // (`profile_context.py`) reste hors de ce lot (voir le rapport) : les
  // textes ci-dessous disent ce qui est VRAI aujourd'hui, jamais plus.
  service_types: 'consequence.serviceTypes',
  service_types_proven: 'consequence.serviceTypesProven',
  service_types_desired: 'consequence.serviceTypesDesired',
  reference_sectors: 'consequence.referenceSectors',
  // #2041.1 — ce que le NIVEAU change : la priorité déclarée trie, elle
  // n'ajoute pas un secteur de plus.
  priority_sectors: 'consequence.prioritySectors',
  case_study_results: 'consequence.caseStudyResults',
  client_testimonials: 'consequence.clientTestimonials',
  // #2961 (#2302.28) — même traitement que `case_study_results` ci-dessus.
  reference_accounts: 'consequence.referenceAccounts',
  // #2039.6 (épopée #2880) — projetée en `profile_data.expertiseWithoutConcreteProof`
  // (analysis.ts), sans consommateur prompt vérifié pour l'instant (`onboarding-
  // question-consumers.ts`, `areas: []`) — la conséquence le dit honnêtement.
  expertise_no_concrete_proof: 'consequence.expertiseNoConcreteProof',
  // #2039.2 (épopée #2880) — même règle honnête que sa voisine ci-dessus :
  // projetée en `profile_data.expertiseWithClientReference` (analysis.ts),
  // sans consommateur prompt vérifié pour l'instant.
  expertise_client_reference: 'consequence.expertiseClientReference',
  // #2039.3/.4/.5 (épopée #2880, vague G lot g10) — même règle honnête que
  // leurs voisines ci-dessus : projetées en `profile_data`, sans consommateur
  // prompt vérifié pour l'instant.
  expertise_personal_experience: 'consequence.expertisePersonalExperience',
  expertise_partner: 'consequence.expertisePartner',
  expertise_talent_pool: 'consequence.expertiseTalentPool',
  staffing_modes: 'consequence.staffingModes',
  profile_validation_methods: 'consequence.profileValidationMethods',
  contractual_constraints: 'consequence.contractualConstraints',
  // #2018.2 / #2018.4 — rôle, ancienneté, objectifs : les cinq clés du bloc
  // « La personne qui répond » de `bellum_profiler.py:142`, déjà lues par le
  // profileur. `user_role` et `individual_goal` vont plus loin :
  // `esnAnswersToProfileData` (`analysis.ts:733-739`) les projette en
  // `sellerRole`/`sellerGoal`, qui calibrent le ton et le niveau d'explication
  // des messages — leurs textes peuvent le dire. `role_tenure` et
  // `industry_tenure` n'ont AUCUNE projection connue au-delà du bloc brut du
  // profileur : leurs textes restent modestes (« transmis avec ton profil »),
  // jamais qu'ils orientent quoi que ce soit.
  user_role: 'consequence.userRole',
  role_tenure: 'consequence.roleTenure',
  industry_tenure: 'consequence.industryTenure',
  individual_goal: 'consequence.individualGoal',
  monthly_target: 'consequence.monthlyTarget',
  // #2018.3 — le portefeuille, second point d'entrée de la MÊME question que
  // le profil progressif (`role.ts`) : la charge recommandée en tient
  // compte, comme `analysis.ts:872-873` (`portfolioSize`) le projette déjà.
  portfolio_size: 'consequence.portfolioSize',
  // #2046 — le vivier de consultants déclaré. Les quatorze champs atteignent
  // `bellum_profiler.py` (section « Vivier de consultants déclaré »,
  // `_COMPLEMENT_SECTIONS`) : leurs textes peuvent dire qu'ils configurent
  // l'analyse, pas seulement qu'ils sont enregistrés.
  talent_pool_identified_band: 'consequence.talentPoolIdentifiedBand',
  talent_pool_qualified_band: 'consequence.talentPoolQualifiedBand',
  talent_pool_available_band: 'consequence.talentPoolAvailableBand',
  talent_pool_availability_recency_band: 'consequence.talentPoolAvailabilityRecencyBand',
  talent_pool_avg_tjm_band: 'consequence.talentPoolAvgTjmBand',
  talent_pool_mobility_band: 'consequence.talentPoolMobilityBand',
  talent_pool_consent_status: 'consequence.talentPoolConsentStatus',
  talent_pool_other_processes_band: 'consequence.talentPoolOtherProcessesBand',
  talent_pool_engagement_reality_band: 'consequence.talentPoolEngagementRealityBand',
  talent_pool_revalidation_frequency: 'consequence.talentPoolRevalidationFrequency',
  talent_pool_state_interested_band: 'consequence.talentPoolStateInterestedBand',
  talent_pool_state_available_band: 'consequence.talentPoolStateAvailableBand',
  talent_pool_state_secured_band: 'consequence.talentPoolStateSecuredBand',
  talent_pool_state_presentable_band: 'consequence.talentPoolStatePresentableBand',
  // #2047 — la base de clients déclarée, même section de prompt.
  client_base_missions_ongoing_band: 'consequence.clientBaseMissionsOngoingBand',
  client_base_missions_completed_band: 'consequence.clientBaseMissionsCompletedBand',
  client_base_renewals_band: 'consequence.clientBaseRenewalsBand',
  client_base_satisfaction_band: 'consequence.clientBaseSatisfactionBand',
  client_base_referrals_band: 'consequence.clientBaseReferralsBand',
  client_base_rex_band: 'consequence.clientBaseRexBand',
  client_base_case_studies_band: 'consequence.clientBaseCaseStudiesBand',
  client_base_cross_sell_band: 'consequence.clientBaseCrossSellBand',
  client_base_deadlines_band: 'consequence.clientBaseDeadlinesBand',
  client_base_followup_regularity: 'consequence.clientBaseFollowupRegularity',
  client_base_followup_owner: 'consequence.clientBaseFollowupOwner',
  // #2059 — attribution marketing, ferme le stage `target_market`. Texte
  // délibérément NÉGATIF (« sert uniquement à… », « n'entre jamais dans… ») :
  // c'est la doctrine #2059.9/.10 elle-même qui est la conséquence la plus
  // honnête à afficher, à l'exact inverse du ton « oriente », « calibre » des
  // autres lignes de ce fichier.
  heard_about_bellum: 'consequence.heardAboutBellum',
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée, lue par
  // la couche entreprise du profil à trois couches.
  company_locations: 'consequence.companyLocations',
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — le nombre RÉEL de
  // consultants et le chiffre d'affaires annuel (avec sa période). Les trois
  // atteignent `_COMPLEMENT_SECTIONS` (`bellum_profiler.py`, sections
  // « L'entreprise et sa capacité » / « Économie des affaires ») : leurs
  // textes peuvent dire qu'ils configurent l'analyse, comme les champs du
  // vivier de consultants ci-dessus — pas seulement qu'ils sont enregistrés.
  consultant_count: 'consequence.consultantCount',
  annual_revenue_amount: 'consequence.annualRevenueAmount',
  annual_revenue_period: 'consequence.annualRevenuePeriod',
  // #2060 — la question ouverte qui FERME le parcours. Lue verbatim par le
  // prompt (#2060.10 : jamais découpée en plusieurs faits).
  uncovered_activity_note: 'consequence.uncoveredActivityNote',
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ. Texte délibérément NÉGATIF sur les quatre échelles, même
  // logique que `heard_about_bellum` juste au-dessus : la conséquence la
  // plus honnête à afficher est ce que cette réponse NE FAIT PAS (élargir ou
  // restreindre un droit), avant ce qu'elle fait (cadrer une proposition).
  decisions_alone: 'consequence.decisionsAlone',
  decisions_to_validate: 'consequence.decisionsToValidate',
  people_managed: 'consequence.peopleManaged',
  recruitment_accounts_authority: 'consequence.recruitmentAccountsAuthority',
  staffing_authority: 'consequence.staffingAuthority',
  margin_billing_authority: 'consequence.marginBillingAuthority',
  tools_access: 'consequence.toolsAccess',
  invite_authority: 'consequence.inviteAuthority',
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
  // du commercial.
  associates_count: 'consequence.associatesCount',
  recruiters_team_size: 'consequence.recruitersTeamSize',
  delivery_team_size: 'consequence.deliveryTeamSize',
  marketing_team_size: 'consequence.marketingTeamSize',
  ops_team_size: 'consequence.opsTeamSize',
  team_coordination_mode: 'consequence.teamCoordinationMode',
  // #2058.2 / #2058.10 — deux réponses qui décrivent LA PERSONNE
  // (`seller_context.py:88-92`, miroir de `PROFILE_PERSONAL_ANSWER_KEYS`) et qui
  // atteignent le prompt sous « Préférences de sollicitation et de réponse »
  // (`bellum_profiler.py:252-258`). Le texte dit CE QUE ÇA CHANGE, et s'arrête là :
  // une fenêtre de sollicitation est une préférence, jamais un envoi programmé.
  contact_windows: 'consequence.contactWindows',
  detail_level: 'consequence.detailLevel',
  // #2640.2 — le site de l'entreprise, additif à `entreprise.ts` comme
  // `consultant_count` plus haut : lu par `_COMPLEMENT_SECTIONS` du profiler
  // (« L'entreprise et sa capacité »).
  esn_website: 'consequence.esnWebsite',
  // #2045.1/.2/.4/.6/.7 (lot B, 22/09/2026) — le réseau personnel déclaré
  // pour quatre portes de `canaux.ts`, plus les relations chaudes
  // transversales. Les cinq champs atteignent `bellum_profiler.py` (section
  // « Réseau personnel déclaré — #2045 », `_COMPLEMENT_SECTIONS`), rendu
  // seulement si répondu.
  former_clients_count_band: 'consequence.formerClientsCountBand',
  former_colleagues_count_band: 'consequence.formerColleaguesCountBand',
  partners_count_band: 'consequence.partnersCountBand',
  referrers_count_band: 'consequence.referrersCountBand',
  warm_relations_count_band: 'consequence.warmRelationsCountBand',
}
