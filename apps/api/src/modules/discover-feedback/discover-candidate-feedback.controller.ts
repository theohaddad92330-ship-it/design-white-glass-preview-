import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import type { DiscoverCandidateFeedbackResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CreateDiscoverCandidateFeedbackDto } from './dto/discover-candidate-feedback.dto'
import { DiscoverCandidateFeedbackService } from './discover-candidate-feedback.service'

/**
 * #3671.2bis — le geste « Mauvaise entreprise » d'une carte Découvrir.
 * Même famille que `DiscoverCandidateNotesController` (candidat identifié par
 * son SIREN, pas encore un compte) ; route sœur sous `discover/candidates`.
 */
@Controller('discover/candidates')
@RequireFeature('discover')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class DiscoverCandidateFeedbackController {
  constructor(
    private readonly feedback: DiscoverCandidateFeedbackService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post(':siren/feedback')
  @RequirePermission('records:write')
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('siren') siren: string,
    @Body() body: CreateDiscoverCandidateFeedbackDto,
  ): Promise<DiscoverCandidateFeedbackResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.feedback.record(workspaceId, user.userId, siren, body.verdict)
  }
}
