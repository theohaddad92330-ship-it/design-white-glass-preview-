/**
 * L'ONBOARDING V23 DE THÉO — LE CATALOGUE EN DONNÉES (lot r22-ecran-o3, 22/10/2026).
 *
 * Décision de Louis (22/10) : la V23 de Théo est LA référence. Ce fichier porte sa structure — 16 thèmes, 94 groupes
 * (les 92 de Théo + 2 réintégrés), le parcours guidé, les cinq blocs essentiels — sous forme de données pures, pour que
 * les écrans (lots o1 / o2) et l'API la lisent à UN seul endroit (GA-26). Source : `docs/maquettes/theo-v22/_appliquees/o/
 * onboarding-couverture.md`.
 *
 * ⚠️ Rien de notre catalogue n'y disparaît : `workspace_profile` (#4270.1, elle règle la navigation de l'espace) rejoint
 * le parcours guidé à l'étape « Ton offre », et `placed_roles` (elle alimente « Pourquoi maintenant ») a son groupe dans
 * le thème Capacité de staffing. Le parcours guidé de Théo compte 32 questions ; il en compte donc 33 ici.
 *
 * ⚠️ Les clés RENOMMÉES par la V23 ne changent PAS de clé — seul leur libellé est reformulé. Les réponses déjà données
 * restent donc sous la même clé, donc relues telles quelles : la correspondance est l'identité, écrite et gardée par le
 * test (`V23_RENAMED_KEYS`).
 */

type OnboardingThemeV23 = { id: string; title: string; description: string; groups: readonly string[] }

type OnboardingGroupV23 = { id: string; title: string; theme: string; keys: readonly string[] }

type OnboardingGuidedStepV23 = {
  id: string
  title: string
  hint: string
  themes: readonly string[]
  keys: readonly string[]
}

type OnboardingEssentialBlockV23 = { id: string; title: string; keys: readonly string[] }

