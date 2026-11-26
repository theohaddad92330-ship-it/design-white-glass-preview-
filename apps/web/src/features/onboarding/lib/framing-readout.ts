import type { TFunction } from 'i18next'
import { unknownAnswerReasonOf } from '@bellum/contracts'
import type { Question } from '@/features/onboarding/lib/questions'
import type { ThemeSlug } from '@/features/onboarding/lib/theme-map'
import { THEMES } from '@/features/onboarding/lib/theme-catalog'
import { toDisplayValue } from '@/features/onboarding/lib/onboarding-review-blocks'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

type Translate = TFunction<'onboarding'> | ((key: string, options?: Record<string, unknown>) => string)

const QUESTIONS_BY_KEY = new Map<string, Question>(
  THEMES.flatMap(theme => theme.questions.map(q => [q.key, q] as const)),
)

/** Une réponse mesurée sous forme de liste d'éléments — vide si absente OU mise de côté. */
function measuredItems(answers: OnboardingAnswers, key: string): string[] {
  const raw = answers[key]
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  return items.filter(item => item.trim().length > 0 && unknownAnswerReasonOf(item) === null)
}

function shown(answers: OnboardingAnswers, key: string, t: Translate): string | null {
  const question = QUESTIONS_BY_KEY.get(key)
  const items = measuredItems(answers, key)
  if (items.length === 0) return null
  const value = question
    ? toDisplayValue(question, items.length === 1 ? items[0] : items, t as TFunction<'onboarding'>)
    : items.join(', ')
  return value.trim().length > 0 ? value : null
}

type UnderstoodKey = 'activity' | 'role' | 'offer' | 'priority' | 'territory' | 'limits'

type UnderstoodRow = { key: UnderstoodKey; labelKey: string; value: string | null; themeSlug: ThemeSlug }

// Les six lignes de « Ce que Laura a compris » : la clé de réponse qui la fonde et le thème où la corriger.
const UNDERSTOOD: readonly { key: UnderstoodKey; answerKeys: readonly string[]; themeSlug: ThemeSlug }[] = [
  { key: 'activity', answerKeys: ['esn_name'], themeSlug: 'ton-entreprise' },
  { key: 'role', answerKeys: ['user_role'], themeSlug: 'ton-role-et-ton-equipe' },
  { key: 'offer', answerKeys: ['offer_domains', 'expertise_areas'], themeSlug: 'offre-et-expertises' },
  { key: 'priority', answerKeys: ['individual_goal'], themeSlug: 'objectifs-et-difficultes' },
  { key: 'territory', answerKeys: ['geo_zones'], themeSlug: 'marches-et-territoires' },
  { key: 'limits', answerKeys: ['ideal_client_referencement_constraints'], themeSlug: 'clients-et-decideurs' },
]

/** « Ce que Laura a compris » : ce que les réponses disent, ou `null` (« À préciser ») — jamais une valeur inventée. */
export function buildUnderstood(answers: OnboardingAnswers, t: Translate): UnderstoodRow[] {
  return UNDERSTOOD.map(({ key, answerKeys, themeSlug }) => {
    const value = answerKeys.map(k => shown(answers, k, t)).find(v => v !== null) ?? null
    return { key, labelKey: `understood.${key}`, value, themeSlug }
  })
}

type ContextCellKey = 'perimeter' | UnderstoodKey | 'horizon'

type ContextCell = {
  key: ContextCellKey
  labelKey: string
  value: string | null
  /** Les réponses qui fondent la case : leur source (« proposé depuis ton site ») et leur statut s'y lisent. */
  answerKeys: readonly string[]
  themeSlug: ThemeSlug
}

// Théo O onboarding-relecture — « Ton contexte » : huit cases, dans l'ordre de la maquette. `join` réunit
// plusieurs réponses (niveau · unité) ; sinon la première réponse mesurée l'emporte.
const CONTEXT_GRID: readonly {
  key: ContextCellKey
  answerKeys: readonly string[]
  themeSlug: ThemeSlug
  join?: boolean
}[] = [
  { key: 'perimeter', answerKeys: ['scope_level', 'scope_unit'], themeSlug: 'ton-role-et-ton-equipe', join: true },
  { key: 'activity', answerKeys: ['activity_nature', 'esn_name'], themeSlug: 'ton-entreprise' },
  ...UNDERSTOOD.filter(row => row.key !== 'activity' && row.key !== 'limits'),
  { key: 'horizon', answerKeys: ['horizon'], themeSlug: 'objectifs-et-difficultes' },
  ...UNDERSTOOD.filter(row => row.key === 'limits'),
]

