import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { chatArtifactVersionInputSchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ChatArtifactVersionsService } from './chat-artifact-versions.service'

class ChatArtifactVersionDto extends createZodDto(chatArtifactVersionInputSchema) {}
class ChatArtifactHistoryQueryDto extends createZodDto(z.object({ artifactId: z.string().min(3) })) {}

/**
 * #2429.9 (épopée #2852, lot P07 30/09) — modifier un artefact de chat CRÉE une
 * version ; l'historique se lit. Mêmes portes que les gestes sur un fil
 * (`chat_ai`, `records:write` pour écrire), espace résolu depuis le jeton.
 */
@Controller('ia')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class ChatArtifactVersionsController {
  constructor(
    private readonly versions: ChatArtifactVersionsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @RequireFeature('chat_ai')
  @Post('chat/artifacts/versions')
  @RequirePermission('records:write')
  async edit(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChatArtifactVersionDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.versions.edit({ workspaceId, userId: user.userId, input: dto })
  }

  @RequireFeature('chat_ai')
  @Get('chat/artifacts/versions')
  // GA-05 — une LECTURE bornée à l'espace de l'appelant, qui lit déjà ce fil à l'écran.
  @WorkspaceRead()
  async history(@CurrentUser() user: CurrentUserPayload, @Query() query: ChatArtifactHistoryQueryDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.versions.history({ workspaceId, artifactId: query.artifactId })
  }
}
