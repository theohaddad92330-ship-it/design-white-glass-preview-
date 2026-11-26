import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common'
import IORedis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { parseRedisUrl } from '../../config/redis-connection'
import { AccountsService } from '../accounts/accounts.service'
import type { PortfolioPriorities } from '../accounts/portfolio-priorities'
import { NotificationsService } from '../notifications/notifications.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #4462.9 — le classement « par où commencer » au RETOUR d'un lot d'analyses lancé par Laura depuis une liste de noms.
 *
 * Aucun mécanisme de fin de lot n'existait (`analysis-batches` suit les lots de l'écran, pas ceux de Laura, et ne
 * déclenche rien à leur fin). Le plus simple : Laura déclare le lot au lancement (`follow`), le worker déclare chaque
 * analyse terminée ou échouée (`settled`), et la DERNIÈRE pose une notification portant le classement existant du
 * portefeuille (`portfolioPriorities`, aucun second calcul — GA-26) restreint aux comptes du lot. Un échec compte
 * comme terminé : un lot ne reste jamais suspendu à une analyse perdue. Rien ne part à l'extérieur ; aucun crédit,
 * aucun nombre de coût (crédits implicites, c128).
 */

/** Un lot vit au plus quatre heures : une analyse dure 3 à 6 minutes, le reste est un lot abandonné. */
const BATCH_TTL_S = 4 * 3600
const MAX_LINES = 10

/** Jeton d'injection du magasin de lots — absent en production (Redis ou mémoire selon `REDIS_URL`), posé par les tests. */
const LAURA_BATCH_STORE = Symbol('LAURA_BATCH_STORE')

interface BatchStore {
  open(batchId: string, userId: string, pending: string[], members: string[]): Promise<void>
  /** Retire l'analyse de chaque lot qui l'attend ; rend les lots VIDÉS par ce retrait et dont CE appel est le premier à les clore. */
  settle(accountId: string): Promise<{ batchId: string; userId: string; members: string[] }[]>
}

export class MemoryBatchStore implements BatchStore {
  private readonly batches = new Map<string, { userId: string; pending: Set<string>; members: string[] }>()

  async open(batchId: string, userId: string, pending: string[], members: string[]): Promise<void> {
    this.batches.set(batchId, { userId, pending: new Set(pending), members })
  }

  async settle(accountId: string): Promise<{ batchId: string; userId: string; members: string[] }[]> {
    const closed: { batchId: string; userId: string; members: string[] }[] = []
    for (const [batchId, batch] of this.batches) {
      if (batch.pending.delete(accountId) && batch.pending.size === 0) {
        this.batches.delete(batchId)
        closed.push({ batchId, userId: batch.userId, members: batch.members })
      }
    }
    return closed
  }
}

/** Partagé entre les réplicas : l'enregistrement peut tomber sur l'un, la fin d'analyse sur l'autre. */
class RedisBatchStore implements BatchStore {
  constructor(private readonly redis: IORedis) {}

  async open(batchId: string, userId: string, pending: string[], members: string[]): Promise<void> {
    const pipeline = this.redis.multi()
    pipeline.set(`bellum:lbatch:${batchId}:meta`, JSON.stringify({ userId, members }), 'EX', BATCH_TTL_S)
    for (const accountId of pending) {
      pipeline.sadd(`bellum:lbatch:${batchId}:pending`, accountId)
      pipeline.sadd(`bellum:lbatch:acct:${accountId}`, batchId)
      pipeline.expire(`bellum:lbatch:acct:${accountId}`, BATCH_TTL_S)
    }
    pipeline.expire(`bellum:lbatch:${batchId}:pending`, BATCH_TTL_S)
    await pipeline.exec()
  }

