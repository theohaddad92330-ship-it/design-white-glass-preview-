import {
  ONBOARDING_ESSENTIAL_V23,
  ONBOARDING_GUIDED_V23,
  ONBOARDING_THEMES_V23,
  PROFILE_QUESTIONS,
  type UnknownAnswerReason,
} from '@bellum/contracts'
import { COMPLEMENT_QUESTIONS } from '@/features/onboarding/lib/complement-questions'
import { statusOf } from '@/features/onboarding/lib/answer-status'
import { toWebQuestion } from '@/features/onboarding/lib/profile-questions'
import { THEMES } from '@/features/onboarding/lib/theme-catalog'
import { THEME_SLUGS, type ThemeSlug } from '@/features/onboarding/lib/theme-map'
import type { Question } from '@/features/onboarding/lib/questions'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

/**
 * Théo O onboarding-essentiel / onboarding-guide — les deux marches du cadrage,
 * composées SUR le catalogue V23 des contrats (cinq blocs, huit étapes) et sur
 * nos questions (Temps 1, complément, profil progressif) : on ne réécrit aucune question, on les range.
 *
 * Les ids de thèmes du contrat et nos slugs d'écran suivent le même ordre (16
 * thèmes) : la correspondance est l'indice, gardée par le test.
 */
type Statuses = Readonly<Record<string, UnknownAnswerReason | undefined>>

export type FramingStep = {
  id: string
  /** Clé i18n du titre — `guided.blocks.<id>` (essentiel) ou `guided.steps.<id>` (guidé). */
  titleKey: string
  /** Clé i18n de la phrase de sens (guidé seulement). */
  hintKey: string | null
  questions: Question[]
  /** Les thèmes à approfondir depuis cette étape, dans l'ordre du contrat. */
  themeSlugs: ThemeSlug[]
}

const BY_KEY = new Map<string, Question>([
  ...THEMES.flatMap(theme => theme.questions.map(question => [question.key, question] as const)),
  ...COMPLEMENT_QUESTIONS.map(question => [question.key, question as Question] as const),
])
// Le profil progressif (Temps 2) : les clés du parcours guidé qu'aucune sous-étape du Temps 1 ne pose (`go_to_market_channels`).
for (const question of PROFILE_QUESTIONS) {
  if (!BY_KEY.has(question.key)) BY_KEY.set(question.key, toWebQuestion(question))
}

/** La question d'une clé du catalogue — Temps 1 d'abord, puis le profil progressif. */
export function resolveQuestion(key: string): Question | undefined {
  return BY_KEY.get(key)
}

const SLUG_BY_THEME_ID = new Map<string, ThemeSlug>(
  ONBOARDING_THEMES_V23.map((theme, index) => [theme.id, THEME_SLUGS[index]] as const),
)

function questionsOf(keys: readonly string[]): Question[] {
  return keys.flatMap(key => {
    const question = resolveQuestion(key)
    return question ? [question] : []
  })
}

/** Les cinq blocs essentiels — une seule page, cinq sections. */
export const ESSENTIAL_STEPS: readonly FramingStep[] = ONBOARDING_ESSENTIAL_V23.map(block => ({
  id: block.id,
  titleKey: `guided.blocks.${block.id}`,
  hintKey: null,
  questions: questionsOf(block.keys),
  themeSlugs: [],
}))

/** Les huit étapes guidées — une étape à la fois, rail cliquable. */
export const GUIDED_STEPS: readonly FramingStep[] = ONBOARDING_GUIDED_V23.map(step => ({
  id: step.id,
  titleKey: `guided.steps.${step.id}.title`,
  hintKey: `guided.steps.${step.id}.hint`,
  questions: questionsOf(step.keys),
  themeSlugs: step.themes.flatMap(id => {
    const slug = SLUG_BY_THEME_ID.get(id)
    return slug ? [slug] : []
  }),
}))

/**
 * Combien de repères d'une étape ont un statut — une réponse OU une incertitude
 * déclarée : « Une réponse, “Je ne sais pas” ou “À compléter plus tard” suffisent ».
 * `treated` vaut `null` — jamais « 0 » — tant que rien n'est traité (GA-18 : le rail
 * dit « À commencer »).
 */
export function stepProgress(
  step: FramingStep,
  answers: OnboardingAnswers,
  statuses: Statuses,
): { treated: number | null; total: number } {
  const treated = step.questions.filter(q => statusOf(q, answers[q.key], statuses[q.key]) !== 'empty').length
  return { treated: treated === 0 ? null : treated, total: step.questions.length }
}

/** Le nombre de repères DISTINCTS traités sur un ensemble d'étapes (une clé partagée ne compte qu'une fois). */
export function treatedCount(steps: readonly FramingStep[], answers: OnboardingAnswers, statuses: Statuses): number {
  const seen = new Set<string>()
  for (const question of steps.flatMap(step => step.questions)) {
    if (statusOf(question, answers[question.key], statuses[question.key]) !== 'empty') seen.add(question.key)
  }
  return seen.size
}

export function distinctQuestionCount(steps: readonly FramingStep[]): number {
  return new Set(steps.flatMap(step => step.questions.map(q => q.key))).size
}

type FramingLocation = { phase: 'essential' } | { phase: 'guided'; stepIndex: number }

/** L'étape guidée qui porte une question — `-1` quand aucune. */
function guidedIndexOf(key: string): number {
  return GUIDED_STEPS.findIndex(step => step.questions.some(q => q.key === key))
}

/**
 * Où ouvrir le cadrage. Une cible (le « Modifier » de la relecture) gagne ; sinon
 * les cinq blocs tant qu'ils ne sont pas tous traités, puis la première étape
 * guidée qui a encore un repère sans statut — jamais le début quand on reprend.
 */
export function initialFramingLocation(
  targetKey: string | null,
  answers: OnboardingAnswers,
  statuses: Statuses,
): FramingLocation {
  if (targetKey) {
    const guided = guidedIndexOf(targetKey)
    if (guided >= 0) return { phase: 'guided', stepIndex: guided }
    if (ESSENTIAL_STEPS.some(step => step.questions.some(q => q.key === targetKey))) return { phase: 'essential' }
  }
  const essentialsDone = ESSENTIAL_STEPS.every(step => {
    const { treated, total } = stepProgress(step, answers, statuses)
    return treated === total
  })
  if (!essentialsDone) return { phase: 'essential' }
  const pending = GUIDED_STEPS.findIndex(step => {
    const { treated, total } = stepProgress(step, answers, statuses)
    return treated !== total
  })
  return { phase: 'guided', stepIndex: Math.max(pending, 0) }
}
