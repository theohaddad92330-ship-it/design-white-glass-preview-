import { Logger, OnModuleDestroy } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { ProfilerPhase } from '@bellum/contracts'
import { profilerSocketEvents } from '@bellum/contracts'
import IORedis from 'ioredis'
import { Server, Socket } from 'socket.io'
import { attachSocketAuthOnce, socketPrincipal } from '../../common/auth/socket-identity'
import { getAllowedCorsOrigins } from '../../config/cors-origins'
import { parseRedisUrl } from '../../config/redis-connection'
import { attachRedisAdapterOnce, type RedisAdapterHandle } from '../../config/socketio-redis-adapter'

type BufferedEvent = { event: string; payload: Record<string, unknown> }

/**
 * Replay buffers live at most 15 min — a profiler run lasts seconds to a few
 * minutes, and `emitDone`/`emitError` clear the buffer explicitly. The TTL
 * only bounds leakage when the IA service never reports a terminal event.
 */
const BUFFER_TTL_SECONDS = 15 * 60

@WebSocketGateway({
  cors: {
    origin: getAllowedCorsOrigins(),
    credentials: true,
  },
})
export class ProfilerGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfilerGateway.name)

  @WebSocketServer()
  server!: Server

  /** Set when THIS gateway attached the shared Redis adapter (idempotent —
   *  the analysis gateway usually got there first on the shared server). */
  private adapterHandle?: RedisAdapterHandle

  /**
   * Redis client backing the replay buffer. The profiler's progress events
   * arrive over HTTP callbacks from the IA service, which the load balancer
   * routes to ANY replica — a per-process buffer would fragment across
   * replicas and a client joining late would replay only the slice its own
   * replica happened to receive. `undefined` without REDIS_URL (dev, single
   * instance) → the in-memory Map below, behaviour unchanged.
   */
  private redis?: IORedis

  /** In-memory replay buffer — single-instance (no REDIS_URL) fallback only. */
  private readonly buffers = new Map<string, BufferedEvent[]>()

  afterInit(server: Server): void {
    // Qui es-tu ? — posé UNE fois, à la connexion. Appelé depuis chaque
    // passerelle (règle n°7 : retirer un module ne doit pas faire disparaître
    // l'authentification), idempotent sur le serveur partagé.
    attachSocketAuthOnce(server, this.logger)
    this.adapterHandle = attachRedisAdapterOnce(server, this.logger)
    if (process.env['REDIS_URL']) {
      this.redis = new IORedis({ ...parseRedisUrl(), maxRetriesPerRequest: 3 })
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapterHandle?.close()
    await Promise.allSettled([this.redis?.quit()])
  }

  /**
   * *As-tu le droit d'entrer dans CETTE salle ?* — le second geste.
   *
   * La salle du profileur est PERSONNELLE et son tampon rejoue tout ce que le
   * profileur a dit de cette personne. La seule réponse juste est donc : on
   * n'entre que dans la SIENNE. L'identifiant du corps du message n'est pas une
   * identité — il est écrit par celui qui l'envoie ; on le compare à celle que
   * le jeton a prouvée, et un désaccord ne joint RIEN (ni salle, ni rejeu).
   *
   * Le refus est silencieux côté client, et journalisé côté serveur : émettre
   * `profiler:error` ferait s'afficher une erreur chez la victime légitime si
   * elle partageait la connexion, et n'apprendrait rien d'utile à l'appelant.
   */
  @SubscribeMessage(profilerSocketEvents.join)
  async handleJoin(@MessageBody() userId: string, @ConnectedSocket() client: Socket): Promise<void> {
    const room = this.ownRoomFor(userId, client, 'join')
    if (!room) return
    client.join(room)
    const replay = await this.readBuffer(room.slice('profiler:'.length))
    for (const { event, payload } of replay) {
      client.emit(event, payload)
    }
  }

  @SubscribeMessage(profilerSocketEvents.leave)
  handleLeave(@MessageBody() userId: string, @ConnectedSocket() client: Socket): void {
    const room = this.ownRoomFor(userId, client, 'leave')
    if (!room) return
    client.leave(room)
  }

  /**
   * La salle que ce socket a le droit de manipuler, ou `undefined`.
   *
   * Rend la salle de l'identité PROUVÉE — jamais celle nommée par le message —
   * et seulement si les deux coïncident. Un socket sans identité (l'intercepteur
   * de connexion l'a déjà écarté ; ceci est la défense en profondeur) n'obtient
   * aucune salle.
   */
  private ownRoomFor(claimed: unknown, client: Socket, action: 'join' | 'leave'): string | undefined {
    const principal = socketPrincipal(client)
    if (!principal) {
      this.logger.warn(`Socket non authentifié écarté sur \`${action}\` du profileur`)
      return undefined
    }
    if (typeof claimed === 'string' && claimed.length > 0 && claimed !== principal.userId) {
      this.logger.warn(`Salle de profileur refusée sur \`${action}\` : le message nomme une autre identité`)
      return undefined
    }
    return `profiler:${principal.userId}`
  }

  async emitPhaseStarted(userId: string, phase: ProfilerPhase, message: string): Promise<void> {
    await this.broadcast(userId, profilerSocketEvents.phaseStarted, { userId, phase, message })
  }

  async emitPhaseComplete(userId: string, phase: ProfilerPhase, message: string): Promise<void> {
    await this.broadcast(userId, profilerSocketEvents.phaseComplete, { userId, phase, message })
  }

  async emitField(userId: string, field: string, label: string, preview: string): Promise<void> {
    await this.broadcast(userId, profilerSocketEvents.fieldEmitted, { userId, field, label, preview })
  }

  async emitDone(userId: string): Promise<void> {
    await this.broadcast(userId, profilerSocketEvents.done, { userId })
    await this.clearBuffer(userId)
  }

  async emitError(userId: string, message: string): Promise<void> {
    await this.broadcast(userId, profilerSocketEvents.error, { userId, message })
    await this.clearBuffer(userId)
  }

  /** Buffer first (so a join racing this call still replays the event), then
   *  emit live — the Redis adapter fans the emit out to every replica. */
  private async broadcast(userId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    await this.pushBuffer(userId, { event, payload })
    this.server.to(`profiler:${userId}`).emit(event, payload)
  }

  private bufferKey(userId: string): string {
    return `profiler:replay:${userId}`
  }

  private async pushBuffer(userId: string, entry: BufferedEvent): Promise<void> {
    if (!this.redis) {
      const list = this.buffers.get(userId) ?? []
      list.push(entry)
      this.buffers.set(userId, list)
      return
    }
    try {
      const key = this.bufferKey(userId)
      await this.redis.multi().rpush(key, JSON.stringify(entry)).expire(key, BUFFER_TTL_SECONDS).exec()
    } catch (error) {
      // Best-effort: the live emit below still goes out; only late-join replay
      // degrades. Never fail the IA progress callback over a buffer write.
      this.logger.warn('Profiler replay buffer write failed', { error })
    }
  }

  private async readBuffer(userId: string): Promise<BufferedEvent[]> {
    if (!this.redis) return this.buffers.get(userId) ?? []
    try {
      const raw = await this.redis.lrange(this.bufferKey(userId), 0, -1)
      const events: BufferedEvent[] = []
      for (const item of raw) {
        try {
          const parsed: unknown = JSON.parse(item)
          if (isBufferedEvent(parsed)) events.push(parsed)
        } catch {
          // Skip unparseable entries — replay is best-effort.
        }
      }
      return events
    } catch (error) {
      this.logger.warn('Profiler replay buffer read failed', { error })
      return []
    }
  }

  private async clearBuffer(userId: string): Promise<void> {
    this.buffers.delete(userId)
    if (!this.redis) return
    try {
      await this.redis.del(this.bufferKey(userId))
    } catch (error) {
      this.logger.warn('Profiler replay buffer clear failed (TTL will reap it)', { error })
    }
  }
}

function isBufferedEvent(value: unknown): value is BufferedEvent {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { event?: unknown; payload?: unknown }
  return typeof candidate.event === 'string' && typeof candidate.payload === 'object' && candidate.payload !== null
}
