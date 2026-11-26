import { Inject, Logger, OnModuleDestroy } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { UNIVERSAL_IMPORT_SOCKET_EVENTS, type UniversalImportJobState } from '@bellum/contracts'
import { Server, Socket } from 'socket.io'
import { attachSocketAuthOnce, socketPrincipal } from '../../common/auth/socket-identity'
import { getAllowedCorsOrigins } from '../../config/cors-origins'
import { attachRedisAdapterOnce, type RedisAdapterHandle } from '../../config/socketio-redis-adapter'
import { UniversalImportService } from './universal-import.service'

/**
 * « Quel espace regarde cette personne ? » — un PORT câblé dans le module
 * (`useExisting: WorkspaceContextService`), même patron que les ports de
 * `RestitutionService` : ce fichier n'importe aucun service d'un autre module
 * (cliquet GA-07).
 */
export const UNIVERSAL_IMPORT_WORKSPACE_PORT = Symbol('UNIVERSAL_IMPORT_WORKSPACE_PORT')
type UniversalImportWorkspacePort = {
  resolveActiveWorkspace(userId: string): Promise<{ workspaceId: string }>
}

/** La salle d'un job — préfixée pour ne jamais croiser une salle de compte (`AnalysisGateway`). */
export const roomOf = (jobId: string): string => `universal-import:${jobId}`

/**
 * La progression TEMPS RÉEL de l'import universel, sur le serveur Socket.IO
 * PARTAGÉ (même authentification de poignée de main, même adaptateur Redis que
 * `AnalysisGateway` — un worker sur une autre réplique atteint quand même
 * l'écran). Entrer dans la salle d'un job pose la MÊME question que le HTTP :
 * ce job est-il dans l'espace de l'appelant ? Échec de lecture ⇒ refus.
 */
@WebSocketGateway({ cors: { origin: getAllowedCorsOrigins(), credentials: true } })
export class UniversalImportGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(UniversalImportGateway.name)
  private adapterHandle?: RedisAdapterHandle

  @WebSocketServer()
  server!: Server

  constructor(
    @Inject(UNIVERSAL_IMPORT_WORKSPACE_PORT) private readonly workspaceContext: UniversalImportWorkspacePort,
    private readonly imports: UniversalImportService,
  ) {}

  afterInit(server: Server): void {
    attachSocketAuthOnce(server, this.logger)
    this.adapterHandle = attachRedisAdapterOnce(server, this.logger)
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapterHandle?.close()
  }

  @SubscribeMessage(UNIVERSAL_IMPORT_SOCKET_EVENTS.join)
  async handleJoin(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId !== 'string' || jobId.length === 0) return
    const principal = socketPrincipal(client)
    if (!principal) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(principal.userId)
      await this.imports.state(workspaceId, jobId)
      await client.join(roomOf(jobId))
    } catch {
      this.logger.warn("Salle d'import refusée : le job n'est pas dans l'espace de l'appelant")
    }
  }

  @SubscribeMessage(UNIVERSAL_IMPORT_SOCKET_EVENTS.leave)
  async handleLeave(@MessageBody() jobId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof jobId === 'string') await client.leave(roomOf(jobId))
  }

  emitProgress(state: UniversalImportJobState): void {
    this.server?.to(roomOf(state.id)).emit(UNIVERSAL_IMPORT_SOCKET_EVENTS.progress, state)
  }
}
