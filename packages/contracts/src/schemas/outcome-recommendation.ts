import { CHANNEL_MIN_SAMPLE } from './channel-performance.js'
import { classifyRuleOutcome } from './method-rule-outcomes.js'

/**
 * #3211.11 (#3234, lot M11 09/10) — LA RECOMMANDATION PAR DIMENSION tirée des
 * issues DÉCLARÉES de l'espace : quelle CADENCE (étape de relance), quelle
 * ROUTE commerciale (celle du plan du compte), quelle PRIORITÉ (niveau
 * d'effort du compte) a produit le plus d'issues positives.
 *
 * Sources : `action_plan_items.outcome` (issue déclarée à la complétion,
 * classée par {@link classifyRuleOutcome}, même partition que les règles de
 * méthode) et `commercial_outcomes` ({@link classifyCommercialOutcome}) pour
 * route et priorité — un outcome commercial porte sur un compte, jamais sur
 * une étape de cadence.
 *
 * ⚠️ DES COMPTES, JAMAIS UNE PROBABILITÉ (doctrine, refusé six fois) : chaque
 * valeur porte `positive` / `judged`, aucun taux. Sous {@link
 * CHANNEL_MIN_SAMPLE} issues jugées (même seuil que les canaux, décision Louis
 * 02/10), une valeur est `sufficient: false` et n'est pas comparée. Il faut
 * DEUX valeurs suffisantes et un écart pour recommander : une seule valeur ou
 * une égalité ne recommandent rien.
 */
export const OUTCOME_RECOMMENDATION_DIMENSIONS = ['cadence', 'route', 'priority'] as const
export type OutcomeRecommendationDimension = (typeof OUTCOME_RECOMMENDATION_DIMENSIONS)[number]

type OutcomeKind = 'positive' | 'negative'

const COMMERCIAL_POSITIVE = new Set(['qualified_relationship', 'message_replied', 'consultant_positioned'])
const COMMERCIAL_NEGATIVE = new Set(['declined'])

/** `null` : l'outcome ne juge pas l'approche (contact incorrect, pertinence d'un partenaire). */
export function classifyCommercialOutcome(type: string | null): OutcomeKind | null {
  if (type === null) return null
  if (COMMERCIAL_POSITIVE.has(type)) return 'positive'
  if (COMMERCIAL_NEGATIVE.has(type)) return 'negative'
  return null
}

interface OutcomeRecommendationValue {
  value: string
  positive: number
  judged: number
  sufficient: boolean
}

export interface OutcomeRecommendation {
  dimension: OutcomeRecommendationDimension
  recommended: string | null
  reason: 'measured' | 'not_enough_measured' | 'tie' | 'no_outcome'
  values: OutcomeRecommendationValue[]
}

/**
 * `rows` : des comptages déjà groupés (valeur × issue). `source: 'commercial'`
 * classe par {@link classifyCommercialOutcome}, sinon par {@link classifyRuleOutcome}.
 */
export function recommendFromOutcomes(
  dimension: OutcomeRecommendationDimension,
  rows: ReadonlyArray<{ value: string | null; outcome: string | null; count: number; source?: 'commercial' }>,
): OutcomeRecommendation {
  const tally = new Map<string, { positive: number; judged: number }>()
  for (const row of rows) {
    const value = row.value?.trim()
    if (!value || row.count <= 0) continue
    const kind = row.source === 'commercial' ? classifyCommercialOutcome(row.outcome) : classifyRuleOutcome(row.outcome)
    if (kind === null) continue
    const entry = tally.get(value) ?? { positive: 0, judged: 0 }
    entry.judged += row.count
    if (kind === 'positive') entry.positive += row.count
    tally.set(value, entry)
  }
  const values = [...tally.entries()]
    .map(([value, entry]) => ({ value, ...entry, sufficient: entry.judged >= CHANNEL_MIN_SAMPLE }))
    .sort(
      (a, b) => b.positive * a.judged - a.positive * b.judged || b.judged - a.judged || a.value.localeCompare(b.value),
    )
  if (values.length === 0) return { dimension, recommended: null, reason: 'no_outcome', values }
  const measured = values.filter(value => value.sufficient)
  if (measured.length < 2) return { dimension, recommended: null, reason: 'not_enough_measured', values }
  const [first, second] = measured as [OutcomeRecommendationValue, OutcomeRecommendationValue]
  // Comparaison en produits croisés : aucune division, aucun taux calculé.
  if (first.positive * second.judged === second.positive * first.judged) {
    return { dimension, recommended: null, reason: 'tie', values }
  }
  return { dimension, recommended: first.value, reason: 'measured', values }
}
