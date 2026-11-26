import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { updateApprovalSettingsSchema, type ApprovalSettingsView, type UpdateApprovalSettings } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ApprovalSettingsService } from './approval-settings.service'

/**
 * #4016 L6 — Réglages › Automatisations : l'autonomie de l'Action OS (N2 à N5)
 * et ses deux seuils, réglables par l'admin jusqu'à « sans plafond ».
 *
 * La lecture est ouverte à tout membre (chacun doit pouvoir savoir ce qui part
 * seul dans son espace) ; l'écriture exige `team:manage`, posée ici ET revérifiée
 * par le service — la garde de permission est fail-open sur une route sans
 * déclaration.
 */
@Controller('action-os/approval-settings')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ApprovalSettingsController {
  constructor(
    private readonly settings: ApprovalSettingsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Get()
  @WorkspaceRead()
  async read(@CurrentUser() user: CurrentUserPayload): Promise<ApprovalSettingsView> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.settings.read({ workspaceId, role })
  }

  @Put()
  @RequirePermission('team:manage')
  async update(
    @Body(new ZodValidationPipe(updateApprovalSettingsSchema)) body: UpdateApprovalSettings,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ApprovalSettingsView> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.settings.update({ workspaceId, role }, body)
  }
}
