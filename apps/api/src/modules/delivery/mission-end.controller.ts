import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  MISSION_END_CHECK_KEYS,
  missionEndCheckInputSchema,
  missionEndReasonInputSchema,
  missionInterruptionInputSchema,
  type MissionEndCheckKey,
  type MissionEndChecklist,
  type MissionInterruption,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { MissionEndService } from './mission-end.service'

class MissionEndCheckDto extends createZodDto(missionEndCheckInputSchema) {}
class MissionEndReasonDto extends createZodDto(missionEndReasonInputSchema) {}
class MissionInterruptionDto extends createZodDto(missionInterruptionInputSchema) {}

/**
 * #2414 (LAU-FINAL-128) / épopée #2986 — fin de mission : motif typé,
 * checklist de sortie, mission interrompue. Même permission que le passage de
 * statut (`records:write`) : c'est le même geste sur la même mission.
 */
@Controller('delivery/missions/:missionId')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MissionEndController {
  constructor(
    private readonly missionEnd: MissionEndService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /** #2414.11-33 — la checklist de sortie (client / consultant / interne), avec son verdict. */
  @Get('end-checklist')
  @WorkspaceRead()
  async readChecklist(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<MissionEndChecklist> {
    return this.missionEnd.checklist(await this.scope(user.userId), missionId)
  }

  /** Cocher un item de la checklist de sortie : geste humain, daté, avec sa note. */
  @Post('end-checks')
  @RequirePermission('records:write')
  async confirmCheck(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: MissionEndCheckDto,
  ): Promise<MissionEndChecklist> {
    return this.missionEnd.confirmCheck(await this.scope(user.userId), user.userId, missionId, body)
  }

  /** Retirer un item : il est ARCHIVÉ, jamais supprimé. */
  @Post('end-checks/:item/withdraw')
  @RequirePermission('records:write')
  async withdrawCheck(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Param('item') item: string,
  ): Promise<MissionEndChecklist> {
    if (!(MISSION_END_CHECK_KEYS as readonly string[]).includes(item)) {
      throw new BadRequestException('Item de checklist de sortie inconnu.')
    }
    return this.missionEnd.withdrawCheck(
      await this.scope(user.userId),
      user.userId,
      missionId,
      item as MissionEndCheckKey,
    )
  }

  /** #2414.1-8 — le motif de fin, typé (8 valeurs), distinct du motif libre historique. */
  @Post('end-reason')
  @RequirePermission('records:write')
  async setEndReason(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: MissionEndReasonDto,
  ): Promise<void> {
    return this.missionEnd.setEndReason(await this.scope(user.userId), missionId, body)
  }

  /** #2414.54-59 — l'interruption déclarée pour cette mission, ou `null`. */
  @Get('interruption')
  @WorkspaceRead()
  async readInterruption(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<MissionInterruption | null> {
    return this.missionEnd.readInterruption(await this.scope(user.userId), missionId)
  }

  /**
   * #2414.54-58 — déclarer une interruption : motif, responsabilité, risque,
   * les deux accusés. #2414 NO-GO : ce geste ne rend JAMAIS le consultant
   * disponible — voir `confirmAvailability` ci-dessous, un second geste distinct.
   */
  @Post('interruption')
  @RequirePermission('records:write')
  async declareInterruption(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
    @Body() body: MissionInterruptionDto,
  ): Promise<void> {
    return this.missionEnd.declareInterruption(await this.scope(user.userId), user.userId, missionId, body)
  }

  /** #2414.59, NO-GO — le SEUL geste qui revalide la disponibilité après une interruption. */
  @Post('interruption/confirm-availability')
  @RequirePermission('records:write')
  async confirmAvailability(
    @CurrentUser() user: CurrentUserPayload,
    @Param('missionId', ParseUUIDPipe) missionId: string,
  ): Promise<void> {
    return this.missionEnd.confirmAvailability(await this.scope(user.userId), user.userId, missionId)
  }
}
