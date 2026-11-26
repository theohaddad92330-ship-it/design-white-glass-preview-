import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { updateReverseMarketSettingsSchema, type ReverseMarketSettings } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from './require-permission.decorator'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { WorkspaceReverseMarketSettingsService } from './workspace-reverse-market-settings.service'

class UpdateReverseMarketSettingsDto extends createZodDto(updateReverseMarketSettingsSchema) {}

/**
 * `#2035.10` — LE MARCHÉ INVERSÉ ET LA CAPACITÉ DE RÉPONSE.
 *
 * Deux routes : lire le réglage en vigueur, en poser un nouveau. Même forme
 * que `DealStageSlaController` — un contrôleur à part, un module autonome
 * (règle #7) : le retirer retire le réglage, rien d'autre.
 */
@Controller('workspaces/reverse-market-settings')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class WorkspaceReverseMarketSettingsController {
  constructor(
    private readonly settings: WorkspaceReverseMarketSettingsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * Le réglage en vigueur. `@WorkspaceRead()` : tout membre peut savoir si le
   * marché inversé est ouvert et quelle capacité l'espace a déclarée —
   * aucune permission de lecture à inventer, ce serait l'accorder à `viewer`.
   */
  @Get()
  @WorkspaceRead()
  async get(@CurrentUser() user: CurrentUserPayload): Promise<ReverseMarketSettings> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.settings.effectiveFor(workspaceId)
  }

  /**
   * Poser le réglage. `team:manage` : changer la capacité déclarée de
   * l'espace change ce que TOUTE l'équipe voit — le rôle d'administration de
   * l'espace, comme les réglages voisins (SLA du pipe, marque).
   */
  @Patch()
  @RequirePermission('team:manage')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateReverseMarketSettingsDto,
  ): Promise<ReverseMarketSettings> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.settings.update(workspaceId, dto)
  }
}
