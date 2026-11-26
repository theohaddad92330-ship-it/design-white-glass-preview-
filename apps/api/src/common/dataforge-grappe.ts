// Lot 776 (GA-26) — le rattachement SIREN → grappe de fiches de la base commune, UN seul endroit (lot 773).
// Lu par l'Historique (besoins) et par l'onglet Accès (statuts d'accès).

/** Le SIREN tel que la base commune l'indexe : 9 chiffres, ou rien. */
export const sirenOf = (value: string | null): string | null => {
  const siren = (value ?? '').replace(/\D/g, '').slice(0, 9)
  return siren.length === 9 ? siren : null
}

export const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Lot 773 — la GRAPPE d'un SIREN : une seule fiche = elle-même ; sinon toutes les fiches si elles partagent un
 * `cluster_id` non nul, ou (à défaut) le même `group_name` normalisé non vide. Rien de commun = `null` (ambigu).
 */
export function grappeOf<T extends { cluster_id: string | null; group_name: string | null }>(
  rows: readonly T[],
): T[] | null {
  if (rows.length === 1) return [...rows]
  const clusters = new Set(rows.map(row => row.cluster_id ?? ''))
  if (clusters.size === 1 && !clusters.has('')) return [...rows]
  const groups = new Set(rows.map(row => fold(row.group_name ?? '')))
  if (groups.size === 1 && !groups.has('')) return [...rows]
  return null
}
