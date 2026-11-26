import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import type { CommercialOutcome } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CommercialOutcomesService } from './commercial-outcomes.service'
import { CreateCommercialOutcomeDto } from './dto/commercial-outcome.dto'

/**
 * #2126.47/.48/.50/.51/.53/.54/.55/.60 (épopée #2787) — enregistrer et lire les
 * outcomes commerciaux d'un compte. APPEND-ONLY : deux verbes seulement,
 * jamais de `PATCH`/`DELETE` (#2126.60 — voir `commercial-outcomes.service.ts`).
 */
@Controller('accounts/:accountId/outcomes')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class CommercialOutcomesController {
  constructor(
    private readonly outcomes: CommercialOutcomesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  @WorkspaceRead()
  async list(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ items: CommercialOutcome[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { items: await this.outcomes.list(workspaceId, accountId) }
  }

  @Post()
  @RequirePermission('records:write')
  async record(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() body: CreateCommercialOutcomeDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CommercialOutcome> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.outcomes.record(workspaceId, accountId, user.userId, body)
  }
}
