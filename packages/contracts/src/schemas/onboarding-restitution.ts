import { z } from 'zod'
import { frontsBudget } from './onboarding/fronts-budget.js'
import type { EsnAnswers } from './onboarding.js'
import type { CoachingInsights } from './profile-context.js'

/**
 * #3252.1-.14 (BEL-SC-223) — LA RESTITUTION DE FIN D'ONBOARDING. Le
 * questionnaire se referme aujourd'hui sur un écran DÉJÀ riche
 * (`WelcomeScreen.tsx` : salut, personnalisation, forces, coaching,
 * connecteurs, mémoire marché, situations) — le NO-GO de l'issue (« la page
 * finale dit "Ton profil est terminé" puis un dashboard vide ») ne décrit
 * donc pas cet écran. Ce qui manquait, précisément : les 10 champs COMPRIS
 * regroupés et NOMMÉS comme tels (au lieu des 4 de `toWelcomeProfileSummary`),
 * le maillon faible dépiofié PLUS QUE `coachingInsights.mainWeakness` seul
 * (faits / hypothèses / confiance / impact / correction), le contrepoint
 * « ce que je ne recommande pas », des priorités et un premier test AVEC leur
 * raison, et les manques NOMMÉS après génération (pas seulement avant, comme
 * `onboarding-attention-points.ts`).
 *
 * ⚠️ AUCUN DEUXIÈME CALCUL (règle 4 de #3249, instruction commune) : la
 * capacité commerciale réutilise `frontsBudget` — LE calcul canonique
 * (#2067) — et le maillon faible réutilise `coachingInsights`, jamais une
 * seconde estimation. Ce module ASSEMBLE, il n'invente pas de source.
 *
 * ⚠️ « non mesuré » n'est jamais 0 : une ligne dont la donnée sous-jacente est
 * absente est EXCLUE du tableau, jamais rendue vide ou à zéro (GA-18/GA-19).
 * Aucun champ n'est une probabilité ou un pourcentage.
 */

export type OnboardingUnderstandingKey =
  | 'role'
  | 'experience'
  | 'scope'
  | 'organization'
  | 'companyStage'
  | 'offer'
  | 'verticals'
  | 'territories'
  | 'consultantModel'
  | 'salesCapacity'

/** Déclaré = réponse verbatim ; observé = calculé à partir de plusieurs
 *  réponses déclarées (jamais une seconde source) ; inféré = lu depuis une
 *  sortie du profileur (réservé, aucune ligne ne l'utilise encore — voir
 *  la note ci-dessus, le contrat le porte pour ne pas devoir migrer plus
 *  tard si Laura tient un jour ce jugement elle-même). */
export const onboardingRestitutionProvenanceSchema = z.enum(['declared', 'observed', 'inferred'])
export type OnboardingRestitutionProvenance = z.infer<typeof onboardingRestitutionProvenanceSchema>

export const onboardingUnderstandingRowSchema = z.object({
  key: z.enum([
    'role',
    'experience',
    'scope',
    'organization',
    'companyStage',
    'offer',
    'verticals',
    'territories',
    'consultantModel',
    'salesCapacity',
  ]),
  value: z.string().min(1),
  detail: z.array(z.string()),
  provenance: onboardingRestitutionProvenanceSchema,
})
export type OnboardingUnderstandingRow = z.infer<typeof onboardingUnderstandingRowSchema>

export const onboardingBottleneckSchema = z.object({
  /** `coachingInsights.mainWeakness`, verbatim — jamais reformulé ici. */
  headline: z.string().min(1),
  /** Faits DÉCLARÉS, cités mot pour mot — jamais une déduction muette. */
  facts: z.array(z.string()),
  /** Ce que le profileur en infère — nommé comme hypothèse, jamais comme fait. */
  hypotheses: z.array(z.string()),
  /** Catégoriel — jamais un pourcentage (doctrine : aucune probabilité). */
  confidence: z.enum(['low', 'medium', 'high']),
  impact: z.array(z.string()),
  correctable: z.literal(true),
})
export type OnboardingBottleneck = z.infer<typeof onboardingBottleneckSchema>

export const onboardingAntiRecommendationKeySchema = z.enum([
  'extendBeforeNew',
  'offerBeforeCampaign',
  'accessBeforeLargeGroups',
  'systemBeforeHiring',
])
export type OnboardingAntiRecommendationKey = z.infer<typeof onboardingAntiRecommendationKeySchema>

export const onboardingPriorityKeySchema = z.enum([
  'extendExistingAccounts',
  'defineOffer',
  'buildAccessPath',
  'analyzeFirstAccount',
])
export type OnboardingPriorityKey = z.infer<typeof onboardingPriorityKeySchema>

export const onboardingGapKeySchema = z.enum(['role', 'companyStage', 'revenue', 'accessPath'])
export type OnboardingGapKey = z.infer<typeof onboardingGapKeySchema>

export const onboardingRestitutionSchema = z.object({
  understanding: z.array(onboardingUnderstandingRowSchema),
  /** `null` = non évaluable (ni `mainWeakness` ni fait déclaré) — EXCLU de
   *  l'écran, jamais affiché à zéro. */
  bottleneck: onboardingBottleneckSchema.nullable(),
  notRecommended: z.array(onboardingAntiRecommendationKeySchema).max(3),
  /** Maximum trois (règle explicite de l'issue). */
  priorities: z.array(onboardingPriorityKeySchema).max(3),
  firstTest: z
    .object({
      priority: onboardingPriorityKeySchema,
      estimatedMinutes: z.number().int().positive().max(15),
    })
    .nullable(),
  gaps: z.array(onboardingGapKeySchema),
})
export type OnboardingRestitution = z.infer<typeof onboardingRestitutionSchema>

