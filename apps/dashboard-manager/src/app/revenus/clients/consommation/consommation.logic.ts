import type { UserConsumptionRow, WorkspaceConsumptionRow } from '@/lib/credit-consumption'
import { jourCompact } from '@/lib/dates'

/**
 * Ce que l'écran « Consommation » écrit, séparé de ce qu'il rend (#4467).
 *
 * Tout est pur. Les trois règles qui ne se négocient pas :
 *  - « non mesuré » ne s'écrit JAMAIS « 0 » (un `null` rend « — ») ;
 *  - un pool illimité n'a pas de solde : il s'écrit « illimité » ;
 *  - un solde épuisé se dit en toutes lettres — c'est le compte qui voit le frein doux.
 */

/** Le solde d'un espace : « 60 / 100 », « 0 / 100 — épuisé », « illimité » ou « — ». */
export function libelleSolde(
  row: Pick<WorkspaceConsumptionRow, 'remaining' | 'capacity' | 'unlimited' | 'exhausted'>,
): string {
  if (row.unlimited) return 'illimité'
  if (row.remaining === null || row.capacity === null) return '—'
  return `${row.remaining} / ${row.capacity}${row.exhausted ? ' — épuisé' : ''}`
}

/** Un consommé mesuré (zéro compris) ou « — ». */
export function libelleConsomme(consumed: number | null): string {
  return consumed === null ? '—' : String(consumed)
}

/** La date de renouvellement, ou « — » (essai, abonnement absent). */
export function libelleRenouvellement(iso: string | null): string {
  return jourCompact(iso)
}

/**
 * Les espaces à regarder d'abord : épuisés, puis solde croissant. Un espace sans
 * solde mesurable ne vaut pas zéro — il part à la fin, par nom.
 */
export function trierEspaces(rows: readonly WorkspaceConsumptionRow[]): WorkspaceConsumptionRow[] {
  const parNom = (a: WorkspaceConsumptionRow, b: WorkspaceConsumptionRow): number => a.name.localeCompare(b.name, 'fr')
  const mesures = rows.filter(row => row.remaining !== null)
  const autres = rows.filter(row => row.remaining === null)
  mesures.sort((a, b) => (a.remaining ?? 0) - (b.remaining ?? 0) || parNom(a, b))
  autres.sort(parNom)
  return [...mesures, ...autres]
}

/** Les comptes à solde épuisé, groupés par espace puis par e-mail. */
export function trierEpuises(rows: readonly UserConsumptionRow[]): UserConsumptionRow[] {
  return [...rows].sort(
    (a, b) =>
      a.workspaceName.localeCompare(b.workspaceName, 'fr') || (a.email ?? '').localeCompare(b.email ?? '', 'fr'),
  )
}
