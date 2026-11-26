import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { updateTeamPolicySchema, type TeamPolicy } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from './require-permission.decorator'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { WorkspaceTeamPolicySettingsService } from './workspace-team-policy-settings.service'

class UpdateTeamPolicyDto extends createZodDto(updateTeamPolicySchema) {}

/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE (Réglages › Équipe). Lecture ouverte à tout
 * membre — chacun doit savoir quelles règles son plan de journée applique ;
 * écriture sous `team:manage`, comme la charge commerciale : elle change ce que
 * Laura propose à TOUTE l'équipe.
 */
@Controller('workspaces/team-policy')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class WorkspaceTeamPolicySettingsController {
  constructor(
    private readonly settings: WorkspaceTeamPolicySettingsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  @WorkspaceRead()
  async get(@CurrentUser() user: CurrentUserPayload): Promise<TeamPolicy> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.settings.effectiveFor(workspaceId)
  }

  @Patch()
  @RequirePermission('team:manage')
  async update(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateTeamPolicyDto): Promise<TeamPolicy> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.settings.update(workspaceId, user.userId, dto)
  }
}
