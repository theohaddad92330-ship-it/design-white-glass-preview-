import { createHash } from 'node:crypto'
import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { In, Repository } from 'typeorm'
import { CRM_INCREMENTAL_PROVIDERS, type CrmProvider } from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { CrmReadSyncService } from '../crm/crm-read-sync.service'
import {
  CRM_MIRROR_SYNC,
  type CrmMirrorEntity,
  type CrmMirrorSync,
  type CrmMirrorSyncResult,
} from '../crm-mirror/crm-mirror.port'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { crmSyncDisabled } from './crm-sync.config'
import {
  CRM_FREQUENT_SYNC_QUEUE,
  CRM_WEBHOOK_DEDUP_MS,
  crmFrequentSyncSchedulerId,
  type CrmFrequentSyncJobData,
} from './crm-frequent-sync.queue'
import {
  backoffDelayMs,
  crmSyncIntervalMs,
  isRateLimited,
  isTimeout,
  maxPassesFor,
  nextFailureCount,
  retryAfterMs,
} from './crm-sync-schedule'

export type CrmPassResult =
  | { ran: true; state: 'ok' | 'unknown' | 'failed' | 'rate_limited' }
  | { ran: false; reason: 'disabled' | 'disconnected' | 'backoff' | 'locked' | 'first_import_pending' }

/** Les CRM dont on planifie un passage : ceux qui relisent depuis un curseur (HubSpot compris depuis SYNC-C). */
const SYNCED_PROVIDERS: readonly string[] = CRM_INCREMENTAL_PROVIDERS

/** Les erreurs partielles du miroir, une par objet (`deals`, `activities`…), pour le journal. */
function describeMirrorErrors(errors: CrmMirrorSyncResult['errors']): Record<CrmMirrorEntity, string | undefined> {
  const out: Record<CrmMirrorEntity, string | undefined> = {
    deals: undefined,
    activities: undefined,
    owners: undefined,
    pipelines: undefined,
  }
  for (const error of errors) out[error.entity] = error.message
  return out
}

/** Décalage stable (0 … intervalle) par couple : les espaces ne frappent pas tous le CRM à la même seconde. */
function jitterMs(schedulerId: string, intervalMs: number): number {
  return createHash('sha256').update(schedulerId).digest().readUInt32BE(0) % intervalMs
}

/**
 * SYNC-C (C.1 / C.2 / C.5) — la synchro des CRM toutes les `CRM_SYNC_INTERVAL_MINUTES` (15 par défaut) ; la nuit
 * (`CrmReadSyncService.runDailySync`) reste le rapprochement complet.
 *
 * Un passage = les comptes et contacts modifiés depuis le curseur (seulement si une première reprise l'a posé : la
 * première reprise est un geste humain) + le miroir en incrémental si SYNC-A est branché. Garde-fous :
 *  - verrou par (espace, fournisseur) : deux réplicas ou un webhook en rafale ne lisent pas deux fois ;
 *  - budget d'appels par fournisseur (`maxPassesFor`) ; un 429 / `Retry-After` recule, il n'est pas une panne ;
 *  - recul exponentiel plafonné sur échecs consécutifs, remis à zéro au succès ; l'état vit dans CE process
 *    (un redémarrage repart à l'intervalle normal : au pire un passage de plus, jamais un passage perdu) ;
 *  - un timeout n'est pas un échec : état `unknown`, le compteur ne bouge pas et le passage suivant repart ;
 *  - `CRM_SYNC_DISABLED` coupe tout, sans redéploiement.
 */