export const ONBOARDING_THEMES_V23: readonly OnboardingThemeV23[] = [
  {
    id: 'organisation',
    title: 'Ton entreprise',
    description: 'Situer la structure sans confondre groupe, agence et équipe.',
    groups: [
      'entreprise',
      'equipe-commerciale',
      'maturite',
      'sante-activite',
      'effectif-reel',
      'implantation',
      'chiffre-affaires',
      'organisation-precision-1',
      'organisation-v23',
    ],
  },
  {
    id: 'role',
    title: 'Ton rôle et ton équipe',
    description: 'Adapter le conseil à ton travail, sans modifier tes droits.',
    groups: [
      'role',
      'anciennete',
      'decisions-autorite',
      'equipe-managee',
      'responsabilites-autorite',
      'outils-invitation',
      'qui-fait-quoi-1',
      'qui-fait-quoi-2',
      'role-precision-1',
      'role-v23',
    ],
  },
  {
    id: 'objectifs',
    title: 'Objectifs et difficultés',
    description: 'Choisir le résultat qui mérite ton temps et le frein à lever.',
    groups: ['objectifs', 'frein', 'freins', 'question-ouverte', 'objectifs-precision-1', 'objectifs-v23'],
  },
  {
    id: 'offre',
    title: 'Offre et expertises',
    description: 'Séparer ce que tu délivres déjà de ce que tu veux développer.',
    groups: [
      'domaine-offre',
      'domaines',
      'positionnement',
      'offre-prestations',
      'offre-prestations-etats',
      'offre-v23',
      'offre-profil-espace',
    ],
  },
  {
    id: 'staffing',
    title: 'Capacité de staffing',
    description: 'Calibrer la réponse aux besoins et les prochains démarrages.',
    groups: [
      'recrutement',
      'staffing-modes',
      'staffing-cadre',
      'staffing-precision-1',
      'staffing-v23',
      'staffing-metiers-places',
    ],
  },
  {
    id: 'preuves',
    title: 'Références et économie',
    description: 'Construire une approche crédible et connaître tes contraintes économiques.',
    groups: [
      'credibilite-preuves-1',
      'credibilite-preuves-2',
      'preuves-precision-1',
      'preuves-precision-2',
      'preuves-v23',
    ],
  },
  {
    id: 'territoires',
    title: 'Marchés et territoires',
    description: 'Différencier implantation, mobilité, ambitions et exclusions.',
    groups: ['secteurs', 'cibles', 'territoires-precision-1', 'territoires-v23'],
  },
  {
    id: 'clients-cibles',
    title: 'Clients et décideurs',
    description: 'Cibler un périmètre accessible plutôt qu’un titre prestigieux.',
    groups: [
      'client-ideal-1',
      'client-ideal-2',
      'client-ideal-3',
      'interlocuteurs',
      'clients-cibles-precision-1',
      'clients-cibles-v23',
    ],
  },
  {
    id: 'acces',
    title: 'Réseau et voies d’accès',
    description: 'Distinguer relation réelle, prospection directe et partenariat à qualifier.',
    groups: [
      'canaux-1',
      'canaux-2',
      'chemins-acces',
      'reseau-comptage-1',
      'reseau-comptage-2',
      'acces-precision-1',
      'acces-v23',
    ],
  },
  {
    id: 'routine',
    title: 'Temps et méthode',
    description: 'Faire tenir le plan dans ta semaine réelle.',
    groups: ['temps', 'temps-charge', 'routines', 'mesures', 'routine-precision-1'],
  },
  {
    id: 'vivier',
    title: 'Ton vivier',
    description: 'Séparer profils identifiés, qualifiés, disponibles et présentables.',
    groups: ['vivier-comptage-1', 'vivier-comptage-2', 'vivier-collecte-1', 'vivier-collecte-2', 'vivier-etats'],
  },
  {
    id: 'portefeuille',
    title: 'Clients et missions',
    description: 'Capitaliser sur les relations, les retours et les renouvellements.',
    groups: [
      'base-clients-activite-1',
      'base-clients-activite-2',
      'base-clients-capitalisation',
      'base-clients-suivi',
      'portefeuille-precision-1',
      'portefeuille-v23',
    ],
  },
  {
    id: 'outils',
    title: 'Outils et données',
    description: 'Comprendre ce qui existe avant de proposer une connexion.',
    groups: [
      'outillage-1',
      'outillage-2',
      'outillage-annexe-1',
      'outillage-annexe-2',
      'outillage-qualite-1',
      'outillage-qualite-2',
      'outils-precision-1',
      'outils-v23',
    ],
  },
  {
    id: 'consultations',
    title: 'Secteurs réglementés et appels d’offres',
    description: 'Adapter la démarche aux prérequis d’accès et au coût de réponse.',
    groups: [
      'consultations-precision-1',
      'consultations-precision-2',
      'consultations-precision-3',
      'consultations-precision-4',
    ],
  },
  {
    id: 'visibilite',
    title: 'Contenu et visibilité',
    description: 'Distinguer audience, conversations et véritables opportunités.',
    groups: ['visibilite-precision-1', 'visibilite-precision-2'],
  },
  {
    id: 'preferences',
    title: 'Travailler avec Laura',
    description: 'Choisir le niveau de détail, les sollicitations et les limites.',
    groups: ['preferences-echanges', 'attribution', 'preferences-precision-1', 'preferences-v23'],
  },
]

