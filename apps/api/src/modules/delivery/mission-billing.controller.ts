import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { missionBillingDeclarationInputSchema, missionMilestoneInputSchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MissionBillingService, type MissionBillingRead } from './mission-billing.service'

class MissionMilestoneDto extends createZodDto(missionMilestoneInputSchema) {}
class MissionBillingDeclarationDto extends createZodDto(missionBillingDeclarationInputSchema) {}

/**
 * #2417.3 / .4 / .5 — jalons, retainer et placement DÉCLARÉS d'une mission
 * (decisions §8). Des montants : `finance:read` pour lire, `finance:write`
 * pour écrire. Aucune route n'émet ni ne comptabilise quoi que ce soit.
 */
@Controller('delivery/missions/:missionId/billing')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MissionBillingController {
  constructor(
    private readonly billing: MissionBillingService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  @RequirePermission('finance:read')
  async read(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<MissionBillingRead> {
    const today = new Date().toISOString().slice(0, 10)
    return this.billing.read(await this.scope(user.userId), missionId, today)
  }

  @Put()
  @RequirePermission('finance:write')
  async writeDeclarations(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: MissionBillingDeclarationDto,
  ): Promise<{ saved: true }> {
    await this.billing.writeDeclarations(await this.scope(user.userId), user.userId, missionId, body)
    return { saved: true }
  }

  @Post('milestones')
  @RequirePermission('finance:write')
  async addMilestone(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: MissionMilestoneDto,
  ): Promise<{ saved: true }> {
    await this.billing.addMilestone(await this.scope(user.userId), user.userId, missionId, body)
    return { saved: true }
  }

  @Post('milestones/:milestoneId/archive')
  @RequirePermission('finance:write')
  async archiveMilestone(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('milestoneId', ParseUUIDPipe) milestoneId: string,
  ): Promise<{ archived: true }> {
    await this.billing.archiveMilestone(await this.scope(user.userId), missionId, milestoneId)
    return { archived: true }
  }
}
