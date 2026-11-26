import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import type { CrmFusionReport } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountCrmFusionService } from './account-crm-fusion.service'
import { CrmFusionSweepDto } from './dto/crm-fusion-sweep.dto'

/**
 * #4603 — le RATTRAPAGE des paires compte-CRM ↔ compte-analyse déjà créées, et son retour arrière.
 *
 * ⚠️ Renversement de doctrine daté (Louis, 26/10/2026, `c142_fusion_auto_compte_crm_compte_analyse`) : ces
 * paires se fusionnent sans demander, paire par paire. Le PASSAGE, lui, reste un geste : rien ne part seul au
 * déploiement, la simulation est le défaut, l'espace est celui de l'appelant. `integrations:manage` : le droit
 * de qui branche le CRM, pas celui d'un commercial.
 */
@Controller('accounts/crm-fusions')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountCrmFusionController {
  constructor(
    private readonly fusion: AccountCrmFusionService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post('sweep')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('integrations:manage')
  async sweep(@Body() body: CrmFusionSweepDto, @CurrentUser() user: CurrentUserPayload): Promise<CrmFusionReport> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.fusion.sweep(workspaceId, user.userId, { dryRun: body.dryRun, limit: body.limit })
  }

  @Post(':fusionId/undo')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('integrations:manage')
  async undo(
    @Param('fusionId', new ParseUUIDPipe()) fusionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ restored: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.fusion.undo(workspaceId, user.userId, fusionId)
  }
}
