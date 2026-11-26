/**
 * GARDE — l'éclatement de `lib/questions.ts` en un fichier par sous-étape n'a
 * rien perdu, et ne peut pas commencer à perdre quelque chose.
 *
 * Ce que l'éclatement rend possible et que cette garde rend impossible :
 *  - une question qui existe dans DEUX fichiers (identifiant en double) ;
 *  - un fichier de sous-étape que l'index a oublié de recomposer (orphelin) —
 *    du code juste que personne n'appelle, le motif n°1 de ce dépôt ;
 *  - une sous-étape déclarée dans l'index sans fichier à son nom ;
 *  - un réordonnancement silencieux des stages, des sous-étapes ou des questions.
 *
 * Périmètre : le SEUL dossier `lib/questions/`. Le complément Temps-2
 * (`../complement-questions.ts`) est un mécanisme distinct et reste dehors — un
 * témoin ci-dessous le vérifie plutôt que de le supposer.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEMPS1_CATALOGUE_SUBSTEPS, TEMPS1_STAGE_CODES, TEMPS1_STAGES, TEMPS1_SUBSTEPS } from '.'

const HERE = __dirname

/** Les fichiers du dossier qui ne portent PAS de sous-étape. */
// #2054.19 — `tooling-resolve-choices.ts` est un helper partagé par
// `outillage.ts` / `outillage-annexe.ts`, pas une sous-étape.
// #2023.5 — `visibility.ts` porte le branchement adaptatif (`when`), lu par
// cinq consommateurs. Même nature : un helper du dossier, pas un écran.
const NOT_A_SUBSTEP = new Set(['index.ts', 'types.ts', 'tooling-resolve-choices.ts', 'visibility.ts'])

const tsFiles = readdirSync(HERE).filter(f => f.endsWith('.ts'))
const subStepFiles = tsFiles.filter(f => !NOT_A_SUBSTEP.has(f) && !f.endsWith('.test.ts'))

/**
 * La structure MESURÉE sur `lib/questions.ts` juste avant l'éclatement
 * (15/09/2026) : 3 stages, 9 sous-étapes, 12 questions, dans cet ordre.
 * Une question qui s'ajoute pour de bon fait monter un nombre ici — c'est UNE
 * ligne à changer dans le fichier de la sous-étape et une ici, pas un interdit.
 *
 * Lot L15 (#2034, #2035) a ajouté 3 sous-étapes / 7 questions au stage
 * `company_info` : maturité (#2034), santé de l'activité (#2034), effectif
 * réel (#2035) — territoire (#2036) et qui-fait-quoi (#2037) restent pour un
 * lot suivant.
 *
 * Lot L19 (#2050, #2051) en a ajouté 3 de plus, toujours dans `company_info` :
 * le temps commercial en TROIS états (#2050.11/.12/.13 — annoncé, protégé,
 * résiduel : un nombre unique serait le chiffre faux), ce qui mange le reste de
 * la semaine (#2050.2/.3-.8/.9/.10), et la continuité des dossiers (#2051).
 * Lot L17 (#2042, #2043, #2044) a ajouté 3 sous-étapes / 15 questions au stage
 * `target_market` : client idéal (#2042, 9 questions), interlocuteurs (#2043,
 * 3 questions), chemins d'accès (#2044, 3 questions).
 */
