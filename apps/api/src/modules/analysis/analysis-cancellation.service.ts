import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import IORedis from 'ioredis'
import { parseRedisUrl } from '../../config/redis-connection'

/** Redis pub/sub channel carrying cross-replica cancellation requests. */
const CANCEL_CHANNEL = 'bellum:analysis:cancel'

/**
 * Raison posée sur le signal quand c'est le PROCESSUS qui s'en va (redéploiement),
 * pas l'utilisateur qui annule. La distinction porte tout le comportement : une
 * annulation utilisateur ARRÊTE le run, un redéploiement doit le faire REPARTIR.
 */
export const WORKER_SHUTDOWN_REASON = 'worker-shutdown'

/** Signaux d'arrêt envoyés par l'hébergeur avant de tuer le conteneur. */
const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const

/**
 * Registry of `AbortController`s, one per active analysis job. The worker
 * registers a controller when it starts processing a job, the cancel API path
 * triggers its `abort()`, and any `IaClient` HTTP call wired with the
 * controller's signal short-circuits immediately.
 *
 * Multi-replica: the controller lives in the process running the BullMQ
 * worker, but the user's cancel HTTP request can land on ANY replica — and
 * `job.remove()` throws on locked (active) jobs, so without more the analysis
 * would keep running (and burning Claude tokens) to completion. When
 * REDIS_URL is set, `cancel()` therefore also broadcasts on a Redis pub/sub
 * channel that every replica subscribes to; the replica holding the
 * controller aborts it. Without Redis (dev, single instance) the behaviour
 * is exactly the old in-process one.
 */
@Injectable()
export class AnalysisCancellationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisCancellationService.name)
  private readonly controllers = new Map<string, AbortController>()

  /** Pub/sub pair — `undefined` without REDIS_URL (single instance). A
   *  subscribed ioredis connection can't issue regular commands, hence two. */
  private pub?: IORedis
  private sub?: IORedis

  /** Gardé pour être retiré à l'arrêt — sans quoi chaque instanciation (tests,
   *  rechargement à chaud) laisserait un écouteur derrière elle. */
  private shutdownHandler?: () => void

  onModuleInit(): void {
    // Redéploiement (annexe latence) : l'hébergeur envoie SIGTERM puis tue le
    // conteneur. Sans ce crochet, l'analyse en cours meurt SANS rien écrire, et
    // BullMQ ne peut la reprendre qu'à l'expiration de son verrou —
    // `lockDuration` = 10 min de temps mort, mesurées en production le
    // 16/08/2026. On abandonne donc TOUT DE SUITE, avec une raison qui dit
    // « reprends », pour que le nouveau conteneur reparte en quelques secondes.
    this.shutdownHandler = () => {
      this.abortAllForShutdown()
    }
    for (const signal of SHUTDOWN_SIGNALS) process.on(signal, this.shutdownHandler)

    if (!process.env['REDIS_URL']) return
    this.pub = new IORedis({ ...parseRedisUrl(), maxRetriesPerRequest: 3 })
    this.sub = this.pub.duplicate()
    this.sub.on('message', (channel: string, message: string) => {
      if (channel !== CANCEL_CHANNEL) return
      this.handleRemoteCancel(message)
    })
    void this.sub.subscribe(CANCEL_CHANNEL).catch((error: unknown) => {
      this.logger.warn('Could not subscribe to the cancel channel — cross-replica cancel degraded', { error })
    })
  }

  async onModuleDestroy(): Promise<void> {
    if (this.shutdownHandler) {
      for (const signal of SHUTDOWN_SIGNALS) process.removeListener(signal, this.shutdownHandler)
      this.shutdownHandler = undefined
    }
    await Promise.allSettled([this.pub?.quit(), this.sub?.quit()])
  }

  /**
   * Interrompt TOUTES les analyses de ce processus parce qu'il s'arrête.
   *
   * Rien n'est diffusé aux autres réplicas : c'est CE processus qui s'en va, et
   * une diffusion tuerait les analyses des réplicas qui, eux, vont très bien.
   *
   * Renvoie le nombre d'analyses interrompues — écrit dans le journal, parce
   * qu'un redéploiement qui coupe trois runs et un redéploiement qui n'en coupe
   * aucun ne se ressemblent pas une fois qu'on cherche pourquoi une analyse a
   * duré vingt minutes.
   */
  abortAllForShutdown(): number {
    const jobIds = Array.from(this.controllers.keys())
    for (const jobId of jobIds) this.abortLocal(jobId, WORKER_SHUTDOWN_REASON)
    if (jobIds.length > 0) {
      this.logger.warn('Arrêt du service — analyses interrompues, elles repartiront au redémarrage', {
        jobIds,
        count: jobIds.length,
      })
    }
    return jobIds.length
  }

  /** Called from the worker at the top of `process()` to register the abort signal
   *  it should pass into IaClient calls. Re-registering the same jobId returns the
   *  existing signal so a `cancel()` racing with a worker start still hits. */
  register(jobId: string): AbortSignal {
    let controller = this.controllers.get(jobId)
    if (!controller) {
      controller = new AbortController()
      this.controllers.set(jobId, controller)
    }
    return controller.signal
  }

  /** Called from the worker when the job ends (success, terminal failure,
   *  retry-exhausted). Frees the controller to keep the map bounded. */
  unregister(jobId: string): void {
    this.controllers.delete(jobId)
  }

  /**
   * Trigger the abort signal. Returns true if a worker was actively
   * registered ON THIS REPLICA (caller can still call `queue.removeJob` for
   * queued/delayed jobs that never reached `register()`). The broadcast is
   * fire-and-forget: the replica actually holding the controller aborts on
   * receipt, including this one (its local abort already happened — the
   * loopback delivery finds no controller and no-ops).
   */
  cancel(jobId: string, reason: string = 'cancelled'): boolean {
    void this.pub?.publish(CANCEL_CHANNEL, JSON.stringify({ jobId, reason })).catch((error: unknown) => {
      this.logger.warn('Cancel broadcast failed — remote replicas will not abort', { jobId, error })
    })
    return this.abortLocal(jobId, reason)
  }

  private handleRemoteCancel(message: string): void {
    try {
      const parsed: unknown = JSON.parse(message)
      if (typeof parsed !== 'object' || parsed === null) return
      const { jobId, reason } = parsed as { jobId?: unknown; reason?: unknown }
      if (typeof jobId !== 'string') return
      this.abortLocal(jobId, typeof reason === 'string' ? reason : 'cancelled')
    } catch {
      this.logger.warn('Ignored malformed cancel broadcast payload')
    }
  }

  private abortLocal(jobId: string, reason: string): boolean {
    const controller = this.controllers.get(jobId)
    if (!controller) {
      this.logger.debug('No active controller to cancel', { jobId })
      return false
    }
    controller.abort(reason)
    this.controllers.delete(jobId)
    this.logger.log('Analysis cancelled via abort signal', { jobId, reason })
    return true
  }
}
