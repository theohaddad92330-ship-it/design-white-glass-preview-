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
import { MultiSourceSearchService, type MultiSourceSearchJobView } from './multi-source-search.service'

export const multiSourceSearchRoomOf = (jobId: string): string => `multi-source-search:${jobId}`

/**
 * #1952.7 (épopée #2844, lot SRC5 28/09 soir) — la progression TEMPS RÉEL de
 * la recherche multi-sources, même patron que `UniversalImportGateway` /
 * `BulkMatchingGateway`.
 */
@WebSocketGateway({ cors: { origin: getAllowedCorsOrigins(), credentials: true } })
export class MultiSourceSearchGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(MultiSourceSearchGateway.name)
  private adapterHandle?: RedisAdapterHandle

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly multiSourceSearch: MultiSourceSearchService,
  ) {}

  afterInit(server: Server): void {
    attachSocketAuthOnce(server, this.logger)
    this.adapterHandle = attachRedisAdapterOnce(server, this.logger)
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapterHandle?.close()
  }

  @SubscribeMessage('multi-source-search:join')
  async handleJoin(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId !== 'string' || jobId.length === 0) return
    const principal = socketPrincipal(client)
    if (!principal) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(principal.userId)
      await this.multiSourceSearch.state(workspaceId, jobId)
      await client.join(multiSourceSearchRoomOf(jobId))
    } catch {
      this.logger.warn("Salle de recherche multi-sources refusée : le job n'est pas dans l'espace de l'appelant")
    }
  }

  @SubscribeMessage('multi-source-search:leave')
  async handleLeave(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId === 'string') await client.leave(multiSourceSearchRoomOf(jobId))
  }

  emitProgress(view: MultiSourceSearchJobView): void {
    this.server?.to(multiSourceSearchRoomOf(view.id)).emit('multi-source-search:progress', view)
  }
}
