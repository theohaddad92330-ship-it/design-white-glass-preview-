import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ObjectPrivacyService, type PrivacyKind } from './object-privacy.service'

class SetPrivacyDto extends createZodDto(z.object({ is_private: z.boolean() }).strict()) {}

/** #4158.34 — interrupteur « Privé » d'un projet, d'un besoin ou d'une mission. */
@Controller('privacy')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ObjectPrivacyController {
  constructor(
    private readonly privacy: ObjectPrivacyService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Patch('projects/:id')
  @RequirePermission('records:write')
  project(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetPrivacyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.apply('project', id, body.is_private, user)
  }

  @Patch('needs/:id')
  @RequirePermission('records:write')
  need(@Param('id', ParseUUIDPipe) id: string, @Body() body: SetPrivacyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.apply('need', id, body.is_private, user)
  }

  @Patch('missions/:id')
  @RequirePermission('records:write')
  mission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetPrivacyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.apply('mission', id, body.is_private, user)
  }

  private async apply(kind: PrivacyKind, id: string, isPrivate: boolean, user: CurrentUserPayload) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.privacy.setPrivate(kind, id, isPrivate, { userId: user.userId, workspaceId, role })
  }
}
