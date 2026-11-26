/**
 * GARDE — l'éclatement d'`esnAnswersSchema` en un bloc par famille de réponses
 * n'a rien perdu, et ne peut pas commencer à perdre quelque chose.
 *
 * Pourquoi elle existe : chaque lot qui ajoute une question au questionnaire
 * écrit dans ce schéma. Le fichier unique en faisait le pire verrou du dépôt —
 * un CONTRAT mal fusionné rend `undefined` un champ que quelqu'un lit déjà.
 *
 * Ce que l'éclatement rend possible et que cette garde rend impossible :
 *  - une clé déclarée dans DEUX blocs (le dernier spread gagnerait, en silence) ;
 *  - un bloc que l'index a oublié de recomposer — des champs corrects que
 *    personne ne compose, le motif n°1 de ce dépôt ;
 *  - un fichier `answers-*.ts` orphelin, ou un bloc sans fichier ;
 *  - un réordonnancement des clés : l'ORDRE commande celui du résultat de
 *    `parse`, il fait donc partie du contrat.
 */
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { esnAnswersSchema, offerDomainSchema, saveAnswersSchema, type EsnAnswers } from '../onboarding.js'
import { ATTRIBUTION_ANSWER_FIELDS } from './answers-attribution.js'
import { BASE_CLIENTS_ANSWER_FIELDS } from './answers-base-clients.js'
import { CANAUX_ANSWER_FIELDS } from './answers-canaux.js'
import { CHIFFRES_CLES_ANSWER_FIELDS } from './answers-chiffres-cles.js'
import { FREINS_ANSWER_FIELDS } from './answers-freins.js'
import { CHEMINS_ACCES_ANSWER_FIELDS } from './answers-chemins-acces.js'
import { CLIENT_IDEAL_ANSWER_FIELDS } from './answers-client-ideal.js'
import { COMPLEMENT_LIBRE_ANSWER_FIELDS } from './answers-complement-libre.js'
import { INTERLOCUTEURS_ANSWER_FIELDS } from './answers-interlocuteurs.js'
import { CREDIBILITE_STAFFING_ANSWER_FIELDS } from './answers-credibilite-staffing.js'
import { MATURITE_EFFECTIF_ANSWER_FIELDS } from './answers-maturite-effectif.js'
import { MESURES_ANSWER_FIELDS } from './answers-mesures.js'
import { offerDomainAnswerFields } from './answers-offer-domains.js'
import { OUTILLAGE_ANSWER_FIELDS } from './answers-outillage.js'
import { OFFRE_SECTEURS_ANSWER_FIELDS } from './answers-offre-secteurs.js'
import { SECTEURS_NIVEAUX_ANSWER_FIELDS } from './answers-secteurs-niveaux.js'
import { OBJECTIFS_ANSWER_FIELDS } from './answers-objectifs.js'
import { PROFILE_ANSWER_FIELDS } from './answers-profil.js'
import { RECRUITMENT_ANSWER_FIELDS } from './answers-recrutement.js'
import { ROUTINES_ANSWER_FIELDS } from './answers-routines.js'
import { SITE_WEB_ANSWER_FIELDS } from './answers-site-web.js'
import { TEMPS_ANSWER_FIELDS } from './answers-temps.js'
import { TEMPS1_ANSWER_FIELDS } from './answers-temps1.js'
import { TEMPS2_ANSWER_FIELDS } from './answers-temps2.js'
import { VIVIER_ANSWER_FIELDS } from './answers-vivier.js'
import { IMPLANTATION_ANSWER_FIELDS } from './answers-implantation.js'
import { AUTORITE_ANSWER_FIELDS } from './answers-autorite.js'
import { EQUIPE_ANSWER_FIELDS } from './answers-equipe.js'
import { RESEAU_ANSWER_FIELDS } from './answers-reseau.js'
import { TERRITOIRE_REMOTE_ANSWER_FIELDS } from './answers-territoire-remote.js'
import { TERRITOIRE_CAPACITE_ANSWER_FIELDS } from './answers-territoire-capacite.js'
import { METIERS_PLACES_ANSWER_FIELDS } from './answers-metiers-places.js'
import { WORKSPACE_PROFILE_ANSWER_FIELDS } from './answers-profil-espace.js'
import { V23_ANSWER_FIELDS } from './answers-v23.js'

const HERE = new URL('.', import.meta.url).pathname

