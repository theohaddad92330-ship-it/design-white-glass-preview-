import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import {
  aggregateNeeds,
  clampLimit,
  collectNeeds,
  filterNeeds,
  type NeedRow,
  type NeedsAggregate,
  type NeedsFilter,
} from './needs-history'
import { NEEDS_HISTORY_MAX_CALLS_PER_TURN, NEEDS_HISTORY_SOURCE_ROWS_PER_ACCOUNT } from './needs-history.limits'

export type NeedsHistoryPage = {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  maxCallsPerTurn: number
  aggregate: NeedsAggregate
  rows: NeedRow[]
}

type HistoryRow = { account_id: string; label: string; signal_date: string | null; status: string }

/**
 * #4759 (HIST-E) — l'historique des besoins d'un compte, lu À LA DEMANDE par Laura.
 *
 * Deux sources, jamais une troisième : les offres du dossier (`raw_analysis.it_job_signals`, avec leur date)
 * et les lignes de recrutement de `signal_history` (retombées comprises). Lecture seule, cloisonnée à
 * l'espace. Rien d'autre ne sort : ni corps de message, ni donnée de personne.
 */
@Injectable()
export class NeedsHistoryService {
  private readonly logger = new Logger(NeedsHistoryService.name)

  constructor(@InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>) {}

  /** L'agrégat borné du contexte, un par compte — deux requêtes pour TOUS les comptes, jamais une par compte. */
  async aggregateFor(workspaceId: string, accountIds: string[]): Promise<Map<string, NeedsAggregate>> {
    const out = new Map<string, NeedsAggregate>()
    if (accountIds.length === 0) return out
    const all = await this.load(workspaceId, accountIds)
    for (const [id, rows] of all) out.set(id, aggregateNeeds(rows))
    return out
  }

  async query(args: {
    workspaceId: string
    userId: string
    accountId: string
    filter: NeedsFilter
  }): Promise<NeedsHistoryPage | null> {
    const all = await this.load(args.workspaceId, [args.accountId])
    if (!all.has(args.accountId)) return null
    const rows = all.get(args.accountId) ?? []
    const matched = filterNeeds(rows, args.filter)
    const limit = clampLimit(args.filter.limit)
    const offset = Math.max(Math.trunc(args.filter.offset ?? 0), 0)
    const page = matched.slice(offset, offset + limit)
    // Le journal : de quoi relever si Laura bute sur le plafond (jamais le contenu des offres).
    this.logger.log(
      `needs_history.query workspace=${args.workspaceId} user=${args.userId} account=${args.accountId} ` +
        `matched=${matched.length} returned=${page.length} limit=${limit} offset=${offset}`,
    )
    return {
      total: matched.length,
      offset,
      limit,
      hasMore: offset + page.length < matched.length,
      maxCallsPerTurn: NEEDS_HISTORY_MAX_CALLS_PER_TURN,
      aggregate: aggregateNeeds(matched),
      rows: page,
    }
  }

  /** Comptes hors espace ou supprimés : absents de la map (jamais une porte dérobée vers un autre client). */
  private async load(workspaceId: string, ids: string[]): Promise<Map<string, NeedRow[]>> {
    const accounts = await this.accounts.manager.query<{ id: string; jobs: unknown }[]>(
      `SELECT a.id, COALESCE(a.raw_analysis -> 'it_job_signals', '[]'::jsonb) AS jobs
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.id = ANY($2::uuid[]) AND a.status <> 'deleted'`,
      [workspaceId, ids],
    )
    const history = await this.accounts.manager.query<HistoryRow[]>(
      `SELECT account_id, label, signal_date, status FROM (
         SELECT h.account_id, h.label, h.signal_date, h.status,
                row_number() OVER (PARTITION BY h.account_id ORDER BY h.last_seen_at DESC) AS rn
           FROM signal_history h
          WHERE h.account_id = ANY($2::uuid[])
            AND (h.workspace_id = $1 OR h.workspace_id IS NULL)
            AND h.signal_type IN ('recrutement', 'hiring', 'recruitment')
       ) t WHERE rn <= $3`,
      [workspaceId, accounts.map(a => a.id), NEEDS_HISTORY_SOURCE_ROWS_PER_ACCOUNT],
    )
    const now = new Date()
    const out = new Map<string, NeedRow[]>()
    for (const account of accounts) {
      out.set(
        account.id,
        collectNeeds({
          jobSignals: account.jobs,
          history: history.filter(h => h.account_id === account.id),
          now,
        }),
      )
    }
    return out
  }
}
