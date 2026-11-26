import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { activeFollowExists } from '../account-follows/account-follow.entity'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { EsnRegistryRotation } from './esn-registry-rotation'
import { PlanFeaturesService } from '../plan-features/plan-features.service'
import {
  REANALYSIS_JOB,
  REGISTRY_WATCH_JOB,
  WATCHLIST_REFRESH_QUEUE,
  capForPlan,
  parisDay,
  registryWatchDisabled,
  reanalysisJobId,
  registryWatchJobId,
  selectDailyBatch,
  selectReanalysisBatch,
  spreadSpacingMs,
  watchlistRefreshCap,
  watchlistRefreshDisabled,
  watchlistRefreshJobId,
  type ReanalysisCandidateRow,
  type ReanalysisJobData,
  type RegistryWatchJobData,
  type WatchlistCandidateRow,
  type WatchlistRefreshJobData,
} from './watchlist-refresh.queue'

/** #3916.a — écart entre deux lectures de registre : la source publique a un
 *  budget par IP (`bodacc: 60 rpm` côté IA), deux secondes le respectent. */
const REGISTRY_JOB_SPACING_MS = 2_000
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * C4 — veille réelle : re-collecte quotidienne des signaux des comptes suivis.
 *
 * Before this cron the /watchlist page only ever showed the signals captured
 * at analysis time (or after a MANUAL « Actualiser » click, which debits an
 * enrichment credit). This scheduler closes the loop: every morning it picks
 * the stalest followed accounts and queues a SYSTEM signal refresh for each —
 * the same `refreshDimension('signals')` mechanism as the manual button
 * (`AnalysisOnDemandService.refreshResearch`), minus the credit debit.
 *
 * Robustness model (same as the other crons + the analysis pipeline):
 *  - `@Cron` fires on every replica → the body runs under the
 *    {@link SingletonLockService} tick lock (exactly one replica enqueues).
 *  - The lock fails OPEN, so the per-(account, day) deterministic jobId is the
 *    second idempotence layer: BullMQ silently dedupes a re-added job.
 *  - One BullMQ job per account → one account's failure never touches the
 *    others, and the worker's concurrency + the staggered `delay` spread the
 *    IA load across the morning instead of storming at the tick.
 *  - Volume is bounded per workspace/day (see `maxAccountsPerWorkspace`) —
 *    the refresh is system-paid (no credit debit), the cap is the budget.
 */
@Injectable()
export class WatchlistRefreshScheduler {
  private readonly logger = new Logger(WatchlistRefreshScheduler.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectQueue(WATCHLIST_REFRESH_QUEUE)
    private readonly queue: Queue<WatchlistRefreshJobData | RegistryWatchJobData | ReanalysisJobData>,
    // Cron-tick lock — `@Optional()` so direct-`new` specs need no stub;
    // without it the cron runs unlocked (single-instance behaviour).
    @Optional() private readonly locks?: SingletonLockService,
    // #4016 L7 — le palier de l'espace, pour le plafond opérateur PAR PLAN.
    // `@Optional()` : sans lui, seul le plafond `*` / global s'applique.
    @Optional() private readonly planFeatures?: PlanFeaturesService,
    // #3921.7 — la relecture nocturne des ESN du référentiel (le verrou est ICI, avec les autres passages).
    @Optional() private readonly esnRotation?: EsnRegistryRotation,
  ) {}

  /** 02:10 Europe/Paris — les ~30 ESN du référentiel relues le plus anciennement (registres publics seulement). */
  @Cron('10 2 * * *', { name: 'esn-registry-reread', timeZone: 'Europe/Paris' })
  @Correlated('cron:esn.registry-reread')
  async rereadEsnRegistry(): Promise<void> {
    await withSingletonLock(this.locks, 'esn-registry-reread', async () => {
      await this.esnRotation?.runNightly(new Date())
    })
  }

  /** Daily 05:20 Europe/Paris — before the 07:00 relance reminders, so fresh
   *  signals are already flowing in when reps start their day. */
  @Cron('20 5 * * *', { name: 'watchlist-refresh', timeZone: 'Europe/Paris' })
  @Correlated('cron:watchlist-refresh.runDailyWatchlistRefresh')
  async runDailyWatchlistRefresh(): Promise<void> {
    await withSingletonLock(this.locks, 'watchlist-refresh', async () => {
      await this.enqueueDailyBatch()
    })
  }

