import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  declareMissionDeliveryMilestoneInputSchema,
  type MissionDeliveryMilestoneStatus,
  type MissionEndReverseMarketReadiness,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { MissionDeliveryMilestonesService } from './mission-delivery-milestones.service'

class DeclareMissionDeliveryMilestoneDto extends createZodDto(declareMissionDeliveryMilestoneInputSchema) {}

/** #3269 (BEL-SC-240) — même permission que la checklist de sortie (`records:write`) : le même geste sur la même mission. */
@Controller('delivery/missions/:missionId')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MissionDeliveryMilestonesController {
  constructor(
    private readonly milestones: MissionDeliveryMilestonesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /** Les dix-sept jalons de la spec, projetés depuis leurs maisons canoniques ou déclarés. */
  @Get('delivery-milestones')
  @WorkspaceRead()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<MissionDeliveryMilestoneStatus[]> {
    return this.milestones.list(await this.scope(user.userId), missionId)
  }

  /** Déclarer un jalon (brief consultant/client, documents et accès, premier check, revue de début, suivi périodique). */
  @Post('delivery-milestones')
  @RequirePermission('records:write')
  async declare(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: DeclareMissionDeliveryMilestoneDto,
  ): Promise<MissionDeliveryMilestoneStatus[]> {
    return this.milestones.declare(await this.scope(user.userId), user.userId, missionId, body)
  }

  /** FIN DE MISSION → REVERSE MARKET (#3269, NO-GO) — jamais de disponibilité déclarée automatiquement. */
  @Get('reverse-market-readiness')
  @WorkspaceRead()
  async reverseMarketReadiness(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<MissionEndReverseMarketReadiness> {
    return this.milestones.reverseMarketReadiness(await this.scope(user.userId), missionId)
  }
}
