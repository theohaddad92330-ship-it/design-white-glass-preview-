import { Logger } from '@nestjs/common'
import type { AccountOwner } from '@bellum/contracts'

const logger = new Logger('resolveOwnerNames')

/**
 * « Nom d'affichage d'un porteur de compte », LA dérivation (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET PAS UN APPEL À `AccountsService`
 * ─────────────────────────────────────────────────────────────────────────────
 * `AccountsService.resolveOwnerNames` posait déjà cette règle (« prénom + nom,
 * à défaut l'email »), mais en méthode PRIVÉE de ce service. Le board d'effort
 * (#3257.7a, `SprintsController`) doit poser la même étiquette sur ses cartes
 * — importer `AccountsService` depuis `sprints` créerait un cycle de modules
 * NestJS (`AccountsModule` importe déjà `ContactsModule`, qui importe déjà
 * `SprintsModule`), et GA-07 interdirait de toute façon l'import service→service.
 *
 * Même patron que `account-hygiene.sql.ts` (#1318.3, `ACCOUNT_HYGIENE_PREDICATES`) :
 * une dérivation PARTAGÉE, écrite une fois, jamais recopiée. `AccountsService`
 * l'appelle (voir sa méthode privée du même nom, qui délègue ici) et
 * `SprintsController` aussi — tous deux via leur propre `Repository<AccountEntity>`,
 * jamais via le service de l'autre.
 *
 * Batchée : une requête pour toute la page/le board, jamais une par ligne. Un id
 * sans profil lisible (membre supprimé) est simplement absent de la Map —
 * l'appelant n'affiche alors pas de badge, plutôt qu'un uuid ou un « inconnu ».
 * Le porteur est un CONFORT d'affichage : son absence (erreur SQL comprise) ne
 * doit jamais priver le commercial de sa liste ou de son board.
 */
export async function resolveOwnerNames(
  db: { query<T = unknown>(sql: string, params?: unknown[]): Promise<T> },
  ids: (string | null)[],
): Promise<Map<string, AccountOwner>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (unique.length === 0) return new Map()
  try {
    const rows = await db.query<
      { userId: string; firstName: string | null; lastName: string | null; email: string | null }[]
    >(
      `SELECT user_id AS "userId", first_name AS "firstName", last_name AS "lastName", email AS "email"
       FROM profiles WHERE user_id = ANY($1)`,
      [unique],
    )
    const entries = rows
      .map(r => {
        const name = [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || (r.email ?? '')
        return name ? ([r.userId, { user_id: r.userId, name }] as [string, AccountOwner]) : null
      })
      .filter((entry): entry is [string, AccountOwner] => entry !== null)
    return new Map(entries)
  } catch (err) {
    logger.error('resolveOwnerNames error', { error: err })
    return new Map()
  }
}
