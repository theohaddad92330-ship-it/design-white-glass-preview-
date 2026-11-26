import type { TFunction } from 'i18next'
import { TEMPS1_STAGES, stageQuestions, type Question } from '@/features/onboarding/lib/questions'
import { statusOf, type AnswerStatus, type DeclaredStatus } from '@/features/onboarding/lib/answer-status'
import { THEME_PLACEMENT, THEME_SLUGS, type ThemeSlug } from '@/features/onboarding/lib/theme-map'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

// Théo O onboarding-catalogue.R1 — les 16 thèmes de la V23, composés SUR le catalogue de questions
// (lot o3 : on le consomme, on ne le touche pas). Une question non rangée n'est jamais perdue :
// elle tombe dans le dernier thème (« Travailler avec Laura ») sous le groupe « Compléments ».
const FALLBACK: readonly [ThemeSlug, string] = ['travailler-avec-laura', 'complements']

type ThemeGroup = { slug: string; labelKey: string; questions: Question[] }

export type Theme = {
  slug: ThemeSlug
  number: number
  labelKey: string
  descriptionKey: string
  groups: ThemeGroup[]
  questions: Question[]
}

function buildThemes(): Theme[] {
  const catalogue = TEMPS1_STAGES.flatMap(stageQuestions)
  return THEME_SLUGS.map((slug, index) => {
    const groups: ThemeGroup[] = []
    for (const question of catalogue) {
      const [themeSlug, groupSlug] = THEME_PLACEMENT[question.key] ?? FALLBACK
      if (themeSlug !== slug) continue
      let group = groups.find(g => g.slug === groupSlug)
      if (!group) {
        group = { slug: groupSlug, labelKey: `themes.groups.${groupSlug}`, questions: [] }
        groups.push(group)
      }
      group.questions.push(question)
    }
    return {
      slug,
      number: index + 1,
      labelKey: `themes.items.${slug}.label`,
      descriptionKey: `themes.items.${slug}.description`,
      groups,
      questions: groups.flatMap(g => g.questions),
    }
  })
}

export const THEMES: Theme[] = buildThemes()

export function findTheme(slug: string): Theme | undefined {
  return THEMES.find(theme => theme.slug === slug)
}

type Statuses = Readonly<Record<string, DeclaredStatus | undefined>>

function statusIn(question: Question, answers: OnboardingAnswers, statuses: Statuses): AnswerStatus | 'empty' {
  return statusOf(question, answers[question.key], statuses[question.key])
}

/**
 * Le compteur d'un thème. `answered` vaut `null` — pas `0` — tant que rien n'est
 * répondu : « Pas encore commencé » (GA-18, une absence n'est jamais « 0 »).
 */
export function themeProgress(
  theme: Theme,
  answers: OnboardingAnswers,
  statuses: Statuses,
): { answered: number | null; total: number } {
  const answered = theme.questions.filter(q => statusIn(q, answers, statuses) === 'answered').length
  return { answered: answered === 0 ? null : answered, total: theme.questions.length }
}

type PendingAnswer = { question: Question; theme: Theme; status: DeclaredStatus }

/** « Tes réponses à reprendre » : mises de côté (je ne sais pas, plus tard, à vérifier) — « Non applicable » est une réponse, pas un reste. */
export function pendingAnswers(answers: OnboardingAnswers, statuses: Statuses): PendingAnswer[] {
  return THEMES.flatMap(theme =>
    theme.questions.flatMap(question => {
      const status = statusIn(question, answers, statuses)
      return status === 'not_yet_known' || status === 'answer_later' || status === 'to_verify_with_team'
        ? [{ question, theme, status }]
        : []
    }),
  )
}

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type SearchHit = { question: Question; theme: Theme }

function choiceValues(question: Question): string[] {
  if ('choices' in question) return question.choices.map(c => c.value)
  if ('groups' in question) return question.groups.flatMap(g => g.choices.map(c => c.value))
  return []
}

/** Recherche dans les questions, leurs aides et leurs choix — tout le catalogue, accents et casse ignorés. */
export function searchCatalog(query: string, t: TFunction<'onboarding'> | ((key: string) => string)): SearchHit[] {
  const needle = fold(query.trim())
  if (needle.length < 2) return []
  const translate = (key: string): string => String((t as (k: string) => string)(key))
  return THEMES.flatMap(theme =>
    theme.questions
      .filter(question => {
        const haystack = [
          translate(question.label),
          question.subtitle ? translate(question.subtitle) : '',
          ...choiceValues(question),
        ]
        return haystack.some(text => fold(text).includes(needle))
      })
      .map(question => ({ question, theme })),
  )
}

/**
 * « À regarder selon tes réponses » : d'abord les thèmes ENTAMÉS (là où tu as déjà
 * donné des réponses, c'est là que le plus vite fini compte), puis les premiers
 * thèmes pas encore commencés. Une règle lisible, jamais un score caché — et le
 * motif affiché dit laquelle des deux a joué.
 */
type Recommendation = { theme: Theme; progress: { started: true; answered: number } | { started: false } }

export function recommendedThemes(answers: OnboardingAnswers, statuses: Statuses, limit = 3): Recommendation[] {
  const started: (Recommendation & { ratio: number })[] = []
  const fresh: Recommendation[] = []
  for (const theme of THEMES) {
    const { answered, total } = themeProgress(theme, answers, statuses)
    if (answered === null) fresh.push({ theme, progress: { started: false } })
    else if (answered < total) started.push({ theme, progress: { started: true, answered }, ratio: answered / total })
  }
  started.sort((a, b) => b.ratio - a.ratio)
  return [...started, ...fresh].slice(0, limit).map(({ theme, progress }) => ({ theme, progress }))
}
