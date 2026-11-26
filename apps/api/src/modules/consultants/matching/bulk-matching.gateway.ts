import { Logger, OnModuleDestroy } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { attachSocketAuthOnce, socketPrincipal } from '../../../common/auth/socket-identity'
import { getAllowedCorsOrigins } from '../../../config/cors-origins'
import { attachRedisAdapterOnce, type RedisAdapterHandle } from '../../../config/socketio-redis-adapter'
import { WorkspaceContextService } from '../../workspace/workspace-context.service'
import { BulkMatchingService, type BulkMatchingJobView } from './bulk-matching.service'

/** La salle d'un job — préfixée pour ne jamais croiser une salle d'un autre travail long. */
export const bulkMatchingRoomOf = (jobId: string): string => `bulk-matching:${jobId}`

/**
 * #1952.3 (épopée #2844, lot SRC5 28/09 soir) — la progression TEMPS RÉEL du
 * matching massif, même patron que `UniversalImportGateway` : serveur
 * Socket.IO PARTAGÉ, même authentification de poignée de main, même
 * adaptateur Redis. Entrer dans la salle d'un job pose la même question que
 * le HTTP : ce job est-il dans l'espace de l'appelant ? Échec de lecture ⇒
 * refus — une panne de base ne doit jamais OUVRIR une salle.
 */
@WebSocketGateway({ cors: { origin: getAllowedCorsOrigins(), credentials: true } })
export class BulkMatchingGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkMatchingGateway.name)
  private adapterHandle?: RedisAdapterHandle

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly bulkMatching: BulkMatchingService,
  ) {}

  afterInit(server: Server): void {
    attachSocketAuthOnce(server, this.logger)
    this.adapterHandle = attachRedisAdapterOnce(server, this.logger)
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapterHandle?.close()
  }

  @SubscribeMessage('bulk-matching:join')
  async handleJoin(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId !== 'string' || jobId.length === 0) return
    const principal = socketPrincipal(client)
    if (!principal) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(principal.userId)
      await this.bulkMatching.state(workspaceId, jobId)
      await client.join(bulkMatchingRoomOf(jobId))
    } catch {
      this.logger.warn("Salle de matching massif refusée : le job n'est pas dans l'espace de l'appelant")
    }
  }

  @SubscribeMessage('bulk-matching:leave')
  async handleLeave(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId === 'string') await client.leave(bulkMatchingRoomOf(jobId))
  }

  emitProgress(view: BulkMatchingJobView): void {
    this.server?.to(bulkMatchingRoomOf(view.id)).emit('bulk-matching:progress', view)
  }
}
