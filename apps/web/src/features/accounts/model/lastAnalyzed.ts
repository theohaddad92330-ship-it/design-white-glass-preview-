import { planFreshness, type PlanFreshness } from '@bellum/contracts'

/**
 * The date to show under « Dernière analyse » / « Analyse le ».
 *
 * The server sends ``last_analyzed_at`` = the real ``MAX(analysis_runs.completed_at)``
 * over completed runs, or ``null`` when no completed run exists. That value is
 * the whole point of this feature: it MOVES when a dossier is re-analysed, so a
 * freshly-finished dossier no longer reads « il y a 5 jours » and invites a
 * credit-costing re-run.
 *
 * When it is null, we make a deliberate, honest fallback rather than invent a date:
 *
 *  - A ``completed`` account with no run row is a **legacy** dossier (analysed
 *    before run tracking existed). Its ``created_at`` is the best available
 *    proxy — and it is the exact date already shown today, so this is a no-op for
 *    that shrinking set, not a new lie. Every re-analysis from now on writes a
 *    run row, so such an account moves to the real date the next time it runs.
 *
 *  - Any other status (``analyzing`` / ``error`` / ``inbox`` …) has **no**
 *    completed analysis. We return ``null`` — the caller shows « — », never a
 *    creation date dressed up as an analysis date for a run that never finished.
 *
 * The API never performs this fallback itself: at the data layer ``created_at``
 * and « last analysed » stay distinct. Conflating them was the original bug.
 */
export function lastAnalyzedDate(account: {
  last_analyzed_at?: string | null
  created_at: string
  status: string
}): string | null {
  if (account.last_analyzed_at) return account.last_analyzed_at
  if (account.status === 'completed') return account.created_at
  return null
}

/** #3420 — l'âge du plan se lit sur la MÊME date que le hero (`lastAnalyzedDate`). */
export function accountPlanFreshness(
  account: {
    last_analyzed_at?: string | null
    strategy_collected_at?: string | null
    created_at: string
    status: string
  },
  now: Date,
): PlanFreshness {
  // #3278.b — l'âge du plan se lit sur la date de SON écriture (re-planification comprise).
  return planFreshness(planGeneratedDate(account), now)
}

/**
 * #3278.b — la date « Calculé le » du PLAN. `last_analyzed_at` suit les runs d'analyse : une
 * re-planification n'en écrit aucun, la date restait celle d'avant. `strategy_collected_at` est posée
 * à CHAQUE écriture du plan (`savePlan`) ; absente (plan d'avant ce champ), on retombe sur la date
 * d'analyse — jamais une date inventée.
 */
export function planGeneratedDate(account: {
  last_analyzed_at?: string | null
  strategy_collected_at?: string | null
  created_at: string
  status: string
}): string | null {
  return account.strategy_collected_at || lastAnalyzedDate(account)
}