export const ONBOARDING_GROUPS_V23: readonly OnboardingGroupV23[] = [
  {
    id: 'entreprise',
    title: 'Identité et taille',
    theme: 'organisation',
    keys: ['esn_name', 'consultant_size', 'consultant_count', 'esn_website'],
  },
  { id: 'equipe-commerciale', title: 'Équipe commerciale', theme: 'organisation', keys: ['sales_team_size'] },
  {
    id: 'maturite',
    title: 'Moment de l’entreprise',
    theme: 'organisation',
    keys: ['esn_maturity_situation', 'company_growth_goal'],
  },
  {
    id: 'sante-activite',
    title: 'Activité réelle',
    theme: 'organisation',
    keys: ['active_clients_band', 'revenue_recurrence', 'client_concentration_risk'],
  },
  {
    id: 'effectif-reel',
    title: 'Périmètres d’effectif',
    theme: 'organisation',
    keys: [
      'consultants_managed_by_user_band',
      'available_consultants_band',
      'consultant_size_group_band',
      'consultant_size_business_unit_band',
    ],
  },
  { id: 'implantation', title: 'Implantations', theme: 'organisation', keys: ['company_locations'] },
  {
    id: 'chiffre-affaires',
    title: 'Chiffre d’affaires et période',
    theme: 'organisation',
    keys: ['annual_revenue_amount', 'annual_revenue_period'],
  },
  {
    id: 'organisation-precision-1',
    title: 'Compléments',
    theme: 'organisation',
    keys: ['company_age', 'company_size', 'company_group_structure'],
  },
  { id: 'role', title: 'Rôle et portefeuille', theme: 'role', keys: ['user_role', 'portfolio_size'] },
  { id: 'anciennete', title: 'Expérience professionnelle', theme: 'role', keys: ['role_tenure', 'industry_tenure'] },
  {
    id: 'decisions-autorite',
    title: 'Décisions et validations',
    theme: 'role',
    keys: ['decisions_alone', 'decisions_to_validate'],
  },
  { id: 'equipe-managee', title: 'Équipe suivie', theme: 'role', keys: ['people_managed'] },
  {
    id: 'responsabilites-autorite',
    title: 'Responsabilités réelles',
    theme: 'role',
    keys: ['recruitment_accounts_authority', 'staffing_authority', 'margin_billing_authority'],
  },
  { id: 'outils-invitation', title: 'Accès et invitations', theme: 'role', keys: ['tools_access', 'invite_authority'] },
  {
    id: 'qui-fait-quoi-1',
    title: 'Répartition du travail · 1',
    theme: 'role',
    keys: ['associates_count', 'recruiters_team_size', 'delivery_team_size', 'marketing_team_size'],
  },
  {
    id: 'qui-fait-quoi-2',
    title: 'Répartition du travail · 2',
    theme: 'role',
    keys: ['ops_team_size', 'team_coordination_mode'],
  },
  { id: 'role-precision-1', title: 'Compléments', theme: 'role', keys: ['role_functions_practiced', 'team_overlap'] },
  {
    id: 'objectifs',
    title: 'Ton objectif prioritaire',
    theme: 'objectifs',
    keys: ['individual_goal', 'monthly_target'],
  },
  { id: 'frein', title: 'Le point qui bloque', theme: 'objectifs', keys: ['main_sales_pain'] },
  {
    id: 'freins',
    title: 'Ce que tu as déjà essayé',
    theme: 'objectifs',
    keys: ['sales_freins', 'frein_attempted', 'frein_stopped', 'frein_stopped_reason'],
  },
  {
    id: 'question-ouverte',
    title: 'Ce qu’il faut encore comprendre',
    theme: 'objectifs',
    keys: ['uncovered_activity_note'],
  },
  { id: 'objectifs-precision-1', title: 'Compléments', theme: 'objectifs', keys: ['sales_blockers'] },
  { id: 'domaine-offre', title: 'Domaines de prestation', theme: 'offre', keys: ['offer_domains'] },
  { id: 'domaines', title: 'Expertises mobilisables', theme: 'offre', keys: ['expertise_areas'] },
  { id: 'positionnement', title: 'Positionnement et modèle', theme: 'offre', keys: ['positioning', 'staffing_model'] },
  { id: 'offre-prestations', title: 'Nature des prestations', theme: 'offre', keys: ['service_types'] },
  {
    id: 'offre-prestations-etats',
    title: 'Offre livrée et offre à développer',
    theme: 'offre',
    keys: ['service_types_proven', 'service_types_desired'],
  },
  { id: 'recrutement', title: 'Recrutement pour les clients', theme: 'staffing', keys: ['recruits_for_clients'] },
  { id: 'staffing-modes', title: 'Modes de réponse', theme: 'staffing', keys: ['staffing_modes'] },
  {
    id: 'staffing-cadre',
    title: 'Validation des profils et cadre contractuel',
    theme: 'staffing',
    keys: ['profile_validation_methods', 'contractual_constraints'],
  },
  {
    id: 'staffing-precision-1',
    title: 'Compléments',
    theme: 'staffing',
    keys: ['ramp_up_capacity', 'consultants_on_mission', 'consultants_in_pipe'],
  },
  {
    id: 'credibilite-preuves-1',
    title: 'Ce qui rend ton offre crédible · 1',
    theme: 'preuves',
    keys: ['case_study_results', 'client_testimonials', 'reference_accounts', 'expertise_no_concrete_proof'],
  },
  {
    id: 'credibilite-preuves-2',
    title: 'Ce qui rend ton offre crédible · 2',
    theme: 'preuves',
    keys: ['expertise_client_reference', 'expertise_personal_experience', 'expertise_partner', 'expertise_talent_pool'],
  },
  {
    id: 'preuves-precision-1',
    title: 'Compléments · 1',
    theme: 'preuves',
    keys: ['client_references', 'avg_tjm', 'avg_deal_size', 'target_margin'],
  },
  { id: 'preuves-precision-2', title: 'Compléments · 2', theme: 'preuves', keys: ['intercontrat_cost'] },
  {
    id: 'secteurs',
    title: 'Secteurs cibles et références',
    theme: 'territoires',
    keys: ['target_sectors', 'priority_sectors', 'reference_sectors'],
  },
  {
    id: 'cibles',
    title: 'Types d’entreprises et géographie',
    theme: 'territoires',
    keys: ['target_company_types', 'geo_zones', 'remote_and_travel_scope', 'zone_capability_status'],
  },
  {
    id: 'territoires-precision-1',
    title: 'Compléments',
    theme: 'territoires',
    keys: ['growth_target_zones', 'no_go_sectors'],
  },
  {
    id: 'client-ideal-1',
    title: 'Le client que tu veux travailler · 1',
    theme: 'clients-cibles',
    keys: ['ideal_client_size', 'ideal_client_structure', 'ideal_client_maturity', 'ideal_client_territory'],
  },
  {
    id: 'client-ideal-2',
    title: 'Le client que tu veux travailler · 2',
    theme: 'clients-cibles',
    keys: [
      'ideal_client_accessibility',
      'ideal_client_max_sales_cycle',
      'ideal_client_min_deal_size',
      'ideal_client_referencement_constraints',
    ],
  },
  {
    id: 'client-ideal-3',
    title: 'Le client que tu veux travailler · 3',
    theme: 'clients-cibles',
    keys: ['ideal_client_current_state'],
  },
  {
    id: 'interlocuteurs',
    title: 'Les bons interlocuteurs',
    theme: 'clients-cibles',
    keys: ['real_response_level', 'budget_validator', 'access_orienteur'],
  },
  {
    id: 'clients-cibles-precision-1',
    title: 'Compléments',
    theme: 'clients-cibles',
    keys: ['decision_maker_personas', 'avg_sales_cycle', 'accounts_relationship_status'],
  },
  {
    id: 'canaux-1',
    title: 'Canaux qui fonctionnent · 1',
    theme: 'acces',
    keys: ['entry_channels_used', 'entry_channels_period', 'entry_channels_measured', 'entry_channels_last_starts'],
  },
  { id: 'canaux-2', title: 'Canaux qui fonctionnent · 2', theme: 'acces', keys: ['entry_channels_time_split'] },
  {
    id: 'chemins-acces',
    title: 'Conditions d’accès',
    theme: 'acces',
    keys: ['entry_channels_dependency', 'entry_channels_prerequisites', 'entry_channels_saturation'],
  },
  {
    id: 'reseau-comptage-1',
    title: 'Réseau réellement mobilisable · 1',
    theme: 'acces',
    keys: ['former_clients_count_band', 'former_colleagues_count_band', 'partners_count_band', 'referrers_count_band'],
  },
  {
    id: 'reseau-comptage-2',
    title: 'Réseau réellement mobilisable · 2',
    theme: 'acces',
    keys: ['warm_relations_count_band'],
  },
  {
    id: 'acces-precision-1',
    title: 'Compléments',
    theme: 'acces',
    keys: ['go_to_market_channels', 'partner_relationship', 'partners_regular_count', 'partners_occasional_count'],
  },
  {
    id: 'temps',
    title: 'Temps commercial disponible',
    theme: 'routine',
    keys: ['weekly_sales_time_declared', 'weekly_sales_time_protected', 'weekly_sales_time_residual'],
  },
  {
    id: 'temps-charge',
    title: 'Charge et créneaux',
    theme: 'routine',
    keys: ['competing_workloads', 'workload_variability', 'weekly_sales_time_slots', 'protected_slot_capacity'],
  },
  {
    id: 'routines',
    title: 'Continuité des dossiers',
    theme: 'routine',
    keys: ['dossier_continuity_practices', 'dossier_continuity_breaks'],
  },
  {
    id: 'mesures',
    title: 'Mesures et période de référence',
    theme: 'routine',
    keys: ['activity_measures_tracked', 'activity_reference_period'],
  },
  {
    id: 'routine-precision-1',
    title: 'Compléments',
    theme: 'routine',
    keys: ['weekly_calls', 'weekly_emails', 'weekly_linkedin', 'sales_routine'],
  },
  {
    id: 'vivier-comptage-1',
    title: 'Connaître son vivier · 1',
    theme: 'vivier',
    keys: [
      'talent_pool_identified_band',
      'talent_pool_qualified_band',
      'talent_pool_available_band',
      'talent_pool_availability_recency_band',
    ],
  },
  { id: 'vivier-comptage-2', title: 'Connaître son vivier · 2', theme: 'vivier', keys: ['talent_pool_avg_tjm_band'] },
  {
    id: 'vivier-collecte-1',
    title: 'Actualité et mobilisation · 1',
    theme: 'vivier',
    keys: [
      'talent_pool_mobility_band',
      'talent_pool_consent_status',
      'talent_pool_other_processes_band',
      'talent_pool_engagement_reality_band',
    ],
  },
  {
    id: 'vivier-collecte-2',
    title: 'Actualité et mobilisation · 2',
    theme: 'vivier',
    keys: ['talent_pool_revalidation_frequency'],
  },
  {
    id: 'vivier-etats',
    title: 'États de qualification',
    theme: 'vivier',
    keys: [
      'talent_pool_state_interested_band',
      'talent_pool_state_available_band',
      'talent_pool_state_secured_band',
      'talent_pool_state_presentable_band',
    ],
  },
  {
    id: 'base-clients-activite-1',
    title: 'Missions et satisfaction · 1',
    theme: 'portefeuille',
    keys: [
      'client_base_missions_ongoing_band',
      'client_base_missions_completed_band',
      'client_base_renewals_band',
      'client_base_satisfaction_band',
    ],
  },
  {
    id: 'base-clients-activite-2',
    title: 'Missions et satisfaction · 2',
    theme: 'portefeuille',
    keys: ['client_base_referrals_band'],
  },
  {
    id: 'base-clients-capitalisation',
    title: 'Références et renouvellement',
    theme: 'portefeuille',
    keys: [
      'client_base_rex_band',
      'client_base_case_studies_band',
      'client_base_cross_sell_band',
      'client_base_deadlines_band',
    ],
  },
  {
    id: 'base-clients-suivi',
    title: 'Suivi des comptes',
    theme: 'portefeuille',
    keys: ['client_base_followup_regularity', 'client_base_followup_owner'],
  },
  {
    id: 'portefeuille-precision-1',
    title: 'Compléments',
    theme: 'portefeuille',
    keys: ['payment_delay_visibility', 'payment_delay_band'],
  },
  {
    id: 'outillage-1',
    title: 'Outils principaux · 1',
    theme: 'outils',
    keys: ['tooling_crm', 'tooling_ats', 'tooling_erp', 'tooling_mailbox'],
  },
  { id: 'outillage-2', title: 'Outils principaux · 2', theme: 'outils', keys: ['tooling_calendar', 'tooling_drive'] },
  {
    id: 'outillage-annexe-1',
    title: 'Outils complémentaires · 1',
    theme: 'outils',
    keys: ['tooling_spreadsheet', 'tooling_enrichment', 'tooling_sourcing_platform', 'tooling_bi'],
  },
  { id: 'outillage-annexe-2', title: 'Outils complémentaires · 2', theme: 'outils', keys: ['tooling_personal_notes'] },
  {
    id: 'outillage-qualite-1',
    title: 'Qualité et continuité des données · 1',
    theme: 'outils',
    keys: [
      'tooling_reference',
      'tooling_reference_data',
      'tooling_reference_freshness',
      'tooling_reference_confidence',
    ],
  },
  {
    id: 'outillage-qualite-2',
    title: 'Qualité et continuité des données · 2',
    theme: 'outils',
    keys: ['tooling_reference_export', 'tooling_duplicates', 'tooling_pain'],
  },
  { id: 'outils-precision-1', title: 'Compléments', theme: 'outils', keys: ['tooling'] },
  {
    id: 'consultations-precision-1',
    title: 'Secteurs réglementés et appels d’offres · 1',
    theme: 'consultations',
    keys: ['rfp_platforms_used', 'rfp_referencing_status', 'rfp_lot_allocation', 'rfp_response_templates'],
  },
  {
    id: 'consultations-precision-2',
    title: 'Secteurs réglementés et appels d’offres · 2',
    theme: 'consultations',
    keys: ['rfp_volume', 'rfp_volume_period', 'rfp_outcomes', 'rfp_go_no_go_process'],
  },
  {
    id: 'consultations-precision-3',
    title: 'Secteurs réglementés et appels d’offres · 3',
    theme: 'consultations',
    keys: ['rfp_document_readiness', 'rfp_deal_value', 'rfp_owner_assignment', 'public_sector_practice'],
  },
  {
    id: 'consultations-precision-4',
    title: 'Secteurs réglementés et appels d’offres · 4',
    theme: 'consultations',
    keys: ['regulated_sector_readiness'],
  },
  {
    id: 'visibilite-precision-1',
    title: 'Contenu et visibilité · 1',
    theme: 'visibilite',
    keys: ['content_active_profile', 'content_audience_size', 'content_visible_expertise', 'content_reactions'],
  },
  {
    id: 'visibilite-precision-2',
    title: 'Contenu et visibilité · 2',
    theme: 'visibilite',
    keys: ['content_conversations_generated', 'content_funnel_stages_reached'],
  },
  {
    id: 'preferences-echanges',
    title: 'Détail et rythme des échanges',
    theme: 'preferences',
    keys: ['contact_windows', 'detail_level'],
  },
  { id: 'attribution', title: 'Comment tu nous as trouvés', theme: 'preferences', keys: ['heard_about_bellum'] },
  {
    id: 'preferences-precision-1',
    title: 'Compléments',
    theme: 'preferences',
    keys: ['proactivity_level', 'shared_data_scope'],
  },
  { id: 'role-v23', title: 'Précisions de cadrage', theme: 'role', keys: ['first_name', 'scope_level', 'scope_unit'] },
  { id: 'organisation-v23', title: 'Précisions de cadrage', theme: 'organisation', keys: ['activity_nature'] },
  { id: 'objectifs-v23', title: 'Précisions de cadrage', theme: 'objectifs', keys: ['horizon', 'success_target'] },
  {
    id: 'offre-v23',
    title: 'Précisions de cadrage',
    theme: 'offre',
    keys: ['skill_technos', 'priority_expertise', 'offer_pitch', 'language_capabilities'],
  },
  {
    id: 'clients-cibles-v23',
    title: 'Précisions de cadrage',
    theme: 'clients-cibles',
    keys: ['target_nature', 'target_size'],
  },
  {
    id: 'territoires-v23',
    title: 'Précisions de cadrage',
    theme: 'territoires',
    keys: ['no_go', 'geography_detail', 'country_scope'],
  },
  { id: 'acces-v23', title: 'Précisions de cadrage', theme: 'acces', keys: ['account_access'] },
  {
    id: 'staffing-v23',
    title: 'Précisions de cadrage',
    theme: 'staffing',
    keys: ['bench_status', 'recruiting_priorities'],
  },
  { id: 'preuves-v23', title: 'Précisions de cadrage', theme: 'preuves', keys: ['commercial_limits', 'currency'] },
  { id: 'portefeuille-v23', title: 'Précisions de cadrage', theme: 'portefeuille', keys: ['delivery_frictions'] },
  {
    id: 'outils-v23',
    title: 'Précisions de cadrage',
    theme: 'outils',
    keys: ['tools', 'data_sources', 'workflow_pain'],
  },
  { id: 'preferences-v23', title: 'Précisions de cadrage', theme: 'preferences', keys: ['autonomy', 'context_policy'] },
  {
    id: 'offre-profil-espace',
    title: 'Comment tu travailles avec tes clients',
    theme: 'offre',
    keys: ['workspace_profile'],
  },
  { id: 'staffing-metiers-places', title: 'Métiers réellement placés', theme: 'staffing', keys: ['placed_roles'] },
]

