import { OPEN_PIPELINE_STAGES, type PipelineSummary } from '@bellum/contracts'

/**
 * Le PORTEFEUILLE de « Ta journée » — ce que l'écran Théo ne portait pas et que la vue jour de PR11 lisait :
 * la tuile « Affaires en cours », « Les affaires à faire avancer » et « Les profils suivis » (Louis 23/10 :
 * l'écran Théo reste, rien de ce qui porte une information ne se perd). Ramené ici depuis
 * `view/day/day-model.ts`, supprimé avec les vues jour orphelines.
 */

export type PipeTile =
  | { kind: 'unknown' }
  | { kind: 'none' }
  | { kind: 'unmeasured'; count: number }
  | { kind: 'measured'; cents: number; count: number; withoutAmount: number }

/**
 * Théo A today-jour.N2 — la tuile « Affaires en cours » : somme NON pondérée des montants réellement saisis.
 *
 * Une affaire sans montant n'entre pas dans la somme, elle est comptée à part (GA-18). Si aucune affaire
 * n'a de montant, la tuile dit « non mesuré » — jamais « 0 € ».
 */
export function pipeTile(summary: PipelineSummary | undefined): PipeTile {
  if (!summary) return { kind: 'unknown' }
  if (summary.total_count === 0) return { kind: 'none' }
  const withAmount = summary.total_count - summary.total_without_amount
  if (withAmount <= 0) return { kind: 'unmeasured', count: summary.total_count }
  return {
    kind: 'measured',
    cents: summary.total_amount_cents,
    count: summary.total_count,
    withoutAmount: summary.total_without_amount,
  }
}

/** Théo A today-jour.R8 — quatre affaires, pas plus : la page est une journée, pas un pipe (le pipe a son écran). */
export const DEALS_SHOWN = 4

/**
 * Théo A today-jour.R8 — « Les affaires à faire avancer » : MES affaires encore ouvertes, celles qui n'ont aucune
 * prochaine action d'abord, puis la plus ancienne dans son étape.
 *
 * `next_action` est trivalent : `undefined` = l'API ne l'a pas dit, ce n'est PAS « aucune prochaine action » — une
 * affaire muette passe après celles dont on sait qu'elles n'ont rien de prévu.
 */
export function dealsToAdvance<
  P extends { owner_id: string | null; stage: string; stage_entered_at: string; next_action?: unknown },
>(projects: readonly P[], userId: string): P[] {
  const open = new Set<string>(OPEN_PIPELINE_STAGES)
  const rank = (project: P): number => (project.next_action === null ? 0 : project.next_action === undefined ? 2 : 1)
  return projects
    .filter(project => project.owner_id === userId && open.has(project.stage))
    .sort((a, b) => rank(a) - rank(b) || Date.parse(a.stage_entered_at) - Date.parse(b.stage_entered_at))
    .slice(0, DEALS_SHOWN)
}

/** Théo A today-jour.N6 — trois profils sur la journée ; le vivier entier a son écran. */
export const PROFILES_SHOWN = 3

/**
 * Théo A today-jour.N6 — « Les profils suivis » : les profils dont JE suis le référent commercial et qui ont une
 * date de disponibilité déclarée, la plus proche d'abord. Pas de date = pas de ligne (une absence ne fait aucune
 * ligne), jamais une disponibilité devinée.
 */
export function followedProfiles<T extends { owner_user_id?: string | null; available_from: string | null }>(
  consultants: readonly T[],
  userId: string,
): T[] {
  return consultants
    .filter(consultant => consultant.owner_user_id === userId && consultant.available_from !== null)
    .sort((a, b) => (a.available_from ?? '').localeCompare(b.available_from ?? ''))
    .slice(0, PROFILES_SHOWN)
}
