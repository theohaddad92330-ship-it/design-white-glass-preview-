/**
 * #3701.3 — « TOUS LES RÉSULTATS », au périmètre exact.
 *
 * tranché sans Louis : plafond de lot = 250 (le volume de recette le plus
 * haut). Au-delà, on charge 250 et on le DIT (« 250 sur M »), jamais « tous » :
 * un plafond silencieux serait exactement le mensonge que l'issue interdit.
 * Aucun appel serveur neuf : on pagine la MÊME requête filtrée que la liste.
 */
export const SELECT_ALL_CAP = 250

type Page<T> = { rows: T[]; hasNextPage: boolean; failed: boolean }

export async function loadAllResults<T extends { id: string }>(input: {
  loaded: T[]
  hasNextPage: boolean
  total: number
  fetchNext: () => Promise<Page<T>>
}): Promise<{ rows: T[]; capped: boolean; failed: boolean; total: number }> {
  let rows = input.loaded
  let hasNext = input.hasNextPage
  let failed = false
  while (hasNext && rows.length < SELECT_ALL_CAP) {
    const next = await input.fetchNext()
    if (next.failed) {
      failed = true
      break
    }
    rows = next.rows
    hasNext = next.hasNextPage
  }
  const capped = rows.length > SELECT_ALL_CAP || (hasNext && rows.length >= SELECT_ALL_CAP)
  return { rows: rows.slice(0, SELECT_ALL_CAP), capped, failed, total: input.total }
}
