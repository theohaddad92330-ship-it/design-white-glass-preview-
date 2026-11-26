import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { weekDeltaQuerySchema, type MonthObjective, type WeekDelta } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WeekDeltaService } from './week-delta.service'

class WeekDeltaQueryDto extends createZodDto(weekDeltaQuerySchema) {}

/**
 * Cockpit (`/pilotage`) › « ce qui a bougé » et « où en est le mois ».
 *
 * Même porte que les routes voisines du contrôleur Pilotage : donnée d'ÉQUIPE,
 * `team:manage` (un membre standard → 403). Un contrôleur à part pour que le
 * lot soit retirable sans toucher au reste du module.
 */
@Controller('pilotage')
@RequireFeature('manager_cockpit')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class WeekDeltaController {
  constructor(
    private readonly weekDelta: WeekDeltaService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Opportunités créées / avancées / reculées / perdues / signées, missions qui finissent, encaissements. */
  @Get('week-delta')
  @RequirePermission('team:manage')
  async delta(@CurrentUser() user: CurrentUserPayload, @Query() query: WeekDeltaQueryDto): Promise<WeekDelta> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.weekDelta.weekDelta(workspaceId, query)
  }

  /** Objectif / réalisé / couverture du mois en cours. */
  @Get('month-objective')
  @RequirePermission('team:manage')
  async monthObjective(@CurrentUser() user: CurrentUserPayload): Promise<MonthObjective> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.weekDelta.monthObjective(workspaceId)
  }
}
