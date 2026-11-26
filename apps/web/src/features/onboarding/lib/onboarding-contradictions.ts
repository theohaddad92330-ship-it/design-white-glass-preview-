import type { TFunction } from 'i18next'
import {
  detectQuestionnaireContradictions,
  NORTH_EXTREMITY_ZONES,
  PRIORITY_SECTORS_NUDGE_THRESHOLD,
  prioritySectorCount,
  SOUTH_EXTREMITY_ZONES,
  type QuestionnaireContradiction,
  type QuestionnaireContradictionId,
} from '@bellum/contracts'
import { TEMPS1_CATALOGUE_SUBSTEPS } from '@/features/onboarding/lib/questions'
import type { ReviewEditTarget } from '@/features/onboarding/lib/onboarding-review-blocks'
import type { OnboardingAnswers, OnboardingAnswerValue } from '@/stores/onboardingStore'

/**
 * #2029 — le pendant ÉCRAN des huit détecteurs de `@bellum/contracts` :
 * compose la phrase exacte « Tu m'as indiqué X et Y… » (#2029.9) à partir des
 * VRAIES réponses (jamais une valeur inventée), résout où « Corriger » renvoie
 * (#2029.10), et porte la clé d'hypothèse d'audit (#2029.11) — jamais une
 * accusation, jamais une affirmation plus stricte que ce que l'utilisateur a
 * donné.
 */

/** Exporté depuis que la tension se rend en CARTE : `OnboardingContradictionCard`
 *  (#2030.13) la reçoit en props et doit donc nommer le type. Tant que l'écran
 *  n'en consommait que la VALEUR, il restait interne — c'est l'apparition d'un
 *  consommateur extérieur qui l'exporte, pas l'inverse (`pnpm lint:exports:types`). */
export type ContradictionView = {
  id: QuestionnaireContradictionId
  x: string
  y: string
  hypothesisKey: string
  /** `null` quand aucune des clés en tension n'est une question Temps-1
   *  atteignable — un renvoi deviné vaudrait pire qu'aucun bouton (#2030.9). */
  editTarget: ReviewEditTarget | null
}

const HYPOTHESIS_KEYS: Record<QuestionnaireContradictionId, string> = {
  small_team_many_sectors: 'contradictions.hypothesis.smallTeamManySectors',
  no_sales_capacity_large_portfolio: 'contradictions.hypothesis.noSalesCapacityLargePortfolio',
  niche_wide_offer: 'contradictions.hypothesis.nicheWideOffer',
  high_target_low_time: 'contradictions.hypothesis.highTargetLowTime',
  big_accounts_no_access: 'contradictions.hypothesis.bigAccountsNoAccess',
  freelance_only_no_bench: 'contradictions.hypothesis.freelanceOnlyNoBench',
  distant_zones_no_reach: 'contradictions.hypothesis.distantZonesNoReach',
  acquisition_priority_no_outbound: 'contradictions.hypothesis.acquisitionPriorityNoOutbound',
  too_many_priority_sectors: 'contradictions.hypothesis.tooManyPrioritySectors',
}

function asArray(value: OnboardingAnswerValue | undefined): string[] {
  return Array.isArray(value) ? value : []
}

function asText(value: OnboardingAnswerValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/** #2029.9 — X et Y, jamais une troisième valeur devinée : chaque fragment
 *  vient directement de la réponse réelle, ou d'un compte réel (`length`). */
function describeParts(
  contradiction: QuestionnaireContradiction,
  answers: OnboardingAnswers,
  t: TFunction<'onboarding'>,
): { x: string; y: string } {
  switch (contradiction.id) {
    case 'small_team_many_sectors':
      return {
        x: asText(answers.sales_team_size),
        y: t('contradictions.parts.sectorCount', { count: asArray(answers.target_sectors).length }),
      }
    case 'no_sales_capacity_large_portfolio':
      return {
        x: asText(answers.sales_team_size),
        y: t('contradictions.parts.portfolioSize', { size: asText(answers.portfolio_size) }),
      }
    case 'niche_wide_offer':
      return {
        x: asText(answers.positioning),
        y: t('contradictions.parts.expertiseCount', { count: asArray(answers.expertise_areas).length }),
      }
    case 'high_target_low_time':
      return {
        x: t('contradictions.parts.monthlyTarget', { target: asText(answers.monthly_target) }),
        y: t('contradictions.parts.weeklyTime', { time: asText(answers.weekly_sales_time_declared) }),
      }
    case 'big_accounts_no_access':
      return { x: t('contradictions.parts.bigAccounts'), y: t('contradictions.parts.noAccessChannel') }
    case 'freelance_only_no_bench':
      return { x: asText(answers.staffing_model), y: t('contradictions.parts.emptyBench') }
    case 'distant_zones_no_reach': {
      const zones = asArray(answers.geo_zones)
      const north = zones.find(zone => NORTH_EXTREMITY_ZONES.includes(zone)) ?? ''
      const south = zones.find(zone => SOUTH_EXTREMITY_ZONES.includes(zone)) ?? ''
      return { x: north, y: south }
    }
    case 'acquisition_priority_no_outbound':
      return { x: t('contradictions.parts.acquisitionGoal'), y: t('contradictions.parts.noOutboundChannel') }
    case 'too_many_priority_sectors':
      // #2041.1 — les deux fragments sont des COMPTES réels : ce que l'ESN a
      // déclaré prioritaire, et le seuil qu'elle vient de franchir. Le seuil
      // est LU depuis le contrat, jamais réécrit ici (GA-26).
      return {
        x: t('contradictions.parts.prioritySectorCount', { count: prioritySectorCount(answers) }),
        y: t('contradictions.parts.prioritySectorThreshold', { count: PRIORITY_SECTORS_NUDGE_THRESHOLD }),
      }
  }
}

/**
 * La première clé en tension qui correspond à une question réelle du
 * questionnaire — DANS LE CATALOGUE (`TEMPS1_CATALOGUE_SUBSTEPS`), pas dans ce
 * que le Temps 1 pose encore (`TEMPS1_SUBSTEPS`).
 *
 * Né de la fusion (#2626.1) : une clé en tension comme `priority_sectors`
 * (#2041.1) a rejoint les questions reportées au Temps 2 — elle a disparu de
 * `TEMPS1_SUBSTEPS`, mais l'écran où elle SE RÉPARE (la sous-étape `secteurs`,
 * qui porte encore `target_sectors`) existe toujours. « Corriger » renvoie
 * vers CET écran, pas vers une clé précise : le catalogue, qui connaît la
 * sous-étape de chaque question sans tenir compte du moment où elle se pose,
 * est la bonne source ici.
 */
function editTargetForKeys(keys: readonly string[]): ReviewEditTarget | null {
  for (const key of keys) {
    const sub = TEMPS1_CATALOGUE_SUBSTEPS.find(s => s.questions.some(q => q.key === key))
    if (sub) return { stage: sub.stageCode, slug: sub.slug }
  }
  return null
}

export function buildQuestionnaireContradictions(
  answers: OnboardingAnswers,
  t: TFunction<'onboarding'>,
): ContradictionView[] {
  return detectQuestionnaireContradictions(answers).map(contradiction => {
    const { x, y } = describeParts(contradiction, answers, t)
    return {
      id: contradiction.id,
      x,
      y,
      hypothesisKey: HYPOTHESIS_KEYS[contradiction.id],
      editTarget: editTargetForKeys(contradiction.keys),
    }
  })
}