/** Les cinq blocs essentiels (18 clés) : le parcours COMMENCE par eux, l'espace est utilisable dès qu'ils sont remplis. */
export const ONBOARDING_ESSENTIAL_V23: readonly OnboardingEssentialBlockV23[] = [
  {
    id: 'cadre',
    title: 'Ton activité',
    keys: ['esn_name', 'esn_maturity_situation', 'consultant_size', 'sales_team_size'],
  },
  { id: 'personne', title: 'Ton rôle et ta priorité', keys: ['user_role', 'individual_goal', 'main_sales_pain'] },
  {
    id: 'proposition',
    title: 'Ton offre',
    keys: ['offer_domains', 'expertise_areas', 'positioning', 'staffing_model'],
  },
  {
    id: 'marche',
    title: 'Ton terrain de jeu',
    keys: ['target_sectors', 'target_company_types', 'geo_zones', 'remote_and_travel_scope'],
  },
  {
    id: 'preuve',
    title: 'La première preuve',
    keys: ['client_references', 'weekly_sales_time_protected', 'uncovered_activity_note'],
  },
]

/** Le parcours guidé : huit étapes, 32 questions de Théo + `workspace_profile` (réintégrée, elle règle la navigation). */
export const ONBOARDING_GUIDED_V23: readonly OnboardingGuidedStepV23[] = [
  {
    id: 'activite',
    title: 'Ton activité',
    hint: 'Le bon périmètre, sans te ranger dans une case.',
    themes: ['organisation', 'role'],
    keys: ['first_name', 'esn_name', 'activity_nature', 'esn_maturity_situation', 'scope_level'],
  },
  {
    id: 'role',
    title: 'Ton rôle',
    hint: 'Adapter les conseils à ton quotidien, pas modifier tes permissions.',
    themes: ['role', 'organisation'],
    keys: ['user_role', 'consultant_size', 'sales_team_size', 'individual_goal'],
  },
  {
    id: 'offre',
    title: 'Ton offre',
    hint: 'Toute l’étendue de tes prestations reste disponible.',
    themes: ['offre', 'staffing'],
    keys: ['offer_domains', 'expertise_areas', 'service_types', 'staffing_model', 'workspace_profile'],
  },
  {
    id: 'cibles',
    title: 'Tes marchés',
    hint: 'Distinguer secteur, type de client et territoire.',
    themes: ['territoires', 'clients-cibles'],
    keys: ['target_nature', 'target_sectors', 'geo_zones', 'no_go'],
  },
  {
    id: 'objectif',
    title: 'Ton cap',
    hint: 'Une priorité, un horizon et les moyens d’avancer.',
    themes: ['objectifs', 'routine'],
    keys: ['horizon', 'success_target', 'main_sales_pain', 'weekly_sales_time_protected'],
  },
  {
    id: 'ressources',
    title: 'Tes appuis',
    hint: 'Ce qui rend ton approche crédible et réalisable.',
    themes: ['preuves', 'acces', 'vivier', 'portefeuille'],
    keys: ['client_references', 'go_to_market_channels', 'bench_status', 'delivery_frictions'],
  },
  {
    id: 'outils',
    title: 'Tes outils',
    hint: 'Réutiliser ce qui existe, sans connexion imposée.',
    themes: ['outils'],
    keys: ['tools', 'data_sources', 'workflow_pain'],
  },
  {
    id: 'laura',
    title: 'Avec Laura',
    hint: 'Les préférences de travail restent sous ton contrôle.',
    themes: ['preferences'],
    keys: ['detail_level', 'autonomy', 'context_policy', 'uncovered_activity_note'],
  },
]

/** Les huit clés dont la V23 reformule le libellé : même clé, mêmes réponses (aucune migration de valeur). */
export const V23_RENAMED_KEYS = [
  'avg_sales_cycle',
  'consultant_size',
  'esn_name',
  'esn_website',
  'sales_team_size',
  'no_go_sectors',
  'target_company_types',
  'talent_pool_consent_status',
] as const

/** Les vingt-six clés NEUVES de la V23 (« Précisions de cadrage »), toutes facultatives. */
export const V23_NEW_KEYS = [
  'account_access',
  'target_nature',
  'target_size',
  'horizon',
  'success_target',
  'language_capabilities',
  'offer_pitch',
  'priority_expertise',
  'skill_technos',
  'activity_nature',
  'data_sources',
  'tools',
  'workflow_pain',
  'delivery_frictions',
  'autonomy',
  'context_policy',
  'commercial_limits',
  'currency',
  'first_name',
  'scope_level',
  'scope_unit',
  'bench_status',
  'recruiting_priorities',
  'country_scope',
  'geography_detail',
  'no_go',
] as const
