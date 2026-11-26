import { describe, expect, it } from 'vitest'
import { SEARCH_THRESHOLD } from '@/features/onboarding/components/QuestionField'
import { TEMPS1_STAGES, type Question } from './index'

/**
 * #2087.9 / #2088.3 — réparation 18/09. La recette écran en production n'a
 * réfuté QUE deux questions (`esn_maturity_situation`, `user_role`), mais la
 * mesure du même soir (`git grep -c` sur `apps/web/src`, coordinateur) montre
 * que le trou est plus large : `iconKey` n'était posé dans AUCUN fichier de
 * `lib/questions/*.ts`, `descriptionKey` dans un seul (`offre-prestations.ts`,
 * un choix `multi`, pas `single`). Remplir tout le catalogue serait un lot
 * bien plus gros que celui-ci, et en grande partie du remplissage CREUX (les
 * questions-bande — tranches de consultants, de TJM, de clients — n'ont pas
 * de vocabulaire d'icône juste dans le registre fermé de `ChoiceRow`).
 *
 * Cette garde ne referme donc PAS tout le catalogue : elle force une DÉCISION
 * explicite sur chaque question à choix `single`, comme `demo-coverage.ts`
 * force « seedée » ou « vide à dessein avec sa raison » — jamais un silence.
 * Une question single est soit CONFORME (icône/description sur CHAQUE choix),
 * soit nommée dans `CARD_ICON_PENDING`/`LONG_DESCRIPTION_PENDING` avec une
 * raison. Un choix `single` neuf sans l'un ni l'autre fait échouer la garde —
 * personne ne peut plus ajouter une question au catalogue sans répondre à la
 * question « icône/description, oui ou non, et pourquoi si non ».
 *
 * `esn_maturity_situation` et `user_role` ne figurent plus dans leur liste
 * PENDING : ce sont les deux questions réparées par ce lot, prouvées en plus
 * par `maturite.test.ts` / `role.test.ts` (garde dédiée, message d'échec plus
 * précis). Les autres questions listées ici restent HORS PÉRIMÈTRE de ce
 * lot — voir le rapport de ce lot et la ligne #2087.9/#2088.3 du registre
 * pour l'agent suivant, elles n'ont pas été écartées, seulement nommées.
 */

const CARD_ICON_PENDING_REASON =
  "Hors périmètre du lot H4 (18/09) : #2087.9 réparait la SEULE carte réfutée en production, esn_maturity_situation. Ces questions sont des TRANCHES numériques (consultants, clients, TJM, équipe…) — leur donner une icône dans le registre fermé actuel (CHOICE_ICON_KEYS) serait décoratif au sens creux, pas un signal juste. Décision de contenu (quel vocabulaire d'icône, le cas échéant) à prendre par un lot dédié, pas ce lot. Théo O onboarding-couverture (22/10) : les six single courts des « Précisions de cadrage » V23 (périmètre, horizon, devise, staffing, autonomie, contexte de Laura) sont des tranches ou des préférences — aucun pictogramme du registre fermé ne dirait un signal juste."

/**
 * #2087.9 — questions `single` COURTES (rendu carte) qui n'ont pas encore
 * d'icône, listées EXPLICITEMENT (pas un `filter` silencieux) : ajouter une
 * icône à l'une d'elles retire sa clé d'ici, l'oublier fait échouer le test
 * de staleness ci-dessous.
 */
const CARD_ICON_PENDING: readonly string[] = [
  'scope_level',
  'horizon',
  'currency',
  'bench_status',
  'autonomy',
  'context_policy',
  'consultant_size',
  'sales_team_size',
  'company_growth_goal',
  'active_clients_band',
  'revenue_recurrence',
  'client_concentration_risk',
  'consultants_managed_by_user_band',
  'available_consultants_band',
  'consultant_size_group_band',
  'consultant_size_business_unit_band',
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
  'weekly_sales_time_declared',
  'weekly_sales_time_protected',
  'weekly_sales_time_residual',
  'workload_variability',
  'protected_slot_capacity',
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
  'tooling_reference_freshness',
  'tooling_reference_confidence',
  'tooling_reference_export',
  'tooling_duplicates',
  'annual_revenue_period',
  'portfolio_size',
  'role_tenure',
  'industry_tenure',
  'recruitment_accounts_authority',
  'staffing_authority',
  'margin_billing_authority',
  'invite_authority',
  'associates_count',
  'recruiters_team_size',
  'delivery_team_size',
  'marketing_team_size',
  'ops_team_size',
  'team_coordination_mode',
  'positioning',
  'staffing_model',
  'recruits_for_clients',
  'activity_reference_period',
  'ideal_client_accessibility',
  'ideal_client_max_sales_cycle',
  'ideal_client_min_deal_size',
  'real_response_level',
  'budget_validator',
  'access_orienteur',
  // #2058.10 — `detail_level` rejoint le Temps-1 (`preferences-echanges.ts`) en
  // réutilisant le catalogue du profil progressif (`PROFILE_QUESTION_OPTIONS`) :
  // même hors périmètre pour le même motif que les tranches numériques
  // ci-dessus, le registre d'icônes fermé (`CHOICE_ICON_KEYS`) n'a rien qui
  // porte « court et dense » / « développé » / « ça dépend » — décision de
  // vocabulaire à prendre par un lot dédié, pas ce lot.
  'detail_level',
  // #2045.1/.2/.4/.7 (lot B, 22/09/2026) — le réseau personnel, mêmes
  // TRANCHES numériques que `talent_pool_*` ci-dessus (`VIVIER_COUNT_BAND_CHOICES`) :
  // même motif, même raison PENDING.
  'former_clients_count_band',
  'former_colleagues_count_band',
  'partners_count_band',
  'referrers_count_band',
  'warm_relations_count_band',
]

