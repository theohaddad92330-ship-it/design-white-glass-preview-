import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common'
import type { CommercialAuditFeedbackResponse, CreateCommercialAuditFeedbackRequest } from '@bellum/contracts'
import { createCommercialAuditFeedbackRequestSchema } from '@bellum/contracts'
import { ZodValidationPipe } from 'nestjs-zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CommercialAuditFeedbackService } from './commercial-audit-feedback.service'

/**
 * #2075.12 / #2075.13 (épopée #2774) — commenter une conclusion, refuser une
 * recommandation de l'audit commercial. L'audit lui-même reste une
 * DÉRIVATION pure côté web (`build-audit.ts`) : ce contrôleur ne fait que
 * poser et rendre la note personnelle, jamais l'audit.
 *
 * `@PersonalScope` (GA-05) : les deux routes n'opèrent QUE sur les notes de
 * CETTE identité (`CommercialAuditFeedbackService`, filtré `user_id`) — même
 * cas que `ProfileContextController`, aucun autre membre de l'espace ne voit
 * quoi que ce soit par ces routes.
 */
@PersonalScope()
@Controller('commercial-audit/feedback')
@UseGuards(JwtGuard)
export class CommercialAuditFeedbackController {
  constructor(
    private readonly feedback: CommercialAuditFeedbackService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post()
  @HttpCode(200)
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(createCommercialAuditFeedbackRequestSchema))
    body: CreateCommercialAuditFeedbackRequest,
  ): Promise<CommercialAuditFeedbackResponse> {
    // ⚠️ Un espace non résolu ne bloque jamais la note (même discipline que
    // `notNowRevalidationInfo` : la note reste personnelle, `workspace_id`
    // est un repère informatif, pas une porte).
    const workspaceId = await this.workspaceContext
      .resolveActiveWorkspace(user.userId)
      .then(({ workspaceId }) => workspaceId)
      .catch(() => null)
    await this.feedback.create(user.userId, workspaceId, body)
    return { feedback: await this.feedback.listForUser(user.userId) }
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<CommercialAuditFeedbackResponse> {
    return { feedback: await this.feedback.listForUser(user.userId) }
  }
}
