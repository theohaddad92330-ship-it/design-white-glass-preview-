import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common'
import type {
  ProspectingSessionMetricsResponse,
  RecordProspectingSessionEventRequest,
  StartProspectingSessionRequest,
  StartProspectingSessionResponse,
} from '@bellum/contracts'
import { recordProspectingSessionEventRequestSchema, startProspectingSessionRequestSchema } from '@bellum/contracts'
import { ZodValidationPipe } from 'nestjs-zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ProspectingSessionsService } from './prospecting-sessions.service'

/**
 * #2386.1 / #2386.9 — LE FIL DE PROSPECTION, LE SEUL APPELANT RÉEL.
 *
 * `POST /prospecting-sessions` est appelé par `ProspectingSessionDialog`
 * (apps/web) au moment où une session est GÉNÉRÉE (`buildProspectingSession`),
 * jamais avant : une session jamais construite ne pose aucune ligne. Les deux
 * autres routes restent BEST-EFFORT côté appelant (un identifiant périmé ou
 * une session déjà close renvoie 404, jamais un blocage de l'écran).
 *
 * Pas de `@PersonalScope` : ces routes n'écrivent ni ne lisent AUCUNE identité
 * (`ProspectingSessionEntity` n'a pas de colonne `user_id`) — seul l'espace
 * (best-effort, comme `CommercialAuditFeedbackController`) délimite la lecture.
 */
@Controller('prospecting-sessions')
@UseGuards(JwtGuard)
export class ProspectingSessionsController {
  constructor(
    private readonly sessions: ProspectingSessionsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post()
  @HttpCode(200)
  async start(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(startProspectingSessionRequestSchema)) body: StartProspectingSessionRequest,
  ): Promise<StartProspectingSessionResponse> {
    const workspaceId = await this.workspaceContext
      .resolveActiveWorkspace(user.userId)
      .then(({ workspaceId }) => workspaceId)
      .catch(() => null)
    const id = await this.sessions.start(workspaceId, body.journey)
    return { id }
  }

  @Post(':id/events')
  @HttpCode(200)
  async recordEvent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordProspectingSessionEventRequestSchema)) body: RecordProspectingSessionEventRequest,
  ): Promise<{ ok: true }> {
    try {
      await this.sessions.recordEvent(id, body)
    } catch (error) {
      // Best-effort (voir l'en-tête de classe) : une session périmée ne doit
      // jamais faire échouer l'écran qui vient de finir un envoi.
      if (!(error instanceof NotFoundException)) throw error
    }
    return { ok: true }
  }

  @Get('metrics')
  async metrics(@CurrentUser() user: CurrentUserPayload): Promise<ProspectingSessionMetricsResponse> {
    const workspaceId = await this.workspaceContext
      .resolveActiveWorkspace(user.userId)
      .then(({ workspaceId }) => workspaceId)
      .catch(() => null)
    return { metrics: await this.sessions.getMetrics(workspaceId) }
  }
}
