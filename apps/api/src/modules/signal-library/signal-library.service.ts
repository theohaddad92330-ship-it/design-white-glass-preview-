import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ACCOUNT_FOLLOW_CAP_REACHED,
  ACCOUNT_FOLLOW_MAX_PER_USER,
  nextWatchRunOn,
  SIGNAL_WATCH_CADENCES,
  type SignalStateRequest,
  type SignalStatesResponse,
  type SignalWatchState,
  type WatchesResponse,
  type WatchItem,
  type WatchRequest,
} from '@bellum/contracts'
import { SignalUserStateEntity } from './signal-user-state.entity'
import { returnedRows } from '../../database/returned-rows'

type WatchRow = {
  id: string
  user_id: string
  name: string
  account_ids: string[]
  natures: WatchItem['natures']
  keywords: string[]
  cadence: WatchItem['cadence']
  starts_on: Date | string
  timezone: string
  channel: WatchItem['channel']
  shared: boolean
  state: SignalWatchState
  created_at: Date | string
}

type AccountRow = { id: string; company_name: string | null; followed: boolean }
type Query = (sql: string, params?: unknown[]) => Promise<unknown>

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()
const day = (value: Date | string): string => (value instanceof Date ? value.toISOString() : value).slice(0, 10)

/**
 * Théo A signaux.N2 / signaux-veilles.N1 — l'état personnel des signaux et les veilles par compte.
 *
 * Tout est cloisonné par ESPACE : un état ou une veille ne se pose que sur des comptes de l'espace actif de
 * l'appelant (404 sinon, rien n'est écrit). Rien n'est supprimé : « remettre dans la bibliothèque » retire une
 * préférence, « supprimer une veille » l'archive.
 *
 * Aucun appel payant ici : la cadence d'une veille ne déclenche qu'une RELECTURE de ce que la collecte commune a
 * déjà ramené (décision du 18/10, veille sans achat).
 */
@Injectable()
export class SignalLibraryService {
  constructor(
    @InjectRepository(SignalUserStateEntity)
    private readonly states: Repository<SignalUserStateEntity>,
  ) {}

  async listStates(userId: string): Promise<SignalStatesResponse> {
    const rows = await this.states.query(
      `SELECT account_id, signal_key, state, updated_at FROM signal_user_states WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId],
    )
    return {
      items: (
        rows as Array<{
          account_id: string
          signal_key: string
          state: SignalStatesResponse['items'][number]['state']
          updated_at: Date | string
        }>
      ).map(row => ({
        account_id: row.account_id,
        signal_key: row.signal_key,
        state: row.state,
        updated_at: iso(row.updated_at),
      })),
    }
  }

  async setStates(userId: string, workspaceId: string, request: SignalStateRequest): Promise<{ updated: number }> {
    const accountIds = [...new Set(request.items.map(item => item.account_id))]
    await this.assertAccountsInWorkspace(accountIds, workspaceId)
    if (request.state === null) {
      await this.states.query(
        `DELETE FROM signal_user_states
          WHERE user_id = $1 AND (account_id, signal_key) IN (SELECT * FROM unnest($2::uuid[], $3::text[]))`,
        [userId, request.items.map(item => item.account_id), request.items.map(item => item.signal_key)],
      )
      return { updated: request.items.length }
    }
    await this.states.query(
      `INSERT INTO signal_user_states (user_id, workspace_id, account_id, signal_key, state)
       SELECT $1, $2, t.account_id, t.signal_key, $5
         FROM unnest($3::uuid[], $4::text[]) AS t(account_id, signal_key)
       ON CONFLICT (user_id, account_id, signal_key) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
      [
        userId,
        workspaceId,
        request.items.map(item => item.account_id),
        request.items.map(item => item.signal_key),
        request.state,
      ],
    )
    return { updated: request.items.length }
  }

