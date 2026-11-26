import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { updateCommercialLoadSettingsSchema, type CommercialLoadSettings } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from './require-permission.decorator'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { WorkspaceCommercialLoadSettingsService } from './workspace-commercial-load-settings.service'

class UpdateCommercialLoadSettingsDto extends createZodDto(updateCommercialLoadSettingsSchema) {}

/**
 * `#2035.11` — LA CHARGE COMMERCIALE ET LA PRIORISATION DES BESOINS.
 *
 * Deux plafonds configurés, sur des colonnes qui existent déjà
 * (`accounts.assigned_to`, `project_needs.status`) — voir le docblock du
 * service pour ce qui est mesuré et ce qui n'est pas inventé.
 */
@Controller('workspaces/commercial-load-settings')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class WorkspaceCommercialLoadSettingsController {
  constructor(
    private readonly settings: WorkspaceCommercialLoadSettingsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Les plafonds en vigueur. Lecture ouverte à tout membre, comme le SLA du pipe. */
  @Get()
  @WorkspaceRead()
  async get(@CurrentUser() user: CurrentUserPayload): Promise<CommercialLoadSettings> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.settings.effectiveFor(workspaceId)
  }

  /**
   * Poser un plafond. `team:manage` : même nature de réglage que le SLA
   * d'étape — change ce que TOUTE l'équipe voit dans la file de priorisation.
   */
  @Patch()
  @RequirePermission('team:manage')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateCommercialLoadSettingsDto,
  ): Promise<CommercialLoadSettings> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.settings.update(workspaceId, dto)
  }
}
