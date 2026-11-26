import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  missionAmendmentStatusChangeSchema,
  proposeMissionAmendmentSchema,
  type MissionAmendmentView,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { MissionAmendmentService } from './mission-amendment.service'

class ProposeMissionAmendmentDto extends createZodDto(proposeMissionAmendmentSchema) {}
class MissionAmendmentStatusChangeDto extends createZodDto(missionAmendmentStatusChangeSchema) {}

/**
 * #2423 — LAU-FINAL-137 : les CHANGEMENTS d'une mission (TJM, société, site,
 * pause…). Même permission que le statut de mission (`records:write`) : un
 * avenant est le même geste de fond — changer ce qui a été convenu.
 */
@Controller('delivery/missions/:missionId/amendments')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MissionAmendmentController {
  constructor(
    private readonly amendments: MissionAmendmentService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  @WorkspaceRead()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<MissionAmendmentView[]> {
    return this.amendments.list(await this.scope(user.userId), missionId)
  }

  @Post()
  @RequirePermission('records:write')
  async propose(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: ProposeMissionAmendmentDto,
  ): Promise<MissionAmendmentView> {
    return this.amendments.propose(await this.scope(user.userId), user.userId, missionId, body)
  }

  @Post(':amendmentId/status')
  @RequirePermission('records:write')
  async changeStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('amendmentId', ParseUUIDPipe) amendmentId: string,
    @Body() body: MissionAmendmentStatusChangeDto,
  ): Promise<MissionAmendmentView> {
    return this.amendments.changeStatus(await this.scope(user.userId), user.userId, missionId, amendmentId, body)
  }
}
