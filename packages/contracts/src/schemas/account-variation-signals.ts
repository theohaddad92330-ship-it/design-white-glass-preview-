/**
 * #3920.10 (décision Louis 15/10/2026) — LES QUATRE SIGNAUX CALCULÉS DE VARIATION D'UN COMPTE.
 *
 *  1. offres d'emploi, mois sur mois (30 derniers jours contre les 30 précédents) ;
 *  2. effectif sur 6 mois (registre) — exige deux observations datées, l'une récente, l'autre d'environ 6 mois ;
 *  3. marchés publics gagnés, 12 mois contre les 12 mois précédents ;
 *  4. mouvements de décideurs IT sur 6 mois (6 derniers mois contre les 6 précédents).
 *
 * Aucun nouvel achat de données : la fonction ne lit QUE ce qu'on lui passe (des dates déjà collectées).
 * Chaque signal porte SA BASE (fenêtre, comparaison, date de calcul, source). Une source non lue
 * (`null`/absente) ou une base manquante rend `not_measured` avec sa raison — JAMAIS 0 (GA-18 / GA-19).
 * Un pourcentage n'existe que si la base précédente est > 0 : sinon `changePct: null`.
 */

export const ACCOUNT_VARIATION_KEYS = ['job_offers_mom', 'headcount_6m', 'public_awards_12m', 'it_moves_6m'] as const
export type AccountVariationKey = (typeof ACCOUNT_VARIATION_KEYS)[number]

type VariationSource = 'job_offers' | 'registry_headcount' | 'public_awards' | 'contact_enrichment'

export interface AccountVariationBase {
  windowDays: number
  compare: 'previous_period' | 'six_months_ago'
  /** Date (AAAA-MM-JJ) à laquelle le calcul a été fait — la base est datée. */
  asOf: string
  source: VariationSource
}

export type AccountVariationSignal =
  | {
      key: AccountVariationKey
      status: 'measured'
      current: number
      previous: number
      delta: number
      /** `null` quand la base précédente vaut 0 — jamais ∞, jamais 0 %. */
      changePct: number | null
      base: AccountVariationBase
    }
  | {
      key: AccountVariationKey
      status: 'not_measured'
      reason: 'source_not_read' | 'no_history' | 'no_baseline'
      source: VariationSource
    }

export interface AccountVariationInput {
  /** Dates de publication des offres d'emploi du compte. `null`/absent = source non lue. */
  jobOfferDates?: readonly string[] | null
  /** Observations datées de l'effectif (registre). `null`/absent = aucun historique. */
  headcountObservations?: readonly { date: string; headcount: number }[] | null
  /** Dates d'attribution des marchés publics gagnés. */
  publicAwardDates?: readonly string[] | null
  /** Dates auxquelles on a APPRIS un mouvement de décideur IT. */
  itDecisionMakerMoveDates?: readonly string[] | null
}

const DAY_MS = 86_400_000

function parseDay(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function pct(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null
}

function periodComparison(
  key: AccountVariationKey,
  dates: readonly string[] | null | undefined,
  windowDays: number,
  source: VariationSource,
  now: Date,
): AccountVariationSignal {
  if (!dates) return { key, status: 'not_measured', reason: 'source_not_read', source }
  const t = now.getTime()
  let current = 0
  let previous = 0
  for (const raw of dates) {
    const ms = parseDay(raw)
    if (ms === null || ms > t) continue
    const age = (t - ms) / DAY_MS
    if (age <= windowDays) current += 1
    else if (age <= windowDays * 2) previous += 1
  }
  return {
    key,
    status: 'measured',
    current,
    previous,
    delta: current - previous,
    changePct: pct(current, previous),
    base: { windowDays, compare: 'previous_period', asOf: now.toISOString().slice(0, 10), source },
  }
}

/** L'observation d'effectif a-t-elle un effectif lisible (> 0) ? Un 0 ou un NaN n'est pas une mesure. */
function readableObservations(input: AccountVariationInput['headcountObservations']) {
  return (input ?? [])
    .map(o => ({ ms: parseDay(o.date), headcount: o.headcount }))
    .filter(
      (o): o is { ms: number; headcount: number } => o.ms !== null && Number.isFinite(o.headcount) && o.headcount > 0,
    )
}

const BASELINE_MIN_AGE_DAYS = 135
const BASELINE_MAX_AGE_DAYS = 225
const CURRENT_MAX_AGE_DAYS = 45

function headcountSignal(input: AccountVariationInput['headcountObservations'], now: Date): AccountVariationSignal {
  const key = 'headcount_6m' as const
  const source = 'registry_headcount' as const
  const obs = readableObservations(input)
  if (obs.length === 0) return { key, status: 'not_measured', reason: 'no_history', source }
  const t = now.getTime()
  const age = (ms: number) => (t - ms) / DAY_MS
  const current = obs.filter(o => age(o.ms) >= 0 && age(o.ms) <= CURRENT_MAX_AGE_DAYS).sort((a, b) => b.ms - a.ms)[0]
  const baseline = obs
    .filter(o => age(o.ms) >= BASELINE_MIN_AGE_DAYS && age(o.ms) <= BASELINE_MAX_AGE_DAYS)
    .sort((a, b) => Math.abs(age(a.ms) - 180) - Math.abs(age(b.ms) - 180))[0]
  if (!current || !baseline) return { key, status: 'not_measured', reason: 'no_baseline', source }
  return {
    key,
    status: 'measured',
    current: current.headcount,
    previous: baseline.headcount,
    delta: current.headcount - baseline.headcount,
    changePct: pct(current.headcount, baseline.headcount),
    base: { windowDays: 180, compare: 'six_months_ago', asOf: now.toISOString().slice(0, 10), source },
  }
}

export function computeAccountVariationSignals(input: AccountVariationInput, now: Date): AccountVariationSignal[] {
  return [
    periodComparison('job_offers_mom', input.jobOfferDates, 30, 'job_offers', now),
    headcountSignal(input.headcountObservations, now),
    periodComparison('public_awards_12m', input.publicAwardDates, 365, 'public_awards', now),
    periodComparison('it_moves_6m', input.itDecisionMakerMoveDates, 180, 'contact_enrichment', now),
  ]
}