  async listWatches(userId: string, workspaceId: string, today: string): Promise<WatchesResponse> {
    const rows = (await this.states.query(
      `SELECT id, user_id, name, account_ids, natures, keywords, cadence, starts_on, timezone, channel, shared, state, created_at
         FROM signal_watches
        WHERE workspace_id = $2 AND archived_at IS NULL AND (user_id = $1 OR shared = true)
        ORDER BY created_at DESC`,
      [userId, workspaceId],
    )) as WatchRow[]
    const wanted = [...new Set(rows.flatMap(row => row.account_ids))]
    const accounts = (
      wanted.length === 0
        ? []
        : await this.states.query(
            `SELECT a.id, a.company_name,
                    EXISTS (SELECT 1 FROM account_follows f WHERE f.account_id = a.id AND f.user_id = $2 AND f.archived_at IS NULL) AS followed
               FROM accounts a
              WHERE a.id = ANY($1::uuid[]) AND a.workspace_id = $3 AND a.status <> 'deleted'`,
            [wanted, userId, workspaceId],
          )
    ) as AccountRow[]
    const byId = new Map(accounts.map(account => [account.id, account]))
    const followedCount = Number(
      (
        (await this.states.query(
          `SELECT count(*)::int AS count
           FROM account_follows f JOIN accounts a ON a.id = f.account_id
          WHERE f.user_id = $1 AND f.archived_at IS NULL AND a.status <> 'deleted'`,
          [userId],
        )) as Array<{ count: number | string }>
      )[0]?.count ?? 0,
    )
    return {
      items: rows.map(row => {
        const cadenceDays = SIGNAL_WATCH_CADENCES.find(cadence => cadence.key === row.cadence)?.days ?? 0
        const startsOn = day(row.starts_on)
        return {
          id: row.id,
          name: row.name,
          natures: row.natures,
          keywords: row.keywords,
          cadence: row.cadence,
          starts_on: startsOn,
          timezone: row.timezone,
          channel: row.channel,
          shared: row.shared,
          state: row.state,
          mine: row.user_id === userId,
          accounts: row.account_ids.flatMap(id => {
            const account = byId.get(id)
            return account
              ? [{ account_id: id, company_name: account.company_name?.trim() || '', followed: account.followed }]
              : []
          }),
          next_run_on: row.state === 'paused' ? null : nextWatchRunOn(startsOn, cadenceDays, today),
          created_at: iso(row.created_at),
        }
      }),
      follow_max: ACCOUNT_FOLLOW_MAX_PER_USER,
      followed_count: followedCount,
    }
  }

  async createWatch(userId: string, workspaceId: string, request: WatchRequest): Promise<{ id: string }> {
    await this.assertAccountsInWorkspace(request.account_ids, workspaceId)
    return this.states.manager.transaction(async manager => {
      const query: Query = (sql, params) => manager.query(sql, params)
      await this.followWatchAccounts(query, userId, workspaceId, request.account_ids)
      const rows = (await query(
        `INSERT INTO signal_watches (user_id, workspace_id, name, account_ids, natures, keywords, cadence, starts_on, timezone, channel, shared)
         VALUES ($1, $2, $3, $4::uuid[], $5::text[], $6::text[], $7, $8, $9, $10, $11)
         RETURNING id`,
        [userId, workspaceId, ...watchParams(request)],
      )) as Array<{ id: string }>
      return { id: rows[0]?.id ?? '' }
    })
  }

  async updateWatch(userId: string, workspaceId: string, id: string, request: WatchRequest): Promise<void> {
    await this.assertAccountsInWorkspace(request.account_ids, workspaceId)
    await this.states.manager.transaction(async manager => {
      const query: Query = (sql, params) => manager.query(sql, params)
      // La veille d'un autre : 404 AVANT tout suivi — on ne suit rien pour une veille qu'on ne règle pas.
      const owned = returnedRows(
        await query(`SELECT id FROM signal_watches WHERE id = $2 AND user_id = $1 AND archived_at IS NULL FOR UPDATE`, [
          userId,
          id,
        ]),
      )
      if (owned.length === 0) throw new NotFoundException('Veille introuvable')
      await this.followWatchAccounts(query, userId, workspaceId, request.account_ids)
      const rows = returnedRows(
        await query(
          `UPDATE signal_watches
            SET name = $3, account_ids = $4::uuid[], natures = $5::text[], keywords = $6::text[], cadence = $7,
                starts_on = $8, timezone = $9, channel = $10, shared = $11, updated_at = now()
          WHERE id = $2 AND user_id = $1 AND archived_at IS NULL
          RETURNING id`,
          [userId, id, ...watchParams(request)],
        ),
      )
      if (rows.length === 0) throw new NotFoundException('Veille introuvable')
    })
  }