/** La grille « Ton contexte » de la relecture : ce que les réponses disent, ou `null` (« À préciser »). */
export function buildContextGrid(answers: OnboardingAnswers, t: Translate): ContextCell[] {
  return CONTEXT_GRID.map(({ key, answerKeys, themeSlug, join }) => {
    const values = answerKeys.map(k => shown(answers, k, t)).filter((v): v is string => v !== null)
    const value = values.length === 0 ? null : join ? values.join(' · ') : (values[0] ?? null)
    const labelKey = key === 'perimeter' || key === 'horizon' ? `contextGrid.${key}` : `understood.${key}`
    return { key, labelKey, value, answerKeys, themeSlug }
  })
}

type ThreadFacts = { company: string | null; goal: string | null; offer: string | null; territory: string | null }

/**
 * Théo O onboarding-guide — « Ton fil conducteur » : quatre faits, lus dans les réponses.
 * Un fait sans réponse vaut `null` (la ligne n'est alors pas rendue — on n'affiche pas ce qu'on n'a pas).
 */
export function buildThreadFacts(answers: OnboardingAnswers, t: Translate): ThreadFacts {
  return {
    company: shown(answers, 'esn_name', t),
    goal: shown(answers, 'individual_goal', t),
    offer: shown(answers, 'offer_domains', t),
    territory: shown(answers, 'geo_zones', t),
  }
}

type OrientationId = 'proof' | 'offer_split' | 'decision_review'

type Orientation = { id: OrientationId; evidenceKeys: string[] }

/**
 * Les orientations à décider (retenir / plus tard / écarter) : des règles
 * LOCALES sur les réponses, rien de généré. Aucune réponse qui la motive = aucune
 * orientation (on n'affiche pas ce qu'on n'a pas). `evidenceKeys` nomme les
 * réponses qui la motivent — « Les réponses qui motivent cette proposition ».
 */
export function buildOrientations(answers: OnboardingAnswers): Orientation[] {
  const out: Orientation[] = []
  const proofKeys = ['reference_accounts', 'case_study_results', 'client_testimonials'].filter(
    k => measuredItems(answers, k).length > 0,
  )
  if (proofKeys.length > 0) out.push({ id: 'proof', evidenceKeys: proofKeys })
  if (measuredItems(answers, 'offer_domains').length >= 2)
    out.push({ id: 'offer_split', evidenceKeys: ['offer_domains'] })
  if (measuredItems(answers, 'weekly_sales_time_protected').length > 0)
    out.push({ id: 'decision_review', evidenceKeys: ['weekly_sales_time_protected'] })
  return out
}

type PointToDecide = { key: UnderstoodKey; labelKey: string; themeSlug: ThemeSlug }

/** « Les points à trancher » : ce qui reste ouvert. Un audit avec des inconnues reste valide — il les nomme. */
export function buildPointsToDecide(answers: OnboardingAnswers, t: Translate): PointToDecide[] {
  return buildUnderstood(answers, t)
    .filter(row => row.value === null)
    .map(row => ({ key: row.key, labelKey: `pointsToDecide.${row.key}`, themeSlug: row.themeSlug }))
}

/** Le brouillon du premier échange avec Laura : modifiable, jamais envoyé seul. Ne cite que ce qui est répondu. */
export function buildFirstExchangePrompt(rows: readonly UnderstoodRow[], t: Translate): string {
  const lines = rows.filter(r => r.value !== null).map(r => `- ${String(t(r.labelKey))} : ${r.value}`)
  if (lines.length === 0) return String(t('firstExchange.promptEmpty'))
  return `${String(t('firstExchange.promptIntro'))}\n${lines.join('\n')}\n${String(t('firstExchange.promptAsk'))}`
}

/**
 * L'empreinte des réponses relues : valider le cadrage ne vaut que pour CELUI-CI.
 * Une réponse modifiée après la validation change l'empreinte — la case se
 * redemande, au lieu de laisser croire que le nouveau cadrage a été relu.
 */
export async function framingDigest(answers: OnboardingAnswers): Promise<string> {
  const stable = Object.keys(answers)
    .sort()
    .map(key => [key, answers[key]])
  const bytes = new TextEncoder().encode(JSON.stringify(stable))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Théo O onboarding-relecture.A6 — des outils ont-ils été DÉCLARÉS ? (`tooling_*`.) Déclarer
 * n'établit aucune connexion : la relecture le dit, et propose le renvoi vers les connecteurs.
 */
export function hasDeclaredTools(answers: OnboardingAnswers): boolean {
  return Object.keys(answers).some(key => key.startsWith('tooling_') && measuredItems(answers, key).length > 0)
}
