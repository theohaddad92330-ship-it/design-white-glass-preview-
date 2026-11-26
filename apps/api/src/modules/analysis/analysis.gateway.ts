import { Logger, OnModuleDestroy, Optional } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { analysisPartialFrom } from '@bellum/contracts'
import type { AgentWarning, SourceHealth } from '@bellum/contracts'
import { isFailure } from '@bellum/utils'
import { Server, Socket } from 'socket.io'
import { attachSocketAuthOnce, socketPrincipal } from '../../common/auth/socket-identity'
import { getAllowedCorsOrigins } from '../../config/cors-origins'
import { attachRedisAdapterOnce, type RedisAdapterHandle } from '../../config/socketio-redis-adapter'
import { AccountsService } from '../accounts/accounts.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

@WebSocketGateway({
  cors: {
    origin: getAllowedCorsOrigins(),
    credentials: true,
  },
})
export class AnalysisGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisGateway.name)

  /**
   * Set when THIS gateway attached the shared Redis adapter (see
   * {@link attachRedisAdapterOnce} — analysis worker emits and IA progress
   * callbacks must reach clients connected to other replicas). `undefined`
   * when REDIS_URL is unset (in-memory adapter) or when another gateway on
   * the shared server attached it first.
   */
  private adapterHandle?: RedisAdapterHandle

  @WebSocketServer()
  server!: Server

  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly accountsService: AccountsService,
    /**
     * #2710 — LE PÉRIMÈTRE D'UNITÉ, comme le chemin HTTP.
     *
     * `@Optional()` et en dernière position pour la même raison que dans
     * `AnalysisController` : des specs construisent cette passerelle
     * POSITIONNELLEMENT. ⚠️ Optionnel pour le CONSTRUCTEUR, jamais pour la
     * RÈGLE — voir `resolveBusinessUnitScope`, qui LÈVE plutôt que d'ouvrir
     * l'espace entier si absent (fail-closed, rattrapé par le `catch` de
     * `mayWatch`).
     */
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  afterInit(server: Server): void {
    // Qui es-tu ? — posé UNE fois, à la connexion. Appelé depuis chaque
    // passerelle (règle n°7 : retirer un module ne doit pas faire disparaître
    // l'authentification), idempotent sur le serveur partagé.
    attachSocketAuthOnce(server, this.logger)
    this.adapterHandle = attachRedisAdapterOnce(server, this.logger)
  }

  /**
   * Close the adapter's Redis clients on shutdown (SIGTERM/SIGINT via Nest's
   * shutdown hooks) so a redeploy doesn't leak connections. No-op when the
   * in-memory adapter is in use or another gateway owns the clients.
   */
  async onModuleDestroy(): Promise<void> {
    await this.adapterHandle?.close()
  }

  /**
   * Socket rooms are keyed by ``accountId`` (not the BullMQ job id). An
   * account always has at most one in-flight analysis, so accountId is the
   * stable handle the client uses to rejoin from Search, AccountDetail or
   * the sidebar. ``jobId`` still travels in the payload so the client can
   * call ``POST /analysis/cancel/:jobId`` and identify the underlying queue
   * job without having to look it up.
   */
  @SubscribeMessage('join')
  async handleJoin(@MessageBody() accountId: string, @ConnectedSocket() client: Socket): Promise<void> {
    if (typeof accountId !== 'string' || accountId.length === 0) return
    const principal = socketPrincipal(client)
    if (!principal) {
      this.logger.warn("Socket non authentifié écarté sur `join` d'une salle d'analyse")
      return
    }
    if (!(await this.mayWatch(principal.userId, accountId))) {
      this.logger.warn("Salle d'analyse refusée : le compte n'est pas dans l'espace de l'appelant")
      return
    }
    client.join(accountId)
  }

  /**
   * *As-tu le droit d'entrer dans CETTE salle ?* — le second geste.
   *
   * La salle est nommée par un `accountId` que l'appelant fournit. Un UUID est
   * de l'OBSCURITÉ, pas une autorisation : il faut la même question que le
   * chemin HTTP pose déjà (`AccountsController`, `listVocabulary`) —
   * `AccountsService.findOneForWorkspace`, ESPACE **et** UNITÉ. Rien n'est
   * inventé ici, ni un nouveau modèle de droits, ni une seconde définition de
   * « mon portefeuille » : `WorkspaceContextService` décide de l'espace,
   * `resolveBusinessUnitScope` décide de l'unité (fail-closed si le service
   * n'est pas câblé), et `findOneForWorkspace` applique les deux dans la MÊME
   * requête que le reste du dépôt écrit.
   *
   * #2710 — avant ce commit, cette méthode s'arrêtait à l'espace : un membre
   * cloisonné sur une autre unité pouvait suivre en temps réel la progression
   * d'un compte que le chemin HTTP (`GET /analysis/status/:accountId`) lui
   * refusait déjà. Le canal temps réel était donc PLUS permissif que le HTTP
   * sur la même ressource.
   *
   * Échec de lecture ⇒ `false`. Une panne de base ne doit jamais OUVRIR une
   * salle : le prix d'un refus est une barre de progression figée, le prix de
   * l'inverse est le dossier d'un concurrent.
   */
  private async mayWatch(userId: string, accountId: string): Promise<boolean> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
      const account = await this.accountsService.findOneForWorkspace(accountId, workspaceId, businessUnitScope)
      return !isFailure(account)
    } catch (error) {
      this.logger.error("Vérification d'appartenance impossible — salle refusée", {
        error: error instanceof Error ? error : new Error(String(error)),
      })
      return false
    }
  }

  @SubscribeMessage('leave')
  handleLeave(@MessageBody() accountId: string, @ConnectedSocket() client: Socket): void {
    client.leave(accountId)
  }

  emitPhaseStarted(accountId: string, jobId: string, phase: string, percent: number): void {
    this.server.to(accountId).emit('phase:started', { accountId, jobId, phase, percent })
  }

  emitPhaseProgress(
    accountId: string,
    jobId: string,
    phase: string,
    step: string,
    percent: number,
    message?: string,
  ): void {
    this.server.to(accountId).emit('phase:progress', { accountId, jobId, phase, step, percent, message })
  }

  /**
   * Send a "still alive" tick during a long phase. The client store is
   * monotonic on ``percent`` so the floor passed here cannot rewind a higher
   * value already pushed by the IA service — it only refreshes the phase
   * label + the live event log so the user sees activity instead of a
   * frozen UI.
   */
  emitHeartbeat(accountId: string, jobId: string, phase: string, percentFloor: number, elapsedSec: number): void {
    this.server.to(accountId).emit('phase:progress', {
      accountId,
      jobId,
      phase,
      step: `heartbeat:${phase}`,
      percent: percentFloor,
      message: `Analyse en cours… (${elapsedSec}s)`,
    })
  }

  /**
   * #2630.2 — la complétion d'une phase porte aussi CE QUI VIENT D'ÊTRE TROUVÉ.
   *
   * `data` (la charge BRUTE de la phase) voyageait déjà et personne ne la
   * lisait : le navigateur ne prenait que `{ phase, percent }`. Elle continue de
   * voyager pour ses consommateurs éventuels, mais elle n'est PAS ce que l'écran
   * affichera — c'est le serveur qui en tire la forme bornée
   * (`analysisPartialFrom`), pour deux raisons :
   *
   *  - ce qui traverse reste petit et nommé — des décomptes et au plus trois
   *    libellés, jamais l'email d'un contact ni la recherche complète ;
   *  - la règle « une absence ne fait aucune ligne » est tenue AVANT le fil :
   *    une phase qui n'a rien ramené n'émet aucun partiel, donc aucun écran ne
   *    peut afficher « 0 contact trouvé ».
   */
  emitPhaseComplete(
    accountId: string,
    jobId: string,
    phase: string,
    percent: number,
    data?: Record<string, unknown>,
  ): void {
    const partial = analysisPartialFrom({ phase, data, at: Date.now() }) ?? undefined
    this.server.to(accountId).emit('phase:complete', { accountId, jobId, phase, percent, data, partial })
  }

  emitAnalysisDone(accountId: string, jobId: string): void {
    this.server.to(accountId).emit('analysis:done', { accountId, jobId, percent: 100 })
  }

  emitAnalysisError(accountId: string, jobId: string, error: string): void {
    this.server.to(accountId).emit('analysis:error', { accountId, jobId, error })
  }

  emitAnalysisDegraded(
    accountId: string,
    jobId: string,
    payload: { phase: string; warnings: AgentWarning[]; sourceHealth?: Record<string, SourceHealth> },
  ): void {
    this.server.to(accountId).emit('analysis:degraded', { accountId, jobId, ...payload })
  }

  emitAnalysisRetry(accountId: string, jobId: string, attempt: number, maxAttempts: number): void {
    this.server.to(accountId).emit('analysis:retry', { accountId, jobId, attempt, maxAttempts })
  }
}
