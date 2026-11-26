import { ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Throttle } from '@nestjs/throttler'
import type { Queue } from 'bullmq'
import type { IntegrationSyncRun, StartSyncRunResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { IntegrationSyncRunEntity } from '../../database/entities/integration-sync-run.entity'
import {
  INTEGRATION_SYNC_JOB_OPTIONS,
  INTEGRATION_SYNC_QUEUE,
  integrationSyncJobId,
  type IntegrationSyncJobData,
} from './integration-sync.queue'
import { IntegrationSyncService } from './integration-sync.service'

/**
 * #4591 — le sondage d'un run (`GET …/sync-runs/:id`, `…/latest`) est une LECTURE d'état, pas un geste : le compter au
 * seuil global (120/min) faisait finir l'écran qui attend la fin du travail en 429. Le compteur du throttler est propre
 * à (classe, handler) : ce seuil ne touche que ces deux routes ; la limite globale n'est pas relevée, et démarrer /
 * annuler restent au seuil global.
 */
const SYNC_RUN_POLL_RATE_LIMIT = { 'default-1m': { limit: 600, ttl: 60_000 } }

function toWire(run: IntegrationSyncRunEntity): IntegrationSyncRun {
  return {
    id: run.id,
    provider: run.provider,
    status: run.status,
    started_at: run.started_at.toISOString(),
    finished_at: run.finished_at ? run.finished_at.toISOString() : null,
    summary: run.summary,
    error: run.error_fr && run.error_en ? { fr: run.error_fr, en: run.error_en } : null,
  }
}

/**
 * L'amorçage de la première synchronisation (#3014, job réel BullMQ depuis
 * l'épopée #2980).
 *
 * Même garde que le reste de l'écran Intégrations (`ConnectorTestController`) :
 * un siège qui ne peut pas connecter un outil n'a rien à en synchroniser.
 *
 * L'orchestration inter-modules (CRM) a déménagé dans `IntegrationSyncWorker`
 * (voir son docblock, relèvement GA-07 assumé) — ce contrôleur ne fait plus
 * que déclencher le job et lire son état, jamais le travail lui-même.
 */
@Controller('tools')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@RequirePermission('integrations:manage')
export class IntegrationSyncController {
  constructor(
    private readonly syncs: IntegrationSyncService,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectQueue(INTEGRATION_SYNC_QUEUE) private readonly queue: Queue<IntegrationSyncJobData>,
  ) {}

  /**
   * #2207.19 — le geste derrière « Synchroniser et comprendre mes données ».
   *
   * #2110.81 — « aucune double synchronisation » : un run non terminal déjà
   * en cours pour ce (espace, connecteur) refuse un second départ en 409,
   * plutôt que d'empiler un deuxième job sur le même travail.
   */
  @Post(':provider/sync-runs')
  @HttpCode(201)
  async start(
    @Param('provider') provider: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<StartSyncRunResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const active = await this.syncs.getActiveRun(workspaceId, provider)
    if (active) throw new ConflictException('sync_run_already_active')

    const run = await this.syncs.startRun(workspaceId, user.userId, provider)
    // Le client reçoit le run `pending` tout de suite et POLL jusqu'à un
    // statut terminal. Le `jobId` porte le run (#4591 : une clé réutilisée est
    // ignorée par BullMQ) ; la garde contre la course que `getActiveRun` seul
    // ne ferme pas entre deux requêtes concurrentes est en base (index unique
    // partiel de la migration `1796321364100`).
    await this.queue.add(
      'sync',
      { runId: run.id, workspaceId, userId: user.userId, provider },
      { ...INTEGRATION_SYNC_JOB_OPTIONS, jobId: integrationSyncJobId(workspaceId, provider, run.id) },
    )
    return toWire(run)
  }

  /** #2110.39 — le bouton « Annuler », quand techniquement possible : un run
   *  déjà terminal ne bouge plus (`cancelRun` est un no-op dessus). */
  @Post(':provider/sync-runs/:id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<IntegrationSyncRun> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const before = await this.syncs.getRun(workspaceId, id)
    if (!before) throw new NotFoundException('sync_run_not_found')
    await this.syncs.cancelRun(workspaceId, id)
    const after = await this.syncs.getRun(workspaceId, id)
    return toWire(after ?? before)
  }

  /**
   * Le dernier run de ce connecteur — pour retrouver un résumé déjà calculé
   * sans garder d'identifiant côté client. Route LITTÉRALE déclarée AVANT
   * `:id` juste en dessous (`architecture/literal-routes-not-captured-by-params.spec.ts`) :
   * sinon `latest` serait avalé comme un identifiant de run.
   */
  @Get(':provider/sync-runs/latest')
  @Throttle(SYNC_RUN_POLL_RATE_LIMIT)
  async getLatest(
    @Param('provider') provider: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<IntegrationSyncRun> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const run = await this.syncs.getLatestRun(workspaceId, provider)
    if (!run) throw new NotFoundException('sync_run_not_found')
    return toWire(run)
  }

  /** Le polling web — jusqu'à `completed`/`failed`. */
  @Get(':provider/sync-runs/:id')
  @Throttle(SYNC_RUN_POLL_RATE_LIMIT)
  async get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload): Promise<IntegrationSyncRun> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const run = await this.syncs.getRun(workspaceId, id)
    if (!run) throw new NotFoundException('sync_run_not_found')
    return toWire(run)
  }
}
