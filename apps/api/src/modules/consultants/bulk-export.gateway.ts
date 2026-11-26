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
import { BulkExportService, type BulkExportJobView } from './bulk-export.service'

export const bulkExportRoomOf = (jobId: string): string => `bulk-export:${jobId}`

/**
 * #1952.6 (épopée #2844, lot SRC5 28/09 soir) — la progression TEMPS RÉEL de
 * l'export en lot, même patron que `UniversalImportGateway` /
 * `BulkMatchingGateway`.
 */
@WebSocketGateway({ cors: { origin: getAllowedCorsOrigins(), credentials: true } })
export class BulkExportGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkExportGateway.name)
  private adapterHandle?: RedisAdapterHandle

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly bulkExport: BulkExportService,
  ) {}

  afterInit(server: Server): void {
    attachSocketAuthOnce(server, this.logger)
    this.adapterHandle = attachRedisAdapterOnce(server, this.logger)
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapterHandle?.close()
  }

  @SubscribeMessage('bulk-export:join')
  async handleJoin(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId !== 'string' || jobId.length === 0) return
    const principal = socketPrincipal(client)
    if (!principal) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(principal.userId)
      await this.bulkExport.state(workspaceId, jobId)
      await client.join(bulkExportRoomOf(jobId))
    } catch {
      this.logger.warn("Salle d'export en lot refusée : le job n'est pas dans l'espace de l'appelant")
    }
  }

  @SubscribeMessage('bulk-export:leave')
  async handleLeave(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId === 'string') await client.leave(bulkExportRoomOf(jobId))
  }

  emitProgress(view: BulkExportJobView): void {
    this.server?.to(bulkExportRoomOf(view.id)).emit('bulk-export:progress', view)
  }
}