@Injectable()
export class CrmFrequentSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CrmFrequentSyncService.name)
  private readonly failures = new Map<string, number>()
  private readonly blockedUntil = new Map<string, number>()

  constructor(
    @InjectQueue(CRM_FREQUENT_SYNC_QUEUE) private readonly queue: Queue<CrmFrequentSyncJobData>,
    @InjectRepository(CrmConnectionEntity) private readonly connections: Repository<CrmConnectionEntity>,
    @Optional() private readonly readSync?: CrmReadSyncService,
    @Optional() private readonly locks?: SingletonLockService,
    @Optional() @Inject(CRM_MIRROR_SYNC) private readonly mirror?: CrmMirrorSync,
  ) {}

  /** La planification est posée au démarrage pour les connexions existantes. Sans Redis ou coupée : rien. */
  async onApplicationBootstrap(): Promise<void> {
    if (!process.env['REDIS_URL'] || crmSyncDisabled()) return
    try {
      await this.reconcileSchedules()
    } catch (error) {
      this.logger.warn('Planification de la synchro CRM non posée au démarrage', { error })
    }
  }

  /** Branchement : un passage répété pour ce couple. Idempotent (même identifiant = même planificateur). */
  async schedule(target: Omit<CrmFrequentSyncJobData, 'trigger'>): Promise<void> {
    const id = crmFrequentSyncSchedulerId(target.workspaceId, target.provider)
    const every = crmSyncIntervalMs()
    await this.queue.upsertJobScheduler(
      id,
      { every, offset: jitterMs(id, every) },
      {
        name: 'pass',
        data: { ...target, trigger: 'schedule' },
        opts: { attempts: 1, removeOnComplete: { age: 3_600, count: 50 }, removeOnFail: { age: 86_400, count: 50 } },
      },
    )
  }

  /** Déconnexion : le planificateur du couple disparaît, et avec lui son compteur d'échecs. */
  async unschedule(workspaceId: string, provider: string): Promise<void> {
    await this.queue.removeJobScheduler(crmFrequentSyncSchedulerId(workspaceId, provider))
    this.failures.delete(`${workspaceId}:${provider}`)
    this.blockedUntil.delete(`${workspaceId}:${provider}`)
  }

  /**
   * Aligne les planificateurs sur les connexions : ajoute ceux qui manquent (CRM branché depuis le dernier
   * passage), retire ceux dont la connexion a disparu (déconnexion), re-pose tous ceux dont l'intervalle a changé.
   */
  async reconcileSchedules(): Promise<{ scheduled: number; removed: number }> {
    const rows = await this.connections.find({ where: { provider: In([...SYNCED_PROVIDERS]) }, take: 1000 })
    const wanted = new Map<string, CrmFrequentSyncJobData>()
    for (const row of rows) {
      if (!row.workspace_id) continue
      wanted.set(crmFrequentSyncSchedulerId(row.workspace_id, row.provider), {
        workspaceId: row.workspace_id,
        userId: row.user_id,
        provider: row.provider,
        trigger: 'schedule',
      })
    }
    const every = crmSyncIntervalMs()
    const existing = await this.queue.getJobSchedulers(0, -1)
    const current = new Map(existing.map(scheduler => [scheduler.key, scheduler]))
    let removed = 0
    for (const scheduler of existing) {
      if (!scheduler.key.startsWith('crm-frequent:') || wanted.has(scheduler.key)) continue
      await this.queue.removeJobScheduler(scheduler.key)
      removed += 1
    }
    let scheduled = 0
    for (const [id, data] of wanted) {
      if (current.get(id)?.every === every) continue
      await this.schedule(data)
      scheduled += 1
    }
    return { scheduled, removed }
  }

  /** Filet : un CRM branché ou débranché sans geste de planification est rattrapé dans les 10 minutes. */
  @Cron('*/10 * * * *', { name: 'crm-frequent-sync-reconcile' })
  @Correlated('cron:crm-frequent-sync.reconcile')
  async reconcileCron(): Promise<void> {
    if (!process.env['REDIS_URL'] || crmSyncDisabled()) return
    await withSingletonLock(this.locks, 'crm-frequent-sync-reconcile', async () => {
      const outcome = await this.reconcileSchedules().catch((error: unknown) => {
        this.logger.warn('Alignement de la synchro CRM non abouti', { error })
        return null
      })
      if (outcome && (outcome.scheduled > 0 || outcome.removed > 0))
        this.logger.log('CRM sync schedules aligned', outcome)
    })
  }

  /** C.5 — une synchro CIBLÉE immédiate, dédoublonnée par (espace, fournisseur) sur 30 s. */
  async enqueueTargeted(target: Omit<CrmFrequentSyncJobData, 'trigger'>): Promise<void> {
    await this.queue.add(
      'pass',
      { ...target, trigger: 'webhook' },
      {
        attempts: 1,
        deduplication: { id: `crm-webhook:${target.workspaceId}:${target.provider}`, ttl: CRM_WEBHOOK_DEDUP_MS },
        removeOnComplete: { age: 3_600, count: 50 },
        removeOnFail: { age: 86_400, count: 50 },
      },
    )
  }

  /** Un passage. Ne lève jamais : l'état est rendu, le journal dit le reste. */
  async runPass(data: CrmFrequentSyncJobData): Promise<CrmPassResult> {
    if (crmSyncDisabled()) return { ran: false, reason: 'disabled' }
    const key = `${data.workspaceId}:${data.provider}`
    const connection = await this.connections.findOne({
      where: { workspace_id: data.workspaceId, provider: data.provider },
    })
    if (!connection) {
      // Débranché depuis la planification : le planificateur s'efface (idempotent).
      await this.unschedule(data.workspaceId, data.provider).catch(() => undefined)
      return { ran: false, reason: 'disconnected' }
    }
    // Un webhook passe outre le recul d'un échec ordinaire, jamais outre un 429 : le quota du client est à lui.
    if (Date.now() < (this.blockedUntil.get(key) ?? 0)) return { ran: false, reason: 'backoff' }

    let result: CrmPassResult = { ran: false, reason: 'locked' }
    const lockSeconds = Math.max(60, Math.floor(crmSyncIntervalMs() / 1000 / 2))
    const body = async () => {
      result = await this.pass(connection.user_id, data, key)
    }
    if (this.locks) await this.locks.withLock(`crm-pass:${key}`, body, data.trigger === 'webhook' ? 20 : lockSeconds)
    else await body()
    return result
  }

  private async pass(userId: string, data: CrmFrequentSyncJobData, key: string): Promise<CrmPassResult> {
    const startedAt = new Date()
    const since = (await this.readSync?.lastPassAt(data.workspaceId, data.provider)) ?? undefined
    try {
      const run = await this.readSync?.syncProvider(userId, data.provider, { maxPasses: maxPassesFor(data.provider) })
      if (run && !run.ran && run.reason === 'first_import_pending')
        return { ran: false, reason: 'first_import_pending' }
      const mirrorResult: CrmMirrorSyncResult | undefined = await this.mirror?.syncProvider({
        workspaceId: data.workspaceId,
        provider: data.provider,
        mode: 'incremental',
        ...(since ? { since } : {}),
      })
      if (mirrorResult && mirrorResult.errors.length > 0)
        this.logger.warn(`Miroir CRM partiel (${data.provider})`, { errors: describeMirrorErrors(mirrorResult.errors) })
      return this.settle(key, data, 'ok', null)
    } catch (error) {
      const state = isRateLimited(error) ? 'rate_limited' : isTimeout(error) ? 'unknown' : 'failed'
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Synchro CRM ${data.provider} (${state}) — passage de ${startedAt.toISOString()}`, {
        workspaceId: data.workspaceId,
        error: message,
      })
      return this.settle(key, data, state, message, isRateLimited(error) ? message : null)
    }
  }

  private async settle(
    key: string,
    data: CrmFrequentSyncJobData,
    state: 'ok' | 'unknown' | 'failed' | 'rate_limited',
    message: string | null,
    rateLimitText: string | null = null,
  ): Promise<CrmPassResult> {
    const failures = nextFailureCount(this.failures.get(key) ?? 0, state)
    this.failures.set(key, failures)
    if (state === 'ok' || state === 'unknown') {
      this.blockedUntil.delete(key)
    } else {
      const hinted = rateLimitText ? retryAfterMs(/retry-after (\d+)/i.exec(rateLimitText)?.[1]) : null
      this.blockedUntil.set(key, Date.now() + Math.max(backoffDelayMs(failures), hinted ?? 0))
    }
    // L'erreur d'un échec se DIT à l'écran ; un timeout (`unknown`) n'est pas une erreur ; un succès efface la précédente.
    if (state !== 'unknown')
      await this.readSync?.recordPassError(data.workspaceId, data.provider, message).catch(() => undefined)
    return { ran: true, state }
  }
}
