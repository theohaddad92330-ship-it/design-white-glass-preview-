import type { UniversalImportVerifiedRow } from '@bellum/contracts'

/**
 * Théo B c4-assistant-import — ce que la vérification autorise. Le serveur n'écrit que les créations et les
 * complétions ; un doublon, une ligne invalide ou un rattachement à valider n'entre jamais « tel quel » (la ligne
 * reste au rapport, nommée). L'humain peut seulement RETIRER une ligne de ce qui part (« Ne pas importer »).
 */
export const isImportable = (row: UniversalImportVerifiedRow): boolean =>
  row.verdict === 'create' || row.verdict === 'complete'

/**
 * Ce que la case de confirmation promet : les créations et complétions du FICHIER ENTIER (les compteurs), moins les
 * lignes que l'humain a décochées dans le détail. Le détail est borné ; on ne retire que ce qu'on y voit.
 */
export function confirmedCounts(
  rows: readonly UniversalImportVerifiedRow[],
  declined: ReadonlySet<number>,
  totals: { toCreate: number; toComplete: number },
): { create: number; complete: number } {
  let create = totals.toCreate
  let complete = totals.toComplete
  for (const row of rows) {
    if (!declined.has(row.line)) continue
    if (row.verdict === 'create') create -= 1
    else if (row.verdict === 'complete') complete -= 1
  }
  return { create, complete }
}

export function pageBounds(page: number, size: number, total: number): { from: number; to: number; pages: number } {
  if (total === 0) return { from: 0, to: 0, pages: 1 }
  return { from: page * size + 1, to: Math.min(total, (page + 1) * size), pages: Math.ceil(total / size) }
}
