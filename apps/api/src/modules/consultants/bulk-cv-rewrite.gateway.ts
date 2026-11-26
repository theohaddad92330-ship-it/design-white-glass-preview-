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
import { attachSocketAuthOnce, socketPrincipal } from '../../common/auth/socket-identity'
import { getAllowedCorsOrigins } from '../../config/cors-origins'
import { attachRedisAdapterOnce, type RedisAdapterHandle } from '../../config/socketio-redis-adapter'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BulkCvRewriteService, type BulkCvRewriteJobView } from './bulk-cv-rewrite.service'

export const bulkCvRewriteRoomOf = (jobId: string): string => `bulk-cv-rewrite:${jobId}`

/**
 * #1952.5 (épopée #2844, lot SRC5 28/09 soir) — la progression TEMPS RÉEL de
 * la réécriture de CV en lot, même patron que `BulkMatchingGateway`.
 */
@WebSocketGateway({ cors: { origin: getAllowedCorsOrigins(), credentials: true } })
export class BulkCvRewriteGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkCvRewriteGateway.name)
  private adapterHandle?: RedisAdapterHandle

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly bulkCvRewrite: BulkCvRewriteService,
  ) {}

  afterInit(server: Server): void {
    attachSocketAuthOnce(server, this.logger)
    this.adapterHandle = attachRedisAdapterOnce(server, this.logger)
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapterHandle?.close()
  }

  @SubscribeMessage('bulk-cv-rewrite:join')
  async handleJoin(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId !== 'string' || jobId.length === 0) return
    const principal = socketPrincipal(client)
    if (!principal) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(principal.userId)
      await this.bulkCvRewrite.state(workspaceId, jobId)
      await client.join(bulkCvRewriteRoomOf(jobId))
    } catch {
      this.logger.warn("Salle de réécriture en lot refusée : le job n'est pas dans l'espace de l'appelant")
    }
  }

  @SubscribeMessage('bulk-cv-rewrite:leave')
  async handleLeave(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId === 'string') await client.leave(bulkCvRewriteRoomOf(jobId))
  }

  emitProgress(view: BulkCvRewriteJobView): void {
    this.server?.to(bulkCvRewriteRoomOf(view.id)).emit('bulk-cv-rewrite:progress', view)
  }
}