  async settle(accountId: string): Promise<{ batchId: string; userId: string; members: string[] }[]> {
    const batchIds = await this.redis.smembers(`bellum:lbatch:acct:${accountId}`)
    const closed: { batchId: string; userId: string; members: string[] }[] = []
    for (const batchId of batchIds) {
      const removed = await this.redis.srem(`bellum:lbatch:${batchId}:pending`, accountId)
      await this.redis.srem(`bellum:lbatch:acct:${accountId}`, batchId)
      if (removed === 0 || (await this.redis.scard(`bellum:lbatch:${batchId}:pending`)) > 0) continue
      // Le premier à poser la clé close le lot : un événement rejoué, ou deux réplicas, ne postent qu'une fois.
      if ((await this.redis.set(`bellum:lbatch:${batchId}:done`, '1', 'EX', BATCH_TTL_S, 'NX')) !== 'OK') continue
      const meta = await this.redis.get(`bellum:lbatch:${batchId}:meta`)
      if (!meta) continue
      const parsed = JSON.parse(meta) as { userId: string; members: string[] }
      closed.push({ batchId, userId: parsed.userId, members: parsed.members })
    }
    return closed
  }
}

type RankLine = { id: string; companyName: string; reason: string }

/** Le classement EXISTANT du portefeuille (maintenant · à vérifier · à surveiller · pas maintenant), restreint au lot. */
export function rankBatch(priorities: PortfolioPriorities, members: ReadonlySet<string>): RankLine[] {
  return [...priorities.now, ...priorities.toVerify, ...priorities.toWatch, ...priorities.notNow]
    .filter(entry => members.has(entry.id))
    .map(entry => ({ id: entry.id, companyName: entry.companyName, reason: entry.reason }))
}

export function batchRankingBody(lines: readonly RankLine[]): string {
  return lines
    .slice(0, MAX_LINES)
    .map((line, index) => `${index + 1}. ${line.companyName}${line.reason.trim() ? ` — ${line.reason.trim()}` : ''}`)
    .join('\n')
}

@Injectable()
export class LauraBatchFollowService implements OnModuleDestroy {
  private readonly logger = new Logger(LauraBatchFollowService.name)
  private redis?: IORedis
  private readonly store: BatchStore

  constructor(
    @Optional() @Inject(LAURA_BATCH_STORE) store: BatchStore | undefined,
    private readonly accounts: AccountsService,
    private readonly notifications: NotificationsService,
    private readonly workspaces: WorkspaceContextService,
  ) {
    if (store) this.store = store
    else if (process.env['REDIS_URL']) {
      this.redis = new IORedis({ ...parseRedisUrl(), maxRetriesPerRequest: 3 })
      this.redis.on('error', () => undefined)
      this.store = new RedisBatchStore(this.redis)
    } else this.store = new MemoryBatchStore()
  }

  onModuleDestroy(): void {
    void this.redis?.quit().catch(() => undefined)
  }

  /** Laura déclare le lot : `launched` = analyses en cours (on les attend), `known` = comptes déjà analysés (au classement). */
  async follow(userId: string, launched: readonly string[], known: readonly string[]): Promise<void> {
    const pending = [...new Set(launched.filter(Boolean))]
    if (pending.length === 0) return
    const members = [...new Set([...pending, ...known.filter(Boolean)])]
    await this.store.open(randomUUID(), userId, pending, members)
  }

  /** Le worker déclare une analyse terminée (ou échouée). Ne jette JAMAIS : un classement perdu ne fait pas échouer un run. */
  async settled(accountId: string, userId: string): Promise<void> {
    try {
      for (const batch of await this.store.settle(accountId)) {
        if (batch.userId !== userId) continue
        await this.announce(batch.userId, batch.members)
      }
    } catch (error) {
      this.logger.warn(`classement de fin de lot : ${(error as Error).message}`)
    }
  }

  private async announce(userId: string, members: readonly string[]): Promise<void> {
    const { workspaceId } = await this.workspaces.resolveActiveWorkspace(userId)
    const priorities = await this.accounts.portfolioPriorities(workspaceId, userId)
    const lines = rankBatch(priorities, new Set(members))
    if (lines.length === 0) return
    await this.notifications.createNotification(userId, {
      type: 'system',
      title: 'Tes analyses sont terminées — par où commencer',
      body: batchRankingBody(lines),
      link: '/accounts',
      origin: 'user_triggered',
    })
  }
}