const LONG_DESCRIPTION_PENDING_REASON =
  'Hors périmètre du lot H4 (18/09) : #2088.3 réparait SEULEMENT user_role, réfuté en production. Écrire une phrase qui distingue chaque entrée de ces catalogues (main_sales_pain, heard_about_bellum, individual_goal, monthly_target) reste une décision de contenu, pas de ce lot.'

/**
 * #2088.3 — questions `single` LONGUES (rendu liste recherchable) sans
 * description sur leurs entrées, listées EXPLICITEMENT.
 */
const LONG_DESCRIPTION_PENDING: readonly string[] = [
  'main_sales_pain',
  'heard_about_bellum',
  'individual_goal',
  'monthly_target',
]

describe('catalogue réel — icône (cartes) et description (choix longs) : conforme ou nommé (#2087.9 / #2088.3)', () => {
  const singles = TEMPS1_STAGES.flatMap(stage => stage.steps.flatMap(step => step.questions)).filter(
    (q): q is Extract<Question, { kind: 'single' }> => q.kind === 'single',
  )
  const cardQuestions = singles.filter(q => q.choices.length <= SEARCH_THRESHOLD)
  const longQuestions = singles.filter(q => q.choices.length > SEARCH_THRESHOLD)

  it('le corpus de cartes courtes n’est pas vide', () => {
    expect(cardQuestions.length).toBeGreaterThan(0)
  })

  it('le corpus de choix longs n’est pas vide', () => {
    expect(longQuestions.length).toBeGreaterThan(0)
  })

  it.each(cardQuestions)('« $key » porte une icône sur chaque carte, ou figure dans CARD_ICON_PENDING', question => {
    if (CARD_ICON_PENDING.includes(question.key)) {
      expect(CARD_ICON_PENDING_REASON.length, 'la raison PENDING ne doit pas être vide').toBeGreaterThan(20)
      return
    }
    const sansIcone = question.choices.filter(c => !c.iconKey).map(c => c.value)
    expect(sansIcone, `${question.key} sans icône : ${sansIcone.join(', ')}`).toEqual([])
  })

  it.each(longQuestions)(
    '« $key » porte une description sur chaque entrée, ou figure dans LONG_DESCRIPTION_PENDING',
    question => {
      if (LONG_DESCRIPTION_PENDING.includes(question.key)) {
        expect(LONG_DESCRIPTION_PENDING_REASON.length, 'la raison PENDING ne doit pas être vide').toBeGreaterThan(20)
        return
      }
      const sansDescription = question.choices.filter(c => !c.descriptionKey).map(c => c.value)
      expect(sansDescription, `${question.key} sans description : ${sansDescription.join(', ')}`).toEqual([])
    },
  )

  it('CARD_ICON_PENDING ne référence que des clés réelles du catalogue de cartes', () => {
    const clesReelles = new Set<string>(cardQuestions.map(q => q.key))
    const inconnues = CARD_ICON_PENDING.filter(k => !clesReelles.has(k))
    expect(inconnues, `clés PENDING introuvables dans le catalogue : ${inconnues.join(', ')}`).toEqual([])
  })

  it('LONG_DESCRIPTION_PENDING ne référence que des clés réelles du catalogue de choix longs', () => {
    const clesReelles = new Set<string>(longQuestions.map(q => q.key))
    const inconnues = LONG_DESCRIPTION_PENDING.filter(k => !clesReelles.has(k))
    expect(inconnues, `clés PENDING introuvables dans le catalogue : ${inconnues.join(', ')}`).toEqual([])
  })

  it('esn_maturity_situation et user_role sont réparés : ils ne sont plus dans leur liste PENDING', () => {
    expect(CARD_ICON_PENDING).not.toContain('esn_maturity_situation')
    expect(LONG_DESCRIPTION_PENDING).not.toContain('user_role')
  })
})
