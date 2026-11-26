import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import type { MailThreadStateCounts } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { LinkMailThreadContactDto, SetMailThreadPriorityDto, SnoozeMailThreadDto } from './dto/mailbox.dto'
import { MailThreadStateService } from './mail-thread-state.service'

/**
 * Théo B M1.N1 / M1.N2 / M1.N3 / M1.N6 — l'état de traitement des fils, personnel et tenu côté Bellum (aucun
 * contenu de message, aucun rappel externe). Même préfixe que la messagerie : la route dit la capacité.
 */
@Controller('mailbox')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MailThreadStateController {
  constructor(
    private readonly state: MailThreadStateService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get('threads/state/counts')
  @RequirePermission('records:write')
  counts(@CurrentUser() user: CurrentUserPayload): Promise<MailThreadStateCounts> {
    return this.state.counts(user.userId)
  }

  @Put('threads/:threadId/snooze')
  @RequirePermission('records:write')
  snooze(
    @CurrentUser() user: CurrentUserPayload,
    @Param('threadId') threadId: string,
    @Body() body: SnoozeMailThreadDto,
  ): Promise<{ snoozeUntil: string | null }> {
    return this.state.snooze(user.userId, threadId, body.until)
  }

  @Put('threads/:threadId/priority')
  @RequirePermission('records:write')
  priority(
    @CurrentUser() user: CurrentUserPayload,
    @Param('threadId') threadId: string,
    @Body() body: SetMailThreadPriorityDto,
  ): Promise<{ priority: boolean }> {
    return this.state.setPriority(user.userId, threadId, body.priority)
  }

  @Put('threads/:threadId/contact')
  @RequirePermission('records:write')
  async contact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('threadId') threadId: string,
    @Body() body: LinkMailThreadContactDto,
  ): Promise<{ contactId: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.state.linkContact(user.userId, workspaceId, threadId, body.contactId)
  }
}