const FIRST_TEST_MINUTES: Record<OnboardingPriorityKey, number> = {
  extendExistingAccounts: 10,
  defineOffer: 10,
  buildAccessPath: 10,
  analyzeFirstAccount: 5,
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function cleanList(values: readonly string[] | null | undefined): string[] {
  return (values ?? []).map(v => v.trim()).filter(Boolean)
}

/** Le champ le plus court (contrairement à `joinTop` côté web) : cette
 *  restitution NOMME dix axes, elle ne les résume pas en une ligne — la
 *  compression appartient à l'affichage, pas au contrat. */
function joinDeclared(values: readonly string[]): string {
  return values.join(' · ')
}

export type OnboardingRestitutionInput = {
  answers: EsnAnswers | null | undefined
  coachingInsights: CoachingInsights | null | undefined
  /** Au moins un compte du portefeuille attend une action — signal EXISTANT
   *  (`useHasAccountsToAct`), jamais recalculé ici. */
  hasAccountsToAct: boolean
}

export function buildOnboardingRestitution(input: OnboardingRestitutionInput): OnboardingRestitution {
  const a = input.answers
  const understanding: OnboardingUnderstandingRow[] = []

  const push = (
    key: OnboardingUnderstandingKey,
    value: string | null,
    provenance: OnboardingRestitutionProvenance,
    detail: string[] = [],
  ): void => {
    if (!value) return
    understanding.push({ key, value, detail, provenance })
  }

  push('role', clean(a?.user_role), 'declared')
  push('experience', clean(a?.role_tenure), 'declared')
  const scope = cleanList(a?.decisions_alone)
  push('scope', scope.length > 0 ? joinDeclared(scope) : null, 'declared')
  push('organization', clean(a?.team_coordination_mode), 'declared')
  push('companyStage', clean(a?.esn_maturity_situation), 'declared')
  const offer = cleanList(a?.expertise_areas)
  push('offer', offer.length > 0 ? joinDeclared(offer) : null, 'declared')
  const verticals = cleanList(a?.target_sectors)
  push('verticals', verticals.length > 0 ? joinDeclared(verticals) : null, 'declared')
  const territories = cleanList(a?.company_locations)
  push('territories', territories.length > 0 ? joinDeclared(territories) : null, 'declared')
  push('consultantModel', clean(a?.consultant_size), 'declared')

  const budget = frontsBudget({
    weekly_sales_time_protected: a?.weekly_sales_time_protected,
    weekly_sales_time_declared: a?.weekly_sales_time_declared,
    protected_slot_capacity: a?.protected_slot_capacity,
    workload_variability: a?.workload_variability,
  })
  if (budget.kind === 'measured') {
    push('salesCapacity', budget.band, 'observed', budget.erosionRisks)
  }

  // #3252.2 — LE maillon faible, dépiofié SANS second calcul : `mainWeakness`
  // reste la source, `sales_blockers` (déclaré) en sont les faits cités,
  // `keyAdvice` en est la lecture du profileur (une hypothèse, nommée comme
  // telle), et la confiance suit ce qui est RÉELLEMENT là — jamais devinée.
  const headline = clean(input.coachingInsights?.mainWeakness)
  const advice = clean(input.coachingInsights?.keyAdvice)
  const facts = cleanList(a?.sales_blockers)
  const bottleneck: OnboardingBottleneck | null = headline
    ? {
        headline,
        facts,
        hypotheses: advice ? [advice] : [],
        confidence: facts.length > 0 && advice ? 'high' : facts.length > 0 || advice ? 'medium' : 'low',
        impact: budget.kind === 'measured' ? budget.erosionRisks : [],
        correctable: true,
      }
    : null

  const hasOffer = offer.length > 0
  const hasAccessPath = cleanList(a?.entry_channels_used).length > 0
  const noSystem = clean(a?.team_coordination_mode) === 'Aucune coordination formalisée'

  const notRecommended: OnboardingAntiRecommendationKey[] = []
  if (input.hasAccountsToAct) notRecommended.push('extendBeforeNew')
  if (!hasOffer) notRecommended.push('offerBeforeCampaign')
  if (!hasAccessPath) notRecommended.push('accessBeforeLargeGroups')
  if (noSystem) notRecommended.push('systemBeforeHiring')

  const priorities: OnboardingPriorityKey[] = []
  if (input.hasAccountsToAct) priorities.push('extendExistingAccounts')
  if (!hasOffer) priorities.push('defineOffer')
  if (!hasAccessPath) priorities.push('buildAccessPath')
  if (priorities.length === 0) priorities.push('analyzeFirstAccount')

  const topPriority = priorities[0]
  const firstTest = topPriority ? { priority: topPriority, estimatedMinutes: FIRST_TEST_MINUTES[topPriority] } : null

  const gaps: OnboardingGapKey[] = []
  if (!clean(a?.user_role)) gaps.push('role')
  if (!clean(a?.esn_maturity_situation)) gaps.push('companyStage')
  if (a?.annual_revenue_amount == null) gaps.push('revenue')
  if (!hasAccessPath) gaps.push('accessPath')

  return {
    understanding,
    bottleneck,
    notRecommended: notRecommended.slice(0, 3),
    priorities: priorities.slice(0, 3),
    firstTest,
    gaps,
  }
}
