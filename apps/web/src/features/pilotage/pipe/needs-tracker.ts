import type { OpenNeedRow } from '@bellum/contracts'

/**
 * RV4-E-FIX 4295.13 (#4016.8e) — LE TRACEUR DU PIPE : le « CA potentiel » des besoins ouverts (cumul JOURNALIER
 * TJM × effectif, le même calcul que le bandeau de `/projects/needs` et que chaque colonne du kanban) et le dernier
 * TJM connu. Jamais une projection (« ce que ça rapporterait sur six mois » serait un chiffre inventé) ; un besoin
 * sans tarif est compté À PART, jamais à 0 €.
 */
type NeedsTracker = {
  /** `null` quand aucun besoin ne porte de tarif : on n'écrit pas « 0 € ». */
  potentialDailyCents: number | null
  withRate: number
  withoutRate: number
  /** Le TJM du besoin au dernier mouvement daté parmi ceux qui portent un tarif ; `at` est `null` sans date. */
  lastTjm: { cents: number; title: string; at: string | null } | null
}

export function needsTracker(rows: readonly OpenNeedRow[]): NeedsTracker {
  const priced = rows.flatMap(row => (row.target_tjm_cents === null ? [] : [{ row, rate: row.target_tjm_cents }]))
  const dailyCents = priced.reduce((sum, entry) => sum + entry.rate * entry.row.headcount, 0)
  const stamp = (at: string | null): number => (at ? Date.parse(at) : Number.NEGATIVE_INFINITY)
  const latest = priced.reduce<(typeof priced)[number] | null>(
    (best, entry) =>
      best === null || stamp(entry.row.status_changed_at) > stamp(best.row.status_changed_at) ? entry : best,
    null,
  )
  return {
    potentialDailyCents: priced.length > 0 ? dailyCents : null,
    withRate: priced.length,
    withoutRate: rows.length - priced.length,
    lastTjm: latest ? { cents: latest.rate, title: latest.row.title, at: latest.row.status_changed_at ?? null } : null,
  }
}