const EXPECTED: ReadonlyArray<readonly [stage: string, slug: string, questionKeys: readonly string[]]> = [
  // #2088.12 (DÉCISION Louis 18/09, point 16) — le NOMBRE exact de consultants
  // rejoint la tranche : la tranche sert le tri, le nombre sert le calcul.
  // #2640.2 — `esn_website` rejoint la même sous-étape, EN FIN.
  ['company_info', 'entreprise', ['esn_name', 'consultant_size', 'consultant_count', 'esn_website']],
  ['company_info', 'equipe-commerciale', ['sales_team_size']],
  ['company_info', 'maturite', ['esn_maturity_situation', 'company_growth_goal']],
  ['company_info', 'sante-activite', ['active_clients_band', 'revenue_recurrence', 'client_concentration_risk']],
  [
    'company_info',
    'effectif-reel',
    [
      'consultants_managed_by_user_band',
      'available_consultants_band',
      // #2035.1 / #2035.2 — de quelle population ce chiffre parle : le
      // groupe, puis la BU. Toujours posées, jamais bloquantes (`optional`).
      'consultant_size_group_band',
      'consultant_size_business_unit_band',
    ],
  ],
  // #2046 — le vivier de consultants DÉCLARÉ à l'onboarding : funnel compté
  // (identifiés/qualifiés/disponibles + récence + TJM du vivier), collecte
  // (mobilité/consentement/process concurrents/engagement réel/fréquence de
  // revalidation), puis les quatre états au contrat (intéressé/disponible/
  // sécurisé/présentable — un CV n'est pas une candidature prête).
  [
    'company_info',
    'vivier-comptage',
    [
      'talent_pool_identified_band',
      'talent_pool_qualified_band',
      'talent_pool_available_band',
      'talent_pool_availability_recency_band',
      'talent_pool_avg_tjm_band',
    ],
  ],
  [
    'company_info',
    'vivier-collecte',
    [
      'talent_pool_mobility_band',
      'talent_pool_consent_status',
      'talent_pool_other_processes_band',
      'talent_pool_engagement_reality_band',
      'talent_pool_revalidation_frequency',
    ],
  ],
  [
    'company_info',
    'vivier-etats',
    [
      'talent_pool_state_interested_band',
      'talent_pool_state_available_band',
      'talent_pool_state_secured_band',
      'talent_pool_state_presentable_band',
    ],
  ],
  // #2047 — la base de clients DÉCLARÉE à l'onboarding. `client_base_active_accounts_band`
  // n'existe pas : `active_clients_band` (sous-étape `sante-activite`
  // ci-dessus) porte déjà cette réponse.
  [
    'company_info',
    'base-clients-activite',
    [
      'client_base_missions_ongoing_band',
      'client_base_missions_completed_band',
      'client_base_renewals_band',
      'client_base_satisfaction_band',
      'client_base_referrals_band',
    ],
  ],
  [
    'company_info',
    'base-clients-capitalisation',
    [
      'client_base_rex_band',
      'client_base_case_studies_band',
      'client_base_cross_sell_band',
      'client_base_deadlines_band',
    ],
  ],
  ['company_info', 'base-clients-suivi', ['client_base_followup_regularity', 'client_base_followup_owner']],
  [
    'company_info',
    'temps',
    ['weekly_sales_time_declared', 'weekly_sales_time_protected', 'weekly_sales_time_residual'],
  ],
  [
    'company_info',
    'temps-charge',
    ['competing_workloads', 'workload_variability', 'weekly_sales_time_slots', 'protected_slot_capacity'],
  ],
  ['company_info', 'routines', ['dossier_continuity_practices', 'dossier_continuity_breaks']],
  // #2054 — la chaîne d'outillage : les systèmes, les à-côtés, la qualité de la
  // source de référence. Trois écrans plutôt qu'un de dix-huit questions.
  [
    'company_info',
    'outillage',
    [
      'tooling_crm',
      'tooling_ats',
      'tooling_erp',
      'tooling_mailbox',
      'tooling_calendar',
      'tooling_drive',
      // #4971.1 — les outils maison, nommés librement, EN FIN de l'écran.
      'tooling_internal_names',
    ],
  ],
  [
    'company_info',
    'outillage-annexe',
    ['tooling_spreadsheet', 'tooling_enrichment', 'tooling_sourcing_platform', 'tooling_bi', 'tooling_personal_notes'],
  ],
  [
    'company_info',
    'outillage-qualite',
    [
      'tooling_reference',
      'tooling_reference_data',
      'tooling_reference_freshness',
      'tooling_reference_confidence',
      'tooling_reference_export',
      'tooling_duplicates',
      'tooling_pain',
    ],
  ],
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée (siège +
  // bureaux), AJOUTÉE EN FIN de `company_info.steps` comme les blocs précédents.
  ['company_info', 'implantation', ['company_locations']],
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — le chiffre d'affaires annuel
  // et la PÉRIODE qu'il couvre, AJOUTÉS EN FIN comme les blocs précédents :
  // l'ordre déjà posé ne bouge pas d'un cran.
  ['company_info', 'chiffre-affaires', ['annual_revenue_amount', 'annual_revenue_period']],
  // #2018.2 — le stage `role` (« Ton rôle » du stepper, `stageCodes: []`
  // jusqu'ici) : le rôle, puis l'ancienneté dans ce rôle et dans le métier.
  ['company_info', 'cadrage-activite', ['activity_nature']],
  ['company_info', 'cadrage-outils', ['tools', 'data_sources', 'workflow_pain']],
  ['company_info', 'cadrage-missions', ['delivery_frictions']],
  ['role', 'role', ['user_role', 'portfolio_size']],
  ['role', 'anciennete', ['role_tenure', 'industry_tenure']],
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ, quatre sous-étapes AJOUTÉES EN FIN du stage `role`. Cadre ce que
  // Laura PROPOSE (#2033.9/.10), jamais ce que l'API accepte (GA-26).
  ['role', 'decisions-autorite', ['decisions_alone', 'decisions_to_validate']],
  ['role', 'equipe-managee', ['people_managed']],
  [
    'role',
    'responsabilites-autorite',
    ['recruitment_accounts_authority', 'staffing_authority', 'margin_billing_authority'],
  ],
  ['role', 'outils-invitation', ['tools_access', 'invite_authority']],
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
  // du commercial, AJOUTÉE EN FIN du stage `role`.
  [
    'role',
    'qui-fait-quoi',
    [
      'associates_count',
      'recruiters_team_size',
      'delivery_team_size',
      'marketing_team_size',
      'ops_team_size',
      'team_coordination_mode',
    ],
  ],
  // #2058.2 / #2058.10 — les moments acceptés et le niveau de détail attendu,
  // AJOUTÉE EN FIN du stage `role` comme les blocs précédents.
  ['role', 'preferences-echanges', ['contact_windows', 'detail_level']],
  ['role', 'cadrage-role', ['first_name', 'scope_level', 'scope_unit']],
  ['role', 'cadrage-laura', ['autonomy', 'context_policy']],
  ['offer_expertise', 'domaine-offre', ['offer_domains']],
  ['offer_expertise', 'domaines', ['expertise_areas']],
  ['offer_expertise', 'positionnement', ['positioning', 'staffing_model']],
  ['offer_expertise', 'recrutement', ['recruits_for_clients', 'workspace_profile']],
  // Lot 26 (#2038, #2039, #2040) — quatre sous-étapes de plus, EN FIN de stage.
  ['offer_expertise', 'offre-prestations', ['service_types']],
  ['offer_expertise', 'offre-prestations-etats', ['service_types_proven', 'service_types_desired']],
  ['offer_expertise', 'staffing-modes', ['staffing_modes']],
  ['offer_expertise', 'staffing-cadre', ['profile_validation_methods', 'contractual_constraints']],
  // #2039.6 (épopée #2880, lot `feat/nuit-14-25-09`) — `expertise_no_concrete_proof`
  // rejoint la sous-étape EXISTANTE, EN FIN, sans en créer une nouvelle.
  // #2039.2 (épopée #2880, lot `feat/soir-s10-26-09`) — `expertise_client_reference`
  // rejoint la même sous-étape, EN FIN, même mécanisme.
  // #2039.3/.4/.5 (épopée #2880, vague G lot g10) — `expertise_personal_experience`
  // / `expertise_partner` / `expertise_talent_pool` rejoignent la même
  // sous-étape, EN FIN, même mécanisme.
  [
    'offer_expertise',
    'credibilite-preuves',
    [
      'case_study_results',
      'client_testimonials',
      'reference_accounts',
      'expertise_no_concrete_proof',
      'expertise_client_reference',
      'expertise_personal_experience',
      'expertise_partner',
      'expertise_talent_pool',
    ],
  ],
  // #2041.1 — `priority_sectors` s'intercale entre les deux : le niveau le plus
  // fort se demande juste après les secteurs visés, avant la preuve.
  ['offer_expertise', 'cadrage-offre', ['offer_pitch', 'language_capabilities']],
  ['offer_expertise', 'cadrage-expertises', ['priority_expertise', 'skill_technos']],
  ['offer_expertise', 'cadrage-staffing', ['bench_status', 'recruiting_priorities']],
  ['offer_expertise', 'cadrage-economie', ['commercial_limits', 'currency']],
  ['target_market', 'secteurs', ['target_sectors', 'priority_sectors', 'reference_sectors']],
  // #2036.2 (#2847, lot `feat/nuit-15-25-09`) — `remote_and_travel_scope`
  // rejoint la sous-étape EXISTANTE, EN FIN, sans en créer une nouvelle.
  // #2036.8 (#2847, lot r4 26/09) — `zone_capability_status` rejoint la même
  // sous-étape, EN FIN, v1 tranché sans Louis.
  [
    'target_market',
    'cibles',
    ['target_company_types', 'geo_zones', 'remote_and_travel_scope', 'zone_capability_status'],
  ],
  [
    'target_market',
    'canaux',
    [
      'entry_channels_used',
      'entry_channels_period',
      'entry_channels_measured',
      'entry_channels_last_starts',
      'entry_channels_time_split',
    ],
  ],
  ['target_market', 'mesures', ['activity_measures_tracked', 'activity_reference_period']],
  ['target_market', 'frein', ['main_sales_pain']],
  // #2055 — les freins qui pèsent, et les trois relances.
  ['target_market', 'freins', ['sales_freins', 'frein_attempted', 'frein_stopped', 'frein_stopped_reason']],
  [
    'target_market',
    'client-ideal',
    [
      'ideal_client_size',
      'ideal_client_structure',
      'ideal_client_maturity',
      'ideal_client_territory',
      'ideal_client_accessibility',
      'ideal_client_max_sales_cycle',
      'ideal_client_min_deal_size',
      'ideal_client_referencement_constraints',
      'ideal_client_current_state',
    ],
  ],
  ['target_market', 'interlocuteurs', ['real_response_level', 'budget_validator', 'access_orienteur']],
  [
    'target_market',
    'chemins-acces',
    ['entry_channels_dependency', 'entry_channels_prerequisites', 'entry_channels_saturation'],
  ],
  // #2059 — attribution marketing, AJOUTÉE EN FIN de `target_market` — donc
  // AVANT le stage `goals`, qui reste le dernier. « Ajouté en fin » se lit
  // dans SON stage, pas en fin de liste : la fusion l'avait mise après `goals`.
  ['target_market', 'attribution', ['heard_about_bellum']],
  // #2045.1/.2/.4/.7 (lot B, 22/09/2026) — le réseau personnel DÉCLARÉ pour
  // quatre portes de `canaux`, AJOUTÉE EN FIN de `target_market` (donc APRÈS
  // `attribution`, qui reste EN FIN de son propre lot — « ajouté en fin » se
  // lit dans SON stage, pas en fin de liste).
  [
    'target_market',
    'reseau-comptage',
    [
      'former_clients_count_band',
      'former_colleagues_count_band',
      'partners_count_band',
      'referrers_count_band',
      // #2045.6 (lot B, 22/09/2026) — les relations chaudes, transversales aux
      // quatre portes ci-dessus, AJOUTÉES EN FIN de la sous-étape existante.
      'warm_relations_count_band',
    ],
  ],
  // #2018.4 — le stage `goals` (« Tes objectifs » du stepper, `stageCodes: []`
  // jusqu'ici) : l'objectif individuel et la cible chiffrée à 30 jours.
  ['target_market', 'cadrage-cibles', ['target_nature', 'target_size']],
  ['target_market', 'cadrage-territoire', ['country_scope', 'geography_detail']],
  ['target_market', 'cadrage-exclusions', ['no_go', 'account_access']],
  ['goals', 'objectifs', ['individual_goal', 'monthly_target']],
  // #2060 — la question ouverte qui FERME le parcours, AJOUTÉE EN FIN du
  // stage `goals` (donc EN FIN de tout le parcours, #2060.1).
  ['goals', 'cadrage-horizon', ['horizon', 'success_target']],
  ['goals', 'question-ouverte', ['uncovered_activity_note']],
]

// Le vivier de consultants déclaré (#2046), la base de clients déclarée
// (#2047 — `client_base_active_accounts_band` n'existe pas, voir
// `answers-base-clients.ts`) et l'attribution marketing (#2059) arrivent sur
// un questionnaire que la vague 12 avait déjà élargi ailleurs.
// ⚠️ Chaque branche écrivait le triplet juste pour elle seule — 5/32/86,
// 3/35/106, 3/30/82. Ni la somme ni aucun des trois n'est juste : le triplet
// se REMESURE à la fusion, il ne se recopie d'aucun côté. REMESURÉ à la vague
// 12 bis (le 16/09/2026, suite verte) : 5 / 39 / 112 — `main` avait déjà
// 12 ter (#2041.1) : 113 — `priority_sectors`, le niveau le plus fort par
// secteur. Ajoutée, pas substituée : `target_sectors` reste la question des
// secteurs VISÉS.
// absorbé #2046, #2047 et #2059, la fusion du parking n'ajoute donc aucune
// sous-étape, seulement l'ORDRE (attribution en fin de `target_market`).
// #2005.4 (DÉCISION Louis 17/09, lot CP2) — +1 sous-étape / +1 question :
// « où l'ESN est implantée » (`company_locations`), stage `company_info`.
// #2035.1 / #2035.2 — +2 questions dans `effectif-reel` (117 = 115 + 2).
// VAGUE 18/09 M — +1 sous-étape (`chiffre-affaires`, 2 questions) et +1
// question (`consultant_count` dans `entreprise`), #2088.12/.13 décision
// Louis du 18/09 : 41 sous-étapes, 120 questions.
// #2060 — +1 sous-étape / +1 question : la question ouverte qui FERME le
// parcours (`uncovered_activity_note`), stage `goals`, EN FIN : 41+1=42,
// 120+1=121.
// #2033.2-.8 (D3, décision Louis 18/09/2026, périmètre d'autorité déclaré) —
// coupée d'un `main` plus ancien (40 sous-étapes / 117 questions), la branche
// ajoute +4 sous-étapes / +8 questions dans le stage `role`
// (`decisions-autorite`, `equipe-managee`, `responsabilites-autorite`,
// `outils-invitation`).
// ⚠️ Chaque branche mesurait juste pour elle-même (42/121 d'un côté, 44/125 de
// l'autre, ce dernier depuis une base plus ancienne) : ni l'un ni l'autre
// n'est juste une fois les deux fusionnés. REMESURÉ à la fusion vague 18/09 P,
// pas recopié d'aucun côté : 42 + 4 = 46 sous-étapes, 121 + 8 = 129 questions.
//
// 18/09/2026, lot EE (#2037.1/.3/.4/.5/.6/.11) : 46 → **47** sous-étapes,
// 129 → **135** questions — une sous-étape `qui-fait-quoi`, six questions,
// AJOUT SEULEMENT.
//
// 20/09/2026 (#2058.2 / #2058.10) : 47 → **48** sous-étapes, 135 → **137**
// questions — `preferences-echanges` (2 questions : `contact_windows`,
// `detail_level`), AJOUTÉE EN FIN du stage `role`. Les deux existaient déjà
// côté profil progressif et en colonne `esn_profiles` depuis le 19/09, mais
// aucune des cinq sections du Temps-1 ne les posait : réfuté en production
// le 20/09 (`GET /esn-profile` rendait les deux colonnes, aucun écran ne les
// affichait).
//
// #2640.2 (21/09/2026) : 48 sous-étapes inchangées, 137 → **138** questions —
// `esn_website` rejoint `entreprise` (stage `company_info`), la sous-étape
// existante, sans en créer une nouvelle.
//
// #2045.1/.2/.4/.7 (lot B, 22/09/2026) : 48 → **49** sous-étapes, 138 →
// **142** questions — `reseau-comptage` (4 questions), AJOUTÉE EN FIN du
// stage `target_market`.
//
// #2045.6 (lot B, 22/09/2026) : 49 sous-étapes inchangées, 142 → **143**
// questions — `warm_relations_count_band` rejoint `reseau-comptage`, la
// sous-étape existante, sans en créer une nouvelle.
//
// Vague de nuit 25/09 : deux lots reparties de ce même 143 SANS SE VOIR —
// #2039.6 (`expertise_no_concrete_proof`, lot `feat/nuit-14-25-09`, +1 dans
// `credibilite-preuves`) et #2036.2 (`remote_and_travel_scope`, lot
// `feat/nuit-15-25-09`, +1 dans `cibles`). 49 sous-étapes inchangées (les deux
// rejoignent une sous-étape EXISTANTE) : 143 + 1 + 1 = 145.
//
// Lot r4 (26/09) : 145 → **146** — #2036.8 (`zone_capability_status`, v1
// tranché sans Louis) rejoint `cibles`, la sous-étape EXISTANTE, sans en
// créer une nouvelle. 49 sous-étapes inchangées.
//
// Lot soir S10 (26/09) : 146 → **147** — #2039.2 (`expertise_client_reference`,
// épopée #2880) rejoint `credibilite-preuves`, la sous-étape EXISTANTE, sans
// en créer une nouvelle. 49 sous-étapes inchangées.
//
// Vague G lot g10 (27/09) : 147 → **150** — #2039.3/.4/.5
// (`expertise_personal_experience` / `expertise_partner` /
// `expertise_talent_pool`, épopée #2880) rejoignent `credibilite-preuves`, la
// sous-étape EXISTANTE, sans en créer une nouvelle. 49 sous-étapes inchangées.
// #4270.1 (18/10) : 151 → **152** — `workspace_profile` (sous-étape `recrutement`).
// Théo O onboarding-couverture (22/10/2026) : 49 → **62** sous-étapes, 152 → **178** questions — les 26 « Précisions de
// cadrage » de la V23 en 13 sous-étapes, AJOUT SEULEMENT, EN FIN de leur stage (`question-ouverte` ferme toujours `goals`).
// Lot J (31/10) : 178 → **179** — #4971.1 `tooling_internal_names` rejoint `outillage`, la
// sous-étape EXISTANTE, EN FIN. 62 sous-étapes inchangées.
const MEASURED = { stages: 5, subSteps: 62, questions: 179 } as const

describe('lib/questions — le corpus est lu', () => {
  it('trouve des fichiers de sous-étape sur le disque (une garde qui itère sur du vide est verte et borgne)', () => {
    expect(tsFiles.length).toBeGreaterThan(2)
    expect(subStepFiles.length).toBe(MEASURED.subSteps)
  })

  it('recompose des sous-étapes qui portent des questions', () => {
    expect(TEMPS1_CATALOGUE_SUBSTEPS.length).toBe(MEASURED.subSteps)
    expect(TEMPS1_CATALOGUE_SUBSTEPS.every(s => s.questions.length > 0)).toBe(true)
  })
})

describe("lib/questions — l'éclatement n'a rien perdu", () => {
  it('garde les nombres mesurés (5 stages / 49 sous-étapes / 147 questions, lots L15, L17, L19, 26, G4, #2018.2, #2018.4, #2046, #2047, #2059, #2005.4, #2088.12/.13, #2060, #2033.2-.8, #2037, #2045, #2039.6, #2036.2, #2036.8 et #2039.2 inclus)', () => {
    expect(TEMPS1_STAGES.length).toBe(MEASURED.stages)
    expect(TEMPS1_CATALOGUE_SUBSTEPS.length).toBe(MEASURED.subSteps)
    expect(TEMPS1_CATALOGUE_SUBSTEPS.reduce((n, s) => n + s.questions.length, 0)).toBe(MEASURED.questions)
  })

  it("garde l'ordre exact des stages, des sous-étapes et des questions", () => {
    const actual = TEMPS1_CATALOGUE_SUBSTEPS.map(s => [s.stageCode, s.slug, s.questions.map(q => q.key)])
    const expected = EXPECTED.map(([stage, slug, keys]) => [stage, slug, [...keys]])
    expect(actual).toEqual(expected)
  })

  /**
   * #2626.1 — le CATALOGUE ci-dessus est ce que le dépôt contient ; celui-ci
   * est ce que le Temps 1 POSE depuis l'arbitrage du 20/09/2026. La garde
   * existe pour que la séparation ne se referme pas par inadvertance : si un
   * jour `TEMPS1_SUBSTEPS` reposait les 135 questions, elle rougirait.
   */
  it('le PARCOURS ne pose que ce qui est exigé — 125 questions sont reposées au Temps 2', () => {
    const posees = TEMPS1_SUBSTEPS.reduce((n, s) => n + s.questions.length, 0)
    expect(posees).toBe(10)
    expect(posees).toBeLessThan(MEASURED.questions)
    expect(TEMPS1_SUBSTEPS.length).toBeLessThan(MEASURED.subSteps)
    expect(TEMPS1_SUBSTEPS.every(s => s.questions.length > 0)).toBe(true)
    expect(TEMPS1_SUBSTEPS.map(s => s.index)).toEqual([...Array(TEMPS1_SUBSTEPS.length).keys()])
  })

  it('garde les codes de stage dans leur ordre', () => {
    expect(TEMPS1_STAGE_CODES).toEqual(['company_info', 'role', 'offer_expertise', 'target_market', 'goals'])
  })

  it('numérote les sous-étapes dans la séquence globale, sans trou', () => {
    expect(TEMPS1_CATALOGUE_SUBSTEPS.map(s => s.index)).toEqual([...Array(MEASURED.subSteps).keys()])
  })
})

describe('lib/questions — une sous-étape = un fichier', () => {
  it('donne un fichier à chaque sous-étape recomposée par l’index', () => {
    const missing = TEMPS1_CATALOGUE_SUBSTEPS.map(s => `${s.slug}.ts`).filter(f => !existsSync(join(HERE, f)))
    expect(missing, 'sous-étapes déclarées dans l’index sans fichier à leur nom').toEqual([])
  })

  it("ne laisse aucun fichier de sous-étape hors de l'index (orphelin)", () => {
    const declared = new Set(TEMPS1_CATALOGUE_SUBSTEPS.map(s => `${s.slug}.ts`))
    const orphans = subStepFiles.filter(f => !declared.has(f))
    expect(orphans, 'fichiers de sous-étape que l’index ne recompose pas').toEqual([])
  })

  it('ne compte NI l’index NI les types NI les tests comme des sous-étapes (témoin)', () => {
    // Ces trois-là existent bel et bien : le filtre travaille sur du réel.
    expect(existsSync(join(HERE, 'index.ts'))).toBe(true)
    expect(existsSync(join(HERE, 'types.ts'))).toBe(true)
    expect(tsFiles).toContain('index.test.ts')
    expect(subStepFiles).not.toContain('index.ts')
    expect(subStepFiles).not.toContain('types.ts')
    expect(subStepFiles).not.toContain('index.test.ts')
  })

  it('ne balaie que son dossier : le complément Temps-2 reste dehors (témoin)', () => {
    // `complement-questions.ts` est un AUTRE mécanisme, rendu par
    // `ProfileComplementCard`. Il existe, et il n'entre pas dans le corpus.
    expect(existsSync(join(HERE, '..', 'complement-questions.ts'))).toBe(true)
    expect(subStepFiles.some(f => f.includes('complement'))).toBe(false)
  })
})

describe('lib/questions — aucun identifiant de question en double', () => {
  it('ne déclare jamais la même clé dans deux fichiers', () => {
    const keys = TEMPS1_CATALOGUE_SUBSTEPS.flatMap(s => s.questions.map(q => q.key))
    const seen = new Map<string, number>()
    for (const key of keys) seen.set(key, (seen.get(key) ?? 0) + 1)
    const duplicates = [...seen].filter(([, n]) => n > 1).map(([key]) => key)
    expect(duplicates, 'clés de question déclarées plus d’une fois').toEqual([])
    expect(keys.length).toBe(MEASURED.questions)
  })

  it('ne déclare jamais le même slug dans deux fichiers', () => {
    const slugs = TEMPS1_CATALOGUE_SUBSTEPS.map(s => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