/** Chaque bloc, son fichier, et le nombre de clés MESURÉ avant l'éclatement. */
const BLOCKS = [
  { file: 'answers-temps1.ts', keys: Object.keys(TEMPS1_ANSWER_FIELDS), measured: 10 },
  { file: 'answers-offer-domains.ts', keys: Object.keys(offerDomainAnswerFields(offerDomainSchema)), measured: 2 },
  { file: 'answers-recrutement.ts', keys: Object.keys(RECRUITMENT_ANSWER_FIELDS), measured: 1 },
  { file: 'answers-temps2.ts', keys: Object.keys(TEMPS2_ANSWER_FIELDS), measured: 5 },
  // #2056 (9) / #2057 (6) — appels d'offres et contenu ; #2032.10 / #2036.9 —
  // `role_functions_practiced` + `growth_target_zones` ; #2015.7 / #2056.11 /
  // #2057.10 — `company_group_structure` / `rfp_deal_value` /
  // `rfp_owner_assignment`. 27 + 15 + 2 + 3 = 47.
  // #2053.3 / #2053.4 — +3 (intercontrat_cost, payment_delay_visibility, payment_delay_band).
  // #2067.2 — +2 (partners_regular_count, partners_occasional_count), décision Louis 18/09.
  // #2058.2 / #2058.10 (20/09/2026) — +2 (contact_windows, detail_level), les
  // deux derniers points qui tenaient #2058 ouverte.
  { file: 'answers-profil.ts', keys: Object.keys(PROFILE_ANSWER_FIELDS), measured: 54 },
  // #2035.1/.2 — +2 (consultant_size_group_band, consultant_size_business_unit_band).
  { file: 'answers-maturite-effectif.ts', keys: Object.keys(MATURITE_EFFECTIF_ANSWER_FIELDS), measured: 9 },
  // Lot L19 — canaux d'entrée (#2048) et unités comparables (#2049).
  // #2048.13 a ajouté `entry_channels_period` (5e clé) le 16/09.
  { file: 'answers-canaux.ts', keys: Object.keys(CANAUX_ANSWER_FIELDS), measured: 5 },
  { file: 'answers-mesures.ts', keys: Object.keys(MESURES_ANSWER_FIELDS), measured: 2 },
  // Lot L19 (#2050 capacité réelle, #2051 continuité des dossiers).
  { file: 'answers-temps.ts', keys: Object.keys(TEMPS_ANSWER_FIELDS), measured: 7 },
  { file: 'answers-routines.ts', keys: Object.keys(ROUTINES_ANSWER_FIELDS), measured: 2 },
  // #2054 / #2055 — cartographie de l'outillage (18) et freins commerciaux (4).
  { file: 'answers-outillage.ts', keys: Object.keys(OUTILLAGE_ANSWER_FIELDS), measured: 19 },
  { file: 'answers-freins.ts', keys: Object.keys(FREINS_ANSWER_FIELDS), measured: 4 },
  { file: 'answers-client-ideal.ts', keys: Object.keys(CLIENT_IDEAL_ANSWER_FIELDS), measured: 9 },
  { file: 'answers-interlocuteurs.ts', keys: Object.keys(INTERLOCUTEURS_ANSWER_FIELDS), measured: 3 },
  { file: 'answers-chemins-acces.ts', keys: Object.keys(CHEMINS_ACCES_ANSWER_FIELDS), measured: 3 },
  { file: 'answers-offre-secteurs.ts', keys: Object.keys(OFFRE_SECTEURS_ANSWER_FIELDS), measured: 4 },
  // #2041.1 — cinq niveaux par secteur : UNE clé ajoutée, `priority_sectors`.
  { file: 'answers-secteurs-niveaux.ts', keys: Object.keys(SECTEURS_NIVEAUX_ANSWER_FIELDS), measured: 1 },
  // #2039.6 (épopée #2880, tranché sans Louis dans le lot `feat/nuit-14-25-09`)
  // — `expertise_no_concrete_proof` ajoutée EN FIN de bloc : 5 → 6.
  // #2039.2 (épopée #2880, tranché sans Louis dans le lot `feat/soir-s10-26-09`)
  // — `expertise_client_reference` ajoutée EN FIN de bloc : 6 → 7.
  // #2039.3/.4/.5 (épopée #2880, vague G lot g10) — `expertise_personal_experience`,
  // `expertise_partner`, `expertise_talent_pool` ajoutées EN FIN de bloc : 7 → 10.
  // #2961 (#2302.28) — `reference_accounts` ajoutée juste après `client_testimonials` : 10 → 11.
  { file: 'answers-credibilite-staffing.ts', keys: Object.keys(CREDIBILITE_STAFFING_ANSWER_FIELDS), measured: 11 },
  // #2052 (lot L19) — les objectifs commerciaux NOMMÉS, ajoutés EN FIN.
  { file: 'answers-objectifs.ts', keys: Object.keys(OBJECTIFS_ANSWER_FIELDS), measured: 1 },
  // Vivier de consultants (#2046) et base de clients (#2047) DÉCLARÉS à
  // l'onboarding. `client_base_active_accounts_band` (#2047.1) n'existe pas :
  // `active_clients_band` (bloc maturité/effectif ci-dessus) porte déjà cette
  // réponse — voir `answers-base-clients.ts`.
  { file: 'answers-vivier.ts', keys: Object.keys(VIVIER_ANSWER_FIELDS), measured: 14 },
  { file: 'answers-base-clients.ts', keys: Object.keys(BASE_CLIENTS_ANSWER_FIELDS), measured: 11 },
  // #2059 — attribution marketing, ferme le stage `target_market`.
  { file: 'answers-attribution.ts', keys: Object.keys(ATTRIBUTION_ANSWER_FIELDS), measured: 1 },
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
  { file: 'answers-implantation.ts', keys: Object.keys(IMPLANTATION_ANSWER_FIELDS), measured: 1 },
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais
  // NOMBRES : chiffre d'affaires (+ sa période) et nombre de consultants.
  { file: 'answers-chiffres-cles.ts', keys: Object.keys(CHIFFRES_CLES_ANSWER_FIELDS), measured: 3 },
  // #2060 — la question ouverte qui FERME le parcours, ajoutée EN FIN.
  { file: 'answers-complement-libre.ts', keys: Object.keys(COMPLEMENT_LIBRE_ANSWER_FIELDS), measured: 1 },
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ : 8 clés (decisions_alone, decisions_to_validate, people_managed,
  // recruitment_accounts_authority, staffing_authority,
  // margin_billing_authority, tools_access, invite_authority).
  { file: 'answers-autorite.ts', keys: Object.keys(AUTORITE_ANSWER_FIELDS), measured: 8 },
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
  // du commercial : 6 clés (associates_count, recruiters_team_size,
  // delivery_team_size, marketing_team_size, ops_team_size,
  // team_coordination_mode).
  { file: 'answers-equipe.ts', keys: Object.keys(EQUIPE_ANSWER_FIELDS), measured: 6 },
  // #2640.2 — le site de l'entreprise, une clé.
  { file: 'answers-site-web.ts', keys: Object.keys(SITE_WEB_ANSWER_FIELDS), measured: 1 },
  // #2045.1/.2/.4/.6/.7 (lot B, 22/09/2026) — le réseau personnel DÉCLARÉ,
  // compté EN BANDES et jamais en nombre exact : anciens clients, anciens
  // collègues, partenaires, personnes pouvant recommander, plus les relations
  // chaudes transversales (.6). Cinq clés, ajoutées EN FIN comme les blocs
  // précédents — même position que dans `onboarding.ts`.
  { file: 'answers-reseau.ts', keys: Object.keys(RESEAU_ANSWER_FIELDS), measured: 5 },
  // #2036.2 (#2847, modèle de territoire à 7 axes) — le remote accepté et les
  // déplacements, bloc neuf, ajouté EN FIN comme les blocs précédents.
  { file: 'answers-territoire-remote.ts', keys: Object.keys(TERRITOIRE_REMOTE_ANSWER_FIELDS), measured: 1 },
  // #2036.8 (#2847) — la posture territoriale déclarée, bloc neuf, ajouté EN
  // FIN comme les blocs précédents.
  { file: 'answers-territoire-capacite.ts', keys: Object.keys(TERRITOIRE_CAPACITE_ANSWER_FIELDS), measured: 1 },
  // #3923.a — les métiers placés (`placed_roles`), bloc neuf ajouté EN FIN.
  { file: 'answers-metiers-places.ts', keys: Object.keys(METIERS_PLACES_ANSWER_FIELDS), measured: 1 },
  // #4270.1 (18/10) — le profil d'espace « forfait / conseil », bloc neuf ajouté EN FIN.
  { file: 'answers-profil-espace.ts', keys: Object.keys(WORKSPACE_PROFILE_ANSWER_FIELDS), measured: 1 },
  // Théo O onboarding-couverture (22/10) — les 26 clés neuves de la V23, bloc neuf ajouté EN FIN.
  { file: 'answers-v23.ts', keys: Object.keys(V23_ANSWER_FIELDS), measured: 26 },
]

/**
 * Les 162 clés d'`esnAnswersSchema`, DANS L'ORDRE, RECOMPTÉES à l'intégration
 * de la vague 12, le 16/09/2026 : 52 avant l'éclatement, puis les lots L19
 * (#2048 canaux, #2049 unités comparables, #2050 capacité réelle, #2051
 * continuité, #2054 outillage, #2055 freins, #2052 objectifs nommés), L17
 * (#2042 client idéal, #2043 interlocuteurs, #2044 chemins d'accès), 26
 * (#2038/#2041 offre et secteurs de référence, #2039/#2040 crédibilité et
 * modes de réponse au besoin), #2056 (appels d'offres, 9) et #2057 (contenu,
 * 6), #2032.10 / #2036.9 (2), #2046 (vivier, 14) et #2047 (base de clients,
 * 11), #2059 (attribution marketing, 1), enfin #2015.7 / #2056.11 / #2057.10
 * (filiation, économie du dossier, owner — 3).
 * ⚠️ Un nombre écrit dans un en-tête ne crée AUCUN conflit quand deux lots
 * l'ignorent chacun de son côté : il se RECOMPTE à chaque intégration.
 * Un champ qui s'ajoute pour de bon s'écrit dans SON bloc et ici — une ligne,
 * pas un interdit. Aucun champ ne se renomme, ne se retire, ni ne se déplace.
 */
const EXPECTED_KEYS = [
  'esn_name',
  'consultant_size',
  'sales_team_size',
  'expertise_areas',
  'positioning',
  'target_sectors',
  'target_company_types',
  'staffing_model',
  'geo_zones',
  'main_sales_pain',
  'offer_domain',
  'offer_domains',
  'recruits_for_clients',
  'decision_maker_personas',
  'avg_sales_cycle',
  'avg_tjm',
  'client_references',
  'no_go_sectors',
  'user_role',
  'role_tenure',
  'industry_tenure',
  'individual_goal',
  'monthly_target',
  'company_age',
  'company_size',
  'consultants_on_mission',
  'consultants_in_pipe',
  'team_overlap',
  'ramp_up_capacity',
  'avg_deal_size',
  'target_margin',
  'portfolio_size',
  'accounts_relationship_status',
  'weekly_calls',
  'weekly_emails',
  'weekly_linkedin',
  'proactivity_level',
  'public_sector_practice',
  'regulated_sector_readiness',
  'partner_relationship',
  'go_to_market_channels',
  'sales_routine',
  'sales_blockers',
  'tooling',
  'shared_data_scope',
  'rfp_platforms_used',
  'rfp_referencing_status',
  'rfp_lot_allocation',
  'rfp_response_templates',
  'rfp_volume',
  'rfp_volume_period',
  'rfp_outcomes',
  'rfp_go_no_go_process',
  'rfp_document_readiness',
  'content_active_profile',
  'content_audience_size',
  'content_visible_expertise',
  'content_reactions',
  'content_conversations_generated',
  'content_funnel_stages_reached',
  'role_functions_practiced',
  'growth_target_zones',
  'company_group_structure',
  'rfp_deal_value',
  'rfp_owner_assignment',
  // #2053.3 / #2053.4 — coût d'intercontrat, puis visibilité et délai
  // d'encaissement. Ajoutées EN FIN, jamais insérées au milieu.
  'intercontrat_cost',
  'payment_delay_visibility',
  'payment_delay_band',
  // #2067.2 — avec combien de partenaires, réguliers puis ponctuels (décision
  // Louis du 18/09/2026). Ajoutées EN FIN du bloc profil, jamais au milieu.
  'partners_regular_count',
  'partners_occasional_count',
  // #2058.2 / #2058.10 (20/09/2026) — les moments acceptés, puis le niveau de
  // détail attendu. Ajoutées EN FIN du bloc profil, jamais au milieu.
  'contact_windows',
  'detail_level',
  'esn_maturity_situation',
  'active_clients_band',
  'revenue_recurrence',
  'client_concentration_risk',
  'company_growth_goal',
  'consultants_managed_by_user_band',
  'available_consultants_band',
  // #2035.1 / #2035.2 — effectif du GROUPE, puis de la BU/agence. Ajoutées EN
  // FIN du bloc maturité/effectif, jamais insérées au milieu.
  'consultant_size_group_band',
  'consultant_size_business_unit_band',
  // Lot L19 (#2048) — les facettes des canaux d'entrée. `entry_channels_period`
  // (#2048.13) ajoutée EN FIN de bloc le 16/09, jamais insérée au milieu.
  'entry_channels_used',
  'entry_channels_measured',
  'entry_channels_last_starts',
  'entry_channels_time_split',
  'entry_channels_period',
  // Lot L19 (#2049) — les unités comptées et la période qui les rend comparables.
  'activity_measures_tracked',
  'activity_reference_period',
  // Lot L19 — #2050 : les trois états du temps, puis ce qui le mange.
  'weekly_sales_time_declared',
  'weekly_sales_time_protected',
  'weekly_sales_time_residual',
  'weekly_sales_time_slots',
  'competing_workloads',
  'workload_variability',
  'protected_slot_capacity',
  // Lot L19 — #2051 : ce qui tient un dossier, et où il décroche.
  'dossier_continuity_practices',
  'dossier_continuity_breaks',
  // #2054 — la chaîne d'outillage : onze maillons puis les sept attributs de
  // la source de référence. Ajoutées EN FIN, jamais insérées au milieu.
  'tooling_crm',
  'tooling_ats',
  'tooling_erp',
  'tooling_mailbox',
  'tooling_calendar',
  'tooling_drive',
  'tooling_spreadsheet',
  'tooling_enrichment',
  'tooling_sourcing_platform',
  'tooling_bi',
  'tooling_personal_notes',
  'tooling_reference',
  'tooling_reference_data',
  'tooling_reference_freshness',
  'tooling_reference_confidence',
  'tooling_reference_export',
  'tooling_duplicates',
  'tooling_pain',
  // #4971.1 (31/10) — les noms des outils maison, EN FIN du bloc outillage.
  'tooling_internal_names',
  // #2055 — les freins, et les trois relances qui séparent le symptôme du goulot.
  'sales_freins',
  'frein_attempted',
  'frein_stopped',
  'frein_stopped_reason',
  // Lot L17 (#2042) — le profil du client idéal, puis (#2043) les
  // interlocuteurs qui répondent vraiment.
  'ideal_client_size',
  'ideal_client_structure',
  'ideal_client_maturity',
  'ideal_client_territory',
  'ideal_client_accessibility',
  'ideal_client_max_sales_cycle',
  'ideal_client_min_deal_size',
  'ideal_client_referencement_constraints',
  'ideal_client_current_state',
  'real_response_level',
  'budget_validator',
  'access_orienteur',
  'entry_channels_dependency',
  'entry_channels_prerequisites',
  'entry_channels_saturation',
  // Lot 26 (#2038, #2041) — types de prestation + secteurs référencés.
  'service_types',
  'service_types_proven',
  'service_types_desired',
  'reference_sectors',
  // #2041.1 — la clé qui donne aux secteurs cinq niveaux au lieu de vingt
  // cases équivalentes. Ajoutée après `reference_sectors`, comme le spread.
  'priority_sectors',
  // Lot 26 (#2039, #2040) — crédibilité + modes de réponse au besoin.
  'case_study_results',
  'client_testimonials',
  // #2961 (#2302.28, épopée Commercial Territory Resolver) — les mêmes
  // références, NOMMÉES seules, ajoutée juste après (même ordre que dans
  // `CREDIBILITE_STAFFING_ANSWER_FIELDS`).
  'reference_accounts',
  // #2039.6 (épopée #2880) — un fondement du groupe #2039.1-.6 qui ne demande
  // pas de donnée relationnelle, ajouté EN FIN de bloc.
  'expertise_no_concrete_proof',
  // #2039.2 (épopée #2880) — même mécanisme, un autre fondement, ajouté juste
  // après.
  'expertise_client_reference',
  // #2039.3/.4/.5 (épopée #2880, vague G lot g10) — les trois derniers
  // fondements à une dimension du groupe #2039.1-.6, même mécanisme.
  'expertise_personal_experience',
  'expertise_partner',
  'expertise_talent_pool',
  'staffing_modes',
  'profile_validation_methods',
  'contractual_constraints',
  // #2052 (lot L19) — les objectifs commerciaux NOMMÉS, ajoutés EN FIN.
  'esn_objectives',
  // #2046 — le vivier de consultants DÉCLARÉ à l'onboarding : funnel compté,
  // collecte, puis les quatre états au contrat.
  'talent_pool_identified_band',
  'talent_pool_qualified_band',
  'talent_pool_available_band',
  'talent_pool_availability_recency_band',
  'talent_pool_avg_tjm_band',
  'talent_pool_mobility_band',
  'talent_pool_consent_status',
  'talent_pool_other_processes_band',
  'talent_pool_engagement_reality_band',
  'talent_pool_revalidation_frequency',
  'talent_pool_state_interested_band',
  'talent_pool_state_available_band',
  'talent_pool_state_secured_band',
  'talent_pool_state_presentable_band',
  // #2047 — la base de clients DÉCLARÉE à l'onboarding.
  'client_base_missions_ongoing_band',
  'client_base_missions_completed_band',
  'client_base_renewals_band',
  'client_base_satisfaction_band',
  'client_base_referrals_band',
  'client_base_rex_band',
  'client_base_case_studies_band',
  'client_base_cross_sell_band',
  'client_base_deadlines_band',
  'client_base_followup_regularity',
  'client_base_followup_owner',
  // #2059 — attribution marketing.
  'heard_about_bellum',
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
  'company_locations',
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais
  // NOMBRES, ajoutés EN FIN comme les blocs précédents.
  'consultant_count',
  'annual_revenue_amount',
  'annual_revenue_period',
  // #2060 — la question ouverte qui FERME le parcours, ajoutée EN FIN.
  'uncovered_activity_note',
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ, AJOUTÉ EN FIN comme les blocs précédents.
  'decisions_alone',
  'decisions_to_validate',
  'people_managed',
  'recruitment_accounts_authority',
  'staffing_authority',
  'margin_billing_authority',
  'tools_access',
  'invite_authority',
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
  // du commercial, AJOUTÉ EN FIN comme les blocs précédents.
  'associates_count',
  'recruiters_team_size',
  'delivery_team_size',
  'marketing_team_size',
  'ops_team_size',
  'team_coordination_mode',
  // #2640.2 — le site de l'entreprise, ajouté EN FIN comme les blocs précédents.
  'esn_website',
  // #2045.1/.2/.4/.7 puis .6 (lot B, 22/09/2026) — le réseau personnel déclaré,
  // COMPTÉ EN BANDES, jamais un nombre exact.
  'former_clients_count_band',
  'former_colleagues_count_band',
  'partners_count_band',
  'referrers_count_band',
  'warm_relations_count_band',
  // #2036.2 (#2847, modèle de territoire à 7 axes) — le remote accepté et les
  // déplacements, bloc neuf, ajouté EN FIN comme les blocs précédents.
  'remote_and_travel_scope',
  'zone_capability_status',
  // #3923.a — les métiers placés, bloc neuf `answers-metiers-places.ts`, EN FIN.
  'placed_roles',
  'workspace_profile',
  // Théo O onboarding-couverture (22/10) — les 26 clés neuves de la V23.
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
]

const shape = esnAnswersSchema.shape as Record<string, unknown>
const composedKeys = Object.keys(shape)
const files = readdirSync(HERE).filter(f => f.endsWith('.ts'))
// ⚠️ `.test.ts` EXCLU : un bloc qui apporte sa propre garde (`answers-outillage.test.ts`)
// s'appelle lui aussi `answers-*`, et le comptage le prenait pour un bloc de réponses.
const blockFiles = files.filter(f => f.startsWith('answers-') && !f.endsWith('.test.ts'))

describe('esnAnswers — le corpus est lu', () => {
  it('trouve des fichiers de bloc sur le disque (une garde qui itère sur du vide est verte et borgne)', () => {
    expect(files.length).toBeGreaterThan(BLOCKS.length)
    expect(blockFiles.length).toBe(BLOCKS.length)
  })

  it('charge des blocs qui portent des clés', () => {
    expect(BLOCKS.every(b => b.keys.length > 0)).toBe(true)
    expect(composedKeys.length).toBeGreaterThan(0)
  })
})

describe("esnAnswers — l'éclatement n'a rien perdu", () => {
  // Intégration vague 12 → absorption de `main` (#2364 mergée) : 132 du côté
  // vague 12 (objectifs #2052, #2056 appels d'offres, #2057 contenu, #2032.10
  // et #2036.9 compris) + 1 (#2059 attribution) + 14 (#2046 vivier) + 11
  // (#2047 base de clients) = 158, puis 1 (#2041.1 `priority_sectors`) = 159. Chaque branche comptait juste sans l'autre —
  // le compte se REFAIT à la fusion, il ne se recopie pas. Puis 3 de plus
  // (#2015.7 / #2056.11 / #2057.10, filiation / économie du dossier / owner) = 162,
  // puis 1 de plus (#2005.4, lot CP2, `company_locations`) = 163.
  // Mesuré ici, pas recopié : la somme des `measured` DOIT valoir
  // `EXPECTED_KEYS.length`. Vague 18/09 H : deux branches sont parties de ce
  // même 163 SANS SE VOIR — #2053.3 / #2053.4 (coût d'intercontrat, visibilité
  // et délai d'encaissement, +3) et #2035.1 / #2035.2 (effectif du groupe puis
  // de la BU/agence, +2). Chacune comptait juste sans l'autre ; la fusion
  // REFAIT le compte, elle ne prend ni l'un ni l'autre chiffre isolé :
  // 163 + 3 + 2 = 168. Vague 18/09 P : TROIS branches sont reparties de ce
  // même 168 SANS SE VOIR — #2088.12/.13 (point 16 du 18/09 soir — chiffre
  // d'affaires, sa période, nombre de consultants, +3), #2060
  // (`uncovered_activity_note`, la question ouverte qui ferme le parcours,
  // +1) et #2033.2-.8 (D3, périmètre d'autorité déclaré, +8). Chaque branche
  // comptait juste pour elle-même (168+3+1=172 d'un côté, 168+8=176 de
  // l'autre) : ni l'un ni l'autre n'est juste une fois les trois fusionnés.
  // REMESURÉ à la fusion, pas recopié d'aucun côté : 168 + 3 + 1 + 8 = 180.
  // #2067.2 (lot H26, décision Louis du 18/09/2026) : +2 — le nombre de
  // partenaires réguliers, puis ponctuels. REMESURÉ sur la branche
  // `feat/laudit-arbitre-la-charge-active-18-09` (vitest, `composedKeys.length`) :
  // 186 au départ (le titre disait encore 180, des lots fusionnés depuis ne
  // l'avaient pas recompté), 188 après. Une branche partie du même 186 en
  // parallèle se RECOMPTE à la fusion.
  // #2058.2 / #2058.10 (20/09/2026) : 188 → 190 — les moments acceptés, puis
  // le niveau de détail attendu, ajoutés EN FIN du bloc profil.
  // #2640.2 (21/09/2026) : 190 → 191 — `esn_website`, le site de l'entreprise
  // devenu une réponse comme les autres (source affichée, corrigeable).
  // #2045 (lot B, 22/09/2026) : 191 → 196 — le réseau personnel déclaré, cinq
  // bandes (quatre portes de `canaux.ts` + les relations chaudes de .6). Le
  // bloc `answers-reseau.ts` est le 29e fichier : la garde « une famille = un
  // bloc » l'exige déclaré ICI, pas seulement composé dans `onboarding.ts`.
  // Vague de nuit 25/09 : deux branches sont reparties de ce même 196 SANS SE
  // VOIR — #2039.6 (`expertise_no_concrete_proof`, lot `feat/nuit-14-25-09`,
  // +1 dans le bloc crédibilité) et #2036.2 (`remote_and_travel_scope`, bloc
  // neuf `answers-territoire-remote.ts`, le 30e fichier, +1). REMESURÉ à
  // l'intégration, pas recopié d'aucun côté : 196 + 1 + 1 = 198.
  // Lot r4 (26/09) : 198 → 199 — #2036.8 (`zone_capability_status`, bloc neuf
  // `answers-territoire-capacite.ts`, le 31e fichier, +1, v1 tranché sans Louis).
  // Lot M04 (09/10) : 204 → 205 — #3923.a (`placed_roles`, bloc neuf
  // `answers-metiers-places.ts`, le 32e fichier, +1).
  // Lot J (31/10) : 205 → 206 — #4971.1 (`tooling_internal_names`), +1 en
  // fin du bloc outillage.
  // Lot soir S10 (26/09) : 199 → 200 — #2039.2 (`expertise_client_reference`,
  // épopée #2880), +1 dans le bloc crédibilité, EN FIN.
  // Vague G lot g10 (27/09) : 200 → 203 — #2039.3/.4/.5
  // (`expertise_personal_experience` / `expertise_partner` /
  // `expertise_talent_pool`, épopée #2880), +3 dans le bloc crédibilité, EN FIN.
  // Lot t6 (28/09) : 203 → 204 — #2961 (`reference_accounts`, #2302.28), +1
  // dans le bloc crédibilité, juste après `client_testimonials`.
  it('garde les 206 clés, dans leur ordre exact', () => {
    expect(composedKeys).toEqual(EXPECTED_KEYS)
  })

  it('garde le compte de clés mesuré pour chaque bloc (10 / 2 / 1 / 5 / 54 / 9 / 5 / 2 / 7 / 2 / 19 / 4 / 9 / 3 / 3 / 4 / 1 / 11 / 1 / 14 / 11 / 1 / 1 / 3 / 1 / 8 / 6 / 1 / 5 / 1 / 1 / 1)', () => {
    expect(BLOCKS.map(b => b.keys.length)).toEqual(BLOCKS.map(b => b.measured))
    expect(BLOCKS.reduce((n, b) => n + b.measured, 0)).toBe(EXPECTED_KEYS.length)
  })

  it('compose EXACTEMENT la réunion des blocs, sans ajout ni oubli', () => {
    const fromBlocks = BLOCKS.flatMap(b => b.keys)
    expect([...fromBlocks].sort()).toEqual([...composedKeys].sort())
  })

  it("garde `offer_domain` typé comme l'union des domaines, jamais `string`", () => {
    // Le TYPE, pas seulement le comportement. Le bloc portefeuille reçoit son
    // énumération en paramètre ; un paramètre non générique l'élargit en
    // `string` sans rien changer à l'exécution — invisible aux sondes
    // ci-dessus, et rouge seulement au `tsc` de contracts (analysis.ts:630).
    // Le `@ts-expect-error` ci-dessous est ce qui dit NON : il cesse de
    // compiler le jour où le type se réélargit.
    const narrow: EsnAnswers['offer_domain'] = 'esn_it'
    // @ts-expect-error une valeur hors énumération ne doit pas compiler
    const wide: EsnAnswers['offer_domain'] = 'pas_un_domaine'
    expect(narrow).toBe('esn_it')
    expect(wide).toBe('pas_un_domaine')
  })

  it('garde `saveAnswersSchema` comme le partiel du schéma composé', () => {
    expect(Object.keys(saveAnswersSchema.shape)).toEqual(composedKeys)
    expect(Object.values(saveAnswersSchema.shape).every(field => field.isOptional())).toBe(true)
  })
})

describe('esnAnswers — une famille = un bloc', () => {
  it('ne déclare jamais la même clé dans deux blocs', () => {
    const seen = new Map<string, string[]>()
    for (const block of BLOCKS) {
      for (const key of block.keys) seen.set(key, [...(seen.get(key) ?? []), block.file])
    }
    const duplicates = [...seen].filter(([, owners]) => owners.length > 1)
    expect(duplicates, 'clés déclarées dans plus d’un bloc').toEqual([])
  })

  it('donne un fichier à chaque bloc, et un bloc à chaque fichier', () => {
    const declared = BLOCKS.map(b => b.file).sort()
    expect(blockFiles.sort(), 'fichiers `answers-*.ts` et blocs recomposés').toEqual(declared)
  })

  it('ne compte NI les plafonds NI les tests comme un bloc (témoin)', () => {
    // Ces deux-là existent bel et bien : le filtre travaille sur du réel.
    expect(files).toContain('limits.ts')
    expect(files).toContain('answers.test.ts')
    expect(blockFiles).not.toContain('limits.ts')
    // `answers.test.ts` commence par « answers » sans être un bloc : le filtre
    // porte sur le préfixe `answers-`, pas sur `answers`.
    expect(blockFiles).not.toContain('answers.test.ts')
  })
})
