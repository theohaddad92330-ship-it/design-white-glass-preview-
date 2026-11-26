import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ACCOUNT_FOLLOW_CAP_REACHED,
  ACCOUNT_FOLLOW_MAX_PER_USER,
  type AccountFollowItem,
  type AccountFollowsResponse,
} from '@bellum/contracts'
import { nextReanalysisFor, nextReanalysisReasonFor } from '../watchlist-refresh/watchlist-refresh.queue'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountFollowEntity } from './account-follow.entity'

type FollowRow = {
  account_id: string
  company_name: string | null
  sector: string | null
  followed_at: Date | string
  archived_at: Date | string | null
  archived_reason: AccountFollowItem['archived_reason']
  notice_seen_at: Date | string | null
  last_analysis_at: Date | string | null
}

type FollowState = { account_id: string; followed: boolean; followed_count: number }

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

/** Laura tutoie (D82) ; le message suit le plafond, il ne le recopie pas. */
const capReachedMessage = (): string =>
  `${ACCOUNT_FOLLOW_MAX_PER_USER} comptes suivis au maximum — retire-en un pour suivre celui-ci.`

/**
 * #4267 — le suivi explicite d'un compte, par utilisateur.
 *
 *  · 4267.1 — ne lit et n'écrit que les lignes de l'appelant ; rien n'est suivi par défaut.
 *  · 4267.2 — {@link list} propose le compte analysé le plus récent quand l'utilisateur ne suit rien.
 *  · 4267.3 — {@link follow} refuse le 4e suivi (409, {@link ACCOUNT_FOLLOW_CAP_REACHED}). Le compte et
 *    l'écriture se font sous un verrou transactionnel PAR UTILISATEUR : deux clics simultanés ne
 *    franchissent pas le plafond ensemble.
 *  · 4267.4 — « Ne plus suivre » ARCHIVE la ligne, « Suivre » la réactive : on ne supprime pas.
 */
