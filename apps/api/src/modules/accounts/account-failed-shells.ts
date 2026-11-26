import { failure, success, type Result } from '@bellum/utils'
import { returnedRows } from '../../database/returned-rows'
import { businessUnitScopeClause, type BusinessUnitScopeClause } from './business-unit-scope.clause'

/**
 * #4621.3 — LES COQUILLES D'ANALYSES ÉCHOUÉES s'archivent, par lot DATÉ.
 *
 * Décision Louis du 28/10/2026 : on ARCHIVE (jamais on ne supprime), CIBLÉ et par SEGMENT — un jour de création
 * à la fois (199 du 18/10, puis 823 du 20/10), jamais tout le parc d'un coup (rattrapage ciblé, 18/09). Une
 * coquille archivée redevient inconnue, elle ne disparaît pas : la ligne, sa raison d'échec et son historique
 * restent en base.
 *
 * Trois bornes, toutes dans le SQL :
 *  1. l'ESPACE qui les porte (`workspace_id = $1`) — jamais au-delà ;
 *  2. VIDE : le prédicat de la liste (une forme, un endroit, GA-26) — ni contact, ni angle, ni plan, ni analyse
 *     terminée ;
 *  3. aucune CORRECTION HUMAINE : un tri commercial posé, une note ou une tâche sort la fiche du lot.
 */

/**
 * TRUE ⇒ la ligne est une coquille d'échec VIDE. Octet pour octet la règle que la liste par défaut masque
 * (`KEEP_NON_EMPTY_FAILED_SQL` en est la négation) et que la migration `PurgeEmptyDuplicateAccounts` appliquait.
 */
export const FAILED_SHELL_SQL = `account.status IN ('error', 'canceled')
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = account.id)
  AND NOT EXISTS (SELECT 1 FROM attack_angles ang WHERE ang.account_id = account.id)
  AND NOT EXISTS (SELECT 1 FROM action_plans ap WHERE ap.account_id = account.id)
  AND NOT EXISTS (SELECT 1 FROM analysis_runs r WHERE r.account_id = account.id AND r.status = 'completed')`

/** Aucune trace humaine : le tri commercial est resté au défaut, aucune note, aucune tâche. */
const NO_HUMAN_TRACE_SQL = `COALESCE(account.commercial_status, 'inbox') = 'inbox'
  AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.entity_type = 'account' AND n.entity_id = account.id)
  AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.account_id = account.id)`

/** Le jour de création se lit en UTC : « le 18/10 » ne dépend pas du fuseau du serveur. */
const shellsOfDaySql = (scopeClause: string | null) => `account.workspace_id = $1
  AND (account.created_at AT TIME ZONE 'UTC')::date = $2::date${scopeClause ? `\n  AND ${scopeClause}` : ''}
  AND ${FAILED_SHELL_SQL}
  AND ${NO_HUMAN_TRACE_SQL}`

export type ShellManager = {
  transaction: <T>(
    work: (tx: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
  ) => Promise<T>
}

export type ArchiveFailedShellsOutcome = {
  createdOn: string
  /** Ce que le lot contient (mesuré avant d'écrire). */
  candidates: number
  /** Ce qui a réellement été archivé (0 à blanc). */
  archived: number
  dryRun: boolean
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Une vraie date de calendrier (le 30 février n'en est pas une) — rien d'autre n'entre dans le SQL. */
function isCalendarDay(value: string): boolean {
  const m = DAY.exec(value)
  if (!m) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

type Failure = { code: 'invalid_input'; message: string }

export async function archiveFailedShells(
  manager: ShellManager,
  workspaceId: string,
  opts: { createdOn: string; expected?: number; dryRun?: boolean; businessUnitScope?: BusinessUnitScopeClause },
): Promise<Result<ArchiveFailedShellsOutcome, Failure>> {
  if (!workspaceId) return failure({ code: 'invalid_input', message: 'Espace introuvable : aucun lot à archiver.' })
  if (!isCalendarDay(opts.createdOn)) {
    return failure({ code: 'invalid_input', message: 'Le lot se désigne par un jour de création (AAAA-MM-JJ).' })
  }
  const dryRun = opts.dryRun === true
  // #4785 — une route qui ARCHIVE reste dans le périmètre Business Unit de l'appelant (GA-336) : un lot n'emporte
  // jamais la fiche d'une unité que le membre ne voit pas. `null` ⇒ aucune borne (le membre voit tout l'espace).
  const scope = opts.businessUnitScope ?? null
  const scopeIds = scope ? [...scope.businessUnitIds] : []
  const selectScope = businessUnitScopeClause(scope, 'account.business_unit_id', 'SELECT unnest($3::uuid[])')
  const updateScope = businessUnitScopeClause(scope, 'account.business_unit_id', 'SELECT unnest($4::uuid[])')

  // Lecture ET écriture dans la MÊME transaction, lignes verrouillées : le lot mesuré est le lot archivé.
  return manager.transaction(async tx => {
    const found = returnedRows<{ id: string }>(
      await tx.query(
        `SELECT account.id FROM accounts account WHERE ${shellsOfDaySql(selectScope)} ORDER BY account.id FOR UPDATE`,
        scope && scope.businessUnitIds.length > 0
          ? [workspaceId, opts.createdOn, scopeIds]
          : [workspaceId, opts.createdOn],
      ),
    )
    const ids = found.map(row => row.id)
    const outcome = { createdOn: opts.createdOn, candidates: ids.length, archived: 0, dryRun }

    if (opts.expected !== undefined && opts.expected !== ids.length) {
      return failure({
        code: 'invalid_input',
        message: `Le lot du ${opts.createdOn} compte ${ids.length} coquille(s), pas ${opts.expected} : rien n'est archivé.`,
      })
    }
    if (dryRun || ids.length === 0) return success(outcome)

    // `error_message` n'est PAS touché : la raison de l'échec reste lisible sur la fiche archivée.
    const archived = returnedRows<{ id: string }>(
      await tx.query(
        `UPDATE accounts account
            SET status = 'archived', commercial_status = 'archived'
          WHERE account.id = ANY($3::uuid[])
            AND ${shellsOfDaySql(updateScope)}
        RETURNING account.id`,
        scope && scope.businessUnitIds.length > 0
          ? [workspaceId, opts.createdOn, ids, scopeIds]
          : [workspaceId, opts.createdOn, ids],
      ),
    )
    return success({ ...outcome, archived: archived.length })
  })
}