  /**
   * #4506 (Louis 23/10, plafond #4267) — une veille SUIT ses comptes : « Comptes suivis » de la modale et le suivi
   * du compte sont UNE seule notion (GA-26), celle que relisent la veille, le rafraîchissement et les digests.
   *
   * Le plafond compte les comptes suivis DISTINCTS de l'utilisateur, toutes veilles confondues : un compte déjà suivi
   * ne compte pas deux fois. Au-delà, 409 {@link ACCOUNT_FOLLOW_CAP_REACHED} et RIEN n'est écrit (ni suivi, ni veille).
   * Même verrou transactionnel que `AccountFollowsService.follow` : un « Suivre » concurrent ne franchit pas le plafond.
   */
  private async followWatchAccounts(query: Query, userId: string, workspaceId: string, accountIds: string[]) {
    await query('SELECT pg_advisory_xact_lock(hashtext($1))', [`account_follows:${userId}`])
    const followed = new Set(
      (
        (await query(
          `SELECT f.account_id FROM account_follows f JOIN accounts a ON a.id = f.account_id
            WHERE f.user_id = $1 AND f.archived_at IS NULL AND a.status <> 'deleted'`,
          [userId],
        )) as Array<{ account_id: string }>
      ).map(row => row.account_id),
    )
    const missing = [...new Set(accountIds)].filter(accountId => !followed.has(accountId))
    if (missing.length === 0) return
    if (followed.size + missing.length > ACCOUNT_FOLLOW_MAX_PER_USER) {
      throw new ConflictException({
        code: ACCOUNT_FOLLOW_CAP_REACHED,
        message: `${ACCOUNT_FOLLOW_MAX_PER_USER} comptes suivis au maximum, toutes veilles confondues — retire-en un pour suivre celui-ci.`,
      })
    }
    await query(
      `INSERT INTO account_follows (user_id, workspace_id, account_id, followed_at)
       SELECT $1, $2, t.account_id, now() FROM unnest($3::uuid[]) AS t(account_id)
       ON CONFLICT (user_id, account_id) DO UPDATE SET archived_at = NULL, archived_reason = NULL,
              followed_at = now(), workspace_id = EXCLUDED.workspace_id, updated_at = now()`,
      [userId, workspaceId, missing],
    )
  }

  async setWatchState(userId: string, id: string, state: SignalWatchState): Promise<void> {
    const rows = returnedRows(
      await this.states.query(
        `UPDATE signal_watches SET state = $3, updated_at = now() WHERE id = $2 AND user_id = $1 AND archived_at IS NULL RETURNING id`,
        [userId, id, state],
      ),
    )
    if (rows.length === 0) throw new NotFoundException('Veille introuvable')
  }

  /** « Supprimer une veille conserve les informations déjà collectées » : on archive la veille, les signaux ne bougent pas. */
  async archiveWatch(userId: string, id: string): Promise<void> {
    const rows = returnedRows(
      await this.states.query(
        `UPDATE signal_watches SET archived_at = now(), updated_at = now() WHERE id = $2 AND user_id = $1 AND archived_at IS NULL RETURNING id`,
        [userId, id],
      ),
    )
    if (rows.length === 0) throw new NotFoundException('Veille introuvable')
  }

  private async assertAccountsInWorkspace(accountIds: string[], workspaceId: string): Promise<void> {
    const rows = (await this.states.query(
      `SELECT count(*)::int AS count FROM accounts WHERE id = ANY($1::uuid[]) AND workspace_id = $2 AND status <> 'deleted'`,
      [accountIds, workspaceId],
    )) as Array<{ count: number | string }>
    if (Number(rows[0]?.count ?? 0) !== new Set(accountIds).size) throw new NotFoundException('Compte introuvable')
  }
}

/** Les colonnes d'une veille, dans l'ordre des requêtes d'écriture ($3 → $11). */
function watchParams(request: WatchRequest): unknown[] {
  return [
    request.name,
    request.account_ids,
    request.natures,
    request.keywords,
    request.cadence,
    request.starts_on,
    request.timezone,
    request.channel,
    request.shared,
  ]
}