@Injectable()
export class AccountFollowsService {
  constructor(
    @InjectRepository(AccountFollowEntity)
    private readonly follows: Repository<AccountFollowEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  async list(userId: string, workspaceId: string): Promise<AccountFollowsResponse> {
    const rows = await this.follows
      .createQueryBuilder('follow')
      .innerJoin(AccountEntity, 'account', 'account.id = follow.account_id')
      .select([
        'follow.account_id AS account_id',
        'account.company_name AS company_name',
        'account.sector AS sector',
        'follow.followed_at AS followed_at',
        'follow.archived_at AS archived_at',
        'follow.archived_reason AS archived_reason',
        'follow.notice_seen_at AS notice_seen_at',
        // #4283.8 — la MÊME définition que le cron de ré-analyse (`enqueueReanalysisBatch`) : la dernière analyse terminée.
        "(SELECT MAX(run.completed_at) FROM analysis_runs run WHERE run.account_id = account.id AND run.status = 'completed') AS last_analysis_at",
      ])
      .where('follow.user_id = :userId', { userId })
      .andWhere('account.status <> :deleted', { deleted: 'deleted' })
      .orderBy('follow.followed_at', 'DESC')
      .getRawMany<FollowRow>()

    const toItem = (row: FollowRow): AccountFollowItem => ({
      account_id: row.account_id,
      company_name: row.company_name?.trim() || '',
      sector: row.sector ?? null,
      followed_at: iso(row.followed_at),
      archived_at: row.archived_at ? iso(row.archived_at) : null,
      archived_reason: row.archived_reason ?? null,
    })
    // #4283.8 — un suivi ACTIF dit sa dernière analyse et la prochaine (15 jours) ; un suivi archivé n'annonce rien.
    const toFollowedItem = (row: FollowRow): AccountFollowItem => {
      const lastAnalysis = row.last_analysis_at ? new Date(row.last_analysis_at) : null
      return {
        ...toItem(row),
        last_analyzed_at: lastAnalysis ? lastAnalysis.toISOString() : null,
        next_reanalysis_at: nextReanalysisFor(true, lastAnalysis),
        next_reanalysis_reason: nextReanalysisReasonFor(true, lastAnalysis),
      }
    }
    const followed = rows.filter(row => !row.archived_at).map(toFollowedItem)
    const archived = rows.filter(row => row.archived_at).map(toItem)

    return {
      max: ACCOUNT_FOLLOW_MAX_PER_USER,
      followed,
      archived,
      suggestion: followed.length === 0 ? await this.mostRecentAnalyzed(userId, workspaceId) : null,
      migration_notice: rows.some(row => row.archived_reason === 'migration_cap' && !row.notice_seen_at),
    }
  }

  /** 4267.2 — SON compte analysé le plus récent dans l'espace actif ; `null` s'il n'en a aucun. */
  private async mostRecentAnalyzed(userId: string, workspaceId: string): Promise<AccountFollowsResponse['suggestion']> {
    const account = await this.accounts.findOne({
      where: { user_id: userId, workspace_id: workspaceId, status: 'completed' },
      order: { created_at: 'DESC' },
    })
    if (!account) return null
    return {
      account_id: account.id,
      company_name: account.company_name?.trim() || '',
      sector: account.sector ?? null,
      analyzed_at: iso(account.created_at),
    }
  }

  async follow(userId: string, workspaceId: string, accountId: string): Promise<FollowState> {
    return this.follows.manager.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`account_follows:${userId}`])
      const repo = manager.getRepository(AccountFollowEntity)
      const existing = await repo.findOne({ where: { user_id: userId, account_id: accountId } })
      const active = await this.activeCount(manager.query.bind(manager), userId)
      if (existing && !existing.archived_at) return { account_id: accountId, followed: true, followed_count: active }
      if (active >= ACCOUNT_FOLLOW_MAX_PER_USER) {
        throw new ConflictException({ code: ACCOUNT_FOLLOW_CAP_REACHED, message: capReachedMessage() })
      }
      await repo.save(
        existing
          ? {
              ...existing,
              workspace_id: workspaceId,
              followed_at: new Date(),
              archived_at: null,
              archived_reason: null,
            }
          : repo.create({ user_id: userId, workspace_id: workspaceId, account_id: accountId, followed_at: new Date() }),
      )
      return { account_id: accountId, followed: true, followed_count: active + 1 }
    })
  }

  async unfollow(userId: string, accountId: string): Promise<FollowState> {
    await this.follows
      .createQueryBuilder()
      .update(AccountFollowEntity)
      .set({ archived_at: () => 'now()', archived_reason: 'unfollowed' })
      .where('user_id = :userId AND account_id = :accountId AND archived_at IS NULL', { userId, accountId })
      .execute()
    const followedCount = await this.activeCount((sql, params) => this.follows.query(sql, params), userId)
    return { account_id: accountId, followed: false, followed_count: followedCount }
  }

  /** 4267.4 — « On a gardé tes 3 comptes les plus récents » : lu, il ne revient plus. */
  async acknowledgeMigrationNotice(userId: string): Promise<void> {
    await this.follows
      .createQueryBuilder()
      .update(AccountFollowEntity)
      .set({ notice_seen_at: () => 'now()' })
      .where("user_id = :userId AND archived_reason = 'migration_cap' AND notice_seen_at IS NULL", { userId })
      .execute()
  }

  /** Les suivis ACTIFS de l'utilisateur, sur un compte encore présent — ce que le plafond compte. */
  private async activeCount(
    query: (sql: string, params: unknown[]) => Promise<Array<{ count: number | string }>>,
    userId: string,
  ): Promise<number> {
    const rows = await query(
      `SELECT count(*)::int AS count
         FROM account_follows f
         JOIN accounts a ON a.id = f.account_id
        WHERE f.user_id = $1 AND f.archived_at IS NULL AND a.status <> 'deleted'`,
      [userId],
    )
    return Number(rows[0]?.count ?? 0)
  }
}
