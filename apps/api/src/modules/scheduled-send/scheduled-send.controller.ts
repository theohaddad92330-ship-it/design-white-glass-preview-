import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import type { ScheduledMessageSendItem } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { RescheduleMessageSendDto, ScheduleMessageSendDto } from './scheduled-send.dto'
import { ScheduledSendService } from './scheduled-send.service'

/**
 * Théo M2 — envoi programmé — programmer / déplacer / déprogrammer / lister « À venir ». L'espace et l'utilisateur
 * viennent TOUJOURS du jeton : jamais l'envoi d'un autre commercial, jamais un autre espace. Aucune de ces routes
 * n'envoie : le départ, c'est le worker, à l'heure que le commercial a choisie.
 */
@Controller('message-drafts/scheduled-sends')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ScheduledSendController {
  constructor(
    private readonly scheduled: ScheduledSendService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  @RequirePermission('records:write')
  async upcoming(@CurrentUser() user: CurrentUserPayload): Promise<{ items: ScheduledMessageSendItem[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.scheduled.listUpcoming(workspaceId, user.userId)
  }

  @Post()
  @RequirePermission('records:write')
  async schedule(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ScheduleMessageSendDto,
  ): Promise<{ scheduledSend: ScheduledMessageSendItem }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { scheduledSend: await this.scheduled.schedule(workspaceId, user.userId, body) }
  }

  @Patch(':id')
  @RequirePermission('records:write')
  async reschedule(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RescheduleMessageSendDto,
  ): Promise<{ scheduledSend: ScheduledMessageSendItem }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { scheduledSend: await this.scheduled.reschedule(workspaceId, user.userId, id, body) }
  }

  /** Déprogrammer : la ligne passe `cancelled` (on archive, on ne supprime pas). */
  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('records:write')
  async cancel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ scheduledSend: ScheduledMessageSendItem }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { scheduledSend: await this.scheduled.cancel(workspaceId, user.userId, id) }
  }
}
