/**
 * Les lignes rendues par un `UPDATE … RETURNING` ou un `DELETE … RETURNING`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * TypeORM ne rend PAS la même forme selon le verbe SQL. Dans
 * `PostgresQueryRunner.query` :
 *
 * ```js
 * switch (raw.command) {
 *   case 'DELETE':
 *   case 'UPDATE':
 *     result.raw = [raw.rows, raw.rowCount]   // ← un COUPLE
 *     break
 *   default:
 *     result.raw = raw.rows                   // ← les lignes
 * }
 * ```
 *
 * Un `SELECT` et un `INSERT … RETURNING` rendent donc les lignes, un `UPDATE …
 * RETURNING` rend `[lignes, nombre]`. Écrire `rows[0]` sur un UPDATE donne le
 * TABLEAU des lignes, pas la première ligne — et comme ce tableau est
 * « truthy », tous les `if (!row) throw NotFound` passent, puis chaque champ lu
 * vaut `undefined`.
 *
 * Ça ne se voit pas : le web n'utilise pas ces réponses (il ré-interroge), donc
 * onze endpoints rendaient un tableau là où leur type annonçait un objet, sans
 * qu'un seul test tombe. Trouvé en recette live le 21/08/2026, quand une
 * mission créée depuis un projet gagné est partie en base avec
 * `account_id = NULL` — le seul endroit où une contrainte a fini par le dire.
 *
 * La règle : **tout `manager.query` sur un UPDATE/DELETE … RETURNING passe par
 * ici.** Une garde (`returned-rows.spec.ts`) refuse les nouveaux appels qui
 * l'oublieraient.
 */

/**
 * Normalise ce que TypeORM rend, quelle que soit la forme.
 *
 * Accepte les deux, parce qu'un appelant ne doit pas avoir à se souvenir du
 * verbe SQL qu'il a écrit trois lignes plus haut — et qu'un jour quelqu'un
 * changera un UPDATE en INSERT sans y penser.
 */
export function returnedRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) return []
  // Forme UPDATE/DELETE : `[lignes, nombre]`. On la reconnaît à sa signature —
  // deux éléments dont le premier est un tableau et le second un nombre — et
  // non à la longueur seule : `[ligneA, ligneB]` est un résultat de SELECT
  // parfaitement légitime.
  if (result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as T[]
  }
  return result as T[]
}

/** La première ligne rendue, ou `null`. Jamais un tableau déguisé en objet. */
export function firstReturnedRow<T>(result: unknown): T | null {
  return returnedRows<T>(result)[0] ?? null
}

/** Combien de lignes ont été touchées. `0` quand rien ne l'a été. */
export function returnedCount(result: unknown): number {
  return returnedRows(result).length
}