  /**
   * Select today's batch and enqueue one refresh job per account. Public so it
   * is unit-testable and can back a future admin "refresh now" action. Returns
   * the number of jobs actually enqueued.
   */
  async enqueueDailyBatch(now: Date = new Date()): Promise<number> {
    if (watchlistRefreshDisabled()) {
      this.logger.log('Watchlist refresh disabled (WATCHLIST_REFRESH_DISABLED=true) — skipping')
      return 0
    }
    // #4016 L7 — tout le portefeuille suivi par défaut ; plafond opérateur
    // OPTIONNEL, global ou par plan (`watchlistRefreshCap`).
    const cap = watchlistRefreshCap()
    if (cap.off) {
      this.logger.log('Watchlist refresh cap is 0 — skipping')
      return 0
    }

    // Watchlist = accounts FOLLOWED EXPLICITLY by at least one user (#4267.1 —
    // `account_follows`, 3 per user; the commercial status no longer counts)
    // whose analysis is COMPLETED — `refreshResearch` re-flips the
    // status to completed, so it must never run on a pending/failed dossier.
    // Stalest `updated_at` first: with the daily cap, the whole watchlist
    // rotates through over successive days instead of always refreshing the
    // same N accounts.
    const rows = await this.accounts
      .createQueryBuilder('account')
      .select(['account.id AS id', 'account.user_id AS user_id', 'account.workspace_id AS workspace_id'])
      .where(activeFollowExists('account'))
      .andWhere('account.status = :completed', { completed: 'completed' })
      // BELLUM-API-7 — un espace de démo est figé, l'IA refuse ses actions : on ne le met jamais en file.
      .andWhere('NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = account.workspace_id AND w.is_demo = true)')
      .orderBy('account.updated_at', 'ASC')
      .getRawMany<WatchlistCandidateRow>()

    const plans = await this.plansOf(rows, cap)
    const batch = selectDailyBatch(rows, tenant =>
      capForPlan(cap, tenant.workspace_id ? (plans.get(tenant.workspace_id) ?? null) : null),
    )
    if (batch.length === 0) {
      this.logger.log('Watchlist refresh: no followed completed account to refresh')
      return 0
    }

    const day = parisDay(now)
    // #4016 L7 — l'étalement se resserre pour que le lot tienne dans la
    // journée, jamais sous le plancher qui protège les sources.
    const spacing = spreadSpacingMs(batch.length)
    let enqueued = 0
    for (const [index, row] of batch.entries()) {
      try {
        await this.queue.add(
          'refresh',
          { accountId: row.id, userId: row.user_id },
          {
            // Idempotence layer 2 (the tick lock fails open): one job per
            // (account, Paris-day), replays and racing replicas dedupe here.
            jobId: watchlistRefreshJobId(row.id, day),
            // Étalement: spread the batch across the morning — no IA storm.
            delay: index * spacing,
          },
        )
        enqueued += 1
      } catch (err) {
        // Isolated failure: one bad enqueue must not sink the rest of the batch.
        this.logger.warn('Watchlist refresh enqueue failed for account (non-fatal)', {
          accountId: row.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const capLabel = Object.keys(cap.byPlan).length > 0 ? 'per plan' : (cap.fallback ?? 'none')
    this.logger.log(
      `Watchlist refresh: enqueued ${enqueued}/${batch.length} job(s) (${rows.length} candidate(s), cap ${capLabel}/workspace, spacing ${spacing}ms)`,
    )
    return enqueued
  }

  /** 04:40 Europe/Paris — #4267.5 : la ré-analyse des comptes suivis dont la dernière analyse a plus de 15 jours. */
  @Cron('40 4 * * *', { name: 'watchlist-reanalysis', timeZone: 'Europe/Paris' })
  @Correlated('cron:watchlist-refresh.runFortnightlyReanalysis')
  async runFortnightlyReanalysis(): Promise<void> {
    await withSingletonLock(this.locks, 'watchlist-reanalysis', async () => {
      await this.enqueueReanalysisBatch()
    })
  }

  /**
   * #4267.5 (Louis 18/10/2026, promesse client) — remet en file d'analyse les comptes SUIVIS EXPLICITEMENT
   * (3 au plus par utilisateur : le plafond est celui du suivi, jamais tout le parc) dont la dernière
   * analyse terminée a plus de 15 jours. L'analyse passe par le lancement normal (le worker l'appelle) :
   * les crédits sont débités comme pour toute analyse. Un job par (compte, fenêtre de 15 jours).
   */
  async enqueueReanalysisBatch(now: Date = new Date()): Promise<number> {
    if (watchlistRefreshDisabled()) {
      this.logger.log('Watchlist re-analysis disabled (WATCHLIST_REFRESH_DISABLED=true) — skipping')
      return 0
    }
    const rows = await this.accounts
      .createQueryBuilder('account')
      .select([
        'account.id AS id',
        'account.user_id AS user_id',
        'true AS followed',
        "(SELECT MAX(run.completed_at) FROM analysis_runs run WHERE run.account_id = account.id AND run.status = 'completed') AS last_analysis_at",
      ])
      .where(activeFollowExists('account'))
      .andWhere('account.status = :completed', { completed: 'completed' })
      .getRawMany<ReanalysisCandidateRow>()

    const due = selectReanalysisBatch(
      rows.map(row => ({
        ...row,
        last_analysis_at: row.last_analysis_at ? new Date(row.last_analysis_at) : null,
      })),
      now,
    )
    const spacing = spreadSpacingMs(due.length)
    let enqueued = 0
    for (const [index, row] of due.entries()) {
      try {
        await this.queue.add(
          REANALYSIS_JOB,
          { accountId: row.id, userId: row.user_id },
          { jobId: reanalysisJobId(row.id, row.last_analysis_at ?? now), delay: index * spacing },
        )
        enqueued += 1
      } catch (err) {
        this.logger.warn('Watchlist re-analysis enqueue failed for account (non-fatal)', {
          accountId: row.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    this.logger.log(`Watchlist re-analysis: enqueued ${enqueued}/${due.length} job(s) (${rows.length} followed)`)
    return enqueued
  }

  /**
   * #4016 L7 — le palier de chaque espace, lu SEULEMENT quand un plafond par
   * plan est posé (sinon : zéro requête de plus). Best-effort : un palier
   * illisible vaut `null`, donc le plafond `*` ou aucun — jamais un refus de
   * toute la veille pour une panne de lecture d'abonnement.
   */
  private async plansOf(
    rows: WatchlistCandidateRow[],
    cap: ReturnType<typeof watchlistRefreshCap>,
  ): Promise<Map<string, string | null>> {
    const plans = new Map<string, string | null>()
    if (Object.keys(cap.byPlan).length === 0 || !this.planFeatures) return plans
    for (const row of rows) {
      if (!row.workspace_id || plans.has(row.workspace_id)) continue
      try {
        plans.set(row.workspace_id, await this.planFeatures.planForWorkspace(row.workspace_id, row.user_id))
      } catch (err) {
        plans.set(row.workspace_id, null)
        this.logger.warn('Watchlist refresh: plan unreadable for workspace, operator fallback cap applied', {
          workspaceId: row.workspace_id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return plans
  }

  /**
   * #3916.a — la lecture QUOTIDIENNE des registres publics (BODACC) pour chaque
   * SIREN d'un compte suivi. 06:10 Europe/Paris : après la parution du bulletin
   * du jour, avant que les commerciaux n'ouvrent leur veille.
   *
   * Pas de plafond par espace, à la différence de la re-analyse : la source est
   * publique et gratuite, et c'est justement ce qui permet à TOUS les comptes
   * suivis d'être lus chaque jour, pas seulement dix par espace.
   */
  @Cron('10 6 * * *', { name: 'public-registry-watch', timeZone: 'Europe/Paris' })
  @Correlated('cron:watchlist-refresh.runDailyRegistryWatch')
  async runDailyRegistryWatch(): Promise<void> {
    await withSingletonLock(this.locks, 'public-registry-watch', async () => {
      await this.enqueueRegistryBatch()
    })
  }

  /** Un job `registry` par SIREN distinct des comptes suivis. Rend le nombre mis en file. */
  async enqueueRegistryBatch(now: Date = new Date()): Promise<number> {
    if (registryWatchDisabled()) {
      this.logger.log('Public registry watch disabled (PUBLIC_REGISTRY_WATCH_DISABLED=true) — skipping')
      return 0
    }
    // Ciblé, jamais tout le parc : les SEULS comptes suivis au dossier complet,
    // et seulement ceux dont le SIREN est connu (BODACC se rattache au SIREN,
    // jamais au nom — #3916).
    const rows = await this.accounts
      .createQueryBuilder('account')
      .select('DISTINCT account.siren', 'siren')
      // #4267.1 — suivis EXPLICITEMENT, jamais déduits du statut commercial.
      .where(activeFollowExists('account'))
      .andWhere('account.status = :completed', { completed: 'completed' })
      .andWhere("account.siren ~ '^[0-9]{9}$'")
      .getRawMany<{ siren: string }>()

    const day = parisDay(now)
    let enqueued = 0
    for (const [index, row] of rows.entries()) {
      try {
        await this.queue.add(
          REGISTRY_WATCH_JOB,
          { siren: row.siren },
          { jobId: registryWatchJobId(row.siren, day), delay: index * REGISTRY_JOB_SPACING_MS },
        )
        enqueued += 1
      } catch (err) {
        this.logger.warn('Public registry watch enqueue failed for SIREN (non-fatal)', {
          siren: row.siren,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    this.logger.log(`Public registry watch: enqueued ${enqueued}/${rows.length} SIREN(s)`)
    return enqueued
  }
}
