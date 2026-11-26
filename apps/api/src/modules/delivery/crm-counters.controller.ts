import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { can, financeScopeKindSchema, type FinanceScope, type HorizonForecast } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CrmCountersService } from './crm-counters.service'
import { ForecastHorizonsService } from './forecast-horizons.service'

/**
 * #4193 — `GET /crm-counters?scope=own|workspace` : les totaux des écrans
 * Affaires / Talents / Missions, chacun avec sa définition écrite.
 *
 * Le contrôleur compose (GA-07) : il lit le prévisionnel du mois — seulement
 * pour qui porte `finance:read` — et le passe au service des compteurs. Sans le
 * droit, le revenu sécurisé est NON MESURÉ, jamais zéro. `?scope=own` ne fait
 * que RETIRER des lignes : aucun droit supplémentaire à vérifier.
 */
@Controller('crm-counters')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class CrmCountersController {
  constructor(
    private readonly counters: CrmCountersService,
    private readonly horizons: ForecastHorizonsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  // Lecture d'espace : tout membre voit les totaux ; le revenu sécurisé, lui,
  // n'est calculé que pour `finance:read` (ci-dessous), sinon NON MESURÉ.
  @Get()
  @WorkspaceRead()
  async read(@CurrentUser() user: CurrentUserPayload, @Query('scope') requested?: string) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    const parsed = financeScopeKindSchema.safeParse(requested)
    const scope: FinanceScope =
      parsed.success && parsed.data === 'own'
        ? { kind: 'own', workspaceId, userId: user.userId }
        : { kind: 'workspace', workspaceId }
    const forecast: HorizonForecast | undefined = can(role, extra, 'finance:read')
      ? await this.horizons.compute(workspaceId, 'month')
      : undefined
    return this.counters.compute(scope, new Date(), forecast)
  }
}
